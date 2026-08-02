#!/usr/bin/env python3
"""Deterministic repairs for the cutouts qwen-image-layered got wrong.

  title        layer_2 kept only the fern accent and discarded the lettering
               card. The krea2 anchor is cream-on-charcoal, so a luminance
               dark-key extracts it cleanly and deterministically.
  fact-found   layer_2 kept the charcoal panel. The raw edit is a full-width
               light-green banner strip between a hotel bleed (top) and
               charcoal (bottom); the banner rows are auto-detected by their
               green fraction and cropped out as an opaque strip.
  magnifier    the glass disc rendered as opaque charcoal. Every near-charcoal
               pixel inside the finalized sprite is punched to transparent with
               a luminance-scaled feather, leaving ring + handle intact.
  glass_hole   (P6) the luminance punch above left the glass at alpha 60-95 —
               a 30 % charcoal veil over everything the child magnifies. The
               aperture is found geometrically (the largest circle inside the
               ring's opaque inner edge) and punched to a TRUE hole, feathered
               into the rim. This is also the circle js/…/config.json's
               `lens.frame` is measured against, so the two can never drift.
  spider_legs  (P6) layer_2 returned the spider's charcoal body but dropped its
               eight pale-grey paper legs against the charcoal backdrop. The
               body silhouette (from the layered cutout) is UNIONed with a
               gradient-tolerant flood key of the raw edit's backdrop, which
               keeps the legs because they are the only bright thing in the
               frame. No regeneration, no model call.

Pure PIL, no network, idempotent. Run AFTER finalize-art.py finalize.
Usage: python3 tools/fix-cutouts.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

GAME = Path(__file__).resolve().parents[1]
SRC = GAME / "assets" / "source"


def save_webp(im: Image.Image, out: Path, budget_kb: int) -> None:
    for q in (90, 82, 74, 66, 58, 50):
        im.save(out, "WEBP", quality=q, method=6)
        if out.stat().st_size <= budget_kb * 1024:
            break
    print(f"  {out.relative_to(GAME)}  {im.size[0]}x{im.size[1]}  "
          f"{out.stat().st_size/1024:.1f}KB (q={q})")


def dark_key(src: Path, out: Path, max_w: int, max_h: int, budget_kb: int,
             thresh_lo: int = 52, thresh_hi: int = 96) -> None:
    """Alpha = distance of luminance above the charcoal band, feathered."""
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    mask = Image.new("L", im.size, 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            lum = max(r, g, b)
            if lum <= thresh_lo:
                mp[x, y] = 0
            elif lum >= thresh_hi:
                mp[x, y] = 255
            else:
                mp[x, y] = int(255 * (lum - thresh_lo) / (thresh_hi - thresh_lo))
    mask = mask.filter(ImageFilter.GaussianBlur(1.0))
    im.putalpha(mask)
    box = im.getbbox()
    im = im.crop(box)
    im.thumbnail((max_w, max_h), Image.LANCZOS)
    save_webp(im, out, budget_kb)


def fact_found() -> None:
    im = Image.open(SRC / "raw-edit" / "fact-found.png").convert("RGB")
    w, h = im.size
    px = im.load()
    rows = []
    for y in range(h):
        greens = 0
        for x in range(0, w, 8):
            r, g, b = px[x, y]
            if g > 150 and g > r + 15 and g > b + 30:
                greens += 1
        rows.append(greens / (w // 8))
    band = [y for y, f in enumerate(rows) if f > 0.30]
    if not band:
        raise SystemExit("fact-found: no green banner band detected")
    top, bot = max(min(band) - 2, 0), min(max(band) + 2, h - 1)
    strip = im.crop((0, top, w, bot + 1)).convert("RGBA")
    strip.thumbnail((900, 300), Image.LANCZOS)
    save_webp(strip, GAME / "assets" / "lockups" / "fact-found.webp", 60)


def magnifier() -> None:
    p = GAME / "assets" / "props" / "magnifier.webp"
    im = Image.open(p).convert("RGBA")
    px = im.load()
    w, h = im.size
    mask = Image.new("L", im.size, 255)
    mp = mask.load()
    lo, hi = 58, 92  # charcoal glass ≈ 42-52 luminance; ring cream ≥ 200; handle ≥ 110
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = max(r, g, b)
            if lum <= lo:
                mp[x, y] = 0
            elif lum < hi:
                mp[x, y] = int(255 * (lum - lo) / (hi - lo))
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    r0, g0, b0, a0 = im.split()
    from PIL import ImageChops
    im.putalpha(ImageChops.multiply(a0, mask))
    save_webp(im, p, 80)


def title() -> None:
    dark_key(SRC / "anchors" / "title.png",
             GAME / "assets" / "title.webp", 1400, 760, 150)


# --- P6 repairs -------------------------------------------------------------


def glass_aperture(im: Image.Image, opaque_at: int = 200) -> tuple[int, int, int]:
    """The largest circle that fits inside the ring's opaque inner edge.

    Returned as (cx, cy, r) in image px. This is a MEASUREMENT, not a constant:
    config.json's `lens.frame.scale` is 900/(2r) and `lens.frame.anchor` is
    (cx/w, cy/h), so re-running this after any change to the sprite prints the
    numbers the game must be re-tuned to.
    """
    import math

    w, h = im.size
    a = im.getchannel("A").load()

    def solid(x: int, y: int) -> bool:
        return not (0 <= x < w and 0 <= y < h) or a[x, y] >= opaque_at

    best = (0, w // 2, h // 2)
    for cx in range(int(w * 0.30), int(w * 0.55), 2):
        for cy in range(int(h * 0.30), int(h * 0.55), 2):
            if solid(cx, cy):
                continue
            worst = 10 ** 9
            for k in range(72):
                th = 2 * math.pi * k / 72
                dx, dy = math.cos(th), math.sin(th)
                r = 1
                while r < max(w, h) // 2 and not solid(int(cx + r * dx), int(cy + r * dy)):
                    r += 1
                worst = min(worst, r)
                if worst <= best[0]:
                    break
            if worst > best[0]:
                best = (worst, cx, cy)
    return best[1], best[2], best[0]


def magnifier_glass() -> None:
    """Punch the measured aperture to a TRUE hole and print the frame numbers."""
    import math

    p = GAME / "assets" / "props" / "magnifier.webp"
    im = Image.open(p).convert("RGBA")
    w, h = im.size
    cx, cy, r = glass_aperture(im)
    alpha = im.getchannel("A")
    ap = alpha.load()
    inner = r - 4          # fully clear
    outer = r + 2          # feathered into the ring's inner edge
    for y in range(h):
        for x in range(w):
            if ap[x, y] == 0:
                continue
            d = math.hypot(x - cx, y - cy)
            if d >= outer:
                continue
            if d <= inner:
                ap[x, y] = 0
            else:
                # Only the veil is removed; anything already opaque at the rim
                # (the ring itself) keeps its own alpha.
                keep = int(ap[x, y] * (d - inner) / (outer - inner))
                ap[x, y] = min(ap[x, y], keep)
    im.putalpha(alpha)
    save_webp(im, p, 80)
    print(f"  aperture centre=({cx},{cy}) r={r}  ->  "
          f"lens.frame.scale={w / (2 * r):.4f} "
          f"anchor=({cx / w:.4f},{cy / h:.4f})")


JOURNAL_CROP = (120, 120, 1470, 1090)      # the book, without the empty table


def journal_page() -> None:
    """Crop the journal spread down to the BOOK.

    finalize-art cover-cropped the raw edit to a 4:3 plate, which left ~18 % of
    dead table above and below the notebook. Every screen that prints this plate
    (`#spread-paper`, the end screen) fills its box with `cover`, so that dead
    margin came straight off the usable page: in portrait the third row of
    stickers ended up printed on the book's cover instead of on the paper.
    Cropping to the book once, here, fixes all four screens and costs nothing —
    no resampling, the pixels are the ones finalize-art already wrote.
    """
    p = GAME / "assets" / "bg-journal.jpg"
    im = Image.open(p)
    want = (JOURNAL_CROP[2] - JOURNAL_CROP[0], JOURNAL_CROP[3] - JOURNAL_CROP[1])
    if im.size == want:
        print("  bg-journal.jpg already cropped")
        return
    im = im.convert("RGB").crop(JOURNAL_CROP)
    for q in (92, 86, 80, 74, 68, 60):
        im.save(p, "JPEG", quality=q, optimize=True, progressive=True)
        if p.stat().st_size <= 300 * 1024:
            break
    print(f"  {p.relative_to(GAME)}  {im.size[0]}x{im.size[1]}  "
          f"{p.stat().st_size/1024:.1f}KB (q={q})")


def _flood_backdrop(im: Image.Image, step_tol: int = 6, cap: int = 110):
    """Mask of the subject, by growing the backdrop inward from the border.

    Growing on a per-STEP luminance tolerance (not a distance from one seed)
    is what survives the vignette: the backdrop drifts smoothly, the paper legs
    do not.
    """
    from collections import deque

    w, h = im.size
    px = im.load()
    lum = [[max(px[x, y]) for x in range(w)] for y in range(h)]
    bg = [[0] * w for _ in range(h)]
    dq: deque = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not bg[y][x]:
                bg[y][x] = 1
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not bg[y][x]:
                bg[y][x] = 1
                dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        l0 = lum[y][x]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] \
                    and abs(lum[ny][nx] - l0) <= step_tol and lum[ny][nx] <= cap:
                bg[ny][nx] = 1
                dq.append((nx, ny))
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            # Keep only what the flood did NOT reach AND what is bright enough
            # to be paper: the body's own charcoal is recovered from the layered
            # cutout instead, which is what it is good at.
            if not bg[y][x] and max(px[x, y]) >= 140:
                mp[x, y] = 255
    return mask


def spider_legs() -> None:
    from PIL import ImageChops

    for frame in ("idle", "happy"):
        raw = Image.open(SRC / "raw-edit" / f"bug-spider-{frame}.png").convert("RGB")
        cut = Image.open(SRC / "cutouts" / f"bug-spider-{frame}.png").convert("RGBA")
        body = cut.getchannel("A").resize(raw.size, Image.LANCZOS) \
                  .point(lambda v: 255 if v > 110 else 0)
        legs = _flood_backdrop(raw)
        mask = ImageChops.lighter(body, legs)
        mask = mask.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(0.8))
        im = raw.convert("RGBA")
        im.putalpha(mask)
        im = im.crop(im.getbbox())
        pad = int(max(im.size) * 0.04)
        canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
        canvas.paste(im, (pad, pad))
        canvas.thumbnail((512, 512), Image.LANCZOS)
        save_webp(canvas, GAME / "assets" / "bugs" / f"spider-{frame}.webp", 60)


if __name__ == "__main__":
    print("[fix] title (dark-key)")
    title()
    print("[fix] fact-found (green band crop)")
    fact_found()
    print("[fix] magnifier (glass punch)")
    magnifier()
    print("[fix] magnifier (true glass hole, P6)")
    magnifier_glass()
    print("[fix] spider legs (body cutout UNION backdrop flood, P6)")
    spider_legs()
    print("[fix] journal spread cropped to the book (P6)")
    journal_page()
    print("done")
