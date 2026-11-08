"""Check the outbound links in the event collection.

Collects eventWebsite, sourceUrl, eventInstagram and eventFacebook, requests
them with a short timeout and reports dead or unreachable links. Writes
out/link-check.json; exits non-zero only with --strict.

Usage: python agentic-python/check_links.py [--limit N] [--timeout S] [--strict]
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit, urljoin

ROOT = Path(__file__).resolve().parents[1]
NEWS_DIR = ROOT / "src" / "content" / "news" / "en"
OUT_DIR = Path(__file__).resolve().parent / "out"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36 TangoExplorerBot/1.0"
)

DEAD = {404, 410, 451}
BLOCKED = {401, 403, 405, 429}

# Tangocat answers 302 -> /en/festivals for events it no longer lists. That is
# not a broken URL, but the listing is gone, so the page must say so instead of
# pretending the source still exists.
GONE_MARKERS = ("/en/festivals",)

FIELDS = ("eventWebsite", "sourceUrl", "eventInstagram", "eventFacebook")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


OPENER = urllib.request.build_opener(_NoRedirect)


def frontmatter(path: Path) -> dict[str, str]:
    raw = path.read_text(encoding="utf-8")
    match = re.match(r"^---\r?\n(.*?)\r?\n---", raw, re.S)
    if not match:
        return {}
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(":")
        if sep:
            fields[key.strip()] = value.strip().strip('"').strip("'")
    return fields


def request(url: str, method: str, timeout: float, hops: int = 0) -> dict:
    req = urllib.request.Request(
        url,
        method=method,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
    )
    context = ssl.create_default_context()
    opener = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPSHandler(context=context))
    try:
        with opener.open(req, timeout=timeout) as response:
            return {"url": url, "status": response.status, "state": "ok"}
    except urllib.error.HTTPError as error:
        if 300 <= error.code < 400:
            return _redirect_result(url, error, method, timeout, hops)
        if error.code in BLOCKED:
            return {"url": url, "status": error.code, "state": "blocked"}
        if error.code in DEAD:
            return {"url": url, "status": error.code, "state": "dead"}
        return {"url": url, "status": error.code, "state": "error"}
    except urllib.error.URLError as error:
        return {"url": url, "status": 0, "state": "unreachable", "reason": str(error.reason)}
    except Exception as error:  # noqa: BLE001 - network stack raises many types
        return {"url": url, "status": 0, "state": "error", "reason": str(error)}


def _redirect_result(url: str, error: urllib.error.HTTPError, method: str, timeout: float, hops: int) -> dict:
    location = error.headers.get("Location") or ""
    parts = urlsplit(location)
    # "Xhttps://…" and friends: the scheme is not a web scheme, so no browser
    # can follow it. Treat it as dead rather than a transient error.
    if parts.scheme and parts.scheme.lower() not in {"http", "https"}:
        return {"url": url, "status": error.code, "state": "dead", "reason": f"bad redirect: {location[:120]}"}
    target = urljoin(url, location)
    if any(marker in urlsplit(target).path for marker in GONE_MARKERS):
        return {"url": url, "status": error.code, "state": "gone", "target": target}
    if hops >= 3:
        return {"url": url, "status": error.code, "state": "error", "reason": "redirect loop"}
    result = request(target, method, timeout, hops + 1)
    # Keep the checked URL as the key; the landing page is reported alongside so
    # main() can still map the result back to the content file.
    result["url"] = url
    result.setdefault("target", target)
    return result


def check(url: str, timeout: float) -> dict:
    # Many servers reject HEAD; retry the interesting failures with GET before
    # calling a link dead or unreachable.
    result = request(url, "HEAD", timeout)
    if result["state"] in {"unreachable", "error"} or result["status"] in BLOCKED:
        fallback = request(url, "GET", timeout)
        if fallback["state"] != "ok" or result["state"] != "ok":
            return fallback
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="check only the first N unique URLs")
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--strict", action="store_true", help="exit 1 when a dead link is found")
    parser.add_argument("--all", action="store_true", help="also check events that already ended")
    parser.add_argument("--write", action="store_true", help="write src/data/link-health.json")
    args = parser.parse_args()

    today = date.today()
    urls: dict[str, list[str]] = {}
    skipped = 0
    for path in sorted(NEWS_DIR.glob("*.md")):
        fields = frontmatter(path)
        end = fields.get("eventEnd") or fields.get("eventStart") or ""
        if not args.all and end and end[:10] < today.isoformat():
            skipped += 1
            continue
        for key in FIELDS:
            value = fields.get(key, "")
            if value.startswith("http"):
                urls.setdefault(value, []).append(path.name)

    targets = list(urls)
    if args.limit:
        targets = targets[: args.limit]

    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(lambda url: check(url, args.timeout), targets))

    for result in results:
        result["sources"] = urls[result["url"]]

    dead = [item for item in results if item["state"] == "dead"]
    unreachable = [item for item in results if item["state"] == "unreachable"]
    blocked = [item for item in results if item["state"] == "blocked"]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "link-check.json").write_text(
        json.dumps({"checked": len(results), "dead": dead, "unreachable": unreachable, "blocked": blocked}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if args.write:
        today = date.today().isoformat()
        payload = {
            "generatedAt": today,
            "links": {item["url"]: {"status": item["state"], "checkedAt": today} for item in results},
        }
        target = ROOT / "src" / "data" / "link-health.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {target.relative_to(ROOT)}")

    print(
        f"checked {len(results)} unique links from upcoming events "
        f"({skipped} ended events skipped): {len(dead)} dead, {len(unreachable)} unreachable, {len(blocked)} blocked"
    )
    for item in dead + unreachable:
        print(f"  {item['state']}: {item['url']}  ({item['sources'][0]})")

    if args.strict and dead:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
