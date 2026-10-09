#!/usr/bin/env python3
"""Generate royalty-free abstract fallback images (SVG) for event cards.

These are our own original vector shapes in the site palette, so they carry no
third-party licence. They are used only on the event card when the event has no
real photo (see src/lib/fallback.ts + TimelineCard.astro).
"""

from __future__ import annotations

import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "fallbacks"
COUNT = 100
W, H = 800, 533

INK = "#1e1a17"
CREAM = "#faf6f2"
PURPLE = "#5a2d82"
ROSE = "#a83250"
GOLD = "#9a7230"
TEAL = "#1a8a7a"
ORANGE = "#d15a28"

BG_PAIRS = [
    (PURPLE, ROSE),
    (ROSE, ORANGE),
    (TEAL, PURPLE),
    (GOLD, ROSE),
    (INK, PURPLE),
    (ROSE, PURPLE),
    (TEAL, INK),
    (ORANGE, PURPLE),
    (PURPLE, INK),
    (ROSE, TEAL),
]
ACCENTS = [CREAM, GOLD, TEAL, ORANGE, ROSE, "#f0e8de"]
DIRECTIONS = [("0", "0", "0", "1"), ("0", "0", "1", "1"), ("0", "1", "1", "0"), ("0", "0.2", "1", "0.8")]


def build(i: int) -> str:
    rng = random.Random(i * 7919 + 13)
    a, b = BG_PAIRS[i % len(BG_PAIRS)]
    x1, y1, x2, y2 = rng.choice(DIRECTIONS)
    grad = (
        f'<linearGradient id="g" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
        f'<stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'
    )
    accent = rng.sample(ACCENTS, 3)
    parts: list[str] = []
    tpl = i % 6

    if tpl == 0:  # layered waves
        for k in range(6):
            c = accent[k % 3]
            op = round(0.08 + 0.1 * (k % 3), 2)
            y = 50 + k * 78 + rng.randint(-18, 18)
            bend = rng.randint(60, 180)
            parts.append(
                f'<path d="M-40 {y} C {bend} {y - 90}, {W - bend} {y + 90}, {W + 40} {y}" '
                f'fill="none" stroke="{c}" stroke-width="{rng.randint(7, 16)}" opacity="{op}"/>'
            )
    elif tpl == 1:  # concentric rings
        cx, cy = rng.randint(220, 580), rng.randint(150, 380)
        for k in range(7):
            parts.append(
                f'<circle cx="{cx}" cy="{cy}" r="{46 + k * 46}" fill="none" stroke="{accent[k % 3]}" '
                f'stroke-width="{rng.randint(3, 9)}" opacity="{round(0.12 + 0.09 * (k % 3), 2)}"/>'
            )
    elif tpl == 2:  # soft bokeh
        for k in range(9):
            parts.append(
                f'<circle cx="{rng.randint(0, W)}" cy="{rng.randint(0, H)}" r="{rng.randint(50, 140)}" '
                f'fill="{accent[k % 3]}" opacity="{round(rng.uniform(0.06, 0.16), 2)}"/>'
            )
    elif tpl == 3:  # diagonal ribbons
        for k in range(7):
            x = -260 + k * 175 + rng.randint(-25, 25)
            parts.append(
                f'<polygon points="{x},0 {x + 95},0 {x + 95 - 270},{H} {x - 270},{H}" '
                f'fill="{accent[k % 3]}" opacity="{round(0.07 + 0.06 * (k % 3), 2)}"/>'
            )
    elif tpl == 4:  # dot field + orbs
        dot = accent[0]
        parts.append(
            f'<pattern id="dots" width="38" height="38" patternUnits="userSpaceOnUse">'
            f'<circle cx="3" cy="3" r="2.4" fill="{dot}" opacity="0.28"/></pattern>'
            f'<rect width="{W}" height="{H}" fill="url(#dots)"/>'
        )
        cx, cy = rng.randint(220, 580), rng.randint(150, 380)
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="150" fill="{accent[1]}" opacity="0.20"/>')
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="88" fill="{accent[2]}" opacity="0.24"/>')
    else:  # sweeping arcs
        for k in range(5):
            rad = 120 + k * 62
            parts.append(
                f'<path d="M {rng.randint(0, 160)} {H + 30} A {rad} {rad} 0 0 1 {W - rng.randint(0, 160)} {H + 30}" '
                f'fill="none" stroke="{accent[k % 3]}" stroke-width="{rng.randint(9, 20)}" '
                f'opacity="{round(0.1 + 0.07 * (k % 3), 2)}"/>'
            )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        f'preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">'
        f"<defs>{grad}</defs>"
        f'<rect width="{W}" height="{H}" fill="url(#g)"/>' + "".join(parts) + "</svg>"
    )


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for i in range(COUNT):
        (OUT / f"fb-{i:03d}.svg").write_text(build(i), encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.glob("fb-*.svg"))
    print(f"wrote {COUNT} svg fallbacks to {OUT} ({total // 1024} KB total)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
