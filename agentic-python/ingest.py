"""Fetch Tangocat, Hoy Milonga Türkiye, and local inbox items into raw.json."""

from __future__ import annotations

import argparse
import calendar
import hashlib
import html as htmlmod
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

from classify import attach_filters
from event_links import enrich_tangocat_item
from slugify import slugify

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
NEWS_DIR = ROOT / "src" / "content" / "news"
INBOX_DIR = ROOT / "sources" / "inbox"
IMAGE_DIR = ROOT / "src" / "assets" / "events"
USER_AGENT = "TangoNews/0.1 (+https://tango-news.pages.dev)"

TANGOCAT_URL = "https://tangocat.net/"
HOY_MILONGA_URL = "https://hoy-milonga.com/turkiye/tr/milongas"
TURKEY_MARKERS = ("rkiye", "turkey")
HORIZON_MONTHS = 12


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "tr,en"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fingerprint(*parts: str) -> str:
    joined = "|".join(part.strip().lower() for part in parts if part)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]


def norm_title(value: str) -> str:
    """Diacritic/punctuation/edition-insensitive title for duplicate detection."""
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9 ]", " ", text.lower())
    text = re.sub(r"\b\d{1,2}(st|nd|rd|th)?\b", " ", text)
    text = re.sub(r"\b(edition|edicion|editio|anniversary)\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def existing_keys() -> set[str]:
    keys: set[str] = set()
    if not NEWS_DIR.exists():
        return keys
    for path in NEWS_DIR.rglob("*.md"):
        keys.add(path.stem)
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r"^(title|sourceUrl):\s*(.+)$", text, re.M):
            keys.add(match.group(2).strip().strip('"').lower())
        front = text.split("---", 2)[1] if text.startswith("---") else ""

        def field(name: str) -> str:
            found = re.search(rf"^{name}:\s*\"?(.+?)\"?\s*$", front, re.M)
            return found.group(1).strip().strip('"') if found else ""

        event_start = field("eventStart")
        city = field("city")
        for value in (field("title"), field("eventName")):
            if value:
                month = event_start[:7] if event_start else ""
                keys.add("t:" + norm_title(value) + "|" + month)
        if event_start and city:
            keys.add("s:" + event_start + "|" + norm_title(city))
    return keys


def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last))


def tangocat_month_urls(today: date, months: int = HORIZON_MONTHS) -> list[tuple[str, int]]:
    urls: list[tuple[str, int]] = []
    year, month = today.year, today.month
    for _ in range(months):
        urls.append((f"https://tangocat.net/{year}/{month}", year))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return urls


def in_horizon(item: dict, today: date) -> bool:
    start_s = item.get("eventStart")
    end_s = item.get("eventEnd") or start_s
    if not start_s:
        return True
    start = date.fromisoformat(start_s)
    end = date.fromisoformat(end_s)
    return end >= today and start <= add_months(today, HORIZON_MONTHS)


def is_turkey(location: str) -> bool:
    lowered = location.lower()
    return any(marker in lowered for marker in TURKEY_MARKERS)


def parse_tangocat(html: str, today: date, page_year: int | None = None) -> list[dict]:
    items: list[dict] = []
    year = page_year or today.year
    for block in re.split(r'<li class="p-3[^"]*">', html)[1:]:
        title_m = re.search(r'<p class="mb-1">(.*?)</p>', block)
        when_m = re.search(r'<p class="small mb-1">(.*?)</p>', block)
        loc_m = re.search(r"</svg></span>([^<]+)</button>", block)
        href_m = re.search(r'href="(/go/[^"]+)"', block)
        if not (title_m and loc_m and href_m):
            continue
        title = htmlmod.unescape(re.sub(r"<[^>]+>", "", title_m.group(1))).strip()
        when = htmlmod.unescape(
            (when_m.group(1) if when_m else "").replace("&nbsp;", " ").replace("&ndash;", "-")
        )
        if when and not re.search(r"20\d{2}", when):
            when = f"{when} {year}"
        location = htmlmod.unescape(loc_m.group(1)).strip()
        href = htmlmod.unescape(href_m.group(1))
        turkey = is_turkey(location)
        items.append(
            attach_filters(
                {
                    "id": f"tangocat-{slugify(title)}",
                    "source": "tangocat",
                    "sourceUrl": f"https://tangocat.net{href}",
                    "title": title,
                    "when": when,
                    "location": location,
                    "category": "turkiye" if turkey else "dunya",
                    "priority": 0 if turkey else 1,
                    "fetchedAt": today.isoformat(),
                },
                today,
            )
        )
    items.sort(key=lambda item: (item["priority"], item.get("eventStart") or "9999", item["title"]))
    return [item for item in items if in_horizon(item, today)]


def parse_hoy_events(html: str) -> list[dict]:
    match = re.search(r"appProps\.events = (\[.*?\]);", html, re.S)
    if not match:
        return []
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return []


def weekday_tr(name: str) -> str:
    mapping = {
        "monday": "Pazartesi",
        "tuesday": "Salı",
        "wednesday": "Çarşamba",
        "thursday": "Perşembe",
        "friday": "Cuma",
        "saturday": "Cumartesi",
        "sunday": "Pazar",
    }
    return mapping.get(name.lower(), name)


