"""ASCII slugs that keep Latin letters after stripping diacritics."""

from __future__ import annotations

import re
import unicodedata


def slugify(value: str, fallback: str = "haber") -> str:
    table = str.maketrans(
        {
            "ç": "c",
            "ğ": "g",
            "ı": "i",
            "ö": "o",
            "ş": "s",
            "ü": "u",
            "Ç": "C",
            "Ğ": "G",
            "İ": "I",
            "Ö": "O",
            "Ş": "S",
            "Ü": "U",
            "ł": "l",
            "Ł": "L",
            "ø": "o",
            "Ø": "O",
            "đ": "d",
            "Đ": "D",
            "æ": "ae",
            "Æ": "AE",
            "ß": "ss",
        }
    )
    text = value.translate(table)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback
