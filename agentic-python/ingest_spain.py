"""Ingest Agenda del Tango (Spain) as a milonga source.

``/milongas/`` is a country-wide weekly directory: one card per milonga with its
weekday, time, city and type, plus a JSON-LD ItemList with every milonga URL.
Each milonga page carries an ``EventSeries`` JSON-LD block (venue, address,
start/end time, price) and the real cadence in its text ("(semanal)",
"(quincenal)", "(mensual)") — the JSON-LD says ``P1W`` for all of them, so the
text is what we trust.

Writes src/data/milongas-es.json.

Usage:
    python agentic-python/ingest_spain.py            # dry run
    python agentic-python/ingest_spain.py --publish
"""

from __future__ import annotations

import argparse
import concurrent.futures as futures
import html as htmllib
import json
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_PATH = ROOT / "src" / "data" / "milongas-es.json"
LISTING = "https://agendadeltango.com/milongas/"
UA = "TangoNews/0.1 (+https://tangoexplorer.com)"

DAYS = {
    "lunes": "monday",
    "martes": "tuesday",
    "miércoles": "wednesday",
    "miercoles": "wednesday",
    "jueves": "thursday",
    "viernes": "friday",
    "sábado": "saturday",
    "sabado": "saturday",
    "domingo": "sunday",
}

DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

CADENCE = {
    "semanal": "weekly",
    "quincenal": "biweekly",
    "mensual": "monthly",
}

CARD = re.compile(r'(?s)<a class="fc-clicable milonga-card" href="([^"]+)"[^>]*>(.*?)</a>')
BADGE = re.compile(r'<span class="type-badge ([a-z]+)"')
HOURS = re.compile(r'<span class="hours">\s*([\d:]+)\s*[–-]\s*([\d:]+)\s*</span>')
TITLE = re.compile(r'(?s)<div class="card-title">\s*(.*?)\s*</div>')
PLACE = re.compile(r'<span class="lugar-tag">\s*(.*?)\s*</span>')
ORGANIZER = re.compile(r'(?s)Organiza:\s*<b>(.*?)</b>')
CADENCE_TEXT = re.compile(r"\((semanal|quincenal|mensual)[^)]*\)", re.I)


def fetch(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", value or ""))).strip()


def listing_rows() -> list[dict]:
    page = fetch(LISTING)
    rows = []
    for href, body in CARD.findall(page):
        badge = BADGE.search(body)
        hours = HOURS.search(body)
        title = TITLE.search(body)
        place = PLACE.search(body)
        organizer = ORGANIZER.search(body)
        if not title:
            continue
        rows.append(
            {
                "url": href if href.startswith("http") else "https://agendadeltango.com/milongas/" + href,
                "type": "practica" if (badge.group(1) if badge else "") == "practica" else "milonga",
                "start": hours.group(1) if hours else "",
                "end": hours.group(2) if hours else "",
                "name": clean(title.group(1)),
                "city": clean(place.group(1)) if place else "",
                "organizers": clean(organizer.group(1)) if organizer else "",
            }
        )
    return rows


def read_detail(row: dict) -> dict | None:
    try:
        page = fetch(row["url"])
    except Exception:  # noqa: BLE001
        return None
    series = None
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and data.get("@type") == "EventSeries":
            series = data
            break

    text = clean(page)
    cadence = CADENCE_TEXT.search(text)
    schedule = CADENCE.get(cadence.group(1).lower(), "weekly") if cadence else "weekly"

    item = dict(row)
    item["schedule"] = schedule
    if series:
        location = series.get("location") or {}
        address = location.get("address") or {}
        schedule_ld = series.get("eventSchedule") or {}
        offers = series.get("offers") or {}
        item["venue"] = (location.get("name") or "").strip()
        item["address"] = (address.get("streetAddress") or "").strip()
        item["city"] = (address.get("addressLocality") or item["city"]).strip()
        item["start"] = (schedule_ld.get("startTime") or item["start"] or "")[:5]
        item["end"] = (schedule_ld.get("endTime") or item["end"] or "")[:5]
        price = offers.get("price")
        currency = offers.get("priceCurrency")
        if price:
            item["price"] = f"{price} {currency}".strip()
        day = (schedule_ld.get("byDay") or "").rsplit("/", 1)[-1].lower()
        if day in DAY_NAMES:
            item["days"] = [day]
    return item


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Ingest Agenda del Tango (Spain)")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--workers", type=int, default=6)
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

    rows = listing_rows()
    print(f"listing: {len(rows)} milongas")

    details: list[dict] = []
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for item in pool.map(read_detail, rows):
            if item and item.get("days"):
                details.append(item)
    print(f"with schedule: {len(details)}")

    items = []
    for row in details:
        items.append(
            {
                "id": "esp-" + re.sub(r"[^a-z0-9]+", "-", row["url"].rstrip("/").rsplit("/", 1)[-1])[:40],
                "region": "spain",
                "city": row["city"],
                "name": row["name"],
                "country": "Spain",
                "type": row["type"],
                "days": row["days"],
                "schedule": row["schedule"],
                "start": row["start"],
                "end": row["end"],
                "venue": row.get("venue", ""),
                "area": "",
                "address": row.get("address", ""),
                "lat": None,
                "lng": None,
                "mapUrl": "",
                "price": row.get("price", ""),
                "detailUrl": row["url"],
                "website": "",
                "instagram": "",
                "facebook": "",
                "phone": "",
                "organizers": row.get("organizers", ""),
                "verified": "",
                "source": "spain",
                "sourceUrl": row["url"],
            }
        )

    for item in items:
        if item["venue"] and item["city"]:
            item["mapUrl"] = (
                f"https://maps.google.com/?q={item['venue'].replace(' ', '+')},+{item['city'].replace(' ', '+')}"
            )

    items.sort(key=lambda row: (row["city"], row["days"][0], row["start"], row["name"]))
    print(f"kept: {len(items)}")
    print("schedule:", Counter(item["schedule"] for item in items))
    print("type:", Counter(item["type"] for item in items))
    print("cities:", dict(Counter(item["city"] for item in items).most_common(10)))
    for item in items[:8]:
        print(f"  {item['days'][0][:3]} {item['start']}-{item['end']} {item['city'][:16]:<18} {item['name'][:40]:<42} {item['schedule']}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"key": "spain", "name": "Agenda del Tango", "url": LISTING},
        "regions": [{"id": "spain", "labelEn": "Spain", "labelTr": "İspanya", "count": len(items)}],
        "items": items,
        "errors": [],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "spain.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.publish:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {DATA_PATH.relative_to(ROOT)} ({len(items)} milongas)")
    else:
        print("dry run: nothing written to src/data")
    return 0 if items else 1


if __name__ == "__main__":
    raise SystemExit(main())
