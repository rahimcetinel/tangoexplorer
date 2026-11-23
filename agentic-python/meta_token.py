"""Meta / Instagram token sağlığı ve yenileme.

Neden ayrı bir araç: `ingest_instagram.py` token ölünce SystemExit atıyor ama
workflow `|| true` ile yutuyor, `source_health.py` ise yalnızca raporun yaşına
bakıyor. Token 2026-11-11'de sessizce doldu ve on iki koşu boyunca Instagram
verisi yazılmadı; bu betik o boşluğu kapatır: token'ı doğrudan Graph'a sorar,
Meta'nın kendi mesajını (bitiş tarihiyle) gösterir ve uzun ömürlü token'ı
yenilemek için tek komut verir.

Kullanım:
    python agentic-python/meta_token.py --check              # doğrula
    python agentic-python/meta_token.py --check --summary    # CI özeti
    python agentic-python/meta_token.py --refresh --write-env
    python agentic-python/meta_token.py --refresh --out .secrets/meta-access-token.txt

Çıkış kodları (CI'ın dallanabilmesi için):
    0  token geçerli
    2  token süresi dolmuş / geçersiz  (yenilenmeli)
    3  token geçerli ama bitecek (7 günden az) — yalnızca uyarı
    1  beklenmeyen hata (ağ, eksik env)

Token asla stdout'a yazılmaz; yalnızca dosyaya (`--out`) veya `.env`'e
(`--write-env`) yazılır.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GRAPH_VERSION = "v21.0"
GRAPH = f"https://graph.facebook.com/{GRAPH_VERSION}"
WARN_DAYS = 7
UA = "TangoExplorer-token-check/1.0"

EXPIRED_ON = re.compile(r"Session has expired on ([^.]+)\.", re.I)
TOKEN_DATE = re.compile(r"(\d{1,2})-([A-Za-z]{3})-(\d{2})")


def load_dotenv(path: Path) -> None:
    """`.env` okur; var olan ortam değişkenlerini ezmez."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def read_secret() -> tuple[str, str]:
    token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    ig_user_id = os.environ.get("META_IG_USER_ID", "").strip()
    if not token or not ig_user_id:
        raise SystemExit(
            "META_ACCESS_TOKEN ve META_IG_USER_ID tanımlı değil "
            "(.env ya da GitHub secret)."
        )
    return token, ig_user_id


