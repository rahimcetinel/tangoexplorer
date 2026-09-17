"""Fetch Hoy Milonga weekly milonga/practica listings for several regions.

Writes src/data/hoy-milongas.json (used by the /milongas pages) and out/hoy.json.
Stdlib only. Does not copy source text; stores structured facts + source links.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_DIR = ROOT / "src" / "data"
DATA_PATH = DATA_DIR / "hoy-milongas.json"
USER_AGENT = "TangoNews/0.1 (+https://tangoexplorer.com)"

# (slug, label_en, label_tr)
REGIONS = [
    ("turkiye", "Türkiye", "Türkiye"),
    ("buenos-aires", "Buenos Aires", "Buenos Aires"),
    ("berlin", "Berlin", "Berlin"),
    ("nordrhein-westfalen", "Germany: NRW", "Almanya: NRW"),
    ("athens", "Athens", "Atina"),
    ("sao-paulo", "São Paulo", "São Paulo"),
    ("england", "England", "İngiltere"),
    ("miami", "Miami", "Miami"),
]

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en,tr"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode("utf-8", errors="replace")


def clean(value) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_instagram(value) -> str:
    """Extract a bare Instagram handle from messy Hoy values.

    Handles cases like 'instagram.pofpofmilonga', '@handle',
    'https://www.instagram.com/handle/?igsh=...', 'instagram.com/handle'.
    """
    text = clean(value)
    if not text:
        return ""
    match = re.search(r"instagram\.com/([^/?#]+)", text, re.I)
    if match:
        handle = match.group(1)
    else:
        handle = text.lstrip("@").strip()
        handle = re.sub(r"^(?:www\.)?instagram\.com/?", "", handle, flags=re.I)
        handle = handle.split("/")[0].split("?")[0]
        handle = re.sub(r"^instagram\.", "", handle, flags=re.I)
    handle = handle.strip().strip("@").strip()
    if not handle or handle.lower() in {"p", "reel", "reels", "stories", "tv", "explore"}:
        return ""
    if not re.fullmatch(r"[A-Za-z0-9._]+", handle):
        return ""
    return handle


def normalize_url(value) -> str:
    """Return a single clean http(s) URL from messy values."""
    text = re.sub(r"\s+", "", clean(value))
    if not text:
        return ""
    parts = [part for part in re.split(r"(?=https?://)", text) if part]
    url = parts[0] if parts else text
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url.lstrip("/")
    if not re.match(r"^https?://[^/\s]+", url, re.I):
        return ""
    return url


def hm(value: str) -> str:
    return value[:5] if re.fullmatch(r"\d{2}:\d{2}:\d{2}", value) else value


def richness(row: dict) -> int:
    fields = ("instagram", "website", "facebook", "address", "area", "price", "organizers", "phone", "verified", "mapUrl")
    return sum(1 for field in fields if row.get(field))


def dedupe_rows(rows: list[dict]) -> list[dict]:
    """Drop exact duplicates (Hoy returns some events with consecutive ids twice)
    and merge same time/venue rows that differ only by weekday."""
    best: dict[tuple, dict] = {}
    for row in rows:
        key = (
            row["name"].lower(),
            tuple(row["days"]),
            row["start"],
            row["end"],
            row["venue"].lower(),
            row["area"].lower(),
            row["address"].lower(),
            row["city"].lower(),
        )
        current = best.get(key)
        if current is None or richness(row) > richness(current):
            best[key] = row

    merged: dict[tuple, dict] = {}
    for row in best.values():
        key = (row["name"].lower(), row["venue"].lower(), row["start"], row["end"], row["city"].lower())
        current = merged.get(key)
        if current is None:
            merged[key] = row
            continue
        current["days"] = sorted(set(current["days"]) | set(row["days"]), key=lambda day: DAYS.index(day))
        for field in ("instagram", "website", "facebook", "address", "area", "price", "organizers", "phone", "verified", "mapUrl"):
            if not current.get(field) and row.get(field):
                current[field] = row[field]
    return list(merged.values())


def normalize(event: dict, region: str) -> dict | None:
    if event.get("eventCancelledFlag") or event.get("inactiveFlag") or event.get("hasEnded"):
        return None
    if event.get("waitingForPublishingFlag") or event.get("deletedFrmThreadFlag"):
        return None
    name = clean(event.get("name")) or clean(event.get("title"))
    if not name:
        return None
    days = [day for day in clean(event.get("daysOfTheWeek")).lower().split(",") if day in DAYS]
    genre = clean(event.get("genre")).lower()
    etype = genre if genre in {"milonga", "practica"} else clean(event.get("eventType")).lower()
    if etype not in {"milonga", "practica"}:
        etype = "milonga"
    lat = event.get("latitude")
    lng = event.get("longitude")
    map_url = clean(event.get("address4Navigate"))
    if not map_url and lat and lng:
        map_url = f"https://maps.google.com/?q={lat},{lng}"
    instagram = normalize_instagram(event.get("instagram"))
    detail = clean(event.get("detailURL"))
    if detail.startswith("/"):
        detail = "https://www.hoy-milonga.com" + detail
    return {
        "id": f"{region}-{event.get('id')}",
        "region": region,
        "name": name,
        "city": clean(event.get("city")),
        "country": clean(event.get("country")),
        "type": etype,
        "days": days,
        "start": hm(clean(event.get("startTime"))),
        "end": hm(clean(event.get("endTime"))),
        "venue": clean(event.get("venueName4Display")) or clean(event.get("nameOfPlace")),
        "area": clean(event.get("familiarNameOfArea")) or clean(event.get("subarea")),
        "address": clean(event.get("streetLine1")),
        "lat": lat,
        "lng": lng,
        "mapUrl": map_url,
        "price": clean(event.get("price4Display")),
        "detailUrl": detail,
        "website": normalize_url(event.get("website")),
        "instagram": f"https://www.instagram.com/{instagram}" if instagram else "",
        "facebook": normalize_url(event.get("facebook")),
        "phone": clean(event.get("phones4Display")),
        "organizers": clean(event.get("organizersNames")),
        "verified": clean(event.get("lastVerifiedDate")),
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Fetch Hoy Milonga listings")
    parser.add_argument("--region", action="append", help="Limit to a region slug (repeatable)")
    args = parser.parse_args()

    regions = [r for r in REGIONS if not args.region or r[0] in args.region]
    items: list[dict] = []
    errors: list[str] = []
    region_meta: list[dict] = []

    for slug, label_en, label_tr in regions:
        try:
            html = fetch(f"https://www.hoy-milonga.com/{slug}/en/milongas")
            match = re.search(r"appProps\.events = (\[.*?\]);", html, re.S)
            events = json.loads(match.group(1)) if match else []
        except (urllib.error.URLError, ValueError, json.JSONDecodeError) as exc:  # noqa: BLE001
            errors.append(f"{slug}: {exc}")
            continue
        normalized = [row for row in (normalize(e, slug) for e in events) if row]
        normalized = dedupe_rows(normalized)
        items.extend(normalized)
        region_meta.append(
            {
                "id": slug,
                "labelEn": label_en,
                "labelTr": label_tr,
                "count": len(normalized),
            }
        )
        print(f"{slug}: {len(events)} fetched, {len(normalized)} kept")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "regions": region_meta,
        "items": items,
        "errors": errors,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "hoy.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas, {len(regions)} regions)")
    for error in errors:
        print(f"WARN {error}", file=sys.stderr)
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
