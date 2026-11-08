"""Ingest tango-calendar.de (Rhein-Main / Germany) as a milonga source.

The site publishes a public iCalendar feed (`/kalender.ics`) plus one page per
date with schema.org `DanceEvent` JSON-LD. We use the feed as the index, group
dates into recurring series and read the series' next occurrence page for the
facts the feed lacks: exact local times, structured address, `kind`
(milonga/practica/workshop) and style.

Writes src/data/milongas-de.json (read by src/lib/milongas.ts).

Usage:
    python agentic-python/ingest_tango_de.py            # dry run, prints stats
    python agentic-python/ingest_tango_de.py --publish  # writes the JSON file
"""

from __future__ import annotations

import argparse
import concurrent.futures as futures
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-de.json"
FEED = "https://tango-calendar.de/kalender.ics"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"

DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

# The site filters by country; the source's own locality stays in `city`.
REGION = "germany"
REGION_LABELS = {
    "germany": ("Germany", "Almanya"),
}

# Titles that are festivals/marathons even when the site files them as milonga.
NOT_WEEKLY = re.compile(
    r"festival|marathon|fest\b|encuentro|jubil|workshop|kurs\b|lesson|schnupper|seminar|unterricht",
    re.I,
)


def fetch(url: str, accept: str = "text/html", timeout: int = 45) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, ""
    except Exception:  # noqa: BLE001
        return 0, ""


def unfold(text: str) -> str:
    """RFC 5545 line unfolding that also survives doubled carriage returns."""
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


def parse_dt(value: str) -> datetime | None:
    value = value.strip()
    for fmt in ("%Y%m%dT%H%M%S", "%Y%m%dT%H%M%SZ", "%Y%m%dT%H%M%SZ"):
        try:
            return datetime.strptime(value.rstrip("Z"), "%Y%m%dT%H%M%S")
        except ValueError:
            continue
    return None


def norm(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("ß", "ss")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", norm(value)).strip("-")


def city_from_address(parts: dict[str, str], fallback: str) -> str:
    city = (parts.get("addressLocality") or "").strip()
    city = re.sub(r"^\d{4,5}\s*", "", city).strip(" ,.")
    if not city:
        city = (parts.get("addressRegion") or "").strip()
    if not city:
        # LOCATION often ends with "<zip> <town>"; take the last segment.
        segments = [seg.strip() for seg in fallback.split(",") if seg.strip()]
        if segments:
            city = re.sub(r"^\d{4,5}\s*", "", segments[-1]).strip()
    return city


def read_series_page(url: str) -> dict:
    status, html = fetch(url)
    row: dict = {"status": status}
    if status != 200:
        return row
    for block in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        if data.get("@type") == "BreadcrumbList":
            for item in data.get("itemListElement", []):
                href = item.get("item", "")
                kind = re.search(r"kind=([a-z]+)", href)
                style = re.search(r"style=([a-z]+)", href)
                if kind:
                    row["kind"] = kind.group(1)
                if style:
                    row["style"] = style.group(1)
                if item.get("name") and not row.get("categoryLabel"):
                    row["categoryLabel"] = item.get("name")
        if data.get("@type") == "DanceEvent":
            location = data.get("location") or {}
            address = location.get("address") or {}
            geo = location.get("geo") or {}
            row.update(
                {
                    "name": data.get("name", ""),
                    "startDate": data.get("startDate", ""),
                    "endDate": data.get("endDate", ""),
                    "venue": location.get("name", ""),
                    "city": city_from_address(address, location.get("name", "")),
                    "address": address.get("streetAddress", ""),
                    "postalCode": address.get("postalCode", ""),
                    "lat": geo.get("latitude"),
                    "lng": geo.get("longitude"),
                    "image": (data.get("image") or [""])[0] if isinstance(data.get("image"), list) else data.get("image", ""),
                    "description": data.get("description", ""),
                }
            )
    return row


def clean_city(value: str) -> str:
    city = re.sub(r"\s*/\s*.*$", "", value or "").strip(" ,.")
    city = re.sub(r"^\d{4,5}\s*", "", city)
    aliases = {
        "frankfurt am main": "Frankfurt",
        "frankfurt": "Frankfurt",
        "giessen": "Gießen",
        "muenchen": "München",
    }
    return aliases.get(norm(city), city)


STREET = re.compile(
    r"str\.|straße|strasse|weg\b|platz|gasse|allee|ufer|ring\b|\d+\s*$", re.I
)


def clean_venue(value: str, city: str) -> str:
    venue = re.sub(r"^\d{4,5}\s*", "", value or "").strip(" ,.")
    if not venue or STREET.search(venue):
        return ""
    # Drop a trailing ", <city>" that some feeds append to the venue name.
    if city and venue.lower().endswith(city.lower()):
        venue = venue[: -len(city)].strip(" ,-")
    return venue


def local_hm(iso: str) -> tuple[str, str]:
    """Return (HH:MM, weekday index) from an offset-aware ISO timestamp."""
    if not iso:
        return "", ""
    match = re.match(r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})", iso)
    if not match:
        return "", ""
    year, month, day, hour, minute = (int(part) for part in match.groups())
    weekday = datetime(year, month, day).weekday()
    return f"{hour:02d}:{minute:02d}", weekday


