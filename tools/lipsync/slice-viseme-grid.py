#!/usr/bin/env python3
"""slice-viseme-grid.py — cut a labelled viseme GRID into per-head grey tiles for
Qwen extraction, NON-DESTRUCTIVELY.

A foundational-model viseme sheet is a 3x3 grid of the character's head (one per
mouth shape) on a flat grey background, with a small phoneme label under each.
This slices it into 9 single-head tiles ready to feed `qwen-image-layered`.

IMPORTANT — do NOT matte here. The extraction (Qwen) is what isolates the head;
this step must leave the art untouched. Earlier versions threshold+feathered an
alpha and re-composited onto grey, which RE-CUT the soft felt-fur edges (and the
damage then propagated through Qwen's redraw). This version only *crops verbatim
pixels* onto a matching-grey canvas — the fur edges are preserved exactly.

How it locates each head without grabbing the label:
- head mask = saturated OR very dark (mane/horn/ears/eyes), which already ignores
  the light label text — but a DARK label can join the mask, so:
- take the largest connected component after a tiny binary_close (the close bridges
  a thin mask gap that can disconnect an ear; it's far too small to reach the label
  a bit below the mane), giving a head bbox that includes the ears and excludes the
  label;
- crop head bbox (bottom kept tight, +8px, to exclude the label) and paste its
  pixels 1:1, centered by the HEAD CENTRE, onto a 1024 tile filled with grey
  sampled from that crop's own corner.

Usage:
    ./venv/bin/python slice-viseme-grid.py <grid.png> <out-dir> [rows cols]
Writes <out-dir>/viseme-{a,o,e,wr,ts,ln,uq,mbp,fv}.png (the standard 3x3 order).
Then run each through qwen-image-layered (async -> layer_2), alpha-trim the
result, and re-register by translation only. Needs numpy+Pillow+scipy.
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

ORDER = [['a', 'o', 'e'], ['wr', 'ts', 'ln'], ['uq', 'mbp', 'fv']]  # standard label grid
TILE = 1024


def head_bbox(region, ox, oy, cell_bounds):
    """Complete head bbox from an overlapping search region, assigned by centre."""
    mask = (region.max(2) - region.min(2) > 34) | (region.max(2) < 80)  # saturated OR dark
    cc = ndimage.binary_closing(mask, iterations=3)                # bridge ear gap only
    lbl, n = ndimage.label(cc)
    x0, y0, x1, y1 = cell_bounds
    candidates = []
    for label_id in range(1, n + 1):
        ys, xs = np.where(lbl == label_id)
        if not len(xs):
            continue
        cx, cy = xs.mean() + ox, ys.mean() + oy
        if x0 <= cx < x1 and y0 <= cy < y1:
            candidates.append((len(xs), label_id))
    if not candidates:
        raise ValueError("could not locate a head centred in the expected grid cell")
    cc = lbl == max(candidates)[1]
    ys, xs = np.where(cc)
    return xs.min() + ox, ys.min() + oy, xs.max() + ox + 1, ys.max() + oy + 1


def main(grid, outdir, rows=3, cols=3):
    os.makedirs(outdir, exist_ok=True)
    im = Image.open(grid).convert("RGB")
    W, H = im.size
    a = np.array(im).astype(int)
    cw, ch = W / cols, H / rows
    backgrounds = []
    for r in range(rows):
        for c in range(cols):
            x0, y0 = int(c * cw), int(r * ch)
            x1, y1 = int((c + 1) * cw), int((r + 1) * ch)
            bleed_x, bleed_y = min(96, int((x1 - x0) * .2)), min(96, int((y1 - y0) * .15))
            sx0, sy0 = max(0, x0 - bleed_x), max(0, y0 - bleed_y)
            sx1, sy1 = min(W, x1 + bleed_x), min(H, y1 + bleed_y)
            hx0, hy0, hx1, hy1 = head_bbox(a[sy0:sy1, sx0:sx1], sx0, sy0, (x0, y0, x1, y1))
            bw = hx1 - hx0
            hcx, hcy = (hx0 + hx1) / 2, (hy0 + hy1) / 2
            halfW = bw / 2 + 30
            by0, by1 = hy0 - 24, hy1 + 8            # bottom tight -> excludes the label
            cx0, cy0 = max(0, int(hcx - halfW)), max(0, int(by0))
            cx1, cy1 = min(W, int(hcx + halfW)), min(H, int(by1))
            crop = im.crop((cx0, cy0, cx1, cy1))    # verbatim pixels, NO matte
            if crop.width > TILE or crop.height > TILE:
                raise ValueError(f"{ORDER[r][c]} crop is {crop.width}x{crop.height}; "
                                 f"a 1:1 crop cannot fit on the {TILE}x{TILE} Qwen canvas")
            # Sample each crop rather than assuming one sheet-wide grey. The
            # median tolerates isolated noise and compression artifacts.
            corner = np.array(crop)[:8, :8, :].reshape(-1, 3)
            grey = np.median(corner, axis=0).round().astype(int)
            bg = tuple(int(x) for x in grey)
            backgrounds.append(bg)
            tile = Image.new("RGB", (TILE, TILE), bg)
            tile.paste(crop, (round(TILE / 2 - (hcx - cx0)), round(TILE / 2 - (hcy - cy0))))
            # Remove crop seams by normalising only pixels already very close
            # to the sampled source corner. The subject itself remains untouched.
            t = np.array(tile).astype(int)
            t[np.abs(t - grey).max(2) < 12] = grey
            Image.fromarray(t.astype('uint8')).save(f"{outdir}/viseme-{ORDER[r][c]}.png")
    print(f"wrote {rows * cols} 1:1 tiles to {outdir} "
          f"(per-crop sampled backgrounds: {backgrounds}, art unscaled)")


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit("usage: slice-viseme-grid.py <grid.png> <out-dir> [rows cols]")
    main(sys.argv[1], sys.argv[2], *(int(x) for x in sys.argv[3:5]) if len(sys.argv) > 4 else ())
