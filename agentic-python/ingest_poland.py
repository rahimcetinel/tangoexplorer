"""Ingest milongi.krakow.pl (Poland) as a milonga source.

The site prints a monthly calendar (`/kalendarz?m=YYYY-MM`) with one block per
day and one `<details class="calendar-event confirmed">` per milonga: time,
title and the venue address. "predicted" blocks are the site's own forecasts,
so they are skipped. Three months of pages are enough to classify weekly,
biweekly and monthly series.

Writes src/data/milongas-pl.json.

Usage:
    python agentic-python/ingest_poland.py            # dry run
    python agentic-python/ingest_poland.py --publish
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import sys
import urllib.request
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

from milonga_series import build_item, cluster_series, norm

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-pl.json"
PAGE = "https://milongi.krakow.pl/"
CALENDAR = "https://milongi.krakow.pl/kalendarz?m={month}"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"
MONTHS_AHEAD = 3

MONTHS = {
    # nominative (month heading) and genitive (day headings like "8 listopada")
    "styczen": 1,
    "styczeń": 1,
    "stycznia": 1,
    "luty": 2,
    "lutego": 2,
    "marzec": 3,
    "marca": 3,
    "kwiecien": 4,
    "kwiecień": 4,
    "kwietnia": 4,
    "maj": 5,
    "maja": 5,
    "czerwiec": 6,
    "czerwca": 6,
    "lipiec": 7,
    "lipca": 7,
    "sierpien": 8,
    "sierpień": 8,
    "sierpnia": 8,
    "wrzesien": 9,
    "wrzesień": 9,
    "września": 9,
    "pazdziernik": 10,
    "październik": 10,
    "października": 10,
    "listopad": 11,
    "listopada": 11,
    "grudzien": 12,
    "grudzień": 12,
    "grudnia": 12,
}

TAG_RE = re.compile(r"<[^>]+>")
DAY_MARK_RE = re.compile(r'<div class="calendar-day(?: [^"]*)?">')
EVENT_RE = re.compile(r'<details class="calendar-event (confirmed|predicted)">([\s\S]*?)</details>', re.S)
DATE_FULL_RE = re.compile(r'<span class="calendar-day-full">([^<]+)</span>')
TIME_RE = re.compile(r'<span class="calendar-event-time">([^<]+)</span>')
TITLE_RE = re.compile(r'<span class="calendar-event-title">([^<]+)</span>')
LOCATION_RE = re.compile(r'<div class="calendar-event-location">\s*<p>([\s\S]*?)</p>', re.S)


def fetch(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def text(html: str) -> str:
    return re.sub(r"\s+", " ", html_lib.unescape(TAG_RE.sub(" ", html))).strip()


def parse_day(label: str, heading_month: int, heading_year: int) -> date | None:
    match = re.search(r"(\d{1,2})\s+([A-Za-zĄ-ż]+)", label)
    if not match:
        return None
    day = int(match.group(1))
    month = MONTHS.get(match.group(2).lower())
    if not month:
        return None
    year = heading_year
    if month == 12 and heading_month == 1:
        year -= 1
    elif month == 1 and heading_month == 12:
        year += 1
    try:
        return date(year, month, day)
    except ValueError:
        return None


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest milongi.krakow.pl")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()

    today = datetime.now().date()
    months = []
    year, month = today.year, today.month
    for _ in range(MONTHS_AHEAD + 1):
        months.append((year, month))
        month += 1
        if month > 12:
            month = 1
            year += 1

    stats = Counter()
    occurrences: list[dict] = []
    for year, month in months:
        stamp = f"{year:04d}-{month:02d}"
        try:
            html = fetch(CALENDAR.format(month=stamp))
        except Exception as error:  # noqa: BLE001
            print(f"WARN {stamp}: {error}")
            stats["month-failed"] += 1
            continue
        heading = re.search(r'<h2 class="calendar-month">([^<]+)</h2>', html)
        if not heading:
            print(f"WARN {stamp}: no month heading")
            stats["month-failed"] += 1
            continue
        head_parts = heading.group(1).strip().split()
        head_month = MONTHS.get(head_parts[0].lower()) if head_parts else None
        head_year = int(head_parts[1]) if len(head_parts) > 1 and head_parts[1].isdigit() else None
        if not head_month or not head_year:
            stats["month-failed"] += 1
            continue
        if (head_year, head_month) != (year, month):
            # Out-of-range months fall back to the current one; do not shift dates.
            print(f"{stamp}: site returned {head_parts[0]} {head_year}, skipped")
            stats["month-clamped"] += 1
            continue
        year, month = head_year, head_month
        day_blocks = []
        marks = list(DAY_MARK_RE.finditer(html))
        for index, mark in enumerate(marks):
            end = marks[index + 1].start() if index + 1 < len(marks) else len(html)
            day_blocks.append(html[mark.end():end])
        kept = 0
        for block in day_blocks:
            full = DATE_FULL_RE.search(block)
            if not full:
                continue
            day = parse_day(full.group(1), month, year)
            if not day:
                stats["skip-bad-day"] += 1
                continue
            for kind, event in EVENT_RE.findall(block):
                time_match = TIME_RE.search(event)
                title_match = TITLE_RE.search(event)
                if not time_match or not title_match:
                    stats["skip-incomplete"] += 1
                    continue
                title = text(title_match.group(1))
                start = time_match.group(1).strip()
                location = LOCATION_RE.search(event)
                address = text(location.group(1)) if location else ""
                etype = "practica" if re.search(r"praktyk|practica|praktyka", title, re.I) else "milonga"
                stats[f"event-{kind}"] += 1
                occurrences.append(
                    {
                        "name": title,
                        "venue": "",
                        "address": address,
                        "city": "Kraków",
                        "type": etype,
                        "date": datetime.combine(day, datetime.min.time()),
                        "weekday": day.weekday(),
                        "start": start,
                        "end": "",
                        "url": PAGE,
                        "organizers": "",
                        "price": "",
                        "website": "",
                        "predicted": kind == "predicted",
                    }
                )
                kept += 1
        print(f"{stamp}: days={len(day_blocks)} events={kept}")

    unique: dict[tuple, dict] = {}
    for row in occurrences:
        key = (norm(row["name"]), row["date"].date(), row["start"])
        if key in unique and unique[key].get("predicted") and not row.get("predicted"):
            unique[key] = row
        elif key not in unique:
            unique[key] = row
    occurrences = [row for row in unique.values() if row["date"].date() >= today]
    print(f"occurrences: {len(occurrences)}")

    buckets: dict[tuple, list[dict]] = {}
    for row in occurrences:
        buckets.setdefault((norm(row["name"]), row["weekday"]), []).append(row)

    items: list[dict] = []
    for rows in buckets.values():
        for cluster in cluster_series(rows):
            item = build_item(
                cluster,
                source="krakow",
                region="poland",
                country="Poland",
                source_url=PAGE,
            )
            if item:
                items.append(item)

    items.sort(key=lambda row: (row["days"][0], row["start"], row["name"]))
    print(f"series kept: {len(items)}")
    print("patterns:", Counter(item["schedule"] for item in items))
    print("skipped:", dict(stats))
    for item in items[:10]:
        print(f"  {item['days'][0][:3]} {item['start']} {item['name'][:48]:<50} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "krakow", "name": "milongi.krakow.pl", "url": PAGE},
        "regions": [{"id": "poland", "labelEn": "Poland", "labelTr": "Polonya", "count": len(items)}],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "poland.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
