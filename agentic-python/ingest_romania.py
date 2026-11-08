"""Ingest milonga.ro (Romania) as a milonga source.

milonga.ro is a WordPress site with one post per recurring milonga in
Bucharest; the post title carries the weekday ("Milonga la Valaori (Sat)") and
the body the time, address and contribution. The site is slow (20–40 s per
request) and its REST API is behind a firewall (401), so we scrape the category
archive and the few post pages with generous timeouts.

Writes src/data/milongas-ro.json.

Usage:
    python agentic-python/ingest_romania.py            # dry run
    python agentic-python/ingest_romania.py --publish
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import sys
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from milonga_series import build_item, norm

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-ro.json"
ARCHIVE = "https://milonga.ro/category/milonga/"
PAGE = "https://milonga.ro/"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"
TIMEOUT = 120
WEEKS_AHEAD = 6

DAY_WORDS = {
    "mon": 0,
    "tue": 1,
    "wed": 2,
    "thu": 3,
    "fri": 4,
    "sat": 5,
    "sun": 6,
}

RO_DAYS = {
    "luni": 0,
    "marți": 1,
    "marti": 1,
    "miercuri": 2,
    "joi": 3,
    "vineri": 4,
    "sâmbătă": 5,
    "sambata": 5,
    "sâmbata": 5,
    "duminică": 6,
    "duminica": 6,
}

TAG_RE = re.compile(r"<[^>]+>")


def fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read().decode("utf-8", "replace")


def text(html: str) -> str:
    body = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html)
    return html_lib.unescape(re.sub(r"\s+", " ", TAG_RE.sub(" ", body))).strip()


def weekday_of(title: str, body: str) -> int | None:
    paren = re.search(r"\((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\)", title, re.I)
    if paren:
        return DAY_WORDS[paren.group(1).lower()]
    for word, index in RO_DAYS.items():
        if re.search(rf"\b{word}\b", body, re.I):
            return index
    return None


def start_time(body: str) -> str:
    for pattern in (r"Ora:\s*(\d{1,2})[:.](\d{2})", r"de la\s+(\d{1,2})[.:](\d{2})", r"Time:\s*(\d{1,2}):(\d{2})"):
        match = re.search(pattern, body, re.I)
        if match:
            return f"{int(match.group(1)):02d}:{match.group(2)}"
    return ""


def end_time(body: str) -> str:
    match = re.search(r"(?:până la|pana la|până\s+la|until)\s*(\d{1,2})[.:](\d{2})", body, re.I)
    return f"{int(match.group(1)):02d}:{match.group(2)}" if match else ""


def address_of(body: str) -> str:
    match = re.search(
        r"(?:Locație|Locatie|Address):\s*(.+?)(?:Participare|Contribution|Link|Sumele|Time:|TDJ:|$)",
        body,
        re.I,
    )
    if not match:
        return ""
    value = match.group(1).strip(" .;")
    return value[:160]


def price_of(body: str) -> str:
    match = re.search(r"(?:Participare|Contribution):\s*([^.;]{1,40}?)(?:\s+Link\b|$)", body, re.I)
    return match.group(1).strip() if match else ""


def post_links(archive: str) -> list[str]:
    links = re.findall(r'href="(https://milonga\.ro/[a-z0-9\-]+/)"', archive)
    return sorted(
        {
            link
            for link in links
            if not re.search(r"wp-|category|contact|evenimente|author|feed|/page/", link)
        }
    )


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest milonga.ro")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--limit", type=int, default=12, help="max post pages to fetch")
    args = parser.parse_args()

    try:
        archive = fetch(ARCHIVE)
    except Exception as error:  # noqa: BLE001
        print(f"ERROR archive: {error}", file=sys.stderr)
        return 1
    links = post_links(archive)[: args.limit]
    print(f"posts: {len(links)}")

    today = date.today()
    stats = Counter()
    occurrences: list[dict] = []
    for link in links:
        try:
            html = fetch(link)
        except Exception as error:  # noqa: BLE001
            print(f"WARN {link}: {error}")
            stats["post-failed"] += 1
            continue
        body = text(html)
        title_match = re.search(r'<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)</h1>', html)
        title = text(title_match.group(1)) if title_match else ""
        if not title:
            title = (re.search(r"<title>([^<]*)</title>", html) or [None, ""])[1].split(" in Bucuresti")[0].strip()
        weekday = weekday_of(title, body)
        start = start_time(body)
        if weekday is None or not start:
            stats["skip-incomplete"] += 1
            print(f"  skip {link} (weekday={weekday}, start={start!r})")
            continue
        name = re.sub(r"\s*\((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\)\s*$", "", title, flags=re.I).strip()
        organizer = ""
        place = re.search(r"Event by\s+([^,]+)", body)
        if place:
            organizer = place.group(1).strip()
        occurrence = {
            "name": name,
            "venue": "",
            "address": address_of(body),
            "city": "Bucharest",
            "type": "practica" if re.search(r"practic", name, re.I) else "milonga",
            "date": datetime.combine(today, datetime.min.time()),
            "weekday": weekday,
            "start": start,
            "end": end_time(body),
            "url": link,
            "organizers": organizer,
            "price": price_of(body),
            "website": "",
        }
        # The posts describe a recurring weekly milonga: synthesise the next
        # occurrences so build_item can classify and date the series.
        offset = (weekday - today.weekday()) % 7
        for week in range(WEEKS_AHEAD):
            row = dict(occurrence)
            row["date"] = datetime.combine(today + timedelta(days=offset + 7 * week), datetime.min.time())
            occurrences.append(row)
        print(f"  {name[:40]:<42} {['mon','tue','wed','thu','fri','sat','sun'][weekday]} {start} {address_of(body)[:36]}")

    print(f"occurrences: {len(occurrences)}")

    buckets: dict[tuple, list[dict]] = {}
    for row in occurrences:
        buckets.setdefault((norm(row["name"]), norm(row["venue"]), row["weekday"]), []).append(row)

    items: list[dict] = []
    for rows in buckets.values():
        for cluster in [rows]:
            item = build_item(
                cluster,
                source="milongaro",
                region="romania",
                country="Romania",
                source_url="",
            )
            if item:
                item["schedule"] = "weekly"
                items.append(item)

    items.sort(key=lambda row: (row["days"][0], row["start"], row["name"]))
    print(f"series kept: {len(items)}")
    print("skipped:", dict(stats))
    for item in items:
        print(f"  {item['days'][0][:3]} {item['start']} {item['name'][:40]:<42} {item['price'][:16]}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "milongaro", "name": "Milonga.ro", "url": PAGE},
        "regions": [{"id": "romania", "labelEn": "Romania", "labelTr": "Romanya", "count": len(items)}],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "romania.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
