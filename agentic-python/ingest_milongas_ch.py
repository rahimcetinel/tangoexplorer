"""Ingest milongas.ch (Suisse romande) as a milonga source.

The home page renders the MEC calendar as one card per occurrence. Each card
carries the occurrence date in its link (`?occurrence=YYYY-MM-DD`), the local
time ("19:30 - 21:30"), a numbered category ("02. Milonga régulière"), the
venue/city and the DJ. Past cards are flagged with `mec-past-event`.

Writes src/data/milongas-ch.json.

Usage:
    python agentic-python/ingest_milongas_ch.py            # dry run
    python agentic-python/ingest_milongas_ch.py --publish
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
DATA_PATH = ROOT / "src" / "data" / "milongas-ch.json"
PAGE = "https://milongas.ch/"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"

CARD = re.compile(r'(?s)<article class="([^"]*mec-event-article[^"]*)"[^>]*>(.*?)</article>')
CLOCK = re.compile(r'mec-sl-clock-o"></i>\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})')
OCCURRENCE = re.compile(r"occurrence=(\d{4}-\d{2}-\d{2})")
TITLE = re.compile(r'(?s)<h4 class="mec-event-title"><a[^>]*href="([^"]+)"[^>]*>(.*?)</a>')
LABEL = re.compile(r'(?s)class="mec-label-normal"[^>]*>(.*?)</span>')
PLACE = re.compile(r'(?s)<div class="mec-event-loc-place">(.*?)</div>')


def fetch(url: str, timeout: int = 60) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def text(value: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", value))).strip()


def classify(label: str) -> str:
    low = label.lower()
    if not low or low.startswith("dj"):
        return ""
    if "practica" in low or "práctica" in low:
        return "practica"
    if "milonga" in low or "neotango" in low:
        return "milonga"
    return ""


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest milongas.ch")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()

    page = fetch(PAGE)
    cards = CARD.findall(page)
    print(f"cards: {len(cards)}")

    stats = Counter()
    occurrences: list[dict] = []
    for class_attr, body in cards:
        if "mec-past-event" in class_attr:
            stats["skip-past"] += 1
            continue
        title = TITLE.search(body)
        if not title:
            stats["skip-no-title"] += 1
            continue
        href, raw_name = title.group(1), text(title.group(2))
        date_match = OCCURRENCE.search(href)
        if not date_match:
            stats["skip-no-date"] += 1
            continue
        clock = CLOCK.search(body)
        if not clock:
            stats["skip-no-time"] += 1
            continue

        label = next((text(m.group(1)) for m in LABEL.finditer(body) if text(m.group(1))), "")
        etype = classify(label)
        if not etype:
            stats[f"skip-{label.split('. ')[-1][:24] or 'unlabelled'}"] += 1
            continue

        place = PLACE.search(body)
        venue, city = "", ""
        if place:
            parts = [part.strip() for part in text(place.group(1)).split(",") if part.strip()]
            if len(parts) >= 2:
                venue, city = ", ".join(parts[:-1]), parts[-1]
            elif parts:
                city = parts[0]

        day = datetime.strptime(date_match.group(1), "%Y-%m-%d")
        occurrences.append(
            {
                "name": raw_name,
                "venue": venue,
                "city": city,
                "type": etype,
                "date": day,
                "weekday": day.weekday(),
                "start": clock.group(1),
                "end": clock.group(2),
                "url": href.split("?")[0],
                "organizers": "",
                "price": "",
                "address": "",
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
            item = build_item(
                cluster,
                source="milongasch",
                region="switzerland",
                country="Switzerland",
                source_url=PAGE,
            )
            if item:
                item["id"] = item["id"].replace("milongasch-", "mch-", 1)
                items.append(item)

    items.sort(key=lambda row: (row["city"], row["days"][0], row["start"], row["name"]))
    print(f"series kept: {len(items)}")
    print("patterns:", Counter(item["schedule"] for item in items))
    print("skipped:", dict(stats))
    print("cities:", dict(Counter(item["city"] for item in items).most_common()))
    for item in items[:8]:
        print(f"  {item['days'][0][:3]} {item['start']}-{item['end']} {item['city']:<12} {item['name'][:44]:<46} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "milongasch", "name": "milongas.ch", "url": PAGE},
        "regions": [
            {"id": "switzerland", "labelEn": "Switzerland", "labelTr": "İsviçre", "count": len(items)}
        ],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "milongas-ch.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
