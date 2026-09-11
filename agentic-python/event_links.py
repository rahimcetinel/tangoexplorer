"""Resolve Tangocat /go/ redirects and scrape event site links/images."""

from __future__ import annotations

import re
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

USER_AGENT = "TangoNews/0.1 (+https://tango-news.pages.dev)"
MAX_HTML = 400_000
MAX_IMAGE = 2_000_000
SKIP_FB = ("sharer", "share.php", "dialog/", "plugins/", "tr?")
SKIP_IG = ("share", "/p/", "/reel/", "/stories/")
LOGO_HINT = re.compile(r"logo|brand|og.?image", re.I)
MONTHS_TR = (
    ("January", "Ocak"),
    ("February", "Şubat"),
    ("March", "Mart"),
    ("April", "Nisan"),
    ("May", "Mayıs"),
    ("June", "Haziran"),
    ("July", "Temmuz"),
    ("August", "Ağustos"),
    ("September", "Eylül"),
    ("October", "Ekim"),
    ("November", "Kasım"),
    ("December", "Aralık"),
)


def when_tr(text: str) -> str:
    out = text
    for english, turkish in MONTHS_TR:
        out = re.sub(english, turkish, out, flags=re.I)
    return out


def request(url: str, method: str = "GET", max_bytes: int | None = None) -> tuple[str, bytes, str]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        final = resp.geturl()
        ctype = resp.headers.get("Content-Type", "")
        data = resp.read(max_bytes) if max_bytes else resp.read()
        return final, data, ctype


def follow_website(url: str) -> str | None:
    try:
        final, _, _ = request(url, method="HEAD", max_bytes=0)
        return final
    except Exception:
        try:
            final, _, _ = request(url, max_bytes=2048)
            return final
        except Exception:
            return None


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.images: list[str] = []
        self.og_image: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        d = {k: (v or "") for k, v in attrs}
        if tag == "a" and d.get("href"):
            self.hrefs.append(d["href"])
        if tag == "img" and d.get("src"):
            self.images.append(d["src"])
        if tag == "link" and "icon" in d.get("rel", "").lower() and d.get("href"):
            self.images.append(d["href"])
        if tag == "meta":
            prop = (d.get("property") or d.get("name") or "").lower()
            if prop in {"og:image", "twitter:image", "og:image:url"} and d.get("content"):
                self.og_image = d["content"]


def _abs(base: str, href: str) -> str:
    return urljoin(base, href.strip())


def _clean_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return ""
    return url.split("#")[0].rstrip("/")


def _host_token(website: str) -> str:
    host = urlparse(website).netloc.lower().replace("www.", "")
    return re.sub(r"[^a-z0-9]", "", host.split(".")[0])


def _matches_event(url: str, token: str) -> bool:
    if not token or len(token) < 5:
        return True
    compact = re.sub(r"[^a-z0-9]", "", url.lower())
    return token[:8] in compact


def pick_facebook(urls: list[str], token: str = "") -> str | None:
    fallback: str | None = None
    for url in urls:
        low = url.lower()
        if "facebook.com" not in low and "fb.me" not in low:
            continue
        if any(skip in low for skip in SKIP_FB):
            continue
        cleaned = _clean_url(url.split("?")[0])
        if not cleaned:
            continue
        if _matches_event(cleaned, token):
            return cleaned
        if fallback is None:
            fallback = cleaned
    return fallback if not token else None


def pick_instagram(urls: list[str], token: str = "") -> str | None:
    fallback: str | None = None
    for url in urls:
        low = url.lower()
        if "instagram.com" not in low:
            continue
        if any(skip in low for skip in SKIP_IG):
            continue
        cleaned = _clean_url(url.split("?")[0])
        if not cleaned:
            continue
        if _matches_event(cleaned, token):
            return cleaned
        if fallback is None:
            fallback = cleaned
    return fallback if not token else None


