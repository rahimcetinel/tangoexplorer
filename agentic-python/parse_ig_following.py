"""Parse Instagram following.json into a username list."""

from __future__ import annotations

import json
import re
from pathlib import Path

HINT = re.compile(
    r"tango|milonga|encuentro|marathon|maraton|practica|pratik|vals|milonguero|tangue",
    re.I,
)


def usernames_from(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("relationships_following") or data
    names: list[str] = []
    if isinstance(rows, dict):
        rows = rows.get("relationships_following", [])
    for row in rows:
        title = (row.get("title") or "").strip()
        href = ""
        items = row.get("string_list_data") or []
        if items:
            href = items[0].get("href") or ""
        name = title
        if not name and "/_u/" in href:
            name = href.rstrip("/").split("/_u/")[-1]
        elif not name and "instagram.com/" in href:
            name = href.rstrip("/").split("instagram.com/")[-1].split("/")[0]
        name = name.lstrip("@").strip()
        if name:
            names.append(name)
    seen: set[str] = set()
    unique: list[str] = []
    for name in names:
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(name)
    return unique


def main() -> None:
    src = Path(r"C:\Downloads\instagram-rhmctnl\following.json")
    out_dir = Path(__file__).resolve().parents[1] / "sources" / "instagram"
    out_dir.mkdir(parents=True, exist_ok=True)
    names = usernames_from(src)
    tango = [n for n in names if HINT.search(n)]
    other = [n for n in names if n not in tango]
    (out_dir / "following.txt").write_text("\n".join(names) + "\n", encoding="utf-8")
    (out_dir / "following-tango-hint.txt").write_text("\n".join(tango) + "\n", encoding="utf-8")
    print(f"total {len(names)}")
    print(f"name-hint tango {len(tango)}")
    print(f"other {len(other)}")
    print("sample tango:", ", ".join(tango[:12]))
    print("sample other:", ", ".join(other[:12]))


if __name__ == "__main__":
    main()
