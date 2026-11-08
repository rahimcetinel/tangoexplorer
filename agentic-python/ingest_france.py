"""Ingest tango-argentin.fr (France) as a milonga source.

The Paris agenda page is server-rendered: one `<h6>` per day, one table row per
milonga (start time, name, address, `de 19h00 à 02h00`, price, DJ). The page
covers roughly four months, which is enough to recognise weekly and biweekly
series. Addresses carry a French postal code, so the city comes from there
(Paris, Arcueil, Montrouge…).

Writes src/data/milongas-fr.json.

Usage:
    python agentic-python/ingest_france.py            # dry run
    python agentic-python/ingest_france.py --publish
"""

from __future__ import annotations

import argparse
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
DATA_PATH = ROOT / "src" / "data" / "milongas-fr.json"
PAGE = "https://www.tango-argentin.fr/paris"
BASE = "https://www.tango-argentin.fr"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"

MONTHS = {
    "janvier": 1,
    "fevrier": 2,
    "février": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "aout": 8,
    "août": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "decembre": 12,
    "décembre": 12,
}
DAY_RE = re.compile(
    r"<h6 class=\"ta-red text-center alert-secondary text-dark\"[^>]*>\s*([^<]+?)\s*</h6>"
)
ROW_RE = re.compile(
    r"onclick=\"location\.href='([^']+)'\"[^>]*>(.*?)</span>\s*"
    r"<span style=\"font-size:0\.8rem\">([\s\S]*?)</span>",
    re.S,
)
TAG_RE = re.compile(r"<[^>]+>")
TIME_RE = re.compile(r"de\s+(\d{1,2})h(\d{2})\s*[àa]\s*(\d{1,2})h(\d{2})", re.I)
CITY_RE = re.compile(r"(\d{5})\s+([A-Za-zÀ-ÖØ-öø-ÿ'’ \-]+)\s*$")


def fetch(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def text(html: str) -> str:
    return re.sub(r"\s+", " ", TAG_RE.sub(" ", html.replace("<br>", " "))).strip()


def parse_day(label: str) -> date | None:
    parts = norm(label).split()
    if len(parts) < 4:
        return None
    try:
        day = int(parts[1])
        month = MONTHS.get(label.split()[2].lower())
        year = int(parts[-1])
    except (ValueError, IndexError):
        return None
    if not month:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def series_name(name: str) -> str:
    """Drop the weekly DJ/edition suffix so the same milonga clusters together."""
    head = re.split(r"\s+[-–|]\s+|\s*[(:]\s*", name)[0].strip()
    return head or name


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest tango-argentin.fr")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()

    html = fetch(PAGE)
    headers = list(DAY_RE.finditer(html))
    print(f"day headers: {len(headers)}")
    if not headers:
        print("ERROR: no day headers found", file=sys.stderr)
        return 1

    stats = Counter()
    occurrences: list[dict] = []
    for index, header in enumerate(headers):
        day = parse_day(header.group(1))
        if not day:
            stats["skip-bad-day"] += 1
            continue
        block = html[header.end(): headers[index + 1].start() if index + 1 < len(headers) else len(html)]
        for match in ROW_RE.finditer(block):
            href, raw_name, raw_info = match.groups()
            name = text(raw_name)
            info = text(raw_info)
            if not name or not info:
                stats["skip-empty"] += 1
                continue
            times = TIME_RE.search(info)
            if not times:
                stats["skip-no-time"] += 1
                continue
            start = f"{int(times.group(1)):02d}:{times.group(2)}"
            end = f"{int(times.group(3)):02d}:{times.group(4)}"
            address = info[: times.start()].strip(" ,")
            tail = info[times.end():].strip(" ,")
            price = re.split(r"\bDJ\b", tail, flags=re.I)[0].strip(" ,")
            city_match = CITY_RE.search(address)
            city = city_match.group(2).strip() if city_match else "Paris"
            organizer = ""
            dj = re.search(r"\bDJ\b\s*:?\s*(.+)$", tail, re.I)
            if dj:
                organizer = dj.group(1).strip(" ,")
            etype = "practica" if re.search(r"practi", name, re.I) else "milonga"
            occurrences.append(
                {
                    "name": series_name(name),
                    "venue": "",
                    "address": address,
                    "city": city,
                    "type": etype,
                    "date": datetime.combine(day, datetime.min.time()),
                    "weekday": day.weekday(),
                    "start": start,
                    "end": end,
                    "url": BASE + href if href.startswith("/") else href,
                    "organizers": organizer,
                    "price": price,
                    "website": "",
                }
            )

    unique: dict[tuple, dict] = {}
    for row in occurrences:
        unique[(norm(row["name"]), row["city"], row["date"].date(), row["start"])] = row
    occurrences = list(unique.values())
    print(f"occurrences: {len(occurrences)}")

    buckets: dict[tuple, list[dict]] = {}
    for row in occurrences:
        buckets.setdefault((norm(row["name"]), norm(row["city"]), row["weekday"]), []).append(row)

    items: list[dict] = []
    for rows in buckets.values():
        for cluster in cluster_series(rows):
            item = build_item(
                cluster,
                source="tangoargentin",
                region="france",
                country="France",
                source_url=PAGE,
            )
            if item:
                item["id"] = item["id"].replace("tangoargentin-", "targfr-", 1)
                items.append(item)

    items.sort(key=lambda row: (row["city"], row["days"][0], row["start"], row["name"]))
    print(f"series kept: {len(items)}")
    print("patterns:", Counter(item["schedule"] for item in items))
    print("skipped:", dict(stats))
    print("cities:", dict(Counter(item["city"] for item in items).most_common()))
    for item in items[:8]:
        print(f"  {item['days'][0][:3]} {item['start']} {item['city']:<12} {item['name'][:44]:<46} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "tangoargentin", "name": "tango-argentin.fr", "url": PAGE},
        "regions": [{"id": "france", "labelEn": "France", "labelTr": "Fransa", "count": len(items)}],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "france.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
