"""Probe the calendars Bailaspot cites and classify how ingestable they are.

Research helper. For every upstream domain found by
explore_bailaspot_sources.py, fetch the homepage + robots.txt and look for
machine-readable event feeds (WordPress REST, The Events Calendar, AI1EC,
Modern Events Calendar, iCal .ics, JSON endpoints).

Usage:
    python agentic-python/analyze_upstream.py            # all domains
    python agentic-python/analyze_upstream.py --only a.com,b.com
"""

from __future__ import annotations

import argparse
import concurrent.futures as futures
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)

# Platforms where events live inside a social network, not a website.
PLATFORMS = {
    "www.instagram.com", "www.facebook.com", "facebook.com", "t.me", "vk.com",
    "calendar.google.com", "sites.google.com", "www.meetup.com", "m.cafe.daum.net",
    "beacons.ai", "allevents.in", "www.brownbearsw.com", "www.tangotraveller.co",
}

CAL_PLUGINS = {
    "tribe": "The Events Calendar",
    "ai1ec": "All-in-One Event Calendar",
    "mec-": "Modern Events Calendar",
    "eventon": "EventON",
    "events-made-easy": "Events Made Easy",
    "simcal": "Simple Calendar",
    "calendarize": "Calendarize it",
    "wp-fullcalendar": "WP FullCalendar",
}


def get(url: str, timeout: int = 25) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, ""
    except Exception:  # noqa: BLE001
        return 0, ""


def probe(domain: str) -> dict:
    base = f"https://{domain}"
    status, html = get(base)
    if status != 200:
        status2, html2 = get(f"http://{domain}")
        if status2 == 200:
            base, status, html = f"http://{domain}", status2, html2

    out: dict = {"domain": domain, "status": status, "base": base}
    if status != 200:
        return out

    title = re.search(r"(?s)<title[^>]*>(.*?)</title>", html)
    out["title"] = re.sub(r"\s+", " ", title.group(1)).strip()[:110] if title else ""

    markers = []
    for key, label in CAL_PLUGINS.items():
        if key in html:
            markers.append(label)
    out["wp"] = "wp-content" in html or "wp-json" in html
    out["plugins"] = markers

    out["ics"] = len(re.findall(r"\.ics\b", html, re.I))
    out["json_feed"] = bool(re.search(r"wp-json|/api/|\.json\b", html))
    out["event_ld"] = html.count('"@type":"Event"') + html.count('"@type": "Event"')
    out["dates"] = len(re.findall(r"\b20\d{2}-\d{2}-\d{2}\b", html))

    _, robots = get(f"{base}/robots.txt")
    disallow = [line.split(":", 1)[1].strip() for line in robots.splitlines() if line.lower().startswith("disallow:") and len(line) > 12]
    out["robots_disallow"] = disallow[:6]
    out["sitemap"] = "Sitemap:" in robots

    if out["wp"]:
        st, body = get(f"{base}/wp-json/wp/v2/types")
        if st == 200:
            types = re.findall(r'"slug":"([a-z0-9_\-]+)"', body)
            out["wp_types"] = [t for t in types if "event" in t or "milonga" in t or "calendar" in t][:6]
        st, body = get(f"{base}/wp-json/tribe/events/v1/events?per_page=1")
        out["tribe_rest"] = st == 200
        st, body = get(f"{base}/wp-json/ai1ec/v1/events")
        out["ai1ec_rest"] = st == 200
    return out


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    data = json.loads((OUT_DIR / "bailaspot-sources.json").read_text(encoding="utf-8"))
    domains = [d for d in data["domains"] if d not in PLATFORMS]
    if args.only:
        wanted = {d.strip() for d in args.only.split(",") if d.strip()}
        domains = [d for d in domains if d in wanted]
    print(f"probing {len(domains)} domains ...")

    results = []
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for row in pool.map(probe, domains):
            results.append(row)
            flag = "ok " if row.get("status") == 200 else f"!{row.get('status')}"
            print(f"{flag} {row['domain']:<38} {row.get('title','')[:60]}")

    (OUT_DIR / "upstream-probe.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    good = [r for r in results if r.get("status") == 200]
    api = [r for r in good if r.get("tribe_rest") or r.get("ai1ec_rest") or (r.get("wp_types") or [])]
    print(f"\n{len(good)}/{len(results)} reachable · {len(api)} WordPress event APIs")
    for r in api:
        print(f"   API {r['domain']:<36} types={r.get('wp_types')} tribe={r.get('tribe_rest')} ai1ec={r.get('ai1ec_rest')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
