"""Fetch further months of a Modern Events Calendar (MEC) monthly view.

milongas.ch and londonmilongas.co.uk render MEC's *monthly* skin: the page
only carries the current month's grid. Late in a month that leaves a few days
of future occurrences, too few for series detection (a weekly milonga needs
repeats), so the listing collapsed every month-end (milongas.ch 18 -> 6).

The "next month" arrow posts the skin's own settings back to admin-ajax.php.
Every skin on the page prints those settings as `atts: "<urlencoded>"`, so we
replay exactly what the browser sends instead of hard-coding skin ids. The
reply is JSON; `events_side` holds the same `<article>` cards (and
`data-mec-cell` day sections) as the page itself.
"""

from __future__ import annotations

import json
import re
import urllib.request
from datetime import date

SKIN_ATTS = re.compile(r'atts:\s*"([^"]*skin%5D=monthly_view[^"]*)"')


def _month_after(year: int, month: int, step: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + step
    return index // 12, index % 12 + 1


def next_months(page: str, page_url: str, user_agent: str, months: int = 1,
                today: date | None = None, timeout: int = 60) -> list[str]:
    """Return the `events_side` HTML of the next `months` months, per skin.

    Raises on network or format errors: the caller decides whether a partial
    window is acceptable (source_health will flag a short listing anyway).
    """
    today = today or date.today()
    base = re.match(r"https?://[^/]+", page_url).group(0)
    skins = SKIN_ATTS.findall(page)
    if not skins:
        raise ValueError("no MEC monthly_view skin settings found on page")
    chunks: list[str] = []
    for atts in skins:
        for step in range(1, months + 1):
            year, month = _month_after(today.year, today.month, step)
            body = (
                f"action=mec_monthly_view_load_month&mec_year={year}&mec_month={month:02d}"
                f"&{atts}&apply_sf_date=0&navigator_click=true"
            ).encode()
            request = urllib.request.Request(
                f"{base}/wp-admin/admin-ajax.php",
                data=body,
                headers={
                    "User-Agent": user_agent,
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": page_url,
                },
            )
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8", "replace"))
            chunks.append(str(payload.get("events_side") or ""))
    return chunks
