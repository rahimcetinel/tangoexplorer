"""Health-check every data source the site pulls from.

The update workflow runs the ingestors with `|| true`, so a dead calendar, a
changed layout or an expired Instagram token stays invisible: the run is green
and the stale JSON is simply not rewritten. This script looks at the result
instead of the exit codes:

* every source JSON must exist, keep at least `min_items` and be refreshed
  within `max_age_h` hours (the weekly sources refresh themselves every 5–7
  days, so their window is wider);
* the source endpoint must answer with the expected marker (HTTP 200 and a
  signature string), which catches redirects to a holding page or a login wall;
* the Instagram token must still resolve against the Graph API.

Prints a Markdown table (also appended to the GitHub step summary when there is
one) and writes `agentic-python/out/source-health.json`. Exits 1 when something
is actually broken, so the scheduled run turns red instead of staying silent.

Usage:
    python agentic-python/source_health.py               # full check
    python agentic-python/source_health.py --no-probe    # data files only
    python agentic-python/source_health.py --json        # machine-readable
"""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
OUT_DIR = Path(__file__).resolve().parent / "out"
UA = "Mozilla/5.0 (compatible; TangoExplorerSourceHealth/1.0)"

# file: source JSON written by the ingestors (None = probe-only source)
# min_items: roughly 55–65% of today's count, so normal churn does not trip it
# max_age_h: 30 h for six-hourly sources, 8 days for the ones with --max-age-days
SOURCES: list[dict] = [
    {
        "key": "hoymilonga",
        "label": "Hoy Milonga",
        "file": "hoy-milongas.json",
        "min_items": 250,
        "max_age_h": 30,
        "url": "https://www.hoy-milonga.com/",
        "marker": "milonga",
        "timeout": 30,
    },
    {
        "key": "tangocalendar",
        "label": "tango-calendar.de",
        "file": "milongas-de.json",
        "min_items": 8,
        "max_age_h": 30,
        "url": "https://tango-calendar.de/kalender.ics",
        "marker": "BEGIN:VCALENDAR",
        "timeout": 30,
    },
    {
        "key": "sweden",
        "label": "tangokalendern.se",
        "file": "milongas-se.json",
        "min_items": 18,
        "max_age_h": 30,
        "url": "https://tangokalendern.se/",
        "marker": "milonga",
        "timeout": 30,
    },
    {
        "key": "milongasch",
        "label": "milongas.ch",
        "file": "milongas-ch.json",
        "min_items": 10,
        "max_age_h": 30,
        "url": "https://milongas.ch/",
        "marker": "milonga",
        "timeout": 30,
    },
    {
        "key": "oslo",
        "label": "tango.oslo.no",
        "file": "milongas-no.json",
        "min_items": 5,
        "max_age_h": 30,
        "url": "https://tango.oslo.no/kalender.ics",
        "marker": "BEGIN:VCALENDAR",
        "timeout": 30,
    },
    {
        "key": "vienna",
        "label": "tango-wien.at",
        "file": "milongas-at.json",
        "min_items": 12,
        "max_age_h": 30,
        "url": "https://tango-wien.at/kalender",
        "marker": "milonga",
        "timeout": 30,
    },
    {
        "key": "italy",
        "label": "FAItango",
        "file": "milongas-it.json",
        "min_items": 45,
        "max_age_h": 8 * 24,
        "url": "https://www.faitango.it/agenda-eventi",
        "marker": "milonga",
        "timeout": 40,
    },
    {
        "key": "spain",
        "label": "Agenda del Tango",
        "file": "milongas-es.json",
        "min_items": 100,
        "max_age_h": 8 * 24,
        "url": "https://agendadeltango.com/milongas/",
        "marker": "milonga",
        "timeout": 40,
    },
    {
        "key": "london",
        "label": "London Milongas",
        "file": "milongas-uk-london.json",
        "min_items": 20,
        "max_age_h": 8 * 24,
        "url": "https://londonmilongas.co.uk/calendar/",
        "marker": "milonga",
        "timeout": 40,
    },
    {
        "key": "netherlands",
        "label": "tangokalender.nl",
        "file": "milongas-nl.json",
        "min_items": 22,
        "max_age_h": 8 * 24,
        "url": "https://www.tangokalender.nl/evenementagenda.aspx",
        "marker": "milonga",
        "timeout": 40,
    },
    {
        "key": "tangoargentin",
        "label": "tango-argentin.fr",
        "file": "milongas-fr.json",
        "min_items": 20,
        "max_age_h": 30,
        "url": "https://www.tango-argentin.fr/paris",
        "marker": "Milonga",
        "timeout": 40,
    },
    {
        "key": "tangoprague",
        "label": "tango-prague.info",
        "file": "milongas-cz.json",
        "min_items": 5,
        "max_age_h": 30,
        "url": "https://calendar.google.com/calendar/ical/info%40tango-prague.info/public/basic.ics",
        "marker": "BEGIN:VCALENDAR",
        "timeout": 60,
    },
    {
        "key": "krakow",
        "label": "milongi.krakow.pl",
        "file": "milongas-pl.json",
        "min_items": 6,
        "max_age_h": 30,
        "url": "https://milongi.krakow.pl/kalendarz",
        "marker": "calendar-event",
        "timeout": 40,
    },
    {
        "key": "milongaro",
        "label": "Milonga.ro",
        "file": "milongas-ro.json",
        "min_items": 3,
        "max_age_h": 30,
        "url": "https://milonga.ro/",
        "marker": "milonga",
        "timeout": 120,
    },
    # Event sources: no per-source JSON, the probe is the signal.
    {
        "key": "tangocat",
        "label": "Tangocat (events)",
        "file": None,
        "url": "https://tangocat.net/",
        "marker": "tangocat",
        "timeout": 40,
    },
    {
        "key": "tmd",
        "label": "TMD API (events)",
        "file": None,
        "url": "https://www.tangomarathons.com/wp-json/tmd/v3/events?per_page=1",
        "marker": "[",
        "timeout": 40,
    },
]

