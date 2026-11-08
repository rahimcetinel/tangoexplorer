"""Deep-probe a shortlist of upstream tango calendars for machine-readable feeds.

Research helper. For each domain: fetch the homepage, list every feed-ish link
(.ics, .json, /api, rss, "subscribe"), then try the common WordPress event
REST routes and report HTTP status + item counts.

Usage:
    python agentic-python/probe_calendars.py
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / "out"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)

SHORTLIST = [
    "londonmilongas.co.uk",
    "www.tango-argentin.fr",
    "agendadeltango.com",
    "www.faitango.it",
    "tango-wien.at",
    "tango-calendar.de",
    "tangokalender-hamburg.de",
    "tangokalendern.se",
    "tangokalender.no",
    "tangokalender.dk",
    "milongas.ch",
    "tango-prague.info",
    "milongi.krakow.pl",
    "www.tangolx.com",
    "tangohub.ro",
    "milongos.lt",
    "tangocalendar.kr",
    "tangoevents.au",
    "www.newyorktango.com",
    "www.tangokalender.nl",
    "tangokalender.github.io",
    "tango-in-leipzig.de",
]

FEED_HINTS = ("ics", "ical", "json", "rss", "feed", "api", "calendar", "abonn", "export")


def get(url: str, timeout: int = 25, method: str = "GET") -> tuple[int, str, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            ctype = resp.headers.get("content-type", "")
            return resp.status, raw.decode("utf-8", "replace"), ctype
    except urllib.error.HTTPError as exc:
        return exc.code, "", ""
    except Exception:  # noqa: BLE001
        return 0, "", ""


def links(html: str, base: str) -> list[str]:
    out = set()
    for href in re.findall(r'href="([^"#]+)"', html):
        low = href.lower()
        if any(h in low for h in FEED_HINTS):
            if href.startswith("//"):
                href = "https:" + href
            elif href.startswith("/"):
                href = base + href
            out.add(href)
    return sorted(out)[:14]


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    report = []
    for domain in SHORTLIST:
        base = f"https://{domain}"
        status, html, _ = get(base)
        row: dict = {"domain": domain, "status": status}
        if status != 200:
            report.append(row)
            print(f"!{status} {domain}")
            continue
        row["title"] = (re.search(r"(?s)<title[^>]*>(.*?)</title>", html) or [None, ""])[1]
        row["feed_links"] = links(html, base)
        row["ld_events"] = html.count('"@type":"Event"') + html.count('"@type": "Event"')

        probes = {
            "mec": f"{base}/wp-json/mec/v1/events",
            "tribe": f"{base}/wp-json/tribe/events/v1/events?per_page=2",
            "ai1ec": f"{base}/wp-json/ai1ec/v1/events?limit=2",
            "wp_json": f"{base}/wp-json/",
        }
        row["feeds"] = {}
        for key, url in probes.items():
            st, body, ctype = get(url, 20)
            count = None
            if st == 200 and body:
                if key == "wp_json":
                    count = len(body)
                else:
                    try:
                        data = json.loads(body)
                        if isinstance(data, list):
                            count = len(data)
                        elif isinstance(data, dict):
                            count = len(data.get("events", data.get("data", []))) or None
                    except Exception:  # noqa: BLE001
                        count = None
            if st:
                row["feeds"][key] = {"status": st, "count": count, "ctype": ctype.split(";")[0]}
        report.append(row)
        feed_txt = " ".join(f"{k}:{v['status']}/{v['count']}" for k, v in row["feeds"].items() if v["status"] == 200)
        print(f"ok {domain:<30} ld={row['ld_events']:<4} feeds=[{feed_txt}]")
        for link in row["feed_links"][:6]:
            print(f"      link {link[:110]}")

    (OUT_DIR / "calendar-probe.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n-> {OUT_DIR / 'calendar-probe.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
