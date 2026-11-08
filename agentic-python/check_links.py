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

ROOT = Path(__file__).resolve().parents[1]
NEWS_DIR = ROOT / "src" / "content" / "news" / "en"
OUT_DIR = Path(__file__).resolve().parent / "out"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36 TangoExplorerBot/1.0"
)

DEAD = {404, 410, 451}
BLOCKED = {401, 403, 405, 429}

FIELDS = ("eventWebsite", "sourceUrl", "eventInstagram", "eventFacebook")


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


def request(url: str, method: str, timeout: float) -> dict:
    req = urllib.request.Request(
        url,
        method=method,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
    )
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=context) as response:
            return {"url": url, "status": response.status, "state": "ok"}
    except urllib.error.HTTPError as error:
        if error.code in BLOCKED:
            return {"url": url, "status": error.code, "state": "blocked"}
        if error.code in DEAD:
            return {"url": url, "status": error.code, "state": "dead"}
        return {"url": url, "status": error.code, "state": "error"}
    except urllib.error.URLError as error:
        return {"url": url, "status": 0, "state": "unreachable", "reason": str(error.reason)}
    except Exception as error:  # noqa: BLE001 - network stack raises many types
        return {"url": url, "status": 0, "state": "error", "reason": str(error)}


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
