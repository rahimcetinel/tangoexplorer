"""Fetch recent Instagram media via Business Discovery.

Does not print tokens. Writes a local JSON report; does not publish news.
"""

from __future__ import annotations

import argparse
import calendar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

from classify import MONTHS

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "out"
NEWS_DIR = ROOT / "src" / "content" / "news"
DEFAULT_FILE = ROOT / "sources" / "instagram" / "following-tango-hint.txt"
GRAPH_VERSION = "v21.0"
HORIZON_MONTHS = 6
DEFAULT_MEDIA_LIMIT = 10

EVENT_HINT = re.compile(
    r"marathon|maraton|festival|milonga|encuentro|workshop|at[oö]lye|"
    r"\bcamp\b|practica|pratik|save the date|early bird|countdown|"
    r"tickets?|kay[iı]t|iptal|cancelled|postponed|tonight|this week|"
    r"see you|dans|tango",
    re.I,
)
IG_USER = re.compile(r"instagram\.com/([A-Za-z0-9._]+)/?", re.I)
PERMALINK = re.compile(r"https?://(?:www\.)?instagram\.com/\S+", re.I)
MONTH_RE = "|".join(sorted((re.escape(name) for name in MONTHS), key=len, reverse=True))


def load_dotenv(path: Path) -> None:
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


def graph_secrets() -> tuple[str, str]:
    token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    ig_user_id = os.environ.get("META_IG_USER_ID", "").strip()
    if not token or not ig_user_id:
        raise SystemExit("META_ACCESS_TOKEN ve META_IG_USER_ID .env içinde olmalı.")
    return token, ig_user_id


def existing_coverage() -> dict:
    permalinks: set[str] = set()
    ig_usernames: set[str] = set()
    event_names: list[str] = []
    if not NEWS_DIR.exists():
        return {"permalinks": permalinks, "ig_usernames": ig_usernames, "event_names": event_names}
    for path in NEWS_DIR.rglob("*.md"):
        text = path.read_text(encoding="utf-8")
        for match in PERMALINK.finditer(text):
            permalinks.add(match.group(0).rstrip(").,>\"'"))
        for match in IG_USER.finditer(text):
            name = match.group(1).lower()
            if name not in {"p", "reel", "reels", "stories", "tv"}:
                ig_usernames.add(name)
        for match in re.finditer(r"^eventName:\s*\"?(.+?)\"?\s*$", text, re.M):
            event_names.append(match.group(1).strip().strip('"'))
        for match in re.finditer(r"^title:\s*\"?(.+?)\"?\s*$", text, re.M):
            event_names.append(match.group(1).strip().strip('"'))
    return {"permalinks": permalinks, "ig_usernames": ig_usernames, "event_names": event_names}


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _add_range(ranges: list[tuple[date, date]], start: date | None, end: date | None) -> None:
    if not start:
        return
    ranges.append((start, end or start))


