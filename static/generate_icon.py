#!/usr/bin/env python3
"""Generate static/icon.png — 192x192 PWA icon (atom-orbit design)."""

import math
import os

from PIL import Image, ImageDraw

SIZE = 192
SCALE = SIZE / 24
CX, CY = SIZE // 2, SIZE // 2

BG_TOP = (232, 145, 92)
BG_BOT = (194, 90, 48)
WHITE = (255, 255, 255)


def draw_rounded_rect(draw, xy, radius, fill):
    x0, y0, x1, y1 = xy
    r = radius
    draw.rectangle([x0 + r, y0, x1 - r, y1], fill=fill)
    draw.rectangle([x0, y0 + r, x1, y1 - r], fill=fill)
    draw.pieslice([x0, y0, x0 + 2 * r, y0 + 2 * r], 180, 360, fill=fill)
    draw.pieslice([x1 - 2 * r, y0, x1, y0 + 2 * r], 270, 90, fill=fill)
    draw.pieslice([x0, y1 - 2 * r, x0 + 2 * r, y1], 90, 270, fill=fill)
    draw.pieslice([x1 - 2 * r, y1 - 2 * r, x1, y1], 0, 180, fill=fill)


def draw_rotated_ellipse(img, cx, cy, rx, ry, angle, color, stroke_width):
    """Draw a stroked ellipse rotated by angle using exact pixel math."""
    rad = math.radians(angle)
    cos_a, sin_a = math.cos(rad), math.sin(rad)

    for y in range(SIZE):
        for x in range(SIZE):
            # Transform point to ellipse-local coords (inverse rotation)
            dx = x - cx
            dy = y - cy
            lx = dx * cos_a + dy * sin_a
            ly = -dx * sin_a + dy * cos_a

            # Distance to ellipse boundary along the ray from center
            # r(theta) = 1 / sqrt((cos(theta)/rx)^2 + (sin(theta)/ry)^2)
            if lx == 0 and ly == 0:
                dist = 0
            else:
                theta = math.atan2(ly, lx)
                denom = math.sqrt(
                    (math.cos(theta) / rx) ** 2 + (math.sin(theta) / ry) ** 2
                )
                dist = 1.0 / denom

            if (
                dist - stroke_width / 2
                <= abs(math.hypot(lx, ly))
                <= dist + stroke_width / 2
            ):
                img.putpixel((x, y), color)


img = Image.new("RGB", (SIZE, SIZE), BG_TOP)

# Gradient background
for y in range(SIZE):
    t = y / (SIZE - 1)
    r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
    g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
    b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
    ImageDraw.Draw(img).line([(0, y), (SIZE, y)], fill=(r, g, b))

# (gradient already covers the full image; rounded rect was masking the icon)

# Ellipses (from SVG: rx=8.5, ry=3.4, stroke=1.7, rotated ±60°)
rx = 8.5 * SCALE
ry = 3.4 * SCALE
sw = int(1.7 * SCALE)

for angle in (60, -60):
    draw_rotated_ellipse(img, CX, CY, rx, ry, angle, WHITE, sw)

# Center circle (from SVG: r=2.6)
cr = int(2.6 * SCALE)
ImageDraw.Draw(img).ellipse([CX - cr, CY - cr, CX + cr, CY + cr], fill=WHITE)

os.makedirs("static", exist_ok=True)
img.save("static/icon.png")
print("Saved static/icon.png")
