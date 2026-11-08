"""Ingest tangokalendern.se (Sweden) as a milonga source.

The site publishes one JSON-LD ItemList (`#tk-event-list-jsonld`) on its home
page with every upcoming occurrence, already carrying local times with an
offset, the venue and the organiser. The first word of each description is the
category ("Milonga på …", "Praktika på …"), which matches the API's `type`.

Writes src/data/milongas-se.json.

Usage:
    python agentic-python/ingest_sweden.py            # dry run
    python agentic-python/ingest_sweden.py --publish
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

from milonga_series import build_item, cluster_series, norm

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-se.json"
PAGE = "https://tangokalendern.se/"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"

TYPE_WORDS = {
    "milonga": "milonga",
    "praktika": "practica",
    "praktilonga": "practica",
}


def fetch(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest tangokalendern.se")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()

    html = fetch(PAGE)
    match = re.search(r'id="tk-event-list-jsonld">(.*?)</script>', html, re.S)
    if not match:
        print("ERROR: item list not found", file=sys.stderr)
        return 1
    events = [entry["item"] for entry in json.loads(match.group(1))["itemListElement"]]
    print(f"json-ld events: {len(events)}")

    stats = Counter()
    occurrences: list[dict] = []
    for event in events:
        description = (event.get("description") or "").strip()
        category = description.split(" ")[0].lower() if description else ""
        etype = TYPE_WORDS.get(category)
        if not etype:
            stats[f"skip-{category or 'unknown'}"] += 1
            continue
        start_raw = event.get("startDate") or ""
        if not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", start_raw):
            stats["skip-bad-date"] += 1
            continue
        try:
            start = datetime.fromisoformat(start_raw)
        except ValueError:
            stats["skip-bad-date"] += 1
            continue

        location = event.get("location") or {}
        address = location.get("address") or {}
        place = (location.get("name") or "").strip()
        venue, _, extra = place.partition(",")
        city = (address.get("addressLocality") or "").strip()
        organizer = (event.get("organizer") or {}).get("name", "")

        occurrences.append(
            {
                "name": (event.get("name") or "").strip(),
                "venue": venue.strip() or place,
                "address": extra.strip(),
                "city": city,
                "type": etype,
                "date": start.replace(tzinfo=None),
                "weekday": start.weekday(),
                "start": start.strftime("%H:%M"),
                "end": "",
                "url": event.get("url") or "",
                "organizers": organizer,
                "price": "",
            }
        )

    # Drop exact duplicates (same event listed twice for the same date).
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
            item = build_item(
                cluster,
                source="sweden",
                region="sweden",
                country="Sweden",
                source_url=PAGE,
            )
            if item:
                item["id"] = item["id"].replace("sweden-", "tkse-", 1)
                items.append(item)

    items.sort(key=lambda row: (row["city"], row["days"][0], row["start"], row["name"]))
    regions = Counter(item["region"] for item in items)
    print(f"series kept: {len(items)}")
    print("patterns:", Counter(item["schedule"] for item in items))
    print("skipped:", dict(stats))
    print("cities:", dict(Counter(item["city"] for item in items).most_common()))
    for item in items[:8]:
        print(f"  {item['days'][0][:3]} {item['start']} {item['city']:<12} {item['name'][:44]:<46} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "key": "sweden",
            "name": "tangokalendern.se",
            "url": PAGE,
        },
        "regions": [
            {"id": "sweden", "labelEn": "Sweden", "labelTr": "İsveç", "count": regions.get("sweden", 0)}
        ],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "sweden.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
