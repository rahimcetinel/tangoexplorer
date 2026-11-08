"""Map the upstream calendars Bailaspot aggregates from.

Research helper (no site build, no ingestion). Reads Bailaspot country/city
pages, pulls the `sourceUrl` values it stores per event and reports the
distinct upstream domains. Writes out/bailaspot-sources.json.

Usage:
    python agentic-python/explore_bailaspot_sources.py --cities 120
"""

from __future__ import annotations

import argparse
import concurrent.futures as futures
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)
BASE = "https://bailaspot.com"

COUNTRIES = """spain france netherlands turkey romania germany italy argentina greece
poland united-kingdom switzerland belgium austria sweden denmark portugal czechia
hungary bulgaria serbia ukraine russia brazil japan south-korea israel finland
norway ireland cyprus slovakia slovenia croatia latvia lithuania estonia mexico
canada australia united-states""".split()


def fetch(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def source_domains(html: str) -> list[str]:
    """Pull sourceUrl values out of the streamed loader payload."""
    urls = re.findall(r'\\"(https?://[^"\\]+)\\"', html)
    out = []
    for url in urls:
        host = re.sub(r"^https?://", "", url).split("/")[0].lower()
        if host.endswith("bailaspot.com") or "digitaloceanspaces" in host:
            continue
        out.append(host)
    return out


def city_links(html: str, country: str) -> list[str]:
    found = set()
    for href in re.findall(r'href="(/([a-z\-]+)/([a-z0-9\-]+))"', html):
        path, c, _city = href
        if c == country:
            found.add(BASE + path)
    return sorted(found)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("--cities", type=int, default=0, help="extra city pages per country to sample")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    per_country: dict[str, Counter] = {}
    cities_by_country: dict[str, list[str]] = {}
    errors: list[str] = []

    for country in COUNTRIES:
        url = f"{BASE}/{country}/tango"
        try:
            html = fetch(url)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{country}: {exc}")
            continue
        per_country[country] = Counter(source_domains(html))
        if args.cities:
            cities_by_country[country] = city_links(html, country)
        print(f"{country}: {sum(per_country[country].values())} source links, {len(per_country[country])} domains")
        time.sleep(0.3)

    # Optional deeper pass over city pages (each shows a week of instances).
    city_hits: dict[str, Counter] = {}
    if args.cities:
        targets: list[str] = []
        for country, links in cities_by_country.items():
            targets.extend(links[: args.cities])
        print(f"\nsampling {len(targets)} city pages ...")

        def work(city_url: str) -> tuple[str, Counter] | None:
            try:
                return city_url, Counter(source_domains(fetch(city_url)))
            except Exception:  # noqa: BLE001
                return None

        with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            for result in pool.map(work, targets):
                if result is None:
                    continue
                city_url, counter = result
                city_hits[city_url] = counter

    total = Counter()
    for counter in per_country.values():
        total.update(counter)
    for counter in city_hits.values():
        total.update(counter)

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "countries": {k: dict(v) for k, v in per_country.items()},
        "cities": {k: dict(v) for k, v in city_hits.items()},
        "domains": dict(total.most_common()),
        "errors": errors,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "bailaspot-sources.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    print("\n=== upstream domains (events seen) ===")
    for host, count in total.most_common(60):
        print(f"{count:>5}  {host}")
    print(f"\n{len(total)} distinct domains -> {OUT_DIR / 'bailaspot-sources.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