def cluster_series(events: list[dict]) -> list[list[dict]]:
    """Split one venue+weekday into time clusters (a class and a milonga differ)."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for row in events:
        groups[(row["venue"], row["weekday"], row["date"].strftime("%H"))].append(row)

    clusters: list[list[dict]] = []
    for (_venue, _weekday, _hour), rows in sorted(groups.items()):
        rows.sort(key=lambda row: row["date"])
        dates = {row["date"].date() for row in rows}
        merged = False
        for cluster in clusters:
            head = cluster[0]
            if head["venue"] != rows[0]["venue"] or head["weekday"] != rows[0]["weekday"]:
                continue
            other_dates = {row["date"].date() for row in cluster}
            hour_gap = abs(int(head["date"].strftime("%H")) - int(rows[0]["date"].strftime("%H")))
            if hour_gap <= 1 and not (dates & other_dates):
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


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest tango-calendar.de milongas")
    parser.add_argument("--publish", action="store_true", help="write src/data/milongas-de.json")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    status, body = fetch(FEED, accept="text/calendar")
    if status != 200:
        print(f"ERROR feed HTTP {status}", file=sys.stderr)
        return 1
    blocks = re.findall(r"(?s)BEGIN:VEVENT(.*?)END:VEVENT", unfold(body))
    print(f"feed: {len(blocks)} events")

    buckets: dict[tuple, list[dict]] = defaultdict(list)
    for block in blocks:
        start = parse_dt(field(block, "DTSTART"))
        if start is None:
            continue
        location = field(block, "LOCATION")
        venue = location.split(",")[0] if location else field(block, "SUMMARY")
        buckets[(norm(venue), start.weekday())].append(
            {
                "date": start,
                "weekday": start.weekday(),
                "venue": norm(venue),
                "url": field(block, "URL"),
                "title": field(block, "SUMMARY"),
                "location": location,
                "geo": field(block, "GEO"),
                "organizer": field(block, "ORGANIZER"),
            }
        )

    clusters: list[list[dict]] = []
    for rows in buckets.values():
        clusters.extend(cluster_series(rows))

    kept: list[dict] = []
    stats = Counter()
    errors: list[str] = []

    def build(occurrences: list[dict]) -> dict | None:
        occurrences.sort(key=lambda row: row["date"])
        weekday = occurrences[0]["weekday"]
        pattern = summarize_series([row["date"] for row in occurrences])
        stats[pattern] += 1
        if pattern not in {"weekly", "biweekly", "monthly"} or len(occurrences) < 2:
            return None
        if NOT_WEEKLY.search(occurrences[0]["title"]):
            stats["skipped-festival"] += 1
            return None
        upcoming = [row for row in occurrences if row["date"].date() >= datetime.now().date()]
        probe = (upcoming or occurrences)[0]
        page = read_series_page(probe["url"]) if probe["url"] else {}
        if page.get("status") != 200:
            stats["page-error"] += 1
            return None
        if page.get("kind") not in {"milonga"}:
            stats[f"kind-{page.get('kind') or 'unknown'}"] += 1
            return None

        start_hm, _ = local_hm(page.get("startDate", ""))
        end_hm, _ = local_hm(page.get("endDate", ""))
        if not start_hm:
            stats["no-time"] += 1
            return None

        city = clean_city(page.get("city") or "")
        if not city:
            stats["no-city"] += 1
            return None
        region = REGION
        venue = clean_venue((page.get("venue") or "").split(",")[0].strip(), city)
        lat = page.get("lat")
        lng = page.get("lng")
        geo = probe["geo"]
        if (lat is None or lng is None) and ";" in geo:
            try:
                lat, lng = (float(part) for part in geo.split(";", 1))
            except ValueError:
                lat, lng = None, None

        return {
            "id": f"tcd-{slug(city)}-{slug(venue or page.get('name') or probe['title'])[:32]}-{DAY_NAMES[weekday][:3]}",
            "region": region,
            "city": city,
            "name": (page.get("name") or probe["title"]).strip(),
            "country": "Germany",
            "type": "milonga",
            "days": [DAY_NAMES[weekday]],
            "schedule": pattern,
            "next": probe["date"].date().isoformat(),
            "start": start_hm,
            "end": end_hm,
            "venue": venue,
            "area": "",
            "address": ", ".join(
                part
                for part in (
                    page.get("address", ""),
                    f"{page.get('postalCode', '')} {city}".strip(),
                )
                if part
            ),
            "lat": lat,
            "lng": lng,
            "mapUrl": f"https://maps.google.com/?q={lat},{lng}" if lat and lng else "",
            "price": "",
            "detailUrl": probe["url"],
            "website": "",
            "instagram": "",
            "facebook": "",
            "phone": "",
            "organizers": "",
            "verified": "",
            "source": "tangocalendar",
            "sourceUrl": probe["url"],
            "occurrences": len(occurrences),
        }

    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for row in pool.map(build, clusters):
            if row:
                kept.append(row)

    kept.sort(key=lambda row: (row["region"], row["days"][0], row["start"], row["name"]))
    regions = Counter(row["region"] for row in kept)
    print(f"clusters: {len(clusters)} -> kept {len(kept)}")
    print("patterns:", dict(stats))
    print("regions:", dict(regions))
    print("cities:", dict(Counter(row["city"] for row in kept).most_common()))
    for row in kept[:8]:
        print(f"  {row['days'][0][:3]} {row['start']}-{row['end']} {row['city']:<14} {row['name'][:46]:<48} {row['venue'][:30]}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "key": "tangocalendar",
            "name": "tango-calendar.de",
            "url": "https://tango-calendar.de/termine/",
            "feed": FEED,
        },
        "regions": [
            {"id": key, "labelEn": REGION_LABELS[key][0], "labelTr": REGION_LABELS[key][1], "count": count}
            for key, count in sorted(regions.items())
        ],
        "items": kept,
        "errors": errors,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "tangode.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(kept)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if kept else 1


if __name__ == "__main__":
    raise SystemExit(main())
