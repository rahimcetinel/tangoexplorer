"""Tangoverse source: backfill event cover images and add new events.

Tangoverse (https://tangoverse.net) is a Supabase-backed directory. We read its
public REST API (as its own website does), read-only.

Modes:
  --images   Backfill cover images for existing news that lack one
  --publish  Add Tangoverse-only top-level events as new news items
  (no flag => both)
Stdlib only. Attribution: source "Tangoverse" + event page link.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from collect_images import IMAGE_DIR, fm_get, split_frontmatter, update_pair  # noqa: E402
from event_links import download_image  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
NEWS_EN = ROOT / "src" / "content" / "news" / "en"
NEWS_TR = ROOT / "src" / "content" / "news" / "tr"
HOMEPAGE = "https://tangoverse.net/"
USER_AGENT = "TangoNews/0.1 (+https://tangoexplorer.com)"

ALLOWED_TYPES = {"festival", "marathon", "weekend"}
KIND_MAP = {
    "festival": ["festival"],
    "marathon": ["marathon"],
    "workshop": ["workshop"],
    "group_class": ["ders"],
}
COUNTRY_EN = {"Türkyie": "Turkey", "Turkiye": "Turkey", "Türkiye": "Turkey", "UAE": "United Arab Emirates"}
COUNTRY_TR = {"Türkyie": "Türkiye", "Turkiye": "Türkiye", "UAE": "BAE", "United Arab Emirates": "BAE"}


def get(url: str, headers: dict | None = None) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def discover_supabase() -> tuple[str, str]:
    html = get(HOMEPAGE)
    bundle_path = re.search(r"/assets/index-[A-Za-z0-9_\-]+\.js", html)
    if not bundle_path:
        raise SystemExit("Tangoverse: JS bundle bulunamadi")
    bundle = get("https://tangoverse.net" + bundle_path.group(0))
    base = re.search(r"https://[a-z0-9]+\.supabase\.co", bundle)
    key = re.search(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+", bundle)
    if not base or not key:
        raise SystemExit("Tangoverse: Supabase URL/anon key bulunamadi")
    return base.group(0), key.group(0)


def fetch_events(base: str, key: str, today: date, months: int = 14) -> list[dict]:
    horizon = (today + timedelta(days=months * 31)).isoformat()
    fields = (
        "id,title,slug,event_type,start_at,end_at,city,country,venue_name,address,"
        "lat,lng,cover_image_url,website_url,description,parent_event_id"
    )
    url = (
        f"{base}/rest/v1/events?select={fields}"
        f"&start_at=gte.{today.isoformat()}&start_at=lte.{horizon}"
        f"&order=start_at.asc&limit=1000"
    )
    return json.loads(get(url, {"apikey": key, "Authorization": "Bearer " + key}))


def strip_acc(value: str) -> str:
    return unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")


STOP = re.compile(
    r"\b(festival|festivalito|marathon|maraton|congress|encuentro|meeting|weekend|edition|edicion|"
    r"anniversary|international|tango|de|del|la|el|the|and|y)\b"
)


def title_tokens(value: str) -> list[str]:
    text = re.sub(r"[^a-z0-9 ]", " ", strip_acc(value).lower())
    text = re.sub(r"\b\d{1,3}(st|nd|rd|th)?\b", " ", text)
    text = STOP.sub(" ", text)
    return [word for word in re.sub(r"\s+", " ", text).strip().split() if len(word) > 2]


def norm_city(value: str) -> str:
    return re.sub(r"[^a-z]", "", strip_acc(value).lower())


def jaccard(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    return len(sa & sb) / len(sa | sb)


def event_page(event: dict) -> str:
    return f"https://tangoverse.net/events/{event.get('slug', '')}"


def match(rec: dict, candidates: list[dict], strict: bool) -> dict | None:
    """Match a record to candidate events. `strict` is used for image backfill
    (requires a meaningful shared title token or the exact same day), loose for
    duplicate detection when publishing."""
    rtoks = title_tokens(rec.get("title") or "")
    for event in candidates:
        etoks = title_tokens(event.get("title") or "")
        shared = set(rtoks) & set(etoks)
        score = jaccard(rtoks, etoks)
        if rtoks and etoks:
            if strict and score >= 0.6 and any(len(word) >= 5 for word in shared):
                return event
            if not strict and score >= 0.5:
                return event
        if rec.get("city") and norm_city(rec.get("city")) == norm_city(event.get("city")):
            d1 = (rec.get("start_at") or "")[:10]
            d2 = (event.get("start_at") or "")[:10]
            if d1 and d2:
                try:
                    diff = abs((datetime.fromisoformat(d1) - datetime.fromisoformat(d2)).days)
                except ValueError:
                    diff = None
                if diff is not None:
                    if strict and diff == 0 and any(len(word) >= 5 for word in shared):
                        return event
                    if not strict and diff <= 3:
                        return event
    return None


def fm_field(fm: str, key: str) -> str:
    found = re.search(rf"^{key}:\s*\"?(.+?)\"?\s*$", fm, re.M)
    return found.group(1).strip().strip('"') if found else ""


def existing_index() -> list[dict]:
    rows: list[dict] = []
    for path in sorted(NEWS_EN.glob("*.md")):
        fm, _ = split_frontmatter(path.read_text(encoding="utf-8"))
        location = fm_field(fm, "eventLocation")
        start = fm_field(fm, "eventStart")
        rows.append(
            {
                "stem": path.stem,
                "title": fm_field(fm, "title") or fm_field(fm, "eventName"),
                "city": fm_field(fm, "city") or (location.split(",")[-1].strip() if location else ""),
                "start_at": (start + "T00:00:00") if start else "",
                "image": fm_field(fm, "image"),
            }
        )
    return rows


def backfill_images(events: list[dict], dry: bool, limit: int) -> int:
    parents = [e for e in events if not e.get("parent_event_id") and e.get("cover_image_url")]
    updated = 0
    scanned = 0
    for rec in existing_index():
        image = rec["image"]
        if image and (IMAGE_DIR / image.split("/")[-1]).exists():
            continue
        if limit and scanned >= limit:
            break
        target = match(rec, parents, strict=True)
        if not target:
            continue
        scanned += 1
        print(f"IMG {rec['stem']} -> {target.get('slug')}")
        if dry:
            updated += 1
            continue
        local = download_image(target["cover_image_url"], IMAGE_DIR, rec["stem"])
        if not local:
            print("   download failed")
            continue
        updated += update_pair(rec["stem"], local, "Tangoverse", event_page(target))
    return updated


def format_when(start: str, end: str, tr: bool) -> str:
    try:
        s = datetime.fromisoformat(start[:10]).date()
        e = datetime.fromisoformat(end[:10]).date() if end else s
    except ValueError:
        return start[:10]
    months_en = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    months_tr = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
    months = months_tr if tr else months_en
    if s == e:
        return f"{s.day} {months[s.month - 1]} {s.year}"
    if s.month == e.month and s.year == e.year:
        return f"{s.day}–{e.day} {months[s.month - 1]} {s.year}"
    return f"{s.day} {months[s.month - 1]} {s.year} – {e.day} {months[e.month - 1]} {e.year}"


def yaml_escape(value: str) -> str:
    return value.replace('"', '\\"')


def render(event: dict, locale: str, today: date, image: str) -> str:
    tr = locale == "tr"
    title = (event.get("title") or "").strip()
    city = (event.get("city") or "").strip()
    country_raw = (event.get("country") or "").strip()
    country = (COUNTRY_TR if tr else COUNTRY_EN).get(country_raw, country_raw)
    place = ", ".join(part for part in (country, city) if part)
    when = format_when(event.get("start_at") or "", event.get("end_at") or "", tr)
    page = event_page(event)
    kinds = KIND_MAP.get((event.get("event_type") or "").lower(), [])
    category = "turkiye" if country_raw in {"Turkey", "Türkiye", "Turkiye", "Türkyie"} else "dunya"
    if tr:
        summary = f"{title}, {when} tarihlerinde {place} için listelendi. Kaynak: Tangoverse."
        body = (
            f"{title}, {when} tarihlerinde {place} konumunda planlanıyor. "
            "Bu metin kaynak sayfanın kopyası değil; yalnızca tarih, yer ve başlık özetidir.\n\n"
            "Program ve kayıt değişebilir. Güncel bilgi için Tangoverse kaydına bakın."
        )
    else:
        summary = f"{title} is listed for {when} in {place}. Source: Tangoverse."
        body = (
            f"{title} is listed for {when} in {place}. "
            "This is a date and place summary, not a copy of the source listing.\n\n"
            "Programme and registration can change. Follow the Tangoverse listing for current details."
        )
    kinds_block = "".join(f"  - {kind}\n" for kind in kinds)
    extras = [
        f'eventName: "{yaml_escape(title)}"',
        f'eventWhen: "{yaml_escape(when)}"',
        f'eventLocation: "{yaml_escape(place)}"',
    ]
    if event.get("website_url"):
        extras.append(f"eventWebsite: {event['website_url']}")
    if image:
        extras.append(f'image: "{image}"')
        extras.append(f'imageCredit: "Tangoverse"')
        extras.append(f"imageSourceUrl: {page}")
    if kinds:
        extras.append("kinds:")
        extras.append(kinds_block.rstrip("\n"))
    extras.append("format: etkinlik")
    extras.append("sourceKey: tangoverse")
    extras.append(f'country: "{yaml_escape(country)}"')
    if city:
        extras.append(f'city: "{yaml_escape(city)}"')
    extras.append(f"eventStart: {(event.get('start_at') or '')[:10]}")
    if event.get("end_at"):
        extras.append(f"eventEnd: {(event.get('end_at') or '')[:10]}")
    extra_block = "".join(f"{line}\n" for line in extras)
    return (
        f"---\n"
        f'title: "{yaml_escape(title)}"\n'
        f"date: {today.isoformat()}\n"
        f"category: {category}\n"
        f"source: Tangoverse\n"
        f"sourceUrl: {page}\n"
        f"locale: {locale}\n"
        f'summary: "{yaml_escape(summary)}"\n'
        f"{extra_block}"
        f"---\n\n"
        f"{body}\n"
    )


def publish(events: list[dict], dry: bool, limit: int) -> int:
    existing = existing_index()
    parents = [e for e in events if not e.get("parent_event_id") and (e.get("event_type") or "").lower() in ALLOWED_TYPES]
    written = 0
    for event in parents:
        if match(event, existing, strict=False):
            continue
        if limit and written >= limit:
            break
        slug = "tangoverse-" + re.sub(r"[^a-z0-9-]", "", (event.get("slug") or "").lower())
        en_path = NEWS_EN / f"{slug}.md"
        tr_path = NEWS_TR / f"{slug}.md"
        if en_path.exists() or tr_path.exists():
            continue
        print(f"NEW {slug}: {event.get('title')}")
        if dry:
            written += 1
            continue
        image = ""
        if event.get("cover_image_url"):
            local = download_image(event["cover_image_url"], IMAGE_DIR, slug)
            image = local or ""
        today = date.today()
        en_path.write_text(render(event, "en", today, image), encoding="utf-8")
        tr_path.write_text(render(event, "tr", today, image), encoding="utf-8")
        written += 1
    return written


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Tangoverse image backfill + new events")
    parser.add_argument("--images", action="store_true", help="Only backfill cover images")
    parser.add_argument("--publish", action="store_true", help="Only add new events")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    do_images = args.images or not (args.images or args.publish)
    do_publish = args.publish or not (args.images or args.publish)

    base, key = discover_supabase()
    events = fetch_events(base, key, date.today())
    print(f"Tangoverse: {len(events)} upcoming events")

    if do_images:
        n = backfill_images(events, args.dry_run, args.limit)
        print(f"{'Would backfill' if args.dry_run else 'Backfilled'} {n} images")
    if do_publish:
        n = publish(events, args.dry_run, args.limit)
        print(f"{'Would add' if args.dry_run else 'Added'} {n} events")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
