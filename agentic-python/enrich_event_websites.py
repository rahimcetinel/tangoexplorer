"""Fill `eventWebsite` for entries whose source link hides the real site.

Tangocat's ``/go/<event>/<id>`` links are redirects to the organiser's page
(their own site or a Facebook page). The event card shows that address next to
the source, so we resolve the redirect once and store it in the frontmatter as
``eventWebsite``.

Skips: entries that already have ``eventWebsite``, redirects to Tangocat itself,
and events Tangocat has withdrawn (302 → ``/en/festivals``).

Usage:
    python agentic-python/enrich_event_websites.py            # dry run
    python agentic-python/enrich_event_websites.py --apply
"""

from __future__ import annotations

import argparse
import concurrent.futures as futures
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
NEWS_DIR = ROOT / "src" / "content" / "news" / "en"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

GO = re.compile(r"^https://tangocat\.net/go/")
SOURCE_LINE = re.compile(r"^sourceUrl:\s*(\S+)\s*$", re.M)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def resolve(url: str, timeout: float = 20) -> str:
    opener = urllib.request.build_opener(_NoRedirect)
    request = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
    try:
        with opener.open(request, timeout=timeout) as response:
            return response.geturl()
    except urllib.error.HTTPError as error:
        if 300 <= error.code < 400:
            return error.headers.get("Location") or ""
        return ""
    except Exception:  # noqa: BLE001
        return ""


def target_url(location: str) -> str:
    """Accept only absolute web URLs that do not point back at Tangocat."""
    if not location or "en/festivals" in location:
        return ""
    parts = urlsplit(location)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return ""
    if parts.netloc.endswith("tangocat.net"):
        return ""
    return location.split("#")[0].strip()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write eventWebsite into the frontmatter")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    pending: list[tuple[Path, str]] = []
    for path in sorted(NEWS_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        head = text.split("---", 2)[1] if text.startswith("---") else ""
        if re.search(r"^eventWebsite:", head, re.M):
            continue
        match = SOURCE_LINE.search(head)
        if not match or not GO.match(match.group(1)):
            continue
        pending.append((path, match.group(1)))

    if args.limit:
        pending = pending[: args.limit]
    print(f"entries without eventWebsite behind a Tangocat redirect: {len(pending)}")
    if not pending:
        return 0

    def work(item: tuple[Path, str]) -> tuple[Path, str, str]:
        path, url = item
        return path, url, target_url(resolve(url))

    resolved = 0
    failures = 0
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for path, url, website in pool.map(work, pending):
            if not website:
                failures += 1
                continue
            resolved += 1
            if args.apply:
                text = path.read_text(encoding="utf-8")
                text = re.sub(
                    r"^(sourceUrl:\s*\S+)$",
                    lambda m: f"{m.group(1)}\neventWebsite: {website}",
                    text,
                    count=1,
                    flags=re.M,
                )
                path.write_text(text, encoding="utf-8")
            print(f"  {website[:80]:<82} {path.name}")

    print(f"resolved: {resolved} | skipped: {failures}")
    if not args.apply:
        print("dry run: nothing written — use --apply")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
