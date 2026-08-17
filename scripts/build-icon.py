#!/usr/bin/env python3
"""Generate the DevWP app icon set.

Outputs (overwrites):
  build/icon.png        512x512 master
  resources/icon.png    512x512 copy (used by cargo-packager)
  src/assets/icon_32.png 32x32 (embedded via include_bytes!)

Plus multi-resolution .ico and .icns files in build/.

Design: pumpkin-orange rounded square with a bold white W (WordPress-flavored)
and a white terminal-cursor bar beneath it that signals "dev / shell prompt".
"""

from __future__ import annotations

import io
import math
import os
import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
RESOURCES = ROOT / "resources"
ASSETS = ROOT / "src" / "assets"

PUMPKIN = (0xFF, 0x6B, 0x00, 0xFF)         # #ff6b00 (theme --color-pumpkin)
WHITE = (0xF9, 0xFA, 0xFB, 0xFF)            # seasalt-500 (theme --color-seasalt-500)


def rounded_square(size: int, radius: int, fill) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=fill)
    return img


def add_subtle_gradient(base: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """Top-down subtle gradient for a touch of depth (kept very mild)."""
    w, h = base.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    top = (*color, 60)
    bottom = (0, 0, 0, 0)
    for y in range(h):
        t = y / (h - 1)
        a = int(top[3] * (1 - t))
        d.line((0, y, w, y), fill=(top[0], top[1], top[2], a))
    out = Image.alpha_composite(base, overlay)
    return out


def render_w_polygon(canvas: Image.Image, center_xy: tuple[int, int],
                     height: int, fill) -> None:
    """Crisp polygon-based W (sharper than thick-line approach at 512px).

    Four parallelogram segments forming a classic bold W. Inner peak sits well
    above the baseline so the letter reads unambiguously even at 16px.
    """
    cx, cy = center_xy
    half_h = height / 2
    w_w = height * 1.18
    top_y = cy - half_h
    bot_y = cy + half_h
    left_x = cx - w_w / 2
    right_x = cx + w_w / 2
    t = height * 0.18  # stroke thickness

    # Inner peak sits ~24% from the top — high enough for an obvious W silhouette.
    peak_y = cy - half_h * 0.24

    def seg_poly(p1, p2, thickness):
        x1, y1 = p1
        x2, y2 = p2
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        nx, ny = -dy / length, dx / length
        ox, oy = nx * thickness / 2, ny * thickness / 2
        return [
            (x1 + ox, y1 + oy),
            (x1 - ox, y1 - oy),
            (x2 - ox, y2 - oy),
            (x2 + ox, y2 + oy),
        ]

    # Four zig-zag segments:
    #   TL (top)            -> L-valley (baseline, ~14% left of center)
    #   L-valley           -> center peak
    #   center peak         -> R-valley (baseline, ~14% right of center)
    #   R-valley           -> TR (top)
    segs = [
        ((left_x, top_y),            (cx - w_w * 0.14, bot_y)),
        ((cx - w_w * 0.14, bot_y),   (cx, peak_y)),
        ((cx, peak_y),               (cx + w_w * 0.14, bot_y)),
        ((cx + w_w * 0.14, bot_y),   (right_x, top_y)),
    ]
    d = ImageDraw.Draw(canvas)
    for s in segs:
        d.polygon(seg_poly(*s, t), fill=fill)


def render_cursor_bar(canvas: Image.Image, cy: int, height: int,
                     width_frac: float, fill) -> None:
    """Centered horizontal bar (the "shell prompt cursor" accent).

    Drawn as a single sharp polygon rectangle so it stays crisp down to 16px.
    """
    cx = canvas.size[0] // 2
    w = int(canvas.size[0] * width_frac)
    d = ImageDraw.Draw(canvas)
    d.rectangle((cx - w // 2, cy - height // 2,
                 cx + w // 2, cy + height // 2),
                fill=fill)


def render_master(size: int = 512) -> Image.Image:
    """Compose the final 512x512 mark."""
    radius = int(size * 0.22)
    img = rounded_square(size, radius, PUMPKIN)
    img = add_subtle_gradient(img, (0xFF, 0xFF, 0xFF))  # top highlight

    # Bold W, slightly trimmed and raised so the cursor bar reads as
    # a separate element (a "W_" command-prompt feel).
    render_w_polygon(img, center_xy=(size // 2, int(size * 0.40)),
                     height=int(size * 0.55), fill=WHITE)

    # Terminal-cursor bar — mirrors a CLI underscore prompt.
    render_cursor_bar(img, cy=int(size * 0.82),
                      height=int(size * 0.08),
                      width_frac=0.42, fill=WHITE)
    return img


def write_png(img: Image.Image, path: Path, size: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = img if size is None else img.resize((size, size), Image.LANCZOS)
    out.save(path, format="PNG", optimize=True)


def write_ico(img: Image.Image, path: Path, sizes: list[int]) -> None:
    """Write a multi-resolution .ico (PNGs inside the .ico container)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    out = path.with_suffix(".ico")
    out.unlink(missing_ok=True)
    # PIL's ICO writer accepts `sizes=[(w,h), ...]` and embeds all of them
    # when saving a single image source.
    img.save(out, format="ICO", sizes=[(s, s) for s in sizes])


def write_icns(master: Image.Image, path: Path) -> None:
    """Write an Apple ICNS container with multiple PNG-encoded entries.

    Apple's ICNS container is just: 'icns' magic + total length, followed by
    typed chunks {'TYPE' (4 ASCII chars) + chunk length (4B big-endian) + PNG bytes}.
    We support the subset of sizes we'll actually produce from a 512 master.
    """
    path.parent.mkdir(parents=True, exist_ok=True)

    # (pixel_size, type_code) — Apple ICNS reference:
    #  ic07=16, ic08=16@2x(32), ic09=32, ic10=32@2x(64), ic11=64,
    #  ic12=64@2x(128), ic13=128, ic14=128@2x(256), ic15=256, ic16=256@2x(512),
    #  ic17=512, ic18=512@2x(1024), ic19=1024...
    entries: list[tuple[str, Image.Image]] = [
        ("ic07", master.resize((16, 16), Image.LANCZOS)),
        ("ic09", master.resize((32, 32), Image.LANCZOS)),
        ("ic11", master.resize((64, 64), Image.LANCZOS)),
        ("ic13", master.resize((128, 128), Image.LANCZOS)),
        ("ic14", master.resize((256, 256), Image.LANCZOS)),
        ("ic16", master.resize((512, 512), Image.LANCZOS)),
    ]

    body = bytearray()
    for type_code, im in entries:
        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        png = buf.getvalue()
        chunk = struct.pack(">4sI", type_code.encode("ascii"), 8 + len(png)) + png
        body.extend(chunk)

    path.write_bytes(struct.pack(">4sI", b"icns", 8 + len(body)) + bytes(body))


def main() -> None:
    master = render_master(512)

    # 512 master copies.
    write_png(master, BUILD / "icon.png", 512)
    write_png(master, RESOURCES / "icon.png", 512)

    # Embedded 32x32 (downsampled with LANCZOS).
    write_png(master, ASSETS / "icon_32.png", 32)

    # Multi-res .ico for Windows installers.
    write_ico(master, BUILD / "icon", sizes=[16, 32, 48, 64, 128, 256])

    # .icns for macOS.
    write_icns(master, BUILD / "icon.icns")

    # Sanity print.
    for p in [BUILD / "icon.png", BUILD / "icon.ico", BUILD / "icon.icns",
              RESOURCES / "icon.png", ASSETS / "icon_32.png"]:
        size = os.path.getsize(p)
        print(f"{p}  {size:,} bytes")


if __name__ == "__main__":
    main()
