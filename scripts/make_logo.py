#!/usr/bin/env python3
"""Build ChadTube logo assets from the uploaded drawing.

Flood-fills the white background from the image edges so the logo is
transparent (the white "OUCH!" text inside the figure is not edge-connected
and survives), trims to content, and emits:
  - /home/z/my-project/public/chad.png        (header logo, Next app)
  - /home/z/my-project/src/app/icon.png       (favicon via app-router convention)
  - /home/z/my-project/download/chadtube-starter-kit/chad.png (kit, copied later if dir exists)
"""
from collections import deque
import os
import shutil
from PIL import Image

SRC = "/home/z/my-project/upload/pasted_image_1795442359359.png"
OUT_PUBLIC = "/home/z/my-project/public/chad.png"
OUT_ICON = "/home/z/my-project/src/app/icon.png"
OUT_KIT = "/home/z/my-project/download/chadtube-starter-kit/chad.png"

img = Image.open(SRC).convert("RGBA")
w, h = img.size
px = img.load()
print(f"source: {w}x{h}")


def near_white(p, thr=235):
    r, g, b = p[0], p[1], p[2]
    return r >= thr and g >= thr and b >= thr


# BFS flood fill from every border pixel through near-white pixels
seen = [[False] * w for _ in range(h)]
dq = deque()
for x in range(w):
    for y in (0, h - 1):
        if near_white(px[x, y]) and not seen[y][x]:
            seen[y][x] = True
            dq.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if near_white(px[x, y]) and not seen[y][x]:
            seen[y][x] = True
            dq.append((x, y))
removed = 0
while dq:
    x, y = dq.popleft()
    px[x, y] = (255, 255, 255, 0)
    removed += 1
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and near_white(px[nx, ny]):
            seen[ny][nx] = True
            dq.append((nx, ny))

print(f"transparent pixels: {removed} ({100 * removed / (w * h):.1f}%)")

# trim to content bbox with a little padding
bbox = img.getbbox()
if bbox:
    pad = 6
    bbox = (
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(w, bbox[2] + pad),
        min(h, bbox[3] + pad),
    )
    img = img.crop(bbox)
print("trimmed:", img.size)

os.makedirs(os.path.dirname(OUT_PUBLIC), exist_ok=True)
os.makedirs(os.path.dirname(OUT_ICON), exist_ok=True)

# header logo: cap the long edge at 512
logo = img.copy()
logo.thumbnail((512, 512), Image.LANCZOS)
logo.save(OUT_PUBLIC, optimize=True)
print(f"{OUT_PUBLIC}: {logo.size}, {os.path.getsize(OUT_PUBLIC)} bytes")

# favicon: square 256 canvas, aspect-fit with margin
side = 256
icon = Image.new("RGBA", (side, side), (0, 0, 0, 0))
fit = img.copy()
fit.thumbnail((side - 32, side - 32), Image.LANCZOS)
fx, fy = (side - fit.width) // 2, (side - fit.height) // 2
icon.paste(fit, (fx, fy), fit)
icon.save(OUT_ICON, optimize=True)
print(f"{OUT_ICON}: {icon.size}, {os.path.getsize(OUT_ICON)} bytes")

# kit copy (dir may not exist yet — renamed later)
kit_dir = os.path.dirname(OUT_KIT)
if os.path.isdir(kit_dir):
    shutil.copyfile(OUT_PUBLIC, OUT_KIT)
    print(f"{OUT_KIT}: copied")
else:
    print(f"kit dir {kit_dir} not present yet; will copy after rename")
