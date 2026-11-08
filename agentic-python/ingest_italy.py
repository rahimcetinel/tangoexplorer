"""Ingest FAItango's agenda (Italy) as a milonga source.

The agenda page is server-rendered and paginated:
``/agenda-eventi?f[tE][6]=6&f[tE][7]=7&f[dT][0]=…&f[dT][1]=…&cerca=1&page=N``
(type 6 = Milonga, 7 = Pratica). Rows are grouped under an ``<h1>`` day
heading and carry the province/city, the title, the organiser and the event
page. Times live only on the event page, so we fetch one page per series (the
next occurrence) to read start/end, venue and address.

The calendar moves weekly, so the script refreshes at most every N days
(``--max-age-days``, default 5) unless ``--force`` is passed.

Writes src/data/milongas-it.json.

Usage:
    python agentic-python/ingest_italy.py            # dry run
    python agentic-python/ingest_italy.py --publish
"""

from __future__ import annotations

import argparse
import concurrent.futures as futures
import html as htmllib
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from milonga_series import build_item, cluster_series, norm

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-it.json"
AGENDA = "https://www.faitango.it/agenda-eventi"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"

MONTHS = {
    name: index
    for index, name in enumerate(
        ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
        start=1,
    )
}
HEADING = re.compile(r"(?s)<h1>\s*(?:\w+day)?\s*(\d{1,2})\s+([A-Za-z]+)\s*</h1>")
ROW_START = re.compile(r'<a name="evento-(\d+)"></a>')


def fetch(url: str, timeout: int = 60) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", value or ""))).strip()


def tidy_address(value: str) -> str:
    """'Via Savioli 3, Bologna , Bologna' → 'Via Savioli 3, Bologna'."""
    parts: list[str] = []
    for part in (piece.strip(" ,") for piece in clean(value).split(",")):
        if part and (not parts or parts[-1].lower() != part.lower()):
            parts.append(part)
    return ", ".join(parts)


def pick_year(day: int, month: int, start: date, end: date) -> int:
    for year in (start.year, start.year + 1):
        try:
            candidate = date(year, month, day)
        except ValueError:
            continue
        if start - timedelta(days=2) <= candidate <= end + timedelta(days=2):
            return year
    return start.year


def parse_agenda(page: str, start: date, end: date) -> list[dict]:
    headings = [(m.start(), int(m.group(1)), MONTHS.get(m.group(2), 0)) for m in HEADING.finditer(page)]
    rows: list[dict] = []
    for index, (position, day, month) in enumerate(headings):
        if not month:
            continue
        stop = headings[index + 1][0] if index + 1 < len(headings) else len(page)
        segment = page[position:stop]
        year = pick_year(day, month, start, end)
        try:
            when = date(year, month, day)
        except ValueError:
            continue
        starts = [m.start() for m in ROW_START.finditer(segment)]
        for row_index, offset in enumerate(starts):
            chunk = segment[offset : starts[row_index + 1] if row_index + 1 < len(starts) else len(segment)]
            kind = re.search(r'class="icon-event ([a-z]+)"', chunk)
            link = re.search(
                r'href="(https://www\.faitango\.it/scheda-evento-[^"]+)"[^>]*>\s*([^<]{3,})\s*</a>', chunk
            )
            organizer = re.search(r'href="https://www\.faitango\.it/scheda-associazione-[^"]*"[^>]*>\s*([^<]+?)\s*</a>', chunk)
            place = re.search(r'title="[^"]*"></span>&nbsp;(.*?)</div>', chunk, re.S)
            if not (kind and link):
                continue
            href = link.group(1).split("?")[0]
            city = ""
            if place:
                parts = [part.strip() for part in clean(place.group(1)).split(",") if part.strip()]
                if parts:
                    city = parts[-1]
            rows.append(
                {
                    "id": href.split("/scheda-evento-")[-1].split("/")[0],
                    "type": "practica" if kind.group(1) == "pratica" else "milonga",
                    "name": clean(link.group(2)),
                    "city": city,
                    "organizers": clean(organizer.group(1)) if organizer else "",
                    "url": href,
                    "date": datetime.combine(when, datetime.min.time()),
                    "weekday": when.weekday(),
                    # Times and venue are filled from the event page after the
                    # series is known; placeholders keep the shared clusterer happy.
                    "start": "00:00",
                    "end": "",
                    "venue": "",
                    "address": "",
                    "price": "",
                }
            )
    return rows


