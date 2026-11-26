"""Health-check every data source the site pulls from.

The update workflow runs the ingestors with `|| true`, so a dead calendar, a
changed layout or an expired Instagram token stays invisible: the run is green
and the stale JSON is simply not rewritten. This script looks at the result
instead of the exit codes:

* every source JSON must exist, keep at least `min_items` and be refreshed
  within `max_age_h` hours (the weekly sources refresh themselves every 5–7
  days, so their window is wider);
* a source that answers but no longer looks like itself (marker missing, page
  replaced by a holding page) or that has been removed (404/410) is ours to fix:
  the run turns red at once;
* a source we cannot reach at all (403/429 bot wall, 5xx, timeout, DNS) is
  third-party territory: one outage is noise, a sustained one is news. The clock
  is `lastOkAt` from `src/data/source-freshness.json`, not the age of
  `generatedAt` — several ingestors (hoy-milonga) rewrite the file, timestamp and
  all, even when every fetch failed, so the file's own age can lie. `lastOkAt`
  only advances when the data is fresh *and* non-empty. Past
  `max_age_h + 48 h` the row becomes FAIL-EXT: ~3.2 days for the six-hourly
  feeds, ~10 days for the weekly ones. A fixed three-day rule would fire on the
  weekly sources while they are perfectly healthy;
* the Instagram report must be fresh and error-free (while `INSTAGRAM_INGEST=off`
  the row is reported as SKIP: a deliberate pause is not an outage).

Two readers, one file:

* `update.yml` runs the full check (probes included), exits 1 only for our own
  breakage and commits the freshness state. A third party being down does not
  paint the publishing pipeline red — that would make red mean "someone else's
  server", and then nobody reads it when our parser breaks.
* `source-watch.yml` runs `--from-state` once a day, offline: no probes, no rate
  limits, no GitHub-runner IP bias. There a source that outlived its tolerance
  turns the run red (exit 2). That is the "3 gün sürerse haber ver" signal,
  separated from the publishing gate on purpose.

Prints a Markdown table (also appended to the GitHub step summary when there is
one) and writes `agentic-python/out/source-health.json`.

Exit codes: 0 all good (or only tolerated third-party outages), 1 our side is
broken, 2 a third-party outage outlived its tolerance (`--fail-on-external`).

Usage:
    python agentic-python/source_health.py                 # full check
    python agentic-python/source_health.py --no-probe      # data files only
    python agentic-python/source_health.py --fail-on-external
    python agentic-python/source_health.py --from-state    # offline, for the watch
    python agentic-python/source_health.py --json          # machine-readable
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from instagram_switch import is_paused

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
STATE_PATH = DATA / "source-freshness.json"
OUT_DIR = Path(__file__).resolve().parent / "out"
# Browser UA: several sources 403 obvious bot agents.
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)

# Ek tolerans: kaynak çöktüğünde veri bir kez daha tazelenebilsin diye kadansın
# üstüne eklenir. 6 saatlik kaynaklarda ~3 gün, haftalıklarda ~10 gün eder.
EXTERNAL_GRACE_H = 48

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
    # tango-calendar.de: ingest durduruldu (2026-11-26, izin bekleniyor); veri
    # dondurulmuş olduğu için tazelik kontrolü ve /kalender.ics probu da kapalı.
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


def fetch(url: str, timeout: int) -> tuple[int, str]:
    context = ssl.create_default_context()
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        raw = response.read(400_000)
        charset = response.headers.get_content_charset() or "utf-8"
        return response.status, raw.decode(charset, "replace")


IGNORED_HTTP = {401, 403, 405, 429}


def probe(url: str, marker: str, timeout: int) -> dict:
    """Return OK / WARN / FAIL and a `kind` for one endpoint.

    The `kind` is what the policy hangs on: ``unreachable`` is third-party
    territory and gets the tolerance window; ``dead`` (404/410/451) and
    ``shape`` (it answers, but no longer looks like the source) are ours to fix
    and fail at once.
    """
    last_error = ""
    for attempt in range(2):
        try:
            status, body = fetch(url, timeout)
        except urllib.error.HTTPError as error:
            if error.code in IGNORED_HTTP or error.code >= 500:
                return {"status": "WARN", "kind": "unreachable", "detail": f"erişilemiyor (HTTP {error.code})"}
            return {"status": "FAIL", "kind": "dead", "detail": f"HTTP {error.code}"}
        except Exception as error:  # noqa: BLE001 - network errors are the point
            last_error = f"{type(error).__name__}: {error}"
            if attempt == 0:
                continue
            return {"status": "WARN", "kind": "unreachable", "detail": f"erişilemiyor ({last_error[:90]})"}
        if not 200 <= status < 300:
            if status in IGNORED_HTTP or status >= 500:
                return {"status": "WARN", "kind": "unreachable", "detail": f"erişilemiyor (HTTP {status})"}
            return {"status": "FAIL", "kind": "dead", "detail": f"HTTP {status}"}
        if marker.lower() not in body.lower():
            return {"status": "FAIL", "kind": "shape", "detail": f"marker '{marker}' yok"}
        return {"status": "OK", "kind": "ok", "detail": f"HTTP {status}, {len(body) // 1024} kB"}
    return {"status": "WARN", "kind": "unreachable", "detail": f"erişilemiyor ({last_error[:90]})"}


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
        return {"status": "FAIL", "detail": f"{source['file']} yok", "age": None, "items": 0, "stamp": ""}
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = len(payload.get("items") or [])
    stamp = payload.get("generatedAt", "")
    age = age_hours(stamp)
    age_text = f"{age:.0f} sa" if age is not None else "?"
    if items < source["min_items"]:
        return {
            "status": "FAIL",
            "detail": f"{items} kayıt (< {source['min_items']}), yaş {age_text}",
            "age": age,
            "items": items,
            "stamp": stamp,
        }
    if age is None:
        return {"status": "WARN", "detail": f"{items} kayıt, generatedAt okunamadı", "age": None, "items": items, "stamp": stamp}
    if age > source["max_age_h"]:
        return {
            "status": "FAIL",
            "detail": f"{age / 24:.1f} gün bayat (limit {source['max_age_h']} sa)",
            "age": age,
            "items": items,
            "stamp": stamp,
        }
    return {"status": "OK", "detail": f"{items} kayıt, {age_text}", "age": age, "items": items, "stamp": stamp}


def check_instagram() -> dict:
    """Read the report the ingest wrote a few steps earlier.

    The 2026-11-18 "400: Session has expired" was not a false alarm: the token
    really had expired on 11-Nov-26 and Business Discovery was dead too, which
    is why the report stopped being refreshed. The direct Graph probe is still
    gone — one HTTP call cannot tell "expired" from "endpoint refuses" without
    also knowing the token's own expiry, so ``meta_token.py`` owns that check
    (it reports the expiry date Meta gives and can refresh the token). Here the
    report is the evidence: if it is missing, old, or full of errors, the ingest
    has not been able to write Instagram data.
    """
    if is_paused():
        # Bilinçli duraklatma: rapor yaşlanacak, bu bir arıza değil. FAIL yerine
        # SKIP yazıyoruz ki altı saatte bir koşan hat kırmızıya dönmesin.
        return {"status": "SKIP", "detail": "Instagram duraklatıldı (INSTAGRAM_INGEST=off)"}
    path = OUT_DIR / "instagram.json"
    if not path.exists():
        return {"status": "WARN", "detail": "out/instagram.json yok (ingest çalışmamış)"}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"status": "FAIL", "detail": "out/instagram.json bozuk"}
    ok = int(payload.get("okCount") or 0)
    errors = int(payload.get("errorCount") or 0)
    age = age_hours(payload.get("generatedAt", ""))
    if age is None:
        return {"status": "WARN", "detail": f"{ok} hesap, tarih okunamadı"}
    if age > 26:
        return {"status": "FAIL", "detail": f"rapor {age / 24:.1f} gün bayat — token/ingest kontrol edilmeli"}
    if errors:
        return {"status": "FAIL", "detail": f"{errors} hesap hata verdi ({ok} ok)"}
    return {"status": "OK", "detail": f"{ok} hesap, 0 hata, {age:.0f} sa"}


def read_state() -> dict:
    """Read the freshness ledger; a missing or broken file is not an error.

    The ledger is written by the full run and committed by `update.yml`. Its
    absence simply means "no history yet": every source starts in WARN, nothing
    turns red on the first run, and the next six-hourly run fills it in.
    """
    if not STATE_PATH.exists():
        return {"generatedAt": "", "sources": {}}
    try:
        payload = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"generatedAt": "", "sources": {}}
    if not isinstance(payload, dict) or not isinstance(payload.get("sources"), dict):
        return {"generatedAt": "", "sources": {}}
    return payload


def stale_limit(source: dict) -> int:
    """Hours without fresh data after which an unreachable source is an outage.

    Not a global three days: the weekly sources legitimately go 5–7 days between
    refreshes (`max_age_h = 8 * 24`), so a flat 72 h rule would report them as
    dead while they are fine. The tolerance is the source's own cadence plus
    `EXTERNAL_GRACE_H`.
    """
    return source.get("max_age_h", 30) + source.get("grace_h", EXTERNAL_GRACE_H)


def last_ok_hours(state_row: dict, data: dict) -> float | None:
    """Hours since this source last delivered fresh, non-empty data."""
    stamp = (state_row or {}).get("lastOkAt")
    if not stamp and data.get("status") == "OK":
        stamp = data.get("stamp", "")
    return age_hours(stamp or "")


def grade(source: dict, data: dict, probe_row: dict, state_row: dict) -> dict:
    """Fold one data verdict and one endpoint verdict into a single decision.

    ``verdict`` is OK, WARN (ignored), FAIL (ours to fix), FAIL-EXT (third party,
    tolerance exceeded) or SKIP. Which one it is matters more than the status:
    FAIL turns the publishing run red, FAIL-EXT only turns the daily watch red.
    """
    limit = stale_limit(source)
    kind = probe_row.get("kind")

    if kind == "unreachable":
        hours = last_ok_hours(state_row, data)
        if hours is None:
            return {
                "verdict": "WARN",
                "detail": f"uç nokta {probe_row['detail']} — son iyi veri bilinmiyor, tolerans {limit} sa",
            }
        if hours > limit:
            return {
                "verdict": "FAIL-EXT",
                "detail": f"{hours / 24:.1f} gündür taze veri yok (tolerans {limit} sa); uç nokta {probe_row['detail']}",
            }
        return {
            "verdict": "WARN",
            "detail": f"uç nokta {probe_row['detail']} — yok sayıldı ({hours:.0f} sa / {limit} sa)",
        }

    if probe_row.get("status") == "FAIL":
        reason = {"dead": "uç nokta kaldırılmış", "shape": "uç nokta tanınmıyor"}.get(kind, "uç nokta sorunlu")
        return {"verdict": "FAIL", "detail": f"{reason}: {probe_row['detail']} — veri: {data['detail']}"}

    if data.get("status") == "SKIP":
        return {"verdict": "OK", "detail": f"uç nokta {probe_row.get('detail', '—')}"}

    if data["status"] == "FAIL":
        return {"verdict": "FAIL", "detail": f"{data['detail']}; uç nokta sağlam"}

    if data["status"] == "WARN":
        return {"verdict": "WARN", "detail": data["detail"]}

    return {"verdict": "OK", "detail": data["detail"]}


def from_state_rows(state: dict) -> list[dict]:
    """Build the report from the committed ledger alone — no network at all.

    This is what `source-watch.yml` runs: the same tolerance, evaluated offline,
    so the watch costs five seconds and cannot be fooled by a bot wall aimed at
    GitHub's IP range.
    """
    rows: list[dict] = []
    for source in SOURCES:
        state_row = (state.get("sources") or {}).get(source["key"]) or {}
        hours = age_hours(state_row.get("lastOkAt", "") or "")
        limit = stale_limit(source)
        if hours is None:
            verdict, detail = "WARN", "durum dosyasında kayıt yok"
        elif hours > limit:
            verdict, detail = "FAIL-EXT", f"{hours / 24:.1f} gündür taze veri yok (tolerans {limit} sa)"
        elif hours > source.get("max_age_h", 30):
            verdict, detail = "WARN", f"son iyi veri {hours:.0f} sa önce (tolerans {limit} sa)"
        else:
            verdict, detail = "OK", f"son iyi veri {hours:.0f} sa önce"
        rows.append(
            {
                "key": source["key"],
                "label": source["label"],
                "file": source.get("file"),
                "items": state_row.get("items"),
                "ageHours": round(hours, 1) if hours is not None else None,
                "data": {"status": "SKIP", "detail": "durum dosyası"},
                "probe": {"status": "SKIP", "detail": "—"},
                "grade": {"verdict": verdict, "detail": detail},
            }
        )
    return rows


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Check data sources")
    parser.add_argument("--no-probe", action="store_true", help="skip HTTP probes")
    parser.add_argument("--json", action="store_true", help="print JSON only")
    parser.add_argument(
        "--fail-on-external",
        action="store_true",
        help="exit 2 when a third-party outage outlived its tolerance",
    )
    parser.add_argument(
        "--from-state",
        action="store_true",
        help="offline: read src/data/source-freshness.json only (for source-watch)",
    )
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    state = read_state()
    ledger: dict[str, dict] = {}
    rows: list[dict] = []

    if args.from_state:
        rows = from_state_rows(state)
        instagram = {"status": "SKIP", "detail": "durum modunda atlandı"}
        rows.append(
            {
                "key": "instagram",
                "label": "Instagram (Graph API)",
                "file": None,
                "items": None,
                "ageHours": None,
                "data": instagram,
                "probe": {"status": "SKIP", "detail": "—"},
                "grade": {"verdict": "SKIP", "detail": instagram["detail"]},
            }
        )
    else:
        for source in SOURCES:
            if source.get("file"):
                data = check_file(source)
            else:
                data = {"status": "SKIP", "detail": "—", "age": None, "items": None, "stamp": ""}
            if args.no_probe:
                probe_row = {"status": "SKIP", "kind": "skip", "detail": "—"}
            else:
                probe_row = probe(source["url"], source["marker"], source.get("timeout", 30))
            state_row = (state.get("sources") or {}).get(source["key"]) or {}
            row = {
                "key": source["key"],
                "label": source["label"],
                "file": source.get("file"),
                "items": data.get("items"),
                "ageHours": round(data["age"], 1) if data.get("age") is not None else None,
                "data": {"status": data["status"], "detail": data["detail"]},
                "probe": {"status": probe_row["status"], "detail": probe_row["detail"]},
                "grade": grade(source, data, probe_row, state_row),
            }
            rows.append(row)

            # The ledger only advances on evidence of fresh data: a file that was
            # rewritten while every fetch failed (hoy-milonga does that) proves
            # nothing, so the clock keeps its previous value.
            previous = (state_row.get("lastOkAt") or "") if state_row else ""
            if source.get("file"):
                last_ok = data["stamp"] if data["status"] == "OK" and data.get("stamp") else previous
            else:
                last_ok = now.isoformat(timespec="seconds") if probe_row["status"] == "OK" else previous
            ledger[source["key"]] = {
                "lastOkAt": last_ok,
                "verdict": row["grade"]["verdict"],
                "items": data.get("items"),
            }

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
                "grade": {
                    "verdict": {"OK": "OK", "WARN": "WARN", "FAIL": "FAIL", "SKIP": "SKIP"}[instagram["status"]],
                    "detail": instagram["detail"],
                },
            }
        )

    actionable = [row for row in rows if row["grade"]["verdict"] == "FAIL"]
    external = [row for row in rows if row["grade"]["verdict"] == "FAIL-EXT"]
    warnings = [row for row in rows if row["grade"]["verdict"] == "WARN"]

    if args.json:
        print(
            json.dumps(
                {"rows": rows, "failed": len(actionable), "external": len(external), "warnings": len(warnings)},
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        # A ledger nobody refreshes is evidence about *us*, not about the
        # sources: if the six-hourly pipeline stopped, every clock here is stale
        # too. Say that before the table, so the first thing read is the cause.
        ledger_note = ""
        ledger_age = age_hours(state.get("generatedAt", "") or "") if args.from_state else None
        if args.from_state:
            if ledger_age is None:
                ledger_note = "> Durum dosyası yok: `Update site` en az bir kez başarıyla koşunca oluşur."
            elif ledger_age > 12:
                ledger_note = (
                    f"> Durum dosyası {ledger_age:.0f} saattir güncellenmiyor — `Update site` hattı durmuş olabilir; "
                    "aşağıdaki yaşlar kaynağı değil hattı anlatır."
                )

        print("## Kaynak sağlığı\n")
        if ledger_note:
            print(ledger_note + "\n")
        print("| Kaynak | Kayıt | Yaş | Karar | Veri | Uç nokta |")
        print("|---|---|---|---|---|---|")
        for row in rows:
            items = "—" if row["items"] is None else str(row["items"])
            age = "—" if row["ageHours"] is None else f"{row['ageHours']:.0f} sa"
            print(
                f"| {row['label']} | {items} | {age} | "
                f"{row['grade']['verdict']}: {row['grade']['detail']} | "
                f"{row['data']['status']}: {row['data']['detail']} | "
                f"{row['probe']['status']}: {row['probe']['detail']} |"
            )
        print()
        if actionable:
            print(f"**{len(actionable)} kaynak bizde sorunlu:** " + ", ".join(row["label"] for row in actionable))
        if external:
            suffix = "" if args.fail_on_external else " — kırmızı için --fail-on-external"
            print(f"**{len(external)} kaynak üçüncü tarafta çökük:** " + ", ".join(row["label"] for row in external) + suffix)
        if warnings:
            print("Yok sayıldı: " + ", ".join(row["label"] for row in warnings))
        if not actionable and not external:
            print(f"Tüm kaynaklar sağlıklı ({len(rows)} kontrol).")

        if args.from_state and ledger_age is not None and ledger_age > 12:
            print(f"::warning title=Source freshness stale::src/data/source-freshness.json {ledger_age:.0f} saattir güncellenmiyor.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "source-health.json").write_text(
        json.dumps(
            {
                "generatedAt": now.isoformat(),
                "policy": {"externalGraceH": EXTERNAL_GRACE_H, "exit2WithFlag": args.fail_on_external},
                "rows": rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    # Only the full run owns the ledger. The watch must never rewrite a file it
    # cannot commit (read-only checkout) and must never overwrite the history
    # with its own derived numbers; `--no-probe` is a local diagnostic, so it
    # must not seed a half-checked ledger either.
    if not args.from_state and not args.no_probe:
        STATE_PATH.write_text(
            json.dumps(
                {"generatedAt": now.isoformat(timespec="seconds"), "sources": ledger},
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    if actionable:
        return 1
    if external and args.fail_on_external:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
