"""Ingest tangokalender.nl (Netherlands) as a milonga source.

The site is an old ASP.NET WebForms app: ``evenementagenda.aspx`` shows one day
of salons, and the calendar navigates by postback
(``__EVENTTARGET=…Calendar1``, ``__EVENTARGUMENT=<days since 2000-01-01>``).
We keep the session, chain the ``__VIEWSTATE`` from each response and walk the
next N days, reading the ``GridView1`` table (plaats / tijd / evenement /
locatie / prijs). Cancelled rows are struck through and skipped.

Writes src/data/milongas-nl.json.

Usage:
    python agentic-python/ingest_netherlands.py            # dry run
    python agentic-python/ingest_netherlands.py --publish
"""

from __future__ import annotations

import argparse
import html as htmllib
import http.cookiejar
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from milonga_series import build_item, cluster_series, norm

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-nl.json"
URL = "https://www.tangokalender.nl/evenementagenda.aspx"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"
EPOCH = date(2000, 1, 1)

# The agenda covers "Nederland en omstreken": a few German and Belgian towns
# appear too. German ones join the German bucket; Belgian ones are dropped
# because we have no Belgian country yet and mislabelling them is worse.
GERMAN_CITIES = {"aken", "keulen", "dusseldorf", "duisburg", "kleve"}
BELGIAN_CITIES = {"antwerpen", "gent", "hasselt", "turnhout", "luik", "brussel", "brugge", "mechelen"}
SKIP_CITIES = {"online", ""}

ROW = re.compile(r'(?s)<tr class="GridView(?:Row|AlternatingRow)Style"[^>]*>(.*?)</tr>')
CELL = re.compile(r"(?s)<td[^>]*>(.*?)</td>")
TIME = re.compile(r"(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})")


def strip_tags(value: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", value or ""))).strip()


def hidden(page: str, name: str) -> str:
    match = re.search(rf'name="{re.escape(name)}"[^>]*value="([^"]*)"', page)
    return match.group(1) if match else ""


class Session:
    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def get(self) -> str:
        request = urllib.request.Request(URL, headers={"User-Agent": UA})
        with self.opener.open(request, timeout=60) as response:
            return response.read().decode("utf-8", "replace")

    def post_day(self, viewstate: str, generator: str, day: date) -> str:
        payload = {
            "__EVENTTARGET": "ctl00$ContentPlaceHolder1$Calendar1",
            "__EVENTARGUMENT": str((day - EPOCH).days),
            "__LASTFOCUS": "",
            "__VIEWSTATE": viewstate,
            "__VIEWSTATEGENERATOR": generator,
        }
        request = urllib.request.Request(
            URL,
            data=urllib.parse.urlencode(payload).encode(),
            headers={
                "User-Agent": UA,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": URL,
            },
        )
        with self.opener.open(request, timeout=60) as response:
            return response.read().decode("utf-8", "replace")


def parse_day(page: str, day: date) -> list[dict]:
    rows: list[dict] = []
    for row_html in ROW.findall(page):
        if "<strike>" in row_html.lower():
            continue
        cells = CELL.findall(row_html)
        if len(cells) < 4:
            continue
        city = strip_tags(cells[0])
        time = TIME.search(strip_tags(cells[1]).replace(" ", ""))
        name = strip_tags(cells[2])
        location = cells[3]
        if not (city and name and time):
            continue
        parts = re.split(r"(?i)<br\s*/?>", location)
        venue = strip_tags(parts[0]) if parts else ""
        address = strip_tags(parts[1]) if len(parts) > 1 else ""
        remarks = strip_tags(cells[5]) if len(cells) > 5 else ""
        if "geen salon" in remarks.lower():
            continue
        name = re.sub(r"^[>\s]*reserveren\s*", "", name, flags=re.I).strip()
        start = f"{int(time.group(1)):02d}:{time.group(2)}"
        end = f"{int(time.group(3)):02d}:{time.group(4)}"
        rows.append(
            {
                "name": name,
                "city": city,
                "venue": venue,
                "address": address,
                "type": "practica" if re.search(r"pr[áa]ctic", name, re.I) else "milonga",
                "date": datetime.combine(day, datetime.min.time()),
                "weekday": day.weekday(),
                "start": start,
                "end": end,
                "url": URL,
                "organizers": "",
                "price": strip_tags(cells[4]) if len(cells) > 4 else "",
            }
        )
    return rows


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest tangokalender.nl")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--days", type=int, default=56)
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

    session = Session()
    page = session.get()
    viewstate = hidden(page, "__VIEWSTATE")
    generator = hidden(page, "__VIEWSTATEGENERATOR")
    print(f"opened session (viewstate {len(viewstate)} chars)")

    today = date.today()
    occurrences: list[dict] = []
    empty_days = 0
    for offset in range(args.days):
        day = today + timedelta(days=offset)
        page = session.post_day(viewstate, generator, day)
        viewstate = hidden(page, "__VIEWSTATE") or viewstate
        generator = hidden(page, "__VIEWSTATEGENERATOR") or generator
        rows = parse_day(page, day)
        if not rows:
            empty_days += 1
        occurrences.extend(rows)
        if offset % 7 == 0:
            print(f"  {day}: {len(rows)} salons")

    print(f"days: {args.days} | occurrences: {len(occurrences)} | empty days: {empty_days}")

    unique: dict[tuple, dict] = {}
    for row in occurrences:
        unique[(row["name"], row["venue"], row["date"])] = row
    occurrences = list(unique.values())

    dutch: list[dict] = []
    german: list[dict] = []
    for row in occurrences:
        key = norm(row["city"])
        low = (row["city"] or "").lower()
        if key in SKIP_CITIES or key in BELGIAN_CITIES or "(b)" in low or "(be)" in low:
            continue
        if key in GERMAN_CITIES or "(d)" in low:
            german.append(row)
        else:
            dutch.append(row)
    print(f"dutch occurrences: {len(dutch)} | german: {len(german)}")

    items: list[dict] = []
    for rows, source_region, source_country in (
        (dutch, "netherlands", "Netherlands"),
        (german, "germany", "Germany"),
    ):
        buckets: dict[tuple, list[dict]] = {}
        for row in rows:
            buckets.setdefault((norm(row["name"]), norm(row["venue"]), row["weekday"]), []).append(row)
        for cluster in buckets.values():
            for group in cluster_series(cluster):
                item = build_item(group, source="netherlands", region=source_region, country=source_country, source_url=URL)
                if item:
                    item["id"] = item["id"].replace("netherlands-", "nld-", 1)
                    items.append(item)

    items.sort(key=lambda row: (row["city"], row["days"][0], row["start"], row["name"]))
    print(f"series kept: {len(items)}")
    print("schedule:", Counter(item["schedule"] for item in items))
    print("cities:", dict(Counter(item["city"] for item in items).most_common(12)))
    for item in items[:10]:
        print(f"  {item['days'][0][:3]} {item['start']}-{item['end']} {item['city'][:14]:<16} {item['name'][:42]:<44} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "netherlands", "name": "tangokalender.nl", "url": URL},
        "regions": [{"id": "netherlands", "labelEn": "Netherlands", "labelTr": "Hollanda", "count": len(items)}],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "netherlands.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