DETAIL_TIME = re.compile(r"Ora evento:\s*</b>\s*(\d{1,2}:\d{2})")
DETAIL_END = re.compile(r"Ora fine evento:\s*</b>\s*(\d{1,2}:\d{2})")
DETAIL_VENUE = re.compile(r"Locale:\s*</b>\s*(.*?)<br>", re.S)
DETAIL_ADDRESS = re.compile(r"Localita:\s*</b>\s*(.*?)<br>", re.S)
DETAIL_ORGANIZER = re.compile(r'scheda-associazione-[^"]*"[^>]*>\s*([^<]+?)\s*</a>')


def read_detail(url: str) -> dict:
    try:
        page = fetch(url, timeout=45)
    except Exception:  # noqa: BLE001
        return {}
    start = DETAIL_TIME.search(page)
    end = DETAIL_END.search(page)
    venue = DETAIL_VENUE.search(page)
    address = DETAIL_ADDRESS.search(page)
    organizer = DETAIL_ORGANIZER.search(page)
    return {
        "start": start.group(1) if start else "",
        "end": end.group(1) if end else "",
        "venue": clean(venue.group(1)) if venue else "",
        "address": tidy_address(address.group(1)) if address else "",
        "organizers": clean(organizer.group(1)) if organizer else "",
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest FAItango agenda")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--days", type=int, default=120)
    parser.add_argument("--max-age-days", type=float, default=5)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    if not args.force and DATA_PATH.exists():
        try:
            stamp = json.loads(DATA_PATH.read_text(encoding="utf-8")).get("generatedAt", "")
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(stamp)).total_seconds() / 86400
        except Exception:  # noqa: BLE001
            age = 1e9
        if age < args.max_age_days:
            print(f"fresh ({age:.1f} d old), skipping — use --force to refetch")
            return 0

    start = date.today()
    end = start + timedelta(days=args.days)
    base = {
        "f[tE][6]": "6",
        "f[tE][7]": "7",
        "f[dT][0]": start.strftime("%d/%m/%Y"),
        "f[dT][1]": end.strftime("%d/%m/%Y"),
        "cerca": "1",
    }

    rows: list[dict] = []
    for page_number in range(1, 25):
        query = urllib.parse.urlencode({**base, "page": str(page_number)})
        try:
            page = fetch(f"{AGENDA}?{query}")
        except urllib.error.HTTPError:
            break
        found = parse_agenda(page, start, end)
        rows.extend(found)
        print(f"page {page_number}: {len(found)} rows")
        if len(found) < 150:
            break

    unique: dict[tuple, dict] = {}
    for row in rows:
        unique[(row["name"], row["city"], row["date"])] = row
    rows = list(unique.values())
    print(f"occurrences: {len(rows)} | cities: {len({r['city'] for r in rows})}")

    buckets: dict[tuple, list[dict]] = {}
    for row in rows:
        buckets.setdefault((norm(row["name"]), norm(row["city"]), row["weekday"]), []).append(row)

    candidates: list[list[dict]] = []
    for series_rows in buckets.values():
        for cluster in cluster_series(series_rows):
            if len(cluster) >= 2:
                candidates.append(cluster)
    print(f"candidate series: {len(candidates)}")

    def enrich(cluster: list[dict]) -> dict | None:
        cluster.sort(key=lambda row: row["date"])
        today = date.today()
        upcoming = [row for row in cluster if row["date"].date() >= today]
        probe = (upcoming or cluster)[0]
        detail = read_detail(probe["url"])
        if not detail.get("start"):
            return None
        merged = {**probe, **{k: v for k, v in detail.items() if v}}
        cluster = [
            {**row, "start": merged["start"], "end": merged["end"], "venue": merged.get("venue", ""),
             "address": merged.get("address", ""), "organizers": merged.get("organizers", "")}
            for row in cluster
        ]
        item = build_item(cluster, source="italy", region="italy", country="Italy", source_url=AGENDA)
        if item:
            item["id"] = item["id"].replace("italy-", "ita-", 1)
        return item

    items: list[dict] = []
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for item in pool.map(enrich, candidates):
            if item:
                items.append(item)

    items.sort(key=lambda row: (row["city"], row["days"][0], row["start"], row["name"]))
    print(f"series kept: {len(items)}")
    print("patterns:", Counter(item["schedule"] for item in items))
    print("cities:", dict(Counter(item["city"] for item in items).most_common(12)))
    for item in items[:10]:
        print(f"  {item['days'][0][:3]} {item['start']}-{item['end']} {item['city'][:14]:<16} {item['name'][:42]:<44} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "italy", "name": "FAItango", "url": AGENDA},
        "regions": [{"id": "italy", "labelEn": "Italy", "labelTr": "İtalya", "count": len(items)}],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "italy.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
