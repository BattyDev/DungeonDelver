"""Builds editable native-resolution dialogue portraits from a generated reference sheet.

The sheet is five columns (human, orc, elf, dwarf, gnome) by two rows (female, male) of busts on a
flat teal backdrop. Each bust is cut out, its backdrop removed, reduced to the game's 64 x 64
portrait grid, limited to a small palette so it stays crisp pixel art, and outlined like the sprites.

    tools/.venv/Scripts/python.exe tools/portraits/slice_defaults.py <sheet.png> <out.png> [preview.png]

The output is one 320 x 128 strip: columns follow RACES order, the top row is female, the bottom male.
"""
import sys
from collections import deque

import numpy as np
from PIL import Image

RACES = ['human', 'orc', 'elf', 'dwarf', 'gnome']
SIZE = 64
OUTLINE = (27, 26, 36)
COLOURS = 48


def remove_backdrop(cell: np.ndarray) -> np.ndarray:
    """Alpha mask: flood fill the teal backdrop inward from the edges, within a colour tolerance."""
    h, w, _ = cell.shape
    edge = np.concatenate([cell[0], cell[-1], cell[:, 0], cell[:, -1]])
    backdrop = np.median(edge, axis=0)
    near = np.sqrt(((cell - backdrop) ** 2).sum(axis=2)) < 34
    seen = np.zeros((h, w), bool)
    queue = deque((y, x) for y in range(h) for x in (0, w - 1) if near[y, x])
    queue.extend((y, x) for x in range(w) for y in (0, h - 1) if near[y, x])
    for y, x in queue:
        seen[y, x] = True
    while queue:
        y, x = queue.popleft()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and not seen[yy, xx] and near[yy, xx]:
                seen[yy, xx] = True
                queue.append((yy, xx))
    return (~seen).astype(np.uint8) * 255


def bust(cell: np.ndarray) -> Image.Image:
    alpha = remove_backdrop(cell.astype(int))
    rgba = Image.fromarray(np.dstack([cell, alpha]).astype(np.uint8), 'RGBA')
    # Premultiplied box filtering keeps backdrop colour from bleeding into the edge pixels.
    small = rgba.resize((SIZE, SIZE), Image.Resampling.BOX, reducing_gap=None)
    a = np.asarray(small).astype(float)
    solid = a[..., 3] >= 140
    rgb = Image.fromarray(a[..., :3].clip(0, 255).astype(np.uint8), 'RGB')
    rgb = rgb.quantize(COLOURS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    out = np.dstack([np.asarray(rgb), np.where(solid, 255, 0)]).astype(np.uint8)
    out[~solid] = (0, 0, 0, 0)
    # One-pixel dark outline around the silhouette, matching the sprites.
    edge = np.zeros_like(solid)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        edge |= np.roll(solid, (dy, dx), (0, 1))
    edge &= ~solid
    edge[0, :] = edge[:, 0] = edge[:, -1] = False
    out[edge] = (*OUTLINE, 255)
    return Image.fromarray(out, 'RGBA')


def main(sheet_path: str, out_path: str, preview_path: str | None = None):
    sheet = np.asarray(Image.open(sheet_path).convert('RGB'))
    h, w, _ = sheet.shape
    cols = [round(i * w / 5) for i in range(6)]
    rows = [round(i * h / 2) for i in range(3)]
    strip = Image.new('RGBA', (SIZE * 5, SIZE * 2))
    inset = 4
    for r in range(2):
        for c in range(5):
            cell = sheet[rows[r] + inset : rows[r + 1] - inset, cols[c] + inset : cols[c + 1] - inset]
            side = min(cell.shape[:2])
            cell = cell[:side, (cell.shape[1] - side) // 2 : (cell.shape[1] - side) // 2 + side]
            strip.paste(bust(cell), (c * SIZE, r * SIZE))
    strip.save(out_path, optimize=True)
    if preview_path:
        bg = Image.new('RGBA', strip.size, (16, 29, 34, 255))
        bg.alpha_composite(strip)
        bg.resize((strip.width * 4, strip.height * 4), Image.Resampling.NEAREST).save(preview_path)


if __name__ == '__main__':
    main(*sys.argv[1:])
