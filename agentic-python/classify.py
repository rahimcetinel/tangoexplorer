"""Classify tango events for homepage filters."""

from __future__ import annotations

import re
from datetime import date, timedelta

MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
    "ocak": 1,
    "subat": 2,
    "şubat": 2,
    "mart": 3,
    "nisan": 4,
    "mayis": 5,
    "mayıs": 5,
    "haziran": 6,
    "temmuz": 7,
    "agustos": 8,
    "ağustos": 8,
    "eylul": 9,
    "eylül": 9,
    "ekim": 10,
    "kasim": 11,
    "kasım": 11,
    "aralik": 12,
    "aralık": 12,
}

COUNTRY_TR = {
    "turkey": "Türkiye",
    "turkiye": "Türkiye",
    "türkiye": "Türkiye",
    "spain": "İspanya",
    "ispanya": "İspanya",
    "italy": "İtalya",
    "france": "Fransa",
    "germany": "Almanya",
    "portugal": "Portekiz",
    "poland": "Polonya",
    "canada": "Kanada",
    "argentina": "Arjantin",
}

CITY_TR = {
    "istanbul": "İstanbul",
    "valencia": "Valencia",
    "valència": "Valencia",
}


def classify_kinds(title: str) -> list[str]:
    text = title.lower()
    kinds: list[str] = []
    if re.search(r"marathon|maraton", text):
        kinds.append("marathon")
    if re.search(r"festival|fest\b", text):
        kinds.append("festival")
    if "encuentro" in text:
        kinds.append("encuentro")
    if re.search(r"workshop|at[oö]lye|\bcamp\b", text):
        kinds.append("workshop")
    if re.search(r"\bders\b|\bclass(es)?\b", text):
        kinds.append("ders")
    if re.search(r"practic|pratik|milonga", text):
        kinds.append("pratik")
    return kinds or ["festival"]


def classify_source(source: str, url: str = "") -> str:
    blob = f"{source} {url}".lower()
    if "instagram" in blob:
        return "instagram"
    if "facebook" in blob or re.search(r"\bfb\b", blob):
        return "facebook"
    if "tangocat" in blob:
        return "tangocat"
    if "hoy" in blob and "milonga" in blob:
        return "hoymilonga"
    return "diger"


def split_location(location: str) -> tuple[str, str]:
    if not location:
        return "", ""
    parts = [part.strip() for part in location.split(",") if part.strip()]
    if not parts:
        return "", ""
    if len(parts) == 1:
        token = parts[0]
        if token.lower() in COUNTRY_TR or token in {"Türkiye", "İspanya"}:
            return normalize_country(token), ""
        return "", normalize_city(token)
    return normalize_country(parts[0]), normalize_city(parts[1])


def normalize_country(value: str) -> str:
    key = value.lower().replace("ü", "u").replace("ı", "i")
    return COUNTRY_TR.get(value.lower(), COUNTRY_TR.get(key, value))


def normalize_city(value: str) -> str:
    return CITY_TR.get(value.lower(), value)


def parse_when(when: str, fallback_year: int) -> tuple[date | None, date | None]:
    if not when:
        return None, None
    text = when.replace("–", "-").replace("—", "-")
    years = [int(value) for value in re.findall(r"(20\d{2})", text)]
    stripped = re.sub(r"(20\d{2})", " ", text)
    month_names = "|".join(MONTHS.keys())

    def year_for(index: int) -> int:
        if years:
            return years[min(index, len(years) - 1)]
        return fallback_year

    two_month = re.search(
        rf"({month_names})\s+(\d{{1,2}})\s*-\s*({month_names})\s+(\d{{1,2}})",
        stripped,
        re.I,
    )
    if two_month:
        m1 = MONTHS[two_month.group(1).lower()]
        m2 = MONTHS[two_month.group(3).lower()]
        d1, d2 = int(two_month.group(2)), int(two_month.group(4))
        if len(years) >= 2:
            start_year, end_year = years[0], years[-1]
        else:
            single = years[0] if years else fallback_year
            if m2 < m1:
                start_year, end_year = single - 1, single
            else:
                start_year = end_year = single
        return date(start_year, m1, d1), date(end_year, m2, d2)
    same_month = re.search(rf"({month_names})\s+(\d{{1,2}})\s*-\s*(\d{{1,2}})", stripped, re.I)
    if same_month:
        year = year_for(0)
        month = MONTHS[same_month.group(1).lower()]
        return date(year, month, int(same_month.group(2))), date(year, month, int(same_month.group(3)))
    day_first_range = re.search(rf"(\d{{1,2}})\s*-\s*(\d{{1,2}})\s+({month_names})", stripped, re.I)
    if day_first_range:
        year = year_for(0)
        month = MONTHS[day_first_range.group(3).lower()]
        return date(year, month, int(day_first_range.group(1))), date(year, month, int(day_first_range.group(2)))
    single = re.search(rf"({month_names})\s+(\d{{1,2}})", stripped, re.I)
    if single:
        year = year_for(0)
        month = MONTHS[single.group(1).lower()]
        start = date(year, month, int(single.group(2)))
        return start, start
    day_first = re.search(rf"(\d{{1,2}})\s+({month_names})", stripped, re.I)
    if day_first:
        year = year_for(0)
        month = MONTHS[day_first.group(2).lower()]
        start = date(year, month, int(day_first.group(1)))
        return start, start
    return None, None


def week_bounds(today: date) -> tuple[date, date]:
    start = today - timedelta(days=today.weekday())
    return start, start + timedelta(days=6)


def attach_filters(item: dict, today: date) -> dict:
    title = item.get("title") or item.get("eventName") or ""
    location = item.get("location") or item.get("eventLocation") or ""
    source = item.get("source") or ""
    url = item.get("sourceUrl") or ""
    country, city = split_location(location)
    start, end = parse_when(item.get("when") or item.get("eventWhen") or "", today.year)
    kinds = item.get("kinds") or classify_kinds(title)
    source_key = item.get("sourceKey") or classify_source(source, url)
    fmt = item.get("format") or ("blog" if source_key == "diger" and "inbox" not in source.lower() else "etkinlik")
    if item.get("source") in {"hoy-milonga", "Hoy Milonga"}:
        kinds = ["pratik"]
        source_key = "hoymilonga"
        fmt = "etkinlik"
        country = country or "Türkiye"
        if not start:
            start, end = week_bounds(today)
    if item.get("source") == "inbox":
        fmt = item.get("format") or "etkinlik"
        source_key = classify_source(source, url)
    item["kinds"] = kinds
    item["format"] = fmt
    item["sourceKey"] = source_key
    if country:
        item["country"] = country
    if city:
        item["city"] = city
    if start:
        item["eventStart"] = start.isoformat()
        item["eventEnd"] = (end or start).isoformat()
    return item
