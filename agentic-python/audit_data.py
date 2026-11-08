"""Audit the event collection for quality problems.

Checks missing fields, suspicious titles and likely cross-source duplicates.
Stdlib only; prints a summary and writes out/data-audit.json.

Usage: python agentic-python/audit_data.py [--duplicates-only]
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NEWS_DIR = ROOT / "src" / "content" / "news" / "en"
OUT_DIR = Path(__file__).resolve().parent / "out"

GENERIC = {"marathon", "festival", "tango", "milonga", "workshop", "encuentro", "practica"}


def parse_post(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    match = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n", raw, re.S)
    front = match.group(1) if match else ""
    fields = {}
    for line in front.splitlines():
        key, sep, value = line.partition(":")
        if not sep:
            continue
        fields[key.strip()] = value.strip().strip('"').strip("'")
    fields["_file"] = path.name
    fields["_body"] = raw[match.end():] if match else raw
    return fields


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("ı", "i").replace("ł", "l").lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def as_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value[:10])
    except (TypeError, ValueError):
        return None


def richness(post: dict) -> int:
    keys = ("image", "eventWebsite", "eventInstagram", "eventFacebook", "registrationStart", "edition", "summary")
    return sum(1 for key in keys if post.get(key))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--duplicates-only", action="store_true")
    args = parser.parse_args()

    posts = [parse_post(path) for path in sorted(NEWS_DIR.glob("*.md"))]
    events = [post for post in posts if post.get("format", "etkinlik") != "blog" and post.get("eventStart")]

    missing = {
        "country": [post["_file"] for post in events if not post.get("country")],
        "city": [post["_file"] for post in events if not post.get("city")],
        "start": [post["_file"] for post in events if not post.get("eventStart")],
        "image": [post["_file"] for post in events if not post.get("image")],
        "summary": [post["_file"] for post in events if not post.get("summary")],
    }

    suspicious = []
    for post in events:
        title = post.get("title", "").strip()
        if (
            normalize(title) in GENERIC
            or "!!!" in title
            or title.endswith("...")
            or title.endswith("…")
            or (title.isupper() and len(title) > 12 and " " in title)
        ):
            suspicious.append({"file": post["_file"], "title": title})

    duplicates = []
    for i, first in enumerate(events):
        first_start = as_date(first["eventStart"])
        if not first_start:
            continue
        first_city = normalize(first.get("city") or first.get("country") or "")
        for second in events[i + 1:]:
            second_start = as_date(second.get("eventStart", ""))
            if not second_start or abs((first_start - second_start).days) > 1:
                continue
            second_city = normalize(second.get("city") or second.get("country") or "")
            if first_city != second_city:
                continue
            title_a = normalize(first.get("title", ""))
            title_b = normalize(second.get("title", ""))
            ratio = SequenceMatcher(None, title_a, title_b).ratio()
            same_site = bool(first.get("eventWebsite")) and first.get("eventWebsite") == second.get("eventWebsite")
            if ratio >= 0.6 or same_site:
                duplicates.append(
                    {
                        "similarity": round(ratio, 2),
                        "sameWebsite": same_site,
                        "a": {"file": first["_file"], "title": first.get("title"), "start": first["eventStart"]},
                        "b": {"file": second["_file"], "title": second.get("title"), "start": second["eventStart"]},
                        "keep": first["_file"] if richness(first) >= richness(second) else second["_file"],
                    }
                )

    duplicates.sort(key=lambda item: item["similarity"], reverse=True)

    report = {
        "events": len(events),
        "missing": {key: len(value) for key, value in missing.items()},
        "missingFiles": {key: value[:50] for key, value in missing.items()},
        "suspicious": suspicious,
        "duplicates": duplicates,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "data-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if not args.duplicates_only:
        print(f"events: {len(events)}")
        print("missing:", ", ".join(f"{key}={len(value)}" for key, value in missing.items()))
        for key, files in missing.items():
            if files:
                print(f"  {key}: {files[0]}" + (f" (+{len(files) - 1})" if len(files) > 1 else ""))
        print(f"suspicious titles: {len(suspicious)}")
        for item in suspicious:
            print(f"  {item['file']}: {item['title']}")
    print(f"duplicate candidates: {len(duplicates)}")
    for item in duplicates[:20]:
        print(f"  {item['similarity']} {item['a']['file']} <> {item['b']['file']}  keep={item['keep']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