def extract_event_dates(caption: str) -> list[tuple[date, date]]:
    """Calendar dates only. A year by itself is not an event date."""
    ranges: list[tuple[date, date]] = []
    text = caption.replace("–", "-").replace("—", "-").replace("−", "-")

    for match in re.finditer(
        rf"((?:\d{{1,2}}\s*-\s*)+\d{{1,2}})\s+({MONTH_RE})\s+(20\d{{2}})",
        text,
        re.I,
    ):
        days = [int(part) for part in re.findall(r"\d{1,2}", match.group(1))]
        month = MONTHS[match.group(2).lower()]
        year = int(match.group(3))
        _add_range(ranges, _safe_date(year, month, min(days)), _safe_date(year, month, max(days)))

    for match in re.finditer(
        rf"({MONTH_RE})\s+(\d{{1,2}})\s*-\s*(\d{{1,2}}),?\s+(20\d{{2}})",
        text,
        re.I,
    ):
        month = MONTHS[match.group(1).lower()]
        year = int(match.group(4))
        _add_range(
            ranges,
            _safe_date(year, month, int(match.group(2))),
            _safe_date(year, month, int(match.group(3))),
        )

    for match in re.finditer(rf"(\d{{1,2}})\s+({MONTH_RE})\s+(20\d{{2}})", text, re.I):
        month = MONTHS[match.group(2).lower()]
        year = int(match.group(3))
        day = _safe_date(year, month, int(match.group(1)))
        _add_range(ranges, day, day)

    for match in re.finditer(rf"({MONTH_RE})\s+(\d{{1,2}}),?\s+(20\d{{2}})", text, re.I):
        month = MONTHS[match.group(1).lower()]
        year = int(match.group(3))
        day = _safe_date(year, month, int(match.group(2)))
        _add_range(ranges, day, day)

    for match in re.finditer(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})\b", text):
        day = _safe_date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        _add_range(ranges, day, day)

    for match in re.finditer(r"\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b", text):
        day = _safe_date(int(match.group(3)), int(match.group(2)), int(match.group(1)))
        _add_range(ranges, day, day)

    if ranges:
        return ranges

    for match in re.finditer(rf"({MONTH_RE})\s+(20\d{{2}})", text, re.I):
        month = MONTHS[match.group(1).lower()]
        year = int(match.group(2))
        last = calendar.monthrange(year, month)[1]
        _add_range(ranges, _safe_date(year, month, 1), _safe_date(year, month, last))
    return ranges


def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last))


def classify_dates(caption: str, today: date) -> tuple[list[date], list[date], list[date]]:
    ends = sorted({end for _, end in extract_event_dates(caption)})
    horizon_end = add_months(today, HORIZON_MONTHS)
    past = [day for day in ends if day < today]
    horizon = [day for day in ends if today <= day <= horizon_end]
    too_far = [day for day in ends if day > horizon_end]
    return past, horizon, too_far


def tangocat_overlap(username: str, caption: str, coverage: dict) -> bool:
    if username.lower() in coverage["ig_usernames"]:
        return True
    lowered = caption.lower()
    for name in coverage["event_names"]:
        needle = name.lower().strip()
        if len(needle) >= 12 and needle in lowered:
            return True
    return False


def graph_get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "TangoNews/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            raise RuntimeError(f"HTTP {exc.code}") from exc
        err = payload.get("error") or {}
        message = err.get("message") or body[:200]
        code = err.get("code")
        raise RuntimeError(f"Graph {code}: {message}") from exc


def discover(ig_user_id: str, token: str, username: str, media_limit: int) -> dict:
    fields = (
        f"business_discovery.username({username})"
        f"{{username,id,media.limit({media_limit}){{caption,permalink,timestamp,media_type,id}}}}"
    )
    query = urllib.parse.urlencode({"fields": fields, "access_token": token})
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{ig_user_id}?{query}"
    return graph_get(url)


def is_rate_limit(error: str) -> bool:
    low = error.lower()
    return any(
        marker in low
        for marker in (
            "rate limit",
            "too many",
            "user request limit",
            "graph 4:",
            "graph 17:",
            "graph 32:",
            "graph 613:",
        )
    )


def is_token_error(error: str) -> bool:
    low = error.lower()
    return "graph 190" in low or "session has expired" in low or "invalid oauth" in low


def discover_with_retry(ig_user_id: str, token: str, username: str, media_limit: int) -> dict:
    delay = 20
    last_error = ""
    for attempt in range(6):
        try:
            return discover(ig_user_id, token, username, media_limit)
        except RuntimeError as exc:
            last_error = str(exc)
            if is_token_error(last_error):
                raise SystemExit(
                    "Meta token suresi dolmus. Graph Explorer’dan yeni token alip .env icine yaz."
                ) from exc
            if "graph 4:" in last_error.lower() or "application request limit" in last_error.lower():
                raise SystemExit(
                    "Graph uygulama limiti doldu. Bir saat sonra --fresh olmadan devam et."
                ) from exc
            if not is_rate_limit(last_error) or attempt == 5:
                raise
            print(f"RATE LIMIT {username}, {delay}s bekleniyor", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 300)
    raise RuntimeError(last_error)


