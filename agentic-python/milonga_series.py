"""Shared helpers for the milonga calendars that publish dated occurrences.

Every source gives us a list of dated instances; the site lists weekly series
(day + time), so we group instances into series and classify the cadence.

Used by ingest_sweden.py and ingest_milongas_ch.py. ingest_tango_de.py keeps
its own older copy of the same logic.
"""

from __future__ import annotations

import calendar
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def last_sunday(year: int, month: int) -> date:
    day = calendar.monthrange(year, month)[1]
    last = date(year, month, day)
    return last - timedelta(days=(last.weekday() + 1) % 7)


def cet_to_local(moment: datetime) -> datetime:
    """Convert a UTC instant to CET/CEST (Oslo, Stockholm, Berlin…).

    The calendars publish UTC but print local times; the EU rule is enough and
    keeps the ingest stdlib-only (no tzdata on Windows CI).
    """
    year = moment.year
    start = datetime.combine(last_sunday(year, 3), datetime.min.time()) + timedelta(hours=1)
    end = datetime.combine(last_sunday(year, 10), datetime.min.time()) + timedelta(hours=1)
    offset = 2 if start <= moment < end else 1
    return moment + timedelta(hours=offset)


def norm(value: str) -> str:
    text = unicodedata.normalize("NFKD", (value or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("ß", "ss")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", norm(value)).strip("-")


def cluster_series(occurrences: list[dict]) -> list[list[dict]]:
    """Split one name+venue+weekday into time clusters (a class and a milonga differ)."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for row in occurrences:
        groups[(row["name"], row["venue"], row["weekday"], row["start"][:2])].append(row)

    clusters: list[list[dict]] = []
    for _key, rows in sorted(groups.items()):
        rows.sort(key=lambda row: row["date"])
        dates = {row["date"].date() for row in rows}
        merged = False
        for cluster in clusters:
            head = cluster[0]
            if (
                head["name"] != rows[0]["name"]
                or head["venue"] != rows[0]["venue"]
                or head["weekday"] != rows[0]["weekday"]
            ):
                continue
            other = {row["date"].date() for row in cluster}
            hour_gap = abs(int(head["start"][:2]) - int(rows[0]["start"][:2]))
            if hour_gap <= 1 and not (dates & other):
                cluster.extend(rows)
                cluster.sort(key=lambda row: row["date"])
                merged = True
                break
        if not merged:
            clusters.append(list(rows))
    return clusters


def summarize_series(dates: list[datetime]) -> str:
    unique = sorted({d.date() for d in dates})
    gaps = [(b - a).days for a, b in zip(unique, unique[1:])]
    if not gaps:
        return "one-off"
    counts = Counter(gaps)
    if counts[7] >= 0.7 * len(gaps):
        return "weekly"
    if counts[14] >= 0.7 * len(gaps):
        return "biweekly"
    if sum(counts[d] for d in (28, 29, 30, 31) if d in counts) >= 0.7 * len(gaps):
        return "monthly"
    return "irregular"


def build_item(
    occurrences: list[dict],
    *,
    source: str,
    region: str,
    country: str,
    source_url: str = "",
) -> dict | None:
    """Turn one weekly/biweekly/monthly series into a Milonga record."""
    if len(occurrences) < 2:
        return None
    pattern = summarize_series([row["date"] for row in occurrences])
    if pattern not in {"weekly", "biweekly", "monthly"}:
        return None

    occurrences.sort(key=lambda row: row["date"])
    today = datetime.now().date()
    upcoming = [row for row in occurrences if row["date"].date() >= today]
    first = (upcoming or occurrences)[0]
    weekday = first["weekday"]

    city = first.get("city", "")
    venue = first.get("venue", "")
    row = {
        "id": f"{source}-{slug(city)}-{slug(venue or first['name'])[:32]}-{DAY_NAMES[weekday][:3]}",
        "region": region,
        "city": city,
        "name": first["name"],
        "country": country,
        "type": first.get("type", "milonga"),
        "days": [DAY_NAMES[weekday]],
        "schedule": pattern,
        "next": first["date"].date().isoformat(),
        "start": first["start"],
        "end": first.get("end", ""),
        "venue": venue,
        "area": "",
        "address": first.get("address", ""),
        "lat": None,
        "lng": None,
        "mapUrl": "",
        "price": first.get("price", ""),
        "detailUrl": first.get("url", ""),
        "website": first.get("website", ""),
        "instagram": "",
        "facebook": "",
        "phone": "",
        "organizers": first.get("organizers", ""),
        "verified": "",
        "source": source,
        "sourceUrl": source_url or first.get("url", ""),
        "occurrences": len(occurrences),
    }
    if row["city"] and row["venue"]:
        row["mapUrl"] = f"https://maps.google.com/?q={row['venue'].replace(' ', '+')},+{row['city'].replace(' ', '+')}"
    return row
