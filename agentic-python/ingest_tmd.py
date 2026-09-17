"""TMD (Tango Marathon Directory) source.

Adds new events, enriches existing records with edition + registration date,
and backfills event images. Public REST API (read-only). Attribution: "TMD".
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from collect_images import IMAGE_DIR, fm_get, set_key, split_frontmatter, update_pair  # noqa: E402
from event_links import download_image  # noqa: E402
from ingest_tangoverse import existing_index, format_when, match, title_tokens, yaml_escape  # noqa: E402
from slugify import slugify  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
NEWS = ROOT / "src" / "content" / "news"
NEWS_EN = NEWS / "en"
NEWS_TR = NEWS / "tr"
API = "https://www.tangomarathons.com/wp-json/tmd/v3/events"
USER_AGENT = "TangoNews/0.1 (+https://tangoexplorer.com)"

ISO_NAME = {
    "AT": "Austria", "BE": "Belgium", "BG": "Bulgaria", "HR": "Croatia", "CY": "Cyprus",
    "CZ": "Czechia", "DK": "Denmark", "EE": "Estonia", "FI": "Finland", "FR": "France",
    "DE": "Germany", "GR": "Greece", "HU": "Hungary", "IE": "Ireland", "IT": "Italy",
    "LV": "Latvia", "LT": "Lithuania", "LU": "Luxembourg", "MT": "Malta", "MD": "Moldova",
    "ME": "Montenegro", "NL": "Netherlands", "MK": "North Macedonia", "NO": "Norway",
    "PL": "Poland", "PT": "Portugal", "RO": "Romania", "RS": "Serbia", "SK": "Slovakia",
    "SI": "Slovenia", "ES": "Spain", "SE": "Sweden", "CH": "Switzerland", "UA": "Ukraine",
    "GB": "United Kingdom", "BA": "Bosnia and Herzegovina", "AL": "Albania", "IS": "Iceland",
    "US": "United States", "CA": "Canada", "MX": "Mexico", "BR": "Brazil", "AR": "Argentina",
    "CL": "Chile", "CO": "Colombia", "UY": "Uruguay", "PE": "Peru", "VE": "Venezuela",
    "EC": "Ecuador", "BO": "Bolivia", "PY": "Paraguay", "CR": "Costa Rica", "PA": "Panama",
    "GT": "Guatemala", "CU": "Cuba", "DO": "Dominican Republic",
    "TR": "Turkey", "RU": "Russia", "GE": "Georgia", "AM": "Armenia", "AZ": "Azerbaijan",
    "KZ": "Kazakhstan", "UZ": "Uzbekistan", "IN": "India", "ID": "Indonesia", "JP": "Japan",
    "KR": "South Korea", "CN": "China", "SG": "Singapore", "TH": "Thailand",
    "PH": "Philippines", "MY": "Malaysia", "VN": "Vietnam", "AE": "United Arab Emirates",
    "LB": "Lebanon", "IL": "Israel", "QA": "Qatar", "SA": "Saudi Arabia", "HK": "Hong Kong",
    "TW": "Taiwan", "PK": "Pakistan", "IR": "Iran", "IQ": "Iraq", "JO": "Jordan",
    "KW": "Kuwait", "BH": "Bahrain", "OM": "Oman", "LK": "Sri Lanka", "NP": "Nepal",
    "MN": "Mongolia", "AU": "Australia", "NZ": "New Zealand", "PF": "French Polynesia",
    "FJ": "Fiji", "ZA": "South Africa", "EG": "Egypt", "MA": "Morocco", "TN": "Tunisia",
    "KE": "Kenya", "NG": "Nigeria",
}


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def get_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", "replace")


def fetch_events(today: date) -> list[dict]:
    events: list[dict] = []
    page = 1
    while page <= 10:
        url = (
            f"{API}?start_date_min={today.isoformat()}&per_page=100&page={page}"
            f"&orderby=start_date&order=asc&meta_fields=end_date,website&include_taxonomies=1"
        )
        data = get_json(url)
        batch = data.get("_embedded", {}).get("events", [])
        events.extend(batch)
        if not batch or page * 100 >= int(data.get("total", 0)):
            break
        page += 1
    return events


def title_of(event: dict) -> str:
    return re.sub(r"\s+", " ", html.unescape(event.get("title") or "")).strip()


def date_of(value: str) -> str:
    return (value or "")[:10]


def iso_name(code: str) -> str:
    return ISO_NAME.get((code or "").upper(), (code or "").upper())


def event_type(event: dict) -> str:
    tax = event.get("event-categories-2020") or []
    return (tax[0].get("name") or "").lower() if tax else ""


def kinds_for(event: dict) -> list[str]:
    name = event_type(event)
    if "marathon" in name:
        return ["marathon"]
    if "festival" in name:
        return ["festival"]
    if "encuentro" in name:
        return ["encuentro"]
    if "workshop" in name or "class" in name:
        return ["workshop"]
    return []


def scrape_image(link: str) -> str:
    try:
        html = get_text(link)
    except Exception:  # noqa: BLE001
        return ""
    match_ = re.search(r'<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*>', html)
    if not match_:
        match_ = re.search(r'<img[^>]*\bwp-post-image\b[^>]*>', html)
    if not match_:
        return ""
    src = re.search(r'src="([^"]+)"', match_.group(0))
    if not src:
        return ""
    url = src.group(1)
    if "TMD-Logo" in url or "cropped-TMD" in url:
        return ""
    return url


def render(event: dict, locale: str, today: date, image: str) -> str:
    tr = locale == "tr"
    title = title_of(event)
    country = iso_name(event.get("country") or "")
    city = (event.get("city") or "").strip()
    place = ", ".join(part for part in (country, city) if part)
    when = format_when(date_of(event.get("start_date") or ""), date_of(event.get("end_date") or ""), tr)
    website = (event.get("website") or "").strip()
    edition = (event.get("edition") or "").strip()
    reg = date_of(event.get("registration_start_date") or "")
    kinds = kinds_for(event)
    category = "turkiye" if country == "Turkey" else "dunya"
    page = event.get("link") or ""
    if tr:
        summary = f"{title}, {when} tarihlerinde {place} için listelendi. Kaynak: TMD."
        body = (
            f"{title}, {when} tarihlerinde {place} konumunda planlanıyor. "
            "Bu metin kaynak sayfanın kopyası değil; yalnızca tarih, yer ve başlık özetidir.\n\n"
            "Program ve kayıt değişebilir. Güncel bilgi için TMD kaydına bakın."
        )
    else:
        summary = f"{title} is listed for {when} in {place}. Source: TMD."
        body = (
            f"{title} is listed for {when} in {place}. "
            "This is a date and place summary, not a copy of the source listing.\n\n"
            "Programme and registration can change. Follow the TMD listing for current details."
        )
    extras = [
        f'eventName: "{yaml_escape(title)}"',
        f'eventWhen: "{yaml_escape(when)}"',
        f'eventLocation: "{yaml_escape(place)}"',
    ]
    if website:
        extras.append(f"eventWebsite: {website}")
    if image:
        extras.append(f'image: "{image}"')
        extras.append('imageCredit: "TMD"')
        extras.append(f"imageSourceUrl: {page}")
    if kinds:
        extras.append("kinds:")
        extras.extend(f"  - {kind}" for kind in kinds)
    extras.append("format: etkinlik")
    extras.append("sourceKey: tmd")
    if edition.isdigit():
        extras.append(f"edition: {edition}")
    if reg:
        extras.append(f"registrationStart: {reg}")
    extras.append(f'country: "{yaml_escape(country)}"')
    if city:
        extras.append(f'city: "{yaml_escape(city)}"')
    extras.append(f"eventStart: {date_of(event.get('start_date') or '')}")
    end = date_of(event.get("end_date") or "")
    if end:
        extras.append(f"eventEnd: {end}")
    extra_block = "".join(f"{line}\n" for line in extras)
    return (
        f"---\n"
        f'title: "{yaml_escape(title)}"\n'
        f"date: {today.isoformat()}\n"
        f"category: {category}\n"
        f"source: TMD\n"
        f"sourceUrl: {page}\n"
        f"locale: {locale}\n"
        f'summary: "{yaml_escape(summary)}"\n'
        f"{extra_block}"
        f"---\n\n"
        f"{body}\n"
    )


def set_fields(stem: str, fields: dict[str, tuple[str, bool]]) -> int:
    changed = 0
    for locale in ("en", "tr"):
        path = NEWS / locale / f"{stem}.md"
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        fm, body = split_frontmatter(text)
        new_fm = fm
        for key, (value, quoted) in fields.items():
            new_fm = set_key(new_fm, key, value, quoted)
        if new_fm != fm:
            path.write_text(f"---{new_fm}---{body}", encoding="utf-8")
            changed += 1
    return changed


def enriches(event: dict) -> dict[str, tuple[str, bool]]:
    fields: dict[str, tuple[str, bool]] = {}
    edition = (event.get("edition") or "").strip()
    if edition.isdigit():
        fields["edition"] = (edition, False)
    reg = date_of(event.get("registration_start_date") or "")
    if reg:
        fields["registrationStart"] = (reg, False)
    return fields


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="TMD: new events, edition/registration enrichment, images")
    parser.add_argument("--publish", action="store_true", help="Only add new events")
    parser.add_argument("--enrich", action="store_true", help="Only enrich existing records (edition/registration/website/image)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    do_enrich = args.enrich or not (args.publish or args.enrich)
    do_publish = args.publish or not (args.publish or args.enrich)

    today = date.today()
    events = fetch_events(today)
    existing = existing_index()
    print(f"TMD: {len(events)} upcoming events")

    if do_enrich:
        enriched = 0
        images = 0
        scanned = 0
        for event in events:
            rec = {"title": title_of(event), "city": event.get("city") or "", "start_at": date_of(event.get("start_date") or "") + "T00:00:00"}
            row = match(rec, existing, strict=True)
            if not row:
                continue
            if args.limit and scanned >= args.limit:
                break
            scanned += 1
            fields = enriches(event)
            website = (event.get("website") or "").strip()
            # enrich website only if the record has none
            fm, _ = split_frontmatter((NEWS_EN / f"{row['stem']}.md").read_text(encoding="utf-8"))
            if website and not fm_get(fm, "eventWebsite"):
                fields["eventWebsite"] = (website, False)
            print(f"ENRICH {row['stem']}: {', '.join(fields.keys())}")
            if args.dry_run:
                enriched += 1
                continue
            if fields:
                enriched += set_fields(row["stem"], fields)
            # image backfill
            if not row.get("image") or not (IMAGE_DIR / str(row["image"]).split("/")[-1]).exists():
                url = scrape_image(event.get("link") or "")
                if url:
                    local = download_image(url, IMAGE_DIR, row["stem"])
                    if local:
                        images += update_pair(row["stem"], local, "TMD", event.get("link") or url)
        print(f"{'Would enrich' if args.dry_run else 'Enriched'} {enriched} records, {images} image files")

    if do_publish:
        written = 0
        added: set[str] = set()
        for event in events:
            rec = {"title": title_of(event), "city": event.get("city") or "", "start_at": date_of(event.get("start_date") or "") + "T00:00:00"}
            sig = "|".join(sorted(title_tokens(title_of(event)))) + "|" + date_of(event.get("start_date") or "")[:7]
            if sig in added or match(rec, existing, strict=False):
                continue
            if args.limit and written >= args.limit:
                break
            slug = "tmd-" + (slugify(title_of(event))[:80] or "event")
            en_path = NEWS_EN / f"{slug}.md"
            tr_path = NEWS_TR / f"{slug}.md"
            if en_path.exists() or tr_path.exists():
                continue
            added.add(sig)
            print(f"NEW {slug}: {title_of(event)}")
            if args.dry_run:
                written += 1
                continue
            image = ""
            url = scrape_image(event.get("link") or "")
            if url:
                image = download_image(url, IMAGE_DIR, slug) or ""
            en_path.write_text(render(event, "en", today, image), encoding="utf-8")
            tr_path.write_text(render(event, "tr", today, image), encoding="utf-8")
            written += 1
        print(f"{'Would add' if args.dry_run else 'Added'} {written} events")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
