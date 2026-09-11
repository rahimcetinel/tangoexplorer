"""Backfill event images onto news markdown (Tangocat OG → event site OG → Instagram)."""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from event_links import download_image, scrape_event_site, scrape_og_image

ROOT = Path(__file__).resolve().parents[1]
NEWS_DIR = ROOT / "src" / "content" / "news"
IMAGE_DIR = ROOT / "src" / "assets" / "events"
ENV_PATH = ROOT / ".env"


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_PATH.exists():
        return values
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if "=" not in line or line.strip().startswith("#"):
            continue
        key, val = line.split("=", 1)
        values[key.strip()] = val.strip().strip('"').strip("'")
    values.update({k: v for k, v in os.environ.items() if k.startswith("META_")})
    return values


def split_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---"):
        raise ValueError("frontmatter yok")
    parts = text.split("---", 2)
    return parts[1], parts[2]


def fm_get(fm: str, key: str) -> str:
    match = re.search(rf"^{re.escape(key)}:\s*(.+)$", fm, re.M)
    if not match:
        return ""
    return match.group(1).strip().strip('"')


def set_key(fm: str, key: str, value: str, quoted: bool) -> str:
    line = f'{key}: "{value}"' if quoted else f"{key}: {value}"
    pattern = re.compile(rf"^{re.escape(key)}:.*$", re.M)
    if pattern.search(fm):
        return pattern.sub(line, fm, count=1)
    return fm.rstrip() + "\n" + line + "\n"


def image_file_exists(image_field: str) -> bool:
    name = image_field.split("/")[-1].split("?")[0]
    return bool(name) and (IMAGE_DIR / name).exists()


def instagram_username(url: str) -> str:
    parsed = urlparse(url)
    if "instagram.com" not in parsed.netloc.lower():
        return ""
    parts = [p for p in parsed.path.split("/") if p]
    if not parts or parts[0] in {"p", "reel", "stories", "share"}:
        return ""
    return parts[0]


def instagram_media_url(username: str, env: dict[str, str]) -> str | None:
    token = env.get("META_ACCESS_TOKEN")
    user_id = env.get("META_IG_USER_ID")
    if not token or not user_id or not username:
        return None
    import json
    import urllib.parse
    import urllib.request

    fields = f"business_discovery.username({username}){{media.limit(1){{media_url}}}}"
    qs = urllib.parse.urlencode({"fields": fields, "access_token": token})
    url = f"https://graph.facebook.com/v21.0/{user_id}?{qs}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "TangoExplorer/0.1"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        media = payload.get("business_discovery", {}).get("media", {}).get("data") or []
        if media and media[0].get("media_url"):
            return str(media[0]["media_url"])
    except Exception:
        return None
    return None


def pick_source(fm: str, env: dict[str, str]) -> tuple[str | None, str]:
    source_url = fm_get(fm, "sourceUrl")
    website = fm_get(fm, "eventWebsite")
    instagram = fm_get(fm, "eventInstagram")
    source_key = fm_get(fm, "sourceKey")

    if source_url:
        og, _final = scrape_og_image(source_url)
        if og:
            return og, source_url
        time.sleep(0.12)

    if website:
        scraped = scrape_event_site(website)
        if scraped.get("imageUrl"):
            return scraped["imageUrl"], website
        og, _final = scrape_og_image(website)
        if og:
            return og, website
        time.sleep(0.12)

    if source_key == "instagram" or instagram:
        user = instagram_username(instagram)
        media = instagram_media_url(user, env)
        if media:
            return media, instagram or source_url
    return None, ""


def update_pair(stem: str, image: str, credit: str, source_url: str) -> int:
    changed = 0
    for locale in ("en", "tr"):
        path = NEWS_DIR / locale / f"{stem}.md"
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        fm, body = split_frontmatter(text)
        new_fm = set_key(fm, "image", image, quoted=True)
        if credit:
            new_fm = set_key(new_fm, "imageCredit", credit, quoted=True)
        if source_url:
            new_fm = set_key(new_fm, "imageSourceUrl", source_url, quoted=False)
        if new_fm != fm:
            path.write_text(f"---{new_fm}---{body}", encoding="utf-8")
            changed += 1
    return changed


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Collect event images into src/assets/events")
    parser.add_argument("--limit", type=int, default=0, help="Max posts missing an image")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    env = load_env()
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    en_files = sorted((NEWS_DIR / "en").glob("*.md"))
    missing = []
    for path in en_files:
        fm, _body = split_frontmatter(path.read_text(encoding="utf-8"))
        image = fm_get(fm, "image")
        if image and image_file_exists(image):
            continue
        missing.append(path)

    if args.limit:
        missing = missing[: args.limit]

    print(f"{len(missing)} posts need an image")
    updated = 0
    found = 0
    for path in missing:
        fm, _body = split_frontmatter(path.read_text(encoding="utf-8"))
        print(f"image {path.stem} ...")
        url, page = pick_source(fm, env)
        time.sleep(0.15)
        if not url:
            print("  no image")
            continue
        found += 1
        if args.dry_run:
            print(f"  would save {url}")
            continue
        local = download_image(url, IMAGE_DIR, path.stem)
        if not local:
            print("  download failed")
            continue
        host = urlparse(page or url).netloc.replace("www.", "")
        credit = f"Open Graph image ({host})" if host else "Open Graph image"
        n = update_pair(path.stem, local, credit, url)
        updated += n
        print(f"  saved {local} ({n} files)")

    print(f"Found {found} candidates, updated {updated} markdown files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
