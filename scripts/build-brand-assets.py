#!/usr/bin/env python3
"""Build ROVE brand assets from the supplied source art (all sources are checked in, untouched).

  public/assets/rove-ip/rove-hero.jpg         single character key visual -> hero band
  public/assets/rove-ip/rove-collection.jpg   3x2 collage of IP scenes    -> six section scenes
  public/assets/rove-ip/rove-logo-source.jpg  winged-eagle emblem on white -> logo + favicon

Outputs:
  public/assets/rove-hero.webp
  public/assets/rove-ip-01-street.webp ... rove-ip-06-emblem.webp
  public/assets/rove-logo.webp   (transparent background, native resolution)
  public/assets/rove-icon.png    (square pad, favicon)

The emblem arrives as a flat mark on a white JPEG. It is knocked out with a luminance alpha ramp
plus an un-premultiply step, which keeps the anti-aliased edge pixels the colour of the mark
instead of leaving a white halo against the dark UI.

Usage:  python3 scripts/build-brand-assets.py
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageFilter
except ImportError:  # pragma: no cover
    sys.exit("Pillow and numpy are required: python3 -m pip install pillow numpy")

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public" / "assets"
SOURCE_DIR = ASSETS / "rove-ip"
HERO_SRC = SOURCE_DIR / "rove-hero.jpg"
COLLAGE_SRC = SOURCE_DIR / "rove-collection.jpg"
LOGO_SRC = SOURCE_DIR / "rove-logo-source.jpg"

# scene order in the collage, reading order
PANELS = [
    "rove-ip-01-street.webp",
    "rove-ip-02-lounge.webp",
    "rove-ip-03-rider.webp",
    "rove-ip-04-summit.webp",
    "rove-ip-05-arena.webp",
    "rove-ip-06-emblem.webp",
]

PANEL_EXPORT = 1014          # 2x the 507px collage cell: keeps upscaling off the browser
PANEL_QUALITY = 82
HERO_QUALITY = 86
LOGO_QUALITY = 92
LOGO_MARGIN = 0.045          # breathing room around the emblem inside its canvas
LOGO_WHITE = 252.0           # luminance at or above this counts as background
LOGO_RAMP = 8.0              # luminance band used for the soft edge
ICON_SIZE = 256              # plenty for 16-64px tabs and keeps the always-requested favicon light
LUMINANCE = np.array([0.2126, 0.7152, 0.0722], dtype="float32")


def white_gutters(profile: list[float], threshold: float = 0.85) -> list[tuple[int, int]]:
    """Contiguous runs of near-uniform (gutter) columns/rows in the collage."""
    runs, current = [], []
    for index, value in enumerate(profile):
        if value > threshold:
            current.append(index)
        elif current:
            runs.append((current[0], current[-1]))
            current = []
    if current:
        runs.append((current[0], current[-1]))
    return runs


def split_collage() -> None:
    """Cut the 3x2 collage into six square, gutter-free cells."""
    image = Image.open(COLLAGE_SRC).convert("RGB")
    width, height = image.size
    array = np.asarray(image).astype("int16")
    # cells are separated by thin near-white gutters: locate them instead of assuming thirds
    pale = (array > 232).all(axis=2)
    col_gaps = white_gutters((pale.sum(axis=0) / height).tolist())
    row_gaps = white_gutters((pale.sum(axis=1) / width).tolist())
    if len(col_gaps) != 2 or len(row_gaps) != 1:
        sys.exit(f"unexpected collage gutters: cols={col_gaps} rows={row_gaps}")

    # content bands between the gutters, trimmed one extra pixel against anti-aliased bleed
    xs = [(0, col_gaps[0][0] - 1), (col_gaps[0][1] + 1, col_gaps[1][0] - 1), (col_gaps[1][1] + 1, width)]
    ys = [(0, row_gaps[0][0] - 1), (row_gaps[0][1] + 1, height)]
    xs = [(a + 1, b - 1) for a, b in xs]
    ys = [(a + 1, b - 1) for a, b in ys]

    for row, (y0, y1) in enumerate(ys):
        for col, (x0, x1) in enumerate(xs):
            cell = image.crop((x0, y0, x1, y1))
            side = min(cell.size)
            left, top = (cell.width - side) // 2, (cell.height - side) // 2
            cell = cell.crop((left, top, left + side, top + side))
            target = ASSETS / PANELS[row * 3 + col]
            scaled = cell.resize((PANEL_EXPORT, PANEL_EXPORT), Image.LANCZOS)
            scaled = scaled.filter(ImageFilter.UnsharpMask(radius=2, percent=62, threshold=3))
            scaled.save(target, "WEBP", quality=PANEL_QUALITY, method=6)
            print(f"  {target.name:26s} {side}px cell -> {PANEL_EXPORT}px")


def knock_out_white(path: Path) -> Image.Image:
    """Flat mark on white -> transparent RGBA with clean edges."""
    array = np.asarray(Image.open(path).convert("RGB")).astype("float32")
    luminance = array @ LUMINANCE
    alpha = np.clip((LOGO_WHITE - luminance) / LOGO_RAMP, 0.0, 1.0)
    # un-premultiply: recover the mark colour under the white veil so soft edge pixels keep
    # the gold/black tone instead of fading through white
    safe = np.maximum(alpha, 1e-6)[..., None]
    foreground = np.clip((array - (1.0 - safe) * 255.0) / safe, 0, 255)
    return Image.fromarray(
        np.concatenate([foreground, (alpha * 255.0)[..., None]], axis=2).astype("uint8"), "RGBA"
    )


def build_logo() -> None:
    """Derive the logo and the favicon from the supplied emblem."""
    mark = knock_out_white(LOGO_SRC)
    solid = mark.getchannel("A").point(lambda value: 255 if value > 128 else 0)
    bbox = solid.getbbox()
    if not bbox:
        sys.exit("logo source produced an empty mask - is the emblem on a white background?")
    mark = mark.crop(bbox)
    pad_x, pad_y = int(mark.width * LOGO_MARGIN), int(mark.height * LOGO_MARGIN)
    canvas = Image.new("RGBA", (mark.width + 2 * pad_x, mark.height + 2 * pad_y), (0, 0, 0, 0))
    canvas.paste(mark, (pad_x, pad_y), mark)

    canvas.save(ASSETS / "rove-logo.webp", "WEBP", quality=LOGO_QUALITY, method=6)
    print(f"  rove-logo.webp             {canvas.width}x{canvas.height} (transparent)")

    # favicon: same art on a square canvas so every consumer gets a predictable shape
    side = max(canvas.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(canvas, ((side - canvas.width) // 2, (side - canvas.height) // 2), canvas)
    square.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS).save(ASSETS / "rove-icon.png", optimize=True)
    print(f"  rove-icon.png              {ICON_SIZE}x{ICON_SIZE}")

    for name in ("rove-logo.webp", "rove-icon.png"):
        print(f"    {name:24s} {(ASSETS / name).stat().st_size / 1024:6.1f} KB")


def main() -> None:
    for source in (HERO_SRC, COLLAGE_SRC, LOGO_SRC):
        if not source.exists():
            sys.exit(f"source art missing: {source}")

    print("hero key visual")
    hero = Image.open(HERO_SRC).convert("RGB")
    hero.save(ASSETS / "rove-hero.webp", "WEBP", quality=HERO_QUALITY, method=6)
    print(f"  rove-hero.webp             {hero.size[0]}x{hero.size[1]}")

    print("collage scenes")
    split_collage()

    print("logo emblem")
    build_logo()


if __name__ == "__main__":
    main()
