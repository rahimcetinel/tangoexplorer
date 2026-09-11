"""Rename news files whose slugs dropped Latin diacritics; keep old URLs as 301s."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from slugify import slugify

ROOT = Path(__file__).resolve().parents[1]
NEWS_EN = ROOT / "src" / "content" / "news" / "en"
NEWS_TR = ROOT / "src" / "content" / "news" / "tr"
IMAGE_DIR = ROOT / "src" / "assets" / "events"


def fm_get(fm: str, key: str) -> str:
    match = re.search(rf"^{re.escape(key)}:\s*(.+)$", fm, re.M)
    if not match:
        return ""
    return match.group(1).strip().strip('"')


def expected_slug(stem: str, title: str, event_name: str) -> str:
    src = event_name or title
    if stem.startswith("tangocat-"):
        return "tangocat-" + slugify(src)
    if stem.startswith("ig-"):
        return stem
    return slugify(src)


def is_diacritic_loss(old: str, new: str) -> bool:
    compact_old = old.replace("-", "")
    compact_new = new.replace("-", "")
    if compact_old == compact_new:
        return False
    letters = iter(compact_new)
    return all(ch in letters for ch in compact_old) and len(compact_new) > len(compact_old)


def plan() -> list[tuple[str, str]]:
    seen: dict[str, str] = {}
    rows: list[tuple[str, str]] = []
    for path in sorted(NEWS_EN.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        fm = text.split("---", 2)[1]
        new = expected_slug(path.stem, fm_get(fm, "title"), fm_get(fm, "eventName"))
        if new == path.stem or not is_diacritic_loss(path.stem, new):
            continue
        if new in seen or (NEWS_EN / f"{new}.md").exists():
            print(f"SKIP collide {path.stem} -> {new}")
            continue
        seen[new] = path.stem
        rows.append((path.stem, new))
    return rows


def rename_pair(old: str, new: str, dry: bool) -> None:
    for folder in (NEWS_EN, NEWS_TR):
        src = folder / f"{old}.md"
        dest = folder / f"{new}.md"
        if not src.exists():
            print(f"missing {src}")
            continue
        text = src.read_text(encoding="utf-8")
        fm, body = text.split("---", 2)[1], text.split("---", 2)[2]
        image = fm_get(fm, "image")
        if image:
            name = image.split("/")[-1].split("?")[0]
            stem_img, _, ext = name.rpartition(".")
            if stem_img == old:
                new_name = f"{new}.{ext}"
                img_src = IMAGE_DIR / name
                img_dest = IMAGE_DIR / new_name
                if img_src.exists() and not dry:
                    img_src.rename(img_dest)
                text = text.replace(name, new_name)
                print(f"  image {name} -> {new_name}")
        if dry:
            print(f"DRY {folder.name}/{old} -> {new}")
            continue
        dest.write_text(text, encoding="utf-8")
        src.unlink()
        print(f"  {folder.name}/{old} -> {new}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    rows = plan()
    for old, new in rows:
        print(f"{old} -> {new}")
        rename_pair(old, new, dry=not args.apply)
    print(f"{len(rows)} slugs")
    if args.apply:
        redirect_lines = []
        for old, new in rows:
            redirect_lines.append(f"/news/{old} /news/{new} 301")
            redirect_lines.append(f"/tr/haber/{old} /tr/haber/{new} 301")
        print("REDIRECTS")
        print("\n".join(redirect_lines))


if __name__ == "__main__":
    main()
