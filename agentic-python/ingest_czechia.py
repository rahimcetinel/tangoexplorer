"""Ingest tango-prague.info (Czechia) as a milonga source.

The site publishes its agenda as public Google Calendar feeds. The ICS carries
UTC timestamps (`DTSTART:...Z`) and recurring masters (`RRULE`), so we expand
weekly/monthly rules inside the window we care about and convert to Prague
local time with the EU DST rule (same helper the Oslo/Stockholm ingests use).

Writes src/data/milongas-cz.json.

Usage:
    python agentic-python/ingest_czechia.py            # dry run
    python agentic-python/ingest_czechia.py --publish
"""

from __future__ import annotations

import argparse
import calendar
import json
import re
import sys
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from milonga_series import build_item, cet_to_local, cluster_series, norm

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-cz.json"
PAGE = "http://www.tango-prague.info/"
FEEDS = [
    "https://calendar.google.com/calendar/ical/info%40tango-prague.info/public/basic.ics",
    "https://calendar.google.com/calendar/ical/tango-prague.info_em80pj8g1qrq4r5a9ej242ss4o%40group.calendar.google.com/public/basic.ics",
]
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"
WINDOW_DAYS = 150
DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]


def fetch(url: str, timeout: int = 60) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/calendar"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def unfold(raw: str) -> list[str]:
    return re.sub(r"\r?\n[ \t]", "", raw).splitlines()


def unescape(value: str) -> str:
    """ICS escapes commas, semicolons and newlines (text values only)."""
    return (
        value.replace("\\N", " ")
        .replace("\\n", " ")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
        .strip()
    )


def events_of(lines: list[str]) -> list[dict[str, list[str]]]:
    out: list[dict[str, list[str]]] = []
    current: dict[str, list[str]] | None = None
    for line in lines:
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            if current:
                out.append(current)
            current = None
        elif current is not None and ":" in line:
            key, _, value = line.partition(":")
            current.setdefault(key.split(";")[0].upper(), []).append(value)
            if key.upper().startswith("DTSTART"):
                current.setdefault("_dtstart_params", []).append(key)
    return out


def parse_dt(value: str, params: str) -> datetime | None:
    value = value.strip()
    utc = value.endswith("Z")
    value = value.rstrip("Z")
    try:
        if "VALUE=DATE" in params.upper() and "T" not in value:
            return None
        if len(value) == 8:
            return None
        moment = datetime.strptime(value[:15], "%Y%m%dT%H%M%S")
    except ValueError:
        try:
            moment = datetime.strptime(value[:13], "%Y%m%dT%H%M")
        except ValueError:
            return None
    if utc:
        moment = cet_to_local(moment)
    return moment


def nth_weekday(year: int, month: int, weekday: int, nth: int) -> date | None:
    """nth > 0: first/second…; nth < 0: last (-1)."""
    if nth > 0:
        day = date(year, month, 1)
        offset = (weekday - day.weekday()) % 7
        candidate = day + timedelta(days=offset + 7 * (nth - 1))
        return candidate if candidate.month == month else None
    last = date(year, month, calendar.monthrange(year, month)[1])
    offset = (last.weekday() - weekday) % 7
    candidate = last - timedelta(days=offset + 7 * (-nth - 1))
    return candidate if candidate.month == month else None