GRAPH_VERSION = "v21.0"


def fetch(url: str, timeout: int) -> tuple[int, str]:
    context = ssl.create_default_context()
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        raw = response.read(400_000)
        charset = response.headers.get_content_charset() or "utf-8"
        return response.status, raw.decode(charset, "replace")


def probe(url: str, marker: str, timeout: int) -> dict:
    last_error = ""
    for attempt in range(2):
        try:
            status, body = fetch(url, timeout)
            if status != 200:
                last_error = f"HTTP {status}"
                continue
            if marker.lower() not in body.lower():
                return {"ok": False, "detail": f"marker '{marker}' yok"}
            return {"ok": True, "detail": f"HTTP {status}, {len(body) // 1024} kB"}
        except urllib.error.HTTPError as error:
            return {"ok": False, "detail": f"HTTP {error.code}"}
        except Exception as error:  # noqa: BLE001 - network errors are the point
            last_error = f"{type(error).__name__}: {error}"
            if attempt == 0:
                continue
    return {"ok": False, "detail": last_error or "ulaşılamadı"}


def age_hours(stamp: str) -> float | None:
    if not stamp:
        return None
    try:
        moment = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - moment).total_seconds() / 3600


def check_file(source: dict) -> dict:
    path = DATA / source["file"]
    if not path.exists():
        return {"status": "FAIL", "detail": f"{source['file']} yok"}
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = len(payload.get("items") or [])
    age = age_hours(payload.get("generatedAt", ""))
    age_text = f"{age:.0f} sa" if age is not None else "?"
    if items < source["min_items"]:
        return {"status": "FAIL", "detail": f"{items} kayıt (< {source['min_items']}), yaş {age_text}"}
    if age is None:
        return {"status": "WARN", "detail": f"{items} kayıt, generatedAt okunamadı"}
    if age > source["max_age_h"]:
        return {"status": "FAIL", "detail": f"{age / 24:.1f} gün bayat (limit {source['max_age_h']} sa)"}
    return {"status": "OK", "detail": f"{items} kayıt, {age_text}"}


def check_instagram() -> dict:
    token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    if not token:
        return {"status": "SKIP", "detail": "token yok (lokal çalışma)"}
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/me?fields=id&access_token={token}"
    try:
        status, body = fetch(url, 30)
        payload = json.loads(body)
    except Exception as error:  # noqa: BLE001
        return {"status": "FAIL", "detail": f"{type(error).__name__}: {error}"}
    if status != 200 or "error" in payload:
        message = (payload.get("error") or {}).get("message", "")[:80]
        return {"status": "FAIL", "detail": f"token geçersiz: {message}"}
    return {"status": "OK", "detail": "token geçerli"}


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Check data sources")
    parser.add_argument("--no-probe", action="store_true", help="skip HTTP probes")
    parser.add_argument("--json", action="store_true", help="print JSON only")
    args = parser.parse_args()

    rows: list[dict] = []
    for source in SOURCES:
        row = {
            "key": source["key"],
            "label": source["label"],
            "file": source.get("file"),
            "items": None,
            "ageHours": None,
            "data": {"status": "SKIP", "detail": "—"},
            "probe": {"status": "SKIP", "detail": "—"},
        }
        if source.get("file"):
            row["data"] = check_file(source)
            payload = json.loads((DATA / source["file"]).read_text(encoding="utf-8"))
            row["items"] = len(payload.get("items") or [])
            row["ageHours"] = round(age_hours(payload.get("generatedAt", "")) or 0, 1)
        if not args.no_probe:
            result = probe(source["url"], source["marker"], source.get("timeout", 30))
            row["probe"] = {
                "status": "OK" if result["ok"] else "FAIL",
                "detail": result["detail"],
            }
        rows.append(row)

    instagram = check_instagram()
    rows.append(
        {
            "key": "instagram",
            "label": "Instagram (Graph API)",
            "file": None,
            "items": None,
            "ageHours": None,
            "data": instagram,
            "probe": {"status": "SKIP", "detail": "—"},
        }
    )

    failed = [row for row in rows if "FAIL" in (row["data"]["status"], row["probe"]["status"])]
    warnings = [row for row in rows if "WARN" in (row["data"]["status"], row["probe"]["status"])]

    if args.json:
        print(json.dumps({"rows": rows, "failed": len(failed), "warnings": len(warnings)}, ensure_ascii=False, indent=2))
    else:
        print("## Kaynak sağlığı\n")
        print("| Kaynak | Kayıt | Yaş | Veri | Uç nokta |")
        print("|---|---|---|---|---|")
        for row in rows:
            items = "—" if row["items"] is None else str(row["items"])
            age = "—" if row["ageHours"] is None else f"{row['ageHours']:.0f} sa"
            print(
                f"| {row['label']} | {items} | {age} | "
                f"{row['data']['status']}: {row['data']['detail']} | "
                f"{row['probe']['status']}: {row['probe']['detail']} |"
            )
        print()
        if failed:
            print(f"**{len(failed)} kaynak sorunlu:** " + ", ".join(row["label"] for row in failed))
        else:
            print(f"Tüm kaynaklar sağlıklı ({len(rows)} kontrol).")
        if warnings:
            print(f"Uyarı: " + ", ".join(row["label"] for row in warnings))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "source-health.json").write_text(
        json.dumps({"generatedAt": datetime.now(timezone.utc).isoformat(), "rows": rows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
