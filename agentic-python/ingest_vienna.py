"""Ingest tango-wien.at (Vienna) as a milonga source.

The calendar renders one HTML card per occurrence in its ISO-week view
(``/kalender/woche/2026-46``). Cards carry ``data-category``
(Milonga / Practica / Kurs / Workshop …), ``data-occurrence-date``, start/end
``<time>`` elements, the venue and the organiser.

We walk the next N ISO weeks, keep milongas and practicas and group them into
weekly series.

Writes src/data/milongas-at.json.

Usage:
    python agentic-python/ingest_vienna.py            # dry run
    python agentic-python/ingest_vienna.py --publish
"""

from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from milonga_series import build_item, cluster_series, norm

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-at.json"
PAGE = "https://tango-wien.at/kalender"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"

CATEGORY = {
    "milonga": "milonga",
    "practica": "practica",
}

CARD = re.compile(r'(?s)<article[^>]*class="[^"]*week-event-card[^"]*"[^>]*>.*?</article>')
TIME = re.compile(r'<time class="time-display[^"]*" datetime="[^"]*T(\d{2}:\d{2})[^"]*">')
TITLE = re.compile(r'(?s)<h3 class="week-card-title[^"]*">\s*(.*?)\s*</h3>')
VENUE = re.compile(r'(?s)<p class="event-venue">(.*?)</p>')


def fetch(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", value or ""))).strip()


def iso_weeks(start: date, count: int) -> list[str]:
    weeks = []
    for offset in range(count):
        day = start + timedelta(days=7 * offset)
        year, week, _ = day.isocalendar()
        weeks.append(f"{year}-{week:02d}")
    return weeks


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest tango-wien.at")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--weeks", type=int, default=12)
    args = parser.parse_args()

    today = date.today()
    weeks = iso_weeks(today, args.weeks)
    stats = Counter()
    occurrences: list[dict] = []

    for week in weeks:
        try:
            page = fetch(f"{PAGE}/woche/{week}")
        except urllib.error.HTTPError as exc:
            stats[f"week-{week}-http-{exc.code}"] += 1
            continue
        cards = CARD.findall(page)
        for card in cards:
            category = re.search(r'data-category="([^"]*)"', card)
            etype = CATEGORY.get((category.group(1) if category else "").strip().lower())
            if not etype:
                stats[f"skip-{(category.group(1) if category else 'none').lower()[:16]}"] += 1
                continue
            occurrence = re.search(r'data-occurrence-date="(\d{4}-\d{2}-\d{2})"', card)
            href = re.search(r'href="(https://tango-wien\.at/veranstaltung/[^"]+)"', card)
            title = TITLE.search(card)
            times = TIME.findall(card)
            if not (occurrence and title and times):
                stats["skip-incomplete"] += 1
                continue
            day = datetime.strptime(occurrence.group(1), "%Y-%m-%d")
            venue_raw = clean(VENUE.search(card).group(1)) if VENUE.search(card) else ""
            venue, _, district = venue_raw.partition("·")
            organizer = re.search(r'data-organizer-name="([^"]*)"', card)

            occurrences.append(
                {
                    "name": clean(title.group(1)),
                    "venue": venue.strip(),
                    "address": f"{district.strip()}, Wien" if district.strip() else "Wien",
                    "city": "Wien",
                    "type": etype,
                    "date": day,
                    "weekday": day.weekday(),
                    "start": times[0],
                    "end": times[1] if len(times) > 1 else "",
                    "url": href.group(1) if href else PAGE,
                    "organizers": htmllib.unescape(organizer.group(1)) if organizer else "",
                    "price": "",
                }
            )

    unique: dict[tuple, dict] = {}
    for row in occurrences:
        unique[(row["name"], row["venue"], row["date"])] = row
    occurrences = list(unique.values())
    print(f"weeks: {len(weeks)} | occurrences: {len(occurrences)}")

    buckets: dict[tuple, list[dict]] = {}
    for row in occurrences:
        buckets.setdefault((norm(row["name"]), norm(row["venue"]), row["weekday"]), []).append(row)

    items: list[dict] = []
    for rows in buckets.values():
        for cluster in cluster_series(rows):
            item = build_item(cluster, source="vienna", region="austria", country="Austria", source_url=PAGE)
            if item:
                item["id"] = item["id"].replace("vienna-", "vie-", 1)
                items.append(item)

    items.sort(key=lambda row: (row["days"][0], row["start"], row["name"]))
    print(f"series kept: {len(items)}")
    print("patterns:", Counter(item["schedule"] for item in items))
    print("skipped:", dict(stats))
    for item in items[:10]:
        print(f"  {item['days'][0][:3]} {item['start']}-{item['end']} {item['name'][:44]:<46} {item['venue'][:26]:<28} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "vienna", "name": "tango-wien.at", "url": PAGE},
        "regions": [{"id": "austria", "labelEn": "Austria", "labelTr": "Avusturya", "count": len(items)}],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "vienna.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
