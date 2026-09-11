"""Backfill event website, social links, and images on existing news posts."""

from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

from event_links import enrich_tangocat_item
from ingest import TANGOCAT_URL, fetch, parse_tangocat

ROOT = Path(__file__).resolve().parents[1]
NEWS_DIR = ROOT / "src" / "content" / "news"
IMAGE_DIR = ROOT / "src" / "assets" / "events"
OPTIONAL = (
    "eventName",
    "eventWhen",
    "eventLocation",
    "eventWebsite",
    "eventFacebook",
    "eventInstagram",
    "image",
)


def split_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---"):
        raise ValueError("frontmatter yok")
    parts = text.split("---", 2)
    return parts[1], parts[2]


def set_key(fm: str, key: str, value: str, quoted: bool) -> str:
    line = f'{key}: "{value}"' if quoted else f"{key}: {value}"
    pattern = re.compile(rf"^{re.escape(key)}:.*$", re.M)
    if pattern.search(fm):
        return pattern.sub(line, fm, count=1)
    return fm.rstrip() + "\n" + line + "\n"


def main() -> int:
    listing: dict[str, dict] = {}
    try:
        for row in parse_tangocat(fetch(TANGOCAT_URL), date.today()):
            listing[row["sourceUrl"]] = row
    except Exception as exc:  # noqa: BLE001
        print(f"WARN tangocat listing: {exc}", file=sys.stderr)

    updated = 0
    for path in sorted(NEWS_DIR.rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        fm, body = split_frontmatter(text)
        url_m = re.search(r"^sourceUrl:\s*(\S+)", fm, re.M)
        title_m = re.search(r'^title:\s*"(.*)"', fm, re.M)
        source_m = re.search(r"^source:\s*(.+)$", fm, re.M)
        if not url_m or "tangocat.net/go/" not in url_m.group(1):
            continue
        item = {
            "id": path.stem,
            "title": title_m.group(1) if title_m else path.stem,
            "sourceUrl": url_m.group(1).strip(),
            "source": (source_m.group(1).strip() if source_m else "Tangocat"),
        }
        listed = listing.get(item["sourceUrl"])
        if listed:
            item["title"] = listed.get("title") or item["title"]
            item["when"] = listed.get("when") or ""
            item["location"] = listed.get("location") or ""
        print(f"enrich {path.name} ...")
        enrich_tangocat_item(item, IMAGE_DIR)
        new_fm = fm
        quoted = {"eventName", "eventWhen", "eventLocation", "image"}
        for key in OPTIONAL:
            value = item.get(key)
            if not value:
                continue
            new_fm = set_key(new_fm, key, str(value), quoted=key in quoted)
        if new_fm != fm:
            path.write_text(f"---{new_fm}---{body}", encoding="utf-8")
            updated += 1
            print(f"  updated {path.name}")
        else:
            print("  no new fields")
    print(f"Updated {updated} posts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
