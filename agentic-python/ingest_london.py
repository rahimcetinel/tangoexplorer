"""Ingest London Milongas as a milonga source.

``/calendar/`` renders the MEC monthly calendars for the next weeks: one
``<div class="mec-calendar-events-sec" data-mec-cell="YYYYMMDD">`` per day and
one ``<article class="mec-event-article">`` per occurrence, with the time, the
title, the event page and the venue/address.

We take the printed window (about five weeks), group occurrences into series and
keep the weekly/biweekly ones. The directory changes weekly, so the script
refreshes at most every N days.

Writes src/data/milongas-uk-london.json.

Usage:
    python agentic-python/ingest_london.py            # dry run
    python agentic-python/ingest_london.py --publish
"""

from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from milonga_series import build_item, cluster_series, norm

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-uk-london.json"
PAGE = "https://londonmilongas.co.uk/calendar/"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"

SECTION = re.compile(r'(?s)<div class="mec-calendar-events-sec"[^>]*data-mec-cell="(\d{8})"[^>]*>(.*?)(?=<div class="mec-calendar-events-sec"|$)')
ARTICLE = re.compile(r'(?s)<article class="mec-event-article[^"]*">(.*?)</article>')
TIME = re.compile(r'mec-sl-clock-o"></i>\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})')
TITLE = re.compile(r'(?s)class="mec-event-title"><a[^>]*href="([^"]+)"[^>]*>(.*?)</a>')
PLACE = re.compile(r'(?s)class="mec-event-loc-place">(.*?)</div>')
PRACTICA = re.compile(r"pr[áa]ctic", re.I)


def fetch(url: str, timeout: int = 60) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", value or ""))).strip()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest London Milongas")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--max-age-days", type=float, default=7)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if not args.force and DATA_PATH.exists():
        try:
            stamp = json.loads(DATA_PATH.read_text(encoding="utf-8")).get("generatedAt", "")
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(stamp)).total_seconds() / 86400
        except Exception:  # noqa: BLE001
            age = 1e9
        if age < args.max_age_days:
            print(f"fresh ({age:.1f} d old), skipping — use --force")
            return 0

    page = fetch(PAGE)
    sections = SECTION.findall(page)
    print(f"day sections: {len(sections)}")

    seen: dict[tuple, dict] = {}
    for day, body in sections:
        try:
            when = datetime.strptime(day, "%Y%m%d")
        except ValueError:
            continue
        for article in ARTICLE.findall(body):
            title = TITLE.search(article)
            if not title:
                continue
            post = re.search(r'data-mec-postid="(\d+)"', article)
            time = TIME.search(article)
            place = PLACE.search(article)
            name = clean(title.group(2))
            key = (post.group(1) if post else name, day)
            seen[key] = {
                "name": name,
                "venue": clean(place.group(1)).split(",")[0] if place else "",
                "address": clean(place.group(1)) if place else "",
                "city": "London",
                "type": "practica" if PRACTICA.search(name) else "milonga",
                "date": when,
                "weekday": when.weekday(),
                "start": time.group(1) if time else "",
                "end": time.group(2) if time else "",
                "url": title.group(1),
                "organizers": "",
                "price": "",
            }

    occurrences = [row for row in seen.values() if row["start"]]
    print(f"occurrences: {len(occurrences)}")
    dates = sorted({row["date"].date() for row in occurrences})
    if dates:
        print(f"window: {dates[0]} → {dates[-1]} ({len(dates)} days)")

    buckets: dict[tuple, list[dict]] = {}
    for row in occurrences:
        buckets.setdefault((norm(row["name"]), norm(row["venue"]), row["weekday"]), []).append(row)

    items: list[dict] = []
    for rows in buckets.values():
        for cluster in cluster_series(rows):
            item = build_item(cluster, source="london", region="united-kingdom", country="United Kingdom", source_url=PAGE)
            if item:
                item["id"] = item["id"].replace("london-", "ldn-", 1)
                items.append(item)

    items.sort(key=lambda row: (row["days"][0], row["start"], row["name"]))
    print(f"series kept: {len(items)}")
    print("schedule:", Counter(item["schedule"] for item in items))
    for item in items[:10]:
        print(f"  {item['days'][0][:3]} {item['start']}-{item['end']} {item['name'][:44]:<46} {item['venue'][:26]:<28} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "london", "name": "London Milongas", "url": PAGE},
        "regions": [{"id": "united-kingdom", "labelEn": "United Kingdom", "labelTr": "Birleşik Krallık", "count": len(items)}],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "london.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
