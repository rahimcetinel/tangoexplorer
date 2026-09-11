"""Turn ingest raw.json items into short EN/TR markdown news files."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

from classify import attach_filters
from event_links import when_tr

ROOT = Path(__file__).resolve().parents[1]
RAW_PATH = Path(__file__).resolve().parent / "out" / "raw.json"
NEWS_EN = ROOT / "src" / "content" / "news" / "en"
NEWS_TR = ROOT / "src" / "content" / "news" / "tr"


def yaml_escape(value: str) -> str:
    return value.replace('"', '\\"')


def slug_for(item: dict) -> str:
    return re.sub(r"[^a-z0-9-]", "", item["id"].lower())[:80] or "haber"


def source_label(source: str) -> str:
    return {
        "tangocat": "Tangocat",
        "hoy-milonga": "Hoy Milonga",
        "inbox": "Inbox",
        "instagram": "Instagram",
    }.get(source, source)


def body_for(item: dict, locale: str) -> tuple[str, str]:
    title = item["title"]
    when = item.get("when") or ""
    location = item.get("location") or ""
    source = source_label(item["source"])

    if item["source"] == "hoy-milonga":
        if locale == "en":
            summary = (
                f"Hoy Milonga’s Turkey page lists {item.get('eventCount', 0)} milonga/practica records. "
                "Short digest; check the source for hall and time."
            )
            body = (
                "Hoy Milonga’s Turkey guide keeps this week’s milonga and practica listings. "
                "Tango News does not copy every hall. Check the source page for cancellations and times."
            )
        else:
            summary = (
                f"Hoy Milonga Türkiye sayfasında {item.get('eventCount', 0)} milonga/praktika kaydı görünüyor. "
                "Kısa özet; saat ve salon için kaynak ajandaya bakın."
            )
            body = (
                "Hoy Milonga’nın Türkiye rehberi bu haftanın milonga ve praktika kayıtlarını tutuyor. "
                "Tango News her salonu tek tek kopyalamaz. İptal ve saat için kaynak sayfayı kontrol edin."
            )
        return summary, body

    if locale == "en":
        where = f" in {location}" if location else ""
        when_bit = f" ({when})" if when else ""
        summary = f"{title}{when_bit}{where}. Source: {source}."
        body = (
            f"{title} is listed{when_bit}{where}. "
            "This is a date and place summary, not a copy of the source programme.\n\n"
            "Registration, venue, and lineup can change. Follow the source link for the current notice."
        )
        return summary, body

    where = f" {location} konumunda" if location else ""
    when_bit = f" {when_tr(when)} tarihleri arasında" if when else ""
    summary = f"{title}{when_bit}{where} duyuruldu. Kaynak: {source}."
    body = (
        f"{title},{when_bit}{where} listeleniyor. Bu metin kaynak sitedeki programın kopyası değil; "
        "yalnızca tarih, yer ve başlık özetidir.\n\n"
        "Kayıt, salon ve kadro bilgisi değişebilir. Güncel duyuru için kaynak linkine gidin."
    )
    return summary, body


def optional_fields(item: dict) -> str:
    keys = (
        "eventName",
        "eventWhen",
        "eventLocation",
        "eventWebsite",
        "eventFacebook",
        "eventInstagram",
        "image",
        "imageCredit",
        "imageSourceUrl",
        "kinds",
        "format",
        "sourceKey",
        "country",
        "city",
        "eventStart",
        "eventEnd",
    )
    lines: list[str] = []
    for key in keys:
        value = item.get(key)
        if not value:
            continue
        if key == "kinds" and isinstance(value, list):
            lines.append("kinds:")
            lines.extend(f"  - {kind}" for kind in value)
            continue
        if key in {"eventWebsite", "eventFacebook", "eventInstagram", "format", "sourceKey", "eventStart", "eventEnd", "imageSourceUrl"}:
            lines.append(f"{key}: {value}")
        else:
            lines.append(f'{key}: "{yaml_escape(str(value))}"')
    return "".join(f"{line}\n" for line in lines)


def render_markdown(item: dict, today: date, locale: str) -> str:
    summary, body = body_for(item, locale)
    extras = optional_fields(item)
    return (
        f"---\n"
        f'title: "{yaml_escape(item["title"])}"\n'
        f"date: {today.isoformat()}\n"
        f"category: {item.get('category') or 'etkinlik'}\n"
        f"source: {source_label(item['source'])}\n"
        f"sourceUrl: {item['sourceUrl']}\n"
        f"locale: {locale}\n"
        f'summary: "{yaml_escape(summary)}"\n'
        f"{extras}"
        f"---\n\n"
        f"{body}\n"
    )


def prepare(item: dict, today: date) -> dict:
    item.setdefault("eventName", item.get("title"))
    item.setdefault("eventWhen", item.get("when"))
    item.setdefault("eventLocation", item.get("location"))
    attach_filters(item, today)
    return item


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Write short news markdown from raw.json")
    parser.add_argument("--dry-run", action="store_true", help="Print planned files, do not write")
    parser.add_argument("--limit", type=int, default=0, help="Max new stories (0 = no cap)")
    parser.add_argument("--include-published", action="store_true")
    args = parser.parse_args()

    if not RAW_PATH.exists():
        raise SystemExit("raw.json yok. Önce: python agentic-python/ingest.py")

    payload = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    items = payload.get("items", [])
    if not args.include_published:
        items = [item for item in items if not item.get("alreadyPublished")]
        items = [item for item in items if item.get("source") != "hoy-milonga"]

    NEWS_EN.mkdir(parents=True, exist_ok=True)
    NEWS_TR.mkdir(parents=True, exist_ok=True)
    written = 0
    today = date.today()
    for item in items:
        if args.limit and written >= args.limit:
            break
        slug = slug_for(item)
        en_path = NEWS_EN / f"{slug}.md"
        tr_path = NEWS_TR / f"{slug}.md"
        if (en_path.exists() or tr_path.exists()) and not args.include_published:
            continue
        prepare(item, today)
        if args.dry_run:
            print(f"DRY {slug}: {item['title']}")
        else:
            en_path.write_text(render_markdown(item, today, "en"), encoding="utf-8")
            tr_path.write_text(render_markdown(item, today, "tr"), encoding="utf-8")
            print(f"WROTE {en_path.relative_to(ROOT)}")
        written += 1

    print(f"{'Would write' if args.dry_run else 'Wrote'} {written} stories")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