def pick_image(base: str, parser: PageParser) -> str | None:
    parsed = urlparse(base)
    host = parsed.netloc.lower().replace("www.", "")
    origin = f"{parsed.scheme}://{parsed.netloc}"
    candidates: list[str] = []
    if parser.og_image:
        candidates.append(parser.og_image)
    for guess in ("/images/logo.webp", "/images/logo.png", "/images/logo.jpg"):
        candidates.append(origin + guess)
    for src in parser.images:
        if LOGO_HINT.search(src):
            candidates.append(src)
    for src in parser.images:
        low = src.lower()
        if any(low.endswith(ext) or ext + "?" in low for ext in (".png", ".jpg", ".jpeg", ".webp")):
            if "icon" in low or "sprite" in low:
                continue
            candidates.append(src)
    same: list[str] = []
    other: list[str] = []
    for src in candidates:
        abs_url = _abs(base, src)
        if not abs_url.startswith("http") or abs_url.lower().endswith(".svg"):
            continue
        src_host = urlparse(abs_url).netloc.lower().replace("www.", "")
        (same if src_host == host else other).append(abs_url)
    return (same or other or [None])[0]


def scrape_event_site(website: str) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        final, data, _ctype = request(website, max_bytes=MAX_HTML)
    except (urllib.error.URLError, TimeoutError, ValueError):
        return out
    html = data.decode("utf-8", errors="replace")
    parser = PageParser()
    try:
        parser.feed(html)
    except Exception:
        return out
    abs_hrefs = [_abs(final, href) for href in parser.hrefs]
    token = _host_token(final)
    fb = pick_facebook(abs_hrefs, token)
    ig = pick_instagram(abs_hrefs, token)
    image = pick_image(final, parser)
    if fb:
        out["eventFacebook"] = fb
    if ig:
        out["eventInstagram"] = ig
    if image:
        out["imageUrl"] = image
    return out


def image_extension(url: str, ctype: str) -> str:
    low = ctype.lower()
    if "png" in low:
        return ".png"
    if "webp" in low:
        return ".webp"
    if "jpeg" in low or "jpg" in low:
        return ".jpg"
    path = urlparse(url).path.lower()
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        if path.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext
    return ".jpg"


def download_image(url: str, dest_dir: Path, slug: str) -> str | None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    for existing in dest_dir.glob(f"{slug}.*"):
        if existing.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"}:
            return f"/events/{existing.name}"
    try:
        _final, data, ctype = request(url, max_bytes=MAX_IMAGE + 1)
    except Exception:
        return None
    if not data or len(data) > MAX_IMAGE:
        return None
    if data[:1] == b"<":
        return None
    ext = image_extension(url, ctype)
    filename = f"{slug}{ext}"
    path = dest_dir / filename
    path.write_bytes(data)
    return f"/events/{filename}"


def scrape_og_image(url: str) -> tuple[str | None, str | None]:
    """Return (og_image_url, final_page_url)."""
    try:
        final, data, _ctype = request(url, max_bytes=MAX_HTML)
    except Exception:
        return None, None
    html = data.decode("utf-8", errors="replace")
    parser = PageParser()
    try:
        parser.feed(html)
    except Exception:
        return None, final
    if not parser.og_image:
        return None, final
    abs_url = _abs(final, parser.og_image)
    if not abs_url.startswith("http") or abs_url.lower().endswith(".svg"):
        return None, final
    return abs_url, final


def enrich_tangocat_item(item: dict, image_dir: Path, pause: float = 0.15) -> dict:
    source_url = item.get("sourceUrl") or ""
    website = follow_website(source_url) if source_url else None
    time.sleep(pause)
    if website and "tangocat.net" not in urlparse(website).netloc:
        item["eventWebsite"] = website.rstrip("/")
        scraped = scrape_event_site(website)
        time.sleep(pause)
        item.update({k: v for k, v in scraped.items() if k != "imageUrl"})
        if scraped.get("imageUrl"):
            local = download_image(scraped["imageUrl"], image_dir, item.get("id") or "event")
            if local:
                item["image"] = local
    item["eventName"] = item.get("title")
    if item.get("when"):
        item["eventWhen"] = when_tr(str(item["when"]))
    if item.get("location"):
        item["eventLocation"] = item.get("location")
    return item
