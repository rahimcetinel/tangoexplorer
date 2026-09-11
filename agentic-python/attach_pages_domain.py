"""Attach a custom domain to a Cloudflare Pages project using Wrangler OAuth."""

from __future__ import annotations

import json
import ssl
import sys
import tomllib
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ACCOUNT_ID = "6ed2b717620e05b19a10b55fcf76ea17"
PROJECT = "tango-news"
PAGES_HOST = "tango-news.pages.dev"
API = "https://api.cloudflare.com/client/v4"
WRANGLER_TOML = Path.home() / "AppData/Roaming/xdg.config/.wrangler/config/default.toml"


def oauth_token() -> str:
    data = tomllib.loads(WRANGLER_TOML.read_text(encoding="utf-8"))
    token = data.get("oauth_token") or data.get("oauth_token_id")
    if isinstance(token, dict):
        token = token.get("access_token") or token.get("token")
    if not token:
        raise SystemExit("Wrangler OAuth token not found; run npx wrangler login")
    return str(token)


def api(method: str, path: str, token: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{API}{path}",
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        try:
            parsed = json.loads(detail)
        except json.JSONDecodeError:
            parsed = {"raw": detail}
        return {"success": False, "status": exc.code, **parsed}


def summarize_errors(payload: dict) -> str:
    errors = payload.get("errors") or []
    if errors:
        return "; ".join(str(err.get("message") or err) for err in errors)
    return json.dumps({k: v for k, v in payload.items() if k != "result"}, ensure_ascii=False)[:500]


def add_pages_domain(token: str, name: str) -> dict:
    return api(
        "POST",
        f"/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT}/domains",
        token,
        {"name": name},
    )


def list_pages_domains(token: str) -> dict:
    return api("GET", f"/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT}/domains", token)


def zone_id_for(token: str, domain: str) -> str | None:
    query = urllib.parse.urlencode({"name": domain})
    payload = api("GET", f"/zones?{query}", token)
    zones = payload.get("result") or []
    if not zones:
        print(f"Zone not found for {domain}: {summarize_errors(payload)}")
        return None
    return zones[0]["id"]


def existing_record_names(token: str, zone: str) -> set[str]:
    payload = api("GET", f"/zones/{zone}/dns_records?per_page=100", token)
    records = payload.get("result") or []
    return {f"{row.get('type')}:{row.get('name')}" for row in records}


def add_cname(token: str, zone: str, name: str) -> dict:
    return api(
        "POST",
        f"/zones/{zone}/dns_records",
        token,
        {
            "type": "CNAME",
            "name": name,
            "content": PAGES_HOST,
            "proxied": True,
            "ttl": 1,
        },
    )


def main() -> int:
    names = sys.argv[1:] or ["tangoexplorer.com", "www.tangoexplorer.com"]
    token = oauth_token()

    print(f"Pages project: {PROJECT}")
    for name in names:
        result = add_pages_domain(token, name)
        if result.get("success"):
            status = (result.get("result") or {}).get("status")
            print(f"Pages domain {name}: ok ({status})")
        else:
            print(f"Pages domain {name}: {summarize_errors(result)}")

    listed = list_pages_domains(token)
    if listed.get("success"):
        for row in listed.get("result") or []:
            print(f"  listed {row.get('name')} -> {row.get('status')}")
    else:
        print(f"List domains: {summarize_errors(listed)}")

    apex = names[0].removeprefix("www.")
    zone = zone_id_for(token, apex)
    if not zone:
        return 1
    print(f"Zone {apex}: {zone}")

    dns_list = api("GET", f"/zones/{zone}/dns_records?per_page=100", token)
    if not dns_list.get("success"):
        print(f"List DNS: {summarize_errors(dns_list)}")
    have = {
        f"{row.get('type')}:{row.get('name')}"
        for row in (dns_list.get("result") or [])
    }
    print(f"Existing DNS keys: {sorted(have) or '(none)'}")
    for host in names:
        key = f"CNAME:{host}"
        if key in have or f"CNAME:{host}." in have:
            print(f"DNS {host}: already present")
            continue
        dns = add_cname(token, zone, host)
        if dns.get("success"):
            print(f"DNS {host}: CNAME -> {PAGES_HOST}")
        else:
            print(f"DNS {host}: {summarize_errors(dns)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