def write_report(path: Path, accounts: list[dict], posts: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "accountCount": len(accounts),
        "okCount": sum(1 for row in accounts if row["ok"]),
        "errorCount": sum(1 for row in accounts if not row["ok"]),
        "candidateCount": sum(1 for item in posts if item["verdict"] == "candidate"),
        "accounts": accounts,
        "posts": posts,
    }
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"Wrote {path} ({report['okCount']} ok, {report['errorCount']} hata, {report['candidateCount']} aday)",
        flush=True,
    )


def score_caption(caption: str, today: date) -> tuple[str, list[str], list[str], list[str]]:
    past, horizon, too_far = classify_dates(caption, today)
    event_dates = [day.isoformat() for day in past + horizon + too_far]
    future_dates = [day.isoformat() for day in horizon]
    too_far_dates = [day.isoformat() for day in too_far]
    if not EVENT_HINT.search(caption or ""):
        return "noise", event_dates, future_dates, too_far_dates
    if horizon:
        return "candidate", event_dates, future_dates, too_far_dates
    if too_far:
        return "too_far", event_dates, future_dates, too_far_dates
    if past:
        return "past", event_dates, future_dates, too_far_dates
    return "undated", event_dates, future_dates, too_far_dates


def evaluate_media(username: str, media: list[dict], coverage: dict, today: date) -> list[dict]:
    rows: list[dict] = []
    for item in media:
        caption = (item.get("caption") or "").strip()
        permalink = item.get("permalink") or ""
        score, event_dates, future_dates, too_far_dates = score_caption(caption, today)
        if permalink in coverage["permalinks"]:
            verdict = "already_published"
        elif tangocat_overlap(username, caption, coverage):
            verdict = "tangocat_overlap"
        else:
            verdict = score
        rows.append(
            {
                "id": item.get("id"),
                "username": username,
                "permalink": permalink,
                "timestamp": item.get("timestamp"),
                "mediaType": item.get("media_type"),
                "captionPreview": caption[:800],
                "eventDates": event_dates,
                "futureDates": future_dates,
                "tooFarDates": too_far_dates,
                "verdict": verdict,
            }
        )
    return rows


def self_test() -> None:
    today = date(2026, 9, 10)
    cases = [
        ("23–24–25 Ocak 2026 DJ Fest tango", "past"),
        ("10–14 September 2026 Chillout Tango Marathon Antalya", "candidate"),
        ("Finalists of the World Tango Cup 2026 #tango", "undated"),
        ("Milonga tonight at the hall", "undated"),
        ("Workshop 12.10.2026 tango", "candidate"),
        ("Festival 1 May 2026 tango", "past"),
        ("Encuentro November 2026 tango", "candidate"),
        ("Marathon 10 March 2027 tango", "candidate"),
        ("Marathon 10 April 2027 tango", "too_far"),
    ]
    for caption, expected in cases:
        got, _, _, _ = score_caption(caption, today)
        if got != expected:
            raise SystemExit(f"self-test failed: {caption!r} -> {got} (expected {expected})")
    print("self-test ok")


