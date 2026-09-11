"""Write EN/TR news files from Instagram candidate posts. Does not copy captions."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

from classify import attach_filters, classify_kinds
from slugify import slugify

ROOT = Path(__file__).resolve().parents[1]
RAW_PATH = Path(__file__).resolve().parent / "out" / "instagram.json"
NEWS_EN = ROOT / "src" / "content" / "news" / "en"
NEWS_TR = ROOT / "src" / "content" / "news" / "tr"
MAX_STORIES = 12

TR_MONTHS = {
    1: "Ocak",
    2: "Şubat",
    3: "Mart",
    4: "Nisan",
    5: "Mayıs",
    6: "Haziran",
    7: "Temmuz",
    8: "Ağustos",
    9: "Eylül",
    10: "Ekim",
    11: "Kasım",
    12: "Aralık",
}
EN_MONTHS = {
    1: "January",
    2: "February",
    3: "March",
    4: "April",
    5: "May",
    6: "June",
    7: "July",
    8: "August",
    9: "September",
    10: "October",
    11: "November",
    12: "December",
}
TR_PLACES = (
    "istanbul",
    "antalya",
    "ankara",
    "izmir",
    "fethiye",
    "bursa",
    "mersin",
    "bodrum",
    "kapadokya",
    "cappadocia",
    "gaziantep",
    "adana",
    "eskisehir",
    "eskişehir",
)


def yaml_escape(value: str) -> str:
    return value.replace('"', '\\"')


def pretty_username(username: str) -> str:
    return username.replace("_", " ").replace(".", " ").title()


def title_from_caption(caption: str, username: str, when: str) -> str:
    named = re.search(
        r"((?:[A-Za-zÇĞİÖŞÜçğıöşü0-9'’]+[ -]+){0,6}(?:Tango )?(?:Marathon|Maraton|Festival|Encuentro|Meeting|Milonga|Camp|Kamp)(?:\s+20\d{2})?)",
        caption,
        re.I,
    )
    if named:
        candidate = re.sub(r"\s+", " ", named.group(1)).strip(" -–—")
        if 8 <= len(candidate) <= 80:
            return candidate
    for raw in caption.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("http"):
            continue
        cleaned = re.sub(r"https?://\S+", "", line)
        cleaned = re.sub(r"[#@]\w+", "", cleaned)
        cleaned = re.sub(r"[\U00010000-\U0010ffff\u2600-\u27bf]+", "", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -–—|")
        if len(cleaned) >= 12:
            if len(cleaned) > 70:
                cleaned = cleaned[:70].rsplit(" ", 1)[0]
            return cleaned
    return f"{pretty_username(username)} {when}".strip()


def when_label(dates: list[str], months: dict[int, str]) -> str:
    parsed = [date.fromisoformat(value) for value in dates if value]
    if not parsed:
        return ""
    start, end = min(parsed), max(parsed)
    if start == end:
        return f"{start.day} {months[start.month]} {start.year}"
    if start.month == end.month and start.year == end.year:
        return f"{start.day}–{end.day} {months[start.month]} {start.year}"
    return (
        f"{start.day} {months[start.month]} {start.year}"
        f" – {end.day} {months[end.month]} {end.year}"
    )


def place_from(username: str, caption: str) -> tuple[str, str]:
    blob = f"{username} {caption}".lower()
    if any(token in blob for token in TR_PLACES) or "turkey" in blob or "türkiye" in blob or "turkiye" in blob:
        city = ""
        for token, label in (
            ("istanbul", "İstanbul"),
            ("antalya", "Antalya"),
            ("ankara", "Ankara"),
            ("izmir", "İzmir"),
            ("fethiye", "Fethiye"),
        ):
            if token in blob:
                city = label
                break
        return "Türkiye", city
    return "", ""


def pick_candidates(posts: list[dict], limit: int) -> list[dict]:
    chosen: list[dict] = []
    seen_account: set[str] = set()
    ranked = []
    for item in posts:
        if item.get("verdict") != "candidate" or not item.get("permalink"):
            continue
        future = item.get("futureDates") or []
        if not future:
            continue
        ranked.append((min(future), item))
    ranked.sort(key=lambda row: row[0])
    for _, item in ranked:
        key = item["username"].lower()
        if key in seen_account:
            continue
        seen_account.add(key)
        chosen.append(item)
        if len(chosen) >= limit:
            break
    return chosen


def render(locale: str, item: dict, today: date) -> str:
    username = item["username"]
    caption = item.get("captionPreview") or ""
    future = item.get("futureDates") or []
    when_en = when_label(future, EN_MONTHS)
    when_tr = when_label(future, TR_MONTHS)
    when = when_en if locale == "en" else when_tr
    title = title_from_caption(caption, username, when)
    country, city = place_from(username, caption)
    kinds = classify_kinds(f"{title} {caption} {username}")
    category = "turkiye" if country == "Türkiye" else "festival"
    start = min(future)
    end = max(future)
    payload = {
        "source": "instagram",
        "sourceUrl": item["permalink"],
        "title": title,
        "location": ", ".join(part for part in (country, city) if part),
        "when": when,
        "kinds": kinds,
        "format": "etkinlik",
        "sourceKey": "instagram",
        "eventName": title[:80],
        "eventWhen": when,
        "eventLocation": ", ".join(part for part in (country, city) if part),
        "eventInstagram": f"https://www.instagram.com/{username}",
        "eventStart": start,
        "eventEnd": end,
        "country": country,
        "city": city,
        "category": category,
    }
    attach_filters(payload, today)
    if locale == "en":
        summary = f"{title} is listed for {when_en}. Source: Instagram @{username}."
        body = (
            f"{title} appears on Instagram for {when_en}"
            f"{(' in ' + payload.get('eventLocation')) if payload.get('eventLocation') else ''}. "
            "This is a date and place summary, not a copy of the original post.\n\n"
            "Programme, tickets, and venue can change. Check the source post before travelling."
        )
    else:
        where = f" ({payload['eventLocation']})" if payload.get("eventLocation") else ""
        summary = f"{title} {when_tr} tarihlerinde duyuruldu. Kaynak: Instagram @{username}."
        body = (
            f"{title}{where}, Instagram’da {when_tr} için görünüyor. "
            "Bu metin orijinal gönderinin kopyası değil; yalnızca tarih ve yer özetidir.\n\n"
            "Program, bilet ve salon değişebilir. Gitmeden önce kaynak gönderiye bakın."
        )

    kinds_yaml = "".join(f"  - {kind}\n" for kind in payload.get("kinds") or kinds)
    extras = []
    if payload.get("eventName"):
        extras.append(f'eventName: "{yaml_escape(str(payload["eventName"]))}"')
    extras.append(f'eventWhen: "{yaml_escape(when)}"')
    if payload.get("eventLocation"):
        extras.append(f'eventLocation: "{yaml_escape(str(payload["eventLocation"]))}"')
    extras.append(f"eventInstagram: https://www.instagram.com/{username}")
    extras.append("kinds:")
    extras.append(kinds_yaml.rstrip("\n"))
    extras.append("format: etkinlik")
    extras.append("sourceKey: instagram")
    if payload.get("country"):
        extras.append(f'country: "{yaml_escape(str(payload["country"]))}"')
    if payload.get("city"):
        extras.append(f'city: "{yaml_escape(str(payload["city"]))}"')
    extras.append(f"eventStart: {start}")
    extras.append(f"eventEnd: {end}")
    extra_block = "".join(f"{line}\n" for line in extras)
    return (
        f"---\n"
        f'title: "{yaml_escape(title)}"\n'
        f"date: {today.isoformat()}\n"
        f"category: {payload.get('category') or category}\n"
        f"source: Instagram\n"
        f"sourceUrl: {item['permalink']}\n"
        f"locale: {locale}\n"
        f'summary: "{yaml_escape(summary)}"\n'
        f"{extra_block}"
        f"---\n\n"
        f"{body}\n"
    )


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Publish Instagram candidates to news markdown")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=MAX_STORIES)
    args = parser.parse_args()

    if not RAW_PATH.exists():
        raise SystemExit("instagram.json yok. Önce ingest_instagram.py çalıştır.")

    payload = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    chosen = pick_candidates(payload.get("posts") or [], args.limit)
    today = date.today()
    NEWS_EN.mkdir(parents=True, exist_ok=True)
    NEWS_TR.mkdir(parents=True, exist_ok=True)
    written = 0
    for item in chosen:
        start = min(item["futureDates"]).replace("-", "")
        slug = f"ig-{slugify(item['username'])}-{start}"
        en_path = NEWS_EN / f"{slug}.md"
        tr_path = NEWS_TR / f"{slug}.md"
        if en_path.exists() or tr_path.exists():
            print(f"SKIP {slug} (var)")
            continue
        if args.dry_run:
            print(f"DRY {slug}: {title_from_caption(item.get('captionPreview') or '', item['username'], '')}")
            written += 1
            continue
        en_path.write_text(render("en", item, today), encoding="utf-8")
        tr_path.write_text(render("tr", item, today), encoding="utf-8")
        print(f"WROTE {en_path.relative_to(ROOT)}")
        print(f"WROTE {tr_path.relative_to(ROOT)}")
        written += 1
    print(f"{'Would write' if args.dry_run else 'Wrote'} {written} stories ({written * 2} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