def expand(start: datetime, rule: str, until: date) -> list[datetime]:
    parts = dict(part.split("=", 1) for part in rule.split(";") if "=" in part)
    freq = parts.get("FREQ", "")
    interval = int(parts.get("INTERVAL", "1") or 1)
    byday = [token for token in parts.get("BYDAY", "").split(",") if token]
    bounds = re.search(r"UNTIL=(\d{8})", rule)
    stop = until
    if bounds:
        stop = min(stop, datetime.strptime(bounds.group(1), "%Y%m%d").date())

    occurrences: list[datetime] = []
    if freq == "WEEKLY":
        weekdays = [DAY_CODES.index(token[-2:]) for token in byday] if byday else [start.weekday()]
        cursor = start
        while cursor.date() <= stop and len(occurrences) < 40:
            if cursor.weekday() in weekdays:
                occurrences.append(cursor)
            cursor += timedelta(days=1)
            if cursor.weekday() == start.weekday() and cursor > start:
                # after a full week, jump by the interval
                cursor += timedelta(days=7 * (interval - 1))
    elif freq == "MONTHLY":
        year, month = start.year, start.month
        guard = 0
        while guard < 36 and len(occurrences) < 40 and date(year, month, 1) <= stop:
            guard += 1
            days: list[date] = []
            if byday:
                for token in byday:
                    nth = int(token[:-2] or "1")
                    weekday = DAY_CODES.index(token[-2:])
                    day = nth_weekday(year, month, weekday, nth)
                    if day:
                        days.append(day)
            else:
                days.append(date(year, month, min(start.day, calendar.monthrange(year, month)[1])))
            for day in sorted(days):
                candidate = datetime.combine(day, start.time())
                if candidate >= start and candidate.date() <= stop:
                    occurrences.append(candidate)
            month += interval
            if month > 12:
                month -= 12
                year += 1
    else:
        occurrences.append(start)
    return occurrences[:40]


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest tango-prague.info")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()

    today = datetime.now().date()
    window_end = today + timedelta(days=WINDOW_DAYS)
    stats = Counter()
    seen: dict[tuple, dict] = {}

    for feed in FEEDS:
        try:
            lines = unfold(fetch(feed))
        except Exception as error:  # noqa: BLE001 - a dead feed must not stop the others
            print(f"WARN feed failed: {feed} ({error})")
            stats["feed-failed"] += 1
            continue
        events = events_of(lines)
        print(f"{feed.rsplit('/', 3)[-3][:28]:<30} events: {len(events)}")

        for event in events:
            summary = unescape((event.get("SUMMARY") or [""])[0])
            if not re.search(r"milonga|practi|prakti", summary, re.I):
                stats["skip-not-milonga"] += 1
                continue
            raw_start = (event.get("DTSTART") or [""])[0]
            params = (event.get("_dtstart_params") or [""])[0]
            start = parse_dt(raw_start, params)
            if not start:
                stats["skip-no-date"] += 1
                continue
            starts = [start]
            rule = (event.get("RRULE") or [""])[0]
            if rule:
                starts = expand(start, rule, window_end)
                stats[f"rrule-{rule.split(';')[0].split('=')[-1].lower()}"] += 1

            location = unescape((event.get("LOCATION") or [""])[0])
            description = unescape((event.get("DESCRIPTION") or [""])[0])
            venue = re.split(r",", location)[0].strip() if location else ""
            price = ""
            money = re.search(r"(?:Vstupné|vstupné|entrance|Vstup)\s*:?\s*([^\n|]{1,24})", description)
            if money:
                price = money.group(1).strip()
            etype = "practica" if re.search(r"practi|prakti", summary, re.I) else "milonga"
            url = (event.get("URL") or [""])[0].strip()

            for moment in starts:
                day = moment.date()
                if day < today or day > window_end:
                    continue
                key = (norm(summary), moment.strftime("%Y-%m-%d"), moment.strftime("%H:%M"))
                seen[key] = {
                    "name": summary,
                    "venue": venue,
                    "address": location,
                    "city": "Prague",
                    "type": etype,
                    "date": moment,
                    "weekday": moment.weekday(),
                    "start": moment.strftime("%H:%M"),
                    "end": "",
                    "url": url,
                    "organizers": "",
                    "price": price,
                    "website": "",
                }

    occurrences = list(seen.values())
    print(f"occurrences in window: {len(occurrences)}")

    buckets: dict[tuple, list[dict]] = {}
    for row in occurrences:
        buckets.setdefault((norm(row["name"]), norm(row["venue"]), row["weekday"]), []).append(row)

    items: list[dict] = []
    for rows in buckets.values():
        for cluster in cluster_series(rows):
            item = build_item(
                cluster,
                source="tangoprague",
                region="czechia",
                country="Czechia",
                source_url=PAGE,
            )
            if item:
                item["id"] = item["id"].replace("tangoprague-", "tgprague-", 1)
                items.append(item)

    items.sort(key=lambda row: (row["days"][0], row["start"], row["name"]))
    print(f"series kept: {len(items)}")
    print("patterns:", Counter(item["schedule"] for item in items))
    print("skipped:", dict(stats))
    for item in items[:8]:
        print(f"  {item['days'][0][:3]} {item['start']} {item['venue'][:26]:<28} {item['name'][:40]:<42} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "tangoprague", "name": "tango-prague.info", "url": PAGE},
        "regions": [{"id": "czechia", "labelEn": "Czechia", "labelTr": "Çekya", "count": len(items)}],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "czechia.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
