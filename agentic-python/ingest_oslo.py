"""Ingest tango.oslo.no (Norway) as a milonga source.

The site publishes an iCalendar feed (``/kalender.ics``) with one VEVENT per
occurrence, a CATEGORIES field (Milonga / Practica / Kurs / Workshop / Festival)
and an event page URL. Times are UTC (``DTSTART:20261009T150000Z``); the feed's
X-WR-TIMEZONE is Europe/Oslo, so we shift to CET/CEST before storing.

Writes src/data/milongas-no.json.

Usage:
    python agentic-python/ingest_oslo.py            # dry run
    python agentic-python/ingest_oslo.py --publish
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from milonga_series import build_item, cet_to_local, cluster_series, norm

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-no.json"
PAGE = "https://tango.oslo.no/"
FEED = "https://tango.oslo.no/kalender.ics"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"

WANTED = {"milonga", "practica"}


def fetch(url: str, accept: str = "text/calendar", timeout: int = 60) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def unfold(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n[ \t]", "", text)


def unescape(value: str) -> str:
    return (
        value.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
        .strip()
    )


def field(block: str, name: str) -> str:
    match = re.search(rf"^{name}[^:\n]*:(.*)$", block, re.M)
    return unescape(match.group(1)) if match else ""


def parse_utc(value: str) -> datetime | None:
    try:
        return datetime.strptime(value.strip().rstrip("Z"), "%Y%m%dT%H%M%S")
    except ValueError:
        return None


def split_location(raw: str) -> tuple[str, str, str]:
    """'Sentralen, Øvre Slottsgate 3, 0157 Oslo' → venue, address, city."""
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    if not parts:
        return "", "", ""
    venue = parts[0]
    city, address = "", ""
    if len(parts) > 1:
        tail = parts[-1]
        match = re.search(r"\b\d{4}\s+(.+)$", tail)
        city = match.group(1).strip() if match else tail
        address = ", ".join(parts[1:-1]) if len(parts) > 2 else ""
    return venue, address, city


def category_type(raw: str) -> str:
    labels = {part.strip().lower() for part in raw.split(",") if part.strip()}
    if "practica" in labels or "praktika" in labels:
        return "practica"
    if "milonga" in labels:
        return "milonga"
    return ""


def meta_value(description: str, label: str) -> str:
    match = re.search(rf"^{label}:\s*(.+)$", description, re.M)
    return match.group(1).strip() if match else ""


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest tango.oslo.no")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()

    text = unfold(fetch(FEED))
    blocks = re.findall(r"(?s)BEGIN:VEVENT(.*?)END:VEVENT", text)
    print(f"feed: {len(blocks)} events")

    stats = Counter()
    occurrences: list[dict] = []
    for block in blocks:
        if field(block, "STATUS").upper() == "CANCELLED":
            stats["skip-cancelled"] += 1
            continue
        etype = category_type(field(block, "CATEGORIES"))
        if not etype:
            stats[f"skip-{field(block, 'CATEGORIES').lower()[:18] or 'uncategorised'}"] += 1
            continue
        start_utc = parse_utc(field(block, "DTSTART"))
        if start_utc is None:
            stats["skip-bad-date"] += 1
            continue
        end_utc = parse_utc(field(block, "DTEND"))
        start = cet_to_local(start_utc)
        end = cet_to_local(end_utc) if end_utc else None

        venue, address, city = split_location(field(block, "LOCATION"))
        description = field(block, "DESCRIPTION")
        occurrences.append(
            {
                "name": field(block, "SUMMARY"),
                "venue": venue,
                "address": address,
                "city": city,
                "type": etype,
                "date": start,
                "weekday": start.weekday(),
                "start": start.strftime("%H:%M"),
                "end": end.strftime("%H:%M") if end else "",
                "url": field(block, "URL"),
                "organizers": meta_value(description, "Arrangør"),
                "price": meta_value(description, "Pris"),
                "uid": field(block, "UID"),
            }
        )

    unique: dict[tuple, dict] = {}
    for row in occurrences:
        unique[(row["name"], row["venue"], row["date"])] = row
    occurrences = list(unique.values())
    print(f"occurrences: {len(occurrences)}")

    buckets: dict[tuple, list[dict]] = {}
    for row in occurrences:
        buckets.setdefault((norm(row["name"]), norm(row["venue"]), row["weekday"]), []).append(row)

    items: list[dict] = []
    for rows in buckets.values():
        for cluster in cluster_series(rows):
            item = build_item(cluster, source="oslo", region="norway", country="Norway", source_url=PAGE)
            if item:
                item["id"] = item["id"].replace("oslo-", "osl-", 1)
                items.append(item)

    items.sort(key=lambda row: (row["city"], row["days"][0], row["start"], row["name"]))
    print(f"series kept: {len(items)}")
    print("patterns:", Counter(item["schedule"] for item in items))
    print("skipped:", dict(stats))
    print("cities:", dict(Counter(item["city"] for item in items).most_common()))
    for item in items[:8]:
        print(f"  {item['days'][0][:3]} {item['start']}-{item['end']} {item['city']:<10} {item['name'][:44]:<46} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "oslo", "name": "tango.oslo.no", "url": PAGE, "feed": FEED},
        "regions": [{"id": "norway", "labelEn": "Norway", "labelTr": "Norveç", "count": len(items)}],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "oslo.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