def parse_hoy_digest(html: str, today: date) -> list[dict]:
    events = parse_hoy_events(html)
    milongas = [
        event
        for event in events
        if str(event.get("eventType", "")).lower() in {"milonga", "practica", "praktik"}
        and not event.get("eventCancelledFlag")
    ]
    lines: list[str] = []
    for event in milongas[:18]:
        name = event.get("name") or event.get("title") or "Milonga"
        city = event.get("city") or ""
        day = weekday_tr(str(event.get("daysOfTheWeek") or ""))
        start = str(event.get("startTime") or "")[:5]
        bits = [name]
        if city:
            bits.append(str(city))
        if day:
            bits.append(day)
        if start:
            bits.append(start)
        lines.append(" — ".join(bits))

    week = today.strftime("%G-W%V")
    summary_lines = lines[:12]
    return [
        attach_filters(
            {
                "id": f"hoy-milonga-{week}",
                "source": "hoy-milonga",
                "sourceUrl": HOY_MILONGA_URL,
                "title": f"Türkiye milonga ajandası ({week})",
                "when": today.isoformat(),
                "location": "Türkiye",
                "category": "turkiye",
                "priority": 0,
                "notes": summary_lines,
                "eventCount": len(milongas),
                "eventWhen": f"Hafta {week}",
                "eventLocation": "Türkiye",
                "fetchedAt": today.isoformat(),
            },
            today,
        )
    ]


def parse_inbox() -> list[dict]:
    items: list[dict] = []
    if not INBOX_DIR.exists():
        return items
    for path in sorted(INBOX_DIR.iterdir()):
        if path.name.startswith(".") or path.suffix.lower() not in {".txt", ".md"}:
            continue
        if path.name.lower() == "readme.md" or path.name.lower().startswith("ornek"):
            continue
        body = path.read_text(encoding="utf-8").strip()
        if not body:
            continue
        first = body.splitlines()[0].lstrip("# ").strip()
        url_m = re.search(r"https?://\S+", body)
        fmt = "blog" if re.search(r"^format:\s*blog", body, re.I | re.M) or "blog" in path.stem.lower() else "etkinlik"
        items.append(
            attach_filters(
                {
                    "id": f"inbox-{slugify(path.stem)}",
                    "source": "inbox",
                    "sourceUrl": url_m.group(0).rstrip(").,") if url_m else "https://tango-news.pages.dev/hakkinda",
                    "title": first[:120],
                    "when": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).date().isoformat(),
                    "location": "",
                    "category": "topluluk",
                    "priority": 2,
                    "notes": [body[:800]],
                    "inboxFile": str(path.relative_to(ROOT)),
                    "format": fmt,
                    "fetchedAt": date.today().isoformat(),
                },
                date.today(),
            )
        )
    return items


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect tango sources into raw.json")
    parser.add_argument("--skip-network", action="store_true", help="Only read inbox files")
    parser.add_argument("--skip-enrich", action="store_true", help="Do not resolve event websites")
    parser.add_argument("--enrich-all", action="store_true", help="Also enrich already published items")
    args = parser.parse_args()

    today = date.today()
    items: list[dict] = []
    errors: list[str] = []

    if not args.skip_network:
        try:
            seen_urls: set[str] = set()
            for url, page_year in tangocat_month_urls(today):
                for item in parse_tangocat(fetch(url), today, page_year):
                    key = item["sourceUrl"]
                    if key in seen_urls:
                        continue
                    seen_urls.add(key)
                    items.append(item)
        except Exception as exc:  # noqa: BLE001 — ingest should keep going
            errors.append(f"tangocat: {exc}")
        try:
            items.extend(parse_hoy_digest(fetch(HOY_MILONGA_URL), today))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"hoy-milonga: {exc}")

    items.extend(parse_inbox())

    seen_ids: set[str] = set()
    unique: list[dict] = []
    for item in items:
        key = item.get("sourceUrl") or item["id"]
        if item["id"] in seen_ids or key in seen_ids:
            continue
        seen_ids.add(item["id"])
        seen_ids.add(key)
        unique.append(item)

    known = existing_keys()
    for item in unique:
        item["fingerprint"] = fingerprint(item["source"], item["title"], item.get("when", ""))
        published = item["id"] in known or item["title"].lower() in known
        if item["source"] != "hoy-milonga":
            published = published or item["sourceUrl"].lower() in known
        month = (item.get("eventStart") or "")[:7]
        published = published or ("t:" + norm_title(item["title"]) + "|" + month) in known
        if item.get("eventStart") and item.get("city"):
            published = published or ("s:" + item["eventStart"] + "|" + norm_title(item["city"])) in known
        item["alreadyPublished"] = published
        if (
            item["source"] == "tangocat"
            and not args.skip_enrich
            and item.get("priority") == 0
            and (not published or args.enrich_all)
        ):
            try:
                enrich_tangocat_item(item, IMAGE_DIR)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"enrich {item.get('id')}: {exc}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(unique),
        "newCount": sum(1 for item in unique if not item["alreadyPublished"]),
        "errors": errors,
        "items": unique,
    }
    out_path = OUT_DIR / "raw.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} ({payload['count']} items, {payload['newCount']} new)")
    for error in errors:
        print(f"WARN {error}", file=sys.stderr)
    return 1 if errors and not unique else 0


if __name__ == "__main__":
    raise SystemExit(main())