def graph_get(path: str, params: dict[str, str]) -> dict:
    url = f"{GRAPH}/{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            raise RuntimeError(f"HTTP {error.code}: {body[:200]}") from error
        message = (payload.get("error") or {}).get("message") or body[:200]
        raise RuntimeError(f"HTTP {error.code}: {message}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"ağ hatası: {error.reason}") from error


def expiry_hint(message: str) -> str:
    """Meta mesajındaki 'Session has expired on Wednesday, 11-Nov-26 …' kısmını döndürür."""
    match = EXPIRED_ON.search(message)
    if not match:
        return ""
    return f" (Meta: {match.group(1).strip()})"


def day_hint(message: str) -> str:
    """Bitiş tarihini ISO biçimine çevirir; ayrıştıramazsa boş döner."""
    match = TOKEN_DATE.search(message)
    if not match:
        return ""
    day, month, year = match.groups()
    try:
        parsed = datetime.strptime(f"{day}-{month}-{year}", "%d-%b-%y").date()
    except ValueError:
        return ""
    return parsed.isoformat()


def check(ig_user_id: str, token: str, summary: bool) -> int:
    try:
        payload = graph_get(ig_user_id, {"fields": "id,username", "access_token": token})
    except RuntimeError as error:
        message = str(error)
        low = message.lower()
        if "400" in message and ("expired" in low or "session has expired" in low):
            detail = expiry_hint(message)
            when = day_hint(message)
            print(f"FAIL: token süresi dolmuş{detail}")
            if when:
                print(f"Bitiş tarihi: {when} (Meta saat dilimi PST)")
            print(
                "Yenilemek için: python agentic-python/meta_token.py --refresh --write-env\n"
                "Ardından GitHub secret'ını güncelle: "
                "gh secret set META_ACCESS_TOKEN --repo rahimcetinel/tangoexplorer"
            )
            if summary:
                print(f"| Meta token | FAIL | süresi dolmuş{detail} |")
            return 2
        if "190" in message or "invalid oauth" in low or "unsupported get request" in low:
            print(f"FAIL: token geçersiz — {message}")
            if summary:
                print(f"| Meta token | FAIL | geçersiz |")
            return 2
        print(f"FAIL: {message}")
        if summary:
            print(f"| Meta token | FAIL | {message} |")
        return 1

    username = payload.get("username") or "?"
    print(f"OK: token geçerli — @{username} (id {payload.get('id', '?')})")
    if summary:
        print(f"| Meta token | OK | @{username} |")
    return 0


def refresh(token: str, out: Path | None, write_env: bool) -> int:
    """Uzun ömürlü token'ı 60 gün daha uzatır (Instagram ig_refresh_token akışı)."""
    try:
        payload = graph_get(
            "refresh_access_token",
            {"grant_type": "ig_refresh_token", "access_token": token},
        )
    except RuntimeError as error:
        message = str(error)
        print(f"FAIL: yenileme reddedildi — {message}")
        if "expired" in message.lower():
            print(
                "Süresi dolmuş token yenilenemez; Meta app panelinden yeni uzun ömürlü\n"
                "token üretip META_ACCESS_TOKEN secret'ını değiştirmek gerekiyor."
            )
        return 2

    fresh = (payload.get("access_token") or "").strip()
    seconds = int(payload.get("expires_in") or 0)
    if not fresh:
        print("FAIL: yanıtta access_token yok")
        return 1

    days = seconds // 86400 if seconds else 0
    print(f"OK: token yenilendi — {days} gün geçerli ({date.today().isoformat()} → +{days} gün)")

    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(fresh + "\n", encoding="utf-8")
        print(f"Yazıldı: {out} (git'e eklemeyin; .secrets/ ignored)")

    if write_env:
        env_path = ROOT / ".env"
        if not env_path.is_file():
            print(f"UYARI: {env_path} yok, --write-env atlandı")
        else:
            lines = env_path.read_text(encoding="utf-8").splitlines()
            replaced = False
            for index, line in enumerate(lines):
                if line.strip().startswith("META_ACCESS_TOKEN="):
                    lines[index] = f"META_ACCESS_TOKEN={fresh}"
                    replaced = True
                    break
            if not replaced:
                lines.append(f"META_ACCESS_TOKEN={fresh}")
            env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            print(f"Güncellendi: {env_path}")

    print(
        "Son adım — GitHub secret'ını yenile:\n"
        "  gh secret set META_ACCESS_TOKEN --repo rahimcetinel/tangoexplorer "
        "--body \"$(cat .secrets/meta-access-token.txt)\""
    )
    return 0


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Meta/Instagram token sağlığı")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="token'ı doğrula (varsayılan)")
    mode.add_argument("--refresh", action="store_true", help="uzun ömürlü token'ı yenile")
    parser.add_argument("--summary", action="store_true", help="CI özeti için Markdown satırı yaz")
    parser.add_argument("--out", type=Path, help="yenilenen token'ı bu dosyaya yaz")
    parser.add_argument("--write-env", action="store_true", help="yenilenen token'ı .env'e yaz")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    token, ig_user_id = read_secret()

    if args.refresh:
        out = args.out
        if out is None and not args.write_env:
            out = ROOT / ".secrets" / "meta-access-token.txt"
        return refresh(token, out, args.write_env)
    return check(ig_user_id, token, args.summary)


if __name__ == "__main__":
    raise SystemExit(main())