def read_usernames(args: argparse.Namespace) -> list[str]:
    names: list[str] = []
    if args.usernames:
        names.extend(part.strip().lstrip("@") for part in args.usernames.split(","))
    if args.file:
        path = Path(args.file)
        names.extend(line.strip().lstrip("@") for line in path.read_text(encoding="utf-8").splitlines())
    unique: list[str] = []
    seen: set[str] = set()
    for name in names:
        key = name.lower()
        if not name or name.startswith("#") or key in seen:
            continue
        seen.add(key)
        unique.append(name)
    if args.limit:
        unique = unique[: args.limit]
    return unique


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Instagram Business Discovery ingest")
    parser.add_argument("--usernames", help="Comma-separated Instagram usernames")
    parser.add_argument("--file", help="Text file, one username per line")
    parser.add_argument("--fresh", action="store_true", help="Ignore previous instagram.json and start over")
    parser.add_argument("--limit", type=int, default=0, help="Max accounts from the combined list")
    parser.add_argument(
        "--media-limit",
        type=int,
        default=DEFAULT_MEDIA_LIMIT,
        help="Recent posts per account (default 10)",
    )
    parser.add_argument("--sleep", type=float, default=0.25, help="Pause between Graph calls")
    parser.add_argument("--self-test", action="store_true", help="Run caption date filter checks")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    load_dotenv(ROOT / ".env")
    token, ig_user_id = graph_secrets()
    today = date.today()

    usernames = read_usernames(args)
    if not usernames:
        args.file = str(DEFAULT_FILE)
        usernames = read_usernames(args)
    if not usernames:
        raise SystemExit("Kullanıcı adı yok. --usernames veya --file ver.")

    coverage = existing_coverage()
    out_path = OUT_DIR / "instagram.json"
    accounts: list[dict] = []
    posts: list[dict] = []
    done: set[str] = set()
    if not args.fresh and out_path.exists():
        prev = json.loads(out_path.read_text(encoding="utf-8"))
        for row in prev.get("accounts", []):
            name = (row.get("username") or "").lower()
            if row.get("ok") and name:
                accounts.append(row)
                done.add(name)
        posts = [
            item
            for item in prev.get("posts", [])
            if (item.get("username") or "").lower() in done
        ]
        print(f"resume: {len(done)} hesap zaten var", flush=True)

    pending = [name for name in usernames if name.lower() not in done]
    total = len(usernames)

    for i, username in enumerate(pending):
        row: dict = {"username": username, "ok": False}
        try:
            payload = discover_with_retry(ig_user_id, token, username, args.media_limit)
            discovery = payload.get("business_discovery") or {}
            media = (discovery.get("media") or {}).get("data") or []
            evaluated = evaluate_media(username, media, coverage, today)
            row.update(
                {
                    "ok": True,
                    "igId": discovery.get("id"),
                    "mediaCount": len(evaluated),
                    "candidates": sum(1 for item in evaluated if item["verdict"] == "candidate"),
                    "overlaps": sum(1 for item in evaluated if item["verdict"] == "tangocat_overlap"),
                    "past": sum(1 for item in evaluated if item["verdict"] == "past"),
                    "undated": sum(1 for item in evaluated if item["verdict"] == "undated"),
                    "tooFar": sum(1 for item in evaluated if item["verdict"] == "too_far"),
                }
            )
            posts.extend(evaluated)
        except SystemExit:
            write_report(out_path, accounts, posts)
            raise
        except Exception as exc:  # noqa: BLE001 — keep scanning other accounts
            row["error"] = str(exc)
        accounts.append(row)
        index = len(done) + i + 1
        print(
            f"[{index}/{total}] {username}: "
            + (
                f"{row['mediaCount']} post, {row['candidates']} aday, {row['overlaps']} Tangocat, {row['past']} gecmis, {row['tooFar']} uzak, {row['undated']} tarihsiz"
                if row["ok"]
                else f"HATA {row.get('error')}"
            ),
            flush=True,
        )
        if (i + 1) % 10 == 0:
            write_report(out_path, accounts, posts)
        if i + 1 < len(pending) and args.sleep:
            time.sleep(args.sleep)

    write_report(out_path, accounts, posts)
    ok_count = sum(1 for row in accounts if row["ok"])
    print("SCAN COMPLETE", flush=True)
    return 0 if ok_count else 1


if __name__ == "__main__":
    raise SystemExit(main())
