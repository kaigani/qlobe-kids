#!/usr/bin/env python3
"""Bug Hotel Observer — deterministic art finalization (P4).

Turns accepted raw candidates under `assets/source/{anchors,raw-edit,cutouts}/`
into the runtime files `config.json` actually points at, per the per-asset
dimension/budget table in `ASSETS.md` §4-§5. Pure PIL + stdlib, no network,
modelled on `games/sink-or-float/tools/finalize-art.py` and
`games/flashlight-cave/tools/gen-art.py`'s finalize half.

Two kinds of finalize:

  OPAQUE  cover-crop to the exact spec canvas, encode JPEG under a byte
          budget. bg-hotel, the 4 room interiors, bg-journal, and the
          hub-tile candidate (STAGED at assets/source/hub/ ONLY — never
          assets/hub/tiles/, that directory is hand-curated).
  ALPHA   alpha-trim the cutout to its content bbox, pad 4%, then either:
            - CANVAS-NORMALIZE onto a fixed-size transparent canvas at the
              spec's exact W x H (every UI prop/lockup with a paired W x H
              in ASSETS.md: magnifier, plaques, mode faces, journal-tab,
              sticker-backing, fact-card, fact-found) or
            - FIT (contain, no forced canvas) within a max box, keeping the
              artwork's own aspect ratio (title.webp — ASSETS.md gives it as
              "~1400 x 760 after alpha-trim", an approximate box, not a fixed
              slot) or
            - LONGEST-EDGE resize only, keeping native aspect (the 24 bug
              sprites — ASSETS.md specifies "512 px on the longest edge",
              deliberately NOT a fixed box, so each bug's silhouette reads at
              its own natural proportions; matches config.json bugs[].artSize
              being a single number per bug).
          Then encode WEBP under a byte budget.

Subcommands:
    finalize        run every asset whose source exists; skip up-to-date
                    outputs unless --force; --only <substring> filters by id
    qa-composites   composite every one of the 37 FINALIZED transparent
                    assets over saturated magenta into assets/source/qa/,
                    so alpha fringes (the classic thin-limb-on-dark-bg
                    failure) are eyeballable

Usage:
    python3 tools/finalize-art.py finalize --dry-run
    python3 tools/finalize-art.py finalize
    python3 tools/finalize-art.py finalize --only bug-ladybug
    python3 tools/finalize-art.py finalize --only magnifier --force
    python3 tools/finalize-art.py qa-composites
    python3 tools/finalize-art.py qa-composites --only bug-

Every candidate stays retained under assets/source/ (CLAUDE.md rule) — this
script only ever READS from assets/source/ and WRITES into assets/. Sources
are never deleted; a later polish pass re-derives from them.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]        # games/bug-hotel-observer
SRC = GAME / "assets" / "source"
ANCHORS = SRC / "anchors"
RAW_EDIT = SRC / "raw-edit"
CUTOUTS = SRC / "cutouts"
QA = SRC / "qa"
OUT = GAME / "assets"

BUG_IDS = [
    "ladybug", "caterpillar", "snail", "ant", "roly-poly", "worm",
    "bee", "butterfly", "grasshopper", "beetle", "spider", "cricket",
]

# --------------------------------------------------------------------------
# Asset specs
# --------------------------------------------------------------------------
# kind: "opaque" (cover-crop, jpeg) | "canvas" (alpha-trim -> fixed WxH
#       transparent canvas, webp) | "fit" (alpha-trim -> contain-fit box, no
#       forced canvas, webp) | "long-edge" (alpha-trim -> single longest-edge
#       target, webp)

OPAQUE_SPECS = [
    dict(id="bg-hotel", src=ANCHORS / "bg-hotel.png", dst=OUT / "bg-hotel.jpg",
         w=1600, h=1200, budget_kb=300),
    dict(id="bg-room-leaf", src=RAW_EDIT / "bg-room-leaf.png", dst=OUT / "bg-room-leaf.jpg",
         w=1600, h=1200, budget_kb=300),
    dict(id="bg-room-bark", src=RAW_EDIT / "bg-room-bark.png", dst=OUT / "bg-room-bark.jpg",
         w=1600, h=1200, budget_kb=300),
    dict(id="bg-room-bamboo", src=RAW_EDIT / "bg-room-bamboo.png", dst=OUT / "bg-room-bamboo.jpg",
         w=1600, h=1200, budget_kb=300),
    dict(id="bg-room-log", src=RAW_EDIT / "bg-room-log.png", dst=OUT / "bg-room-log.jpg",
         w=1600, h=1200, budget_kb=300),
    dict(id="bg-journal", src=RAW_EDIT / "bg-journal.png", dst=OUT / "bg-journal.jpg",
         w=1600, h=1200, budget_kb=280),
    # STAGED ONLY — never assets/hub/tiles/ (hands-off rule, MEMORY: hub-tiles-hands-off).
    dict(id="hub-tile-candidate", src=ANCHORS / "hub-tile.png",
         dst=SRC / "hub" / "tile-candidate.jpg", w=768, h=640, budget_kb=200),
]

CANVAS_SPECS = [
    dict(id="magnifier", src=CUTOUTS / "magnifier.png", dst=OUT / "props" / "magnifier.webp",
         w=900, h=900, budget_kb=80),
    dict(id="plaque-leaf", src=CUTOUTS / "plaque-leaf.png", dst=OUT / "props" / "plaque-leaf.webp",
         w=360, h=360, budget_kb=40),
    dict(id="plaque-bark", src=CUTOUTS / "plaque-bark.png", dst=OUT / "props" / "plaque-bark.webp",
         w=360, h=360, budget_kb=40),
    dict(id="plaque-bamboo", src=CUTOUTS / "plaque-bamboo.png", dst=OUT / "props" / "plaque-bamboo.webp",
         w=360, h=360, budget_kb=40),
    dict(id="plaque-log", src=CUTOUTS / "plaque-log.png", dst=OUT / "props" / "plaque-log.webp",
         w=360, h=360, budget_kb=40),
    dict(id="mode-hunt", src=CUTOUTS / "mode-hunt.png", dst=OUT / "props" / "mode-hunt.webp",
         w=420, h=420, budget_kb=50),
    dict(id="mode-detective", src=CUTOUTS / "mode-detective.png", dst=OUT / "props" / "mode-detective.webp",
         w=420, h=420, budget_kb=50),
    dict(id="mode-book", src=CUTOUTS / "mode-book.png", dst=OUT / "props" / "mode-book.webp",
         w=420, h=420, budget_kb=50),
    dict(id="journal-tab", src=CUTOUTS / "journal-tab.png", dst=OUT / "props" / "journal-tab.webp",
         w=300, h=300, budget_kb=30),
    dict(id="sticker-backing", src=CUTOUTS / "sticker-backing.png", dst=OUT / "props" / "sticker-backing.webp",
         w=420, h=420, budget_kb=36),
    dict(id="fact-card", src=CUTOUTS / "fact-card.png", dst=OUT / "props" / "fact-card.webp",
         w=1100, h=760, budget_kb=90),
    dict(id="fact-found", src=CUTOUTS / "fact-found.png", dst=OUT / "lockups" / "fact-found.webp",
         w=900, h=280, budget_kb=60),
]

FIT_SPECS = [
    # "~1400 x 760 after alpha-trim" — approximate box, natural aspect kept.
    dict(id="title", src=CUTOUTS / "title.png", dst=OUT / "title.webp",
         w=1400, h=760, budget_kb=150),
]

LONG_EDGE_SPECS = []
for _bid in BUG_IDS:
    for _pose in ("idle", "happy"):
        LONG_EDGE_SPECS.append(dict(
            id=f"bug-{_bid}-{_pose}",
            src=CUTOUTS / f"bug-{_bid}-{_pose}.png",
            dst=OUT / "bugs" / f"{_bid}-{_pose}.webp",
            target=512, budget_kb=60,
        ))

ALL_ALPHA_SPECS = CANVAS_SPECS + FIT_SPECS + LONG_EDGE_SPECS  # the 37 transparent assets

# --------------------------------------------------------------------------
# PIL helpers (deferred import so --dry-run needs no dependency)
# --------------------------------------------------------------------------


def _pil():
    try:
        from PIL import Image
    except ImportError:
        sys.exit("Pillow is required: pip install pillow")
    return Image


def trim_pad(Image, im, pad_frac: float = 0.04, alpha_floor: int = 40):
    """Crop to the alpha bbox (threshold 40 — layered extraction can leave a
    ghost background alpha of ~16-31 that a lower threshold mistakes for
    content), then pad by pad_frac of the longest side."""
    a = im.getchannel("A")
    bbox = a.point(lambda p: 255 if p > alpha_floor else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    pad = int(max(w, h) * pad_frac)
    canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    return canvas


def contain_fit(Image, im, max_w: int, max_h: int):
    """Scale down only (never up) so both dims fit inside the box, aspect kept."""
    w, h = im.size
    scale = min(max_w / w, max_h / h, 1.0)
    if scale < 1.0:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    return im


def canvas_normalize(Image, im, w: int, h: int):
    """contain_fit into (w, h), then paste centred onto an exact w x h
    transparent canvas — a fixed slot size for CSS to size predictably."""
    im = contain_fit(Image, im, w, h)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    x = (w - im.width) // 2
    y = (h - im.height) // 2
    canvas.paste(im, (x, y), im)
    return canvas


def resize_long_edge(Image, im, target: int):
    w, h = im.size
    scale = target / max(w, h)
    if scale < 1.0:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    return im


def cover_crop(Image, im, tw: int, th: int):
    w, h = im.size
    scale = max(tw / w, th / h)
    im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    w, h = im.size
    x, y = (w - tw) // 2, (h - th) // 2
    return im.crop((x, y, x + tw, y + th))


def save_jpeg_budget(im, path: Path, budget_kb: int, start_q: int = 92, min_q: int = 40, step: int = 6) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    q = start_q
    while q >= min_q:
        im.convert("RGB").save(path, "JPEG", quality=q, optimize=True, progressive=True)
        size = path.stat().st_size
        if size <= budget_kb * 1024:
            return size
        q -= step
    return path.stat().st_size


def save_webp_budget(im, path: Path, budget_kb: int, start_q: int = 92, min_q: int = 40, step: int = 6) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    q = start_q
    while q >= min_q:
        im.save(path, "WEBP", quality=q, method=6)
        size = path.stat().st_size
        if size <= budget_kb * 1024:
            return size
        q -= step
    return path.stat().st_size


def magenta_composite(Image, im, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bg = Image.new("RGBA", im.size, (255, 0, 255, 255))
    bg.alpha_composite(im)
    bg.convert("RGB").save(out_path, "JPEG", quality=88)


# --------------------------------------------------------------------------
# finalize
# --------------------------------------------------------------------------


def _up_to_date(dst: Path, src: Path) -> bool:
    return dst.exists() and dst.stat().st_mtime > src.stat().st_mtime


def finalize_opaque(Image, spec: dict, force: bool) -> str:
    src, dst = spec["src"], spec["dst"]
    if not src.exists():
        return f"MISSING source {src.relative_to(GAME) if GAME in src.parents else src}"
    if _up_to_date(dst, src) and not force:
        return "skip"
    im = Image.open(src).convert("RGB")
    im = cover_crop(Image, im, spec["w"], spec["h"])
    size = save_jpeg_budget(im, dst, spec["budget_kb"])
    return f"ok {im.size[0]}x{im.size[1]} {size / 1024:.1f}KB"


def finalize_canvas(Image, spec: dict, force: bool) -> str:
    src, dst = spec["src"], spec["dst"]
    if not src.exists():
        return f"MISSING source {src}"
    if _up_to_date(dst, src) and not force:
        return "skip"
    im = Image.open(src).convert("RGBA")
    im = trim_pad(Image, im)
    im = canvas_normalize(Image, im, spec["w"], spec["h"])
    size = save_webp_budget(im, dst, spec["budget_kb"])
    return f"ok {im.size[0]}x{im.size[1]} {size / 1024:.1f}KB"


def finalize_fit(Image, spec: dict, force: bool) -> str:
    src, dst = spec["src"], spec["dst"]
    if not src.exists():
        return f"MISSING source {src}"
    if _up_to_date(dst, src) and not force:
        return "skip"
    im = Image.open(src).convert("RGBA")
    im = trim_pad(Image, im)
    im = contain_fit(Image, im, spec["w"], spec["h"])
    size = save_webp_budget(im, dst, spec["budget_kb"])
    return f"ok {im.size[0]}x{im.size[1]} {size / 1024:.1f}KB"


def finalize_long_edge(Image, spec: dict, force: bool) -> str:
    src, dst = spec["src"], spec["dst"]
    if not src.exists():
        return f"MISSING source {src}"
    if _up_to_date(dst, src) and not force:
        return "skip"
    im = Image.open(src).convert("RGBA")
    im = trim_pad(Image, im)
    im = resize_long_edge(Image, im, spec["target"])
    size = save_webp_budget(im, dst, spec["budget_kb"])
    return f"ok {im.size[0]}x{im.size[1]} {size / 1024:.1f}KB"


def matches_only(spec_id: str, only: list[str]) -> bool:
    if not only:
        return True
    return any(o.lower() in spec_id.lower() for o in only)


def all_specs() -> list[tuple[str, dict]]:
    out = []
    out += [("opaque", s) for s in OPAQUE_SPECS]
    out += [("canvas", s) for s in CANVAS_SPECS]
    out += [("fit", s) for s in FIT_SPECS]
    out += [("long-edge", s) for s in LONG_EDGE_SPECS]
    return out


def print_dry_run(specs: list[tuple[str, dict]]) -> None:
    print(f"[dry-run] {len(specs)} asset(s); no processing performed")
    for kind, s in specs:
        dims = f"{s['w']}x{s['h']}" if "w" in s else f"long{s['target']}"
        print(f"  {s['id']:<20} {kind:<10} dims={dims:<12} budget={s['budget_kb']}KB "
              f"src={s['src'].name:<30} -> {s['dst'].relative_to(GAME)}")


def cmd_finalize(args) -> int:
    specs = [(k, s) for k, s in all_specs() if matches_only(s["id"], args.only)]
    if not specs:
        print(f"no assets matched --only {args.only!r}")
        return 1
    if args.dry_run:
        print_dry_run(specs)
        return 0

    Image = _pil()
    fns = {"opaque": finalize_opaque, "canvas": finalize_canvas,
           "fit": finalize_fit, "long-edge": finalize_long_edge}
    results = []
    for kind, spec in specs:
        status = fns[kind](Image, spec, args.force)
        print(f"  [{kind}] {spec['id']:<20} {status}")
        results.append((spec["id"], status))

    ok = sum(1 for _, s in results if s == "skip" or s.startswith("ok"))
    missing = [(i, s) for i, s in results if s.startswith("MISSING")]
    print(f"\n{ok}/{len(results)} ok/skipped, {len(missing)} missing source")
    return 1 if missing else 0


# --------------------------------------------------------------------------
# qa-composites
# --------------------------------------------------------------------------


def cmd_qa_composites(args) -> int:
    # ALL_ALPHA_SPECS already excludes the opaque plates; filter by --only too.
    specs = [s for s in ALL_ALPHA_SPECS if matches_only(s["id"], args.only)]
    if not specs:
        print(f"no assets matched --only {args.only!r}")
        return 1
    if args.dry_run:
        print(f"[dry-run] {len(specs)} magenta composite(s); no processing performed")
        for s in specs:
            qa_out = QA / f"{s['id']}-magenta.jpg"
            print(f"  {s['id']:<20} src={s['dst'].relative_to(GAME)}  -> {qa_out.relative_to(GAME)}")
        return 0

    Image = _pil()
    missing = []
    for s in specs:
        dst = s["dst"]
        if not dst.exists():
            print(f"  MISSING finalized asset {dst.relative_to(GAME)} — run `finalize` first")
            missing.append(s["id"])
            continue
        im = Image.open(dst).convert("RGBA")
        qa_out = QA / f"{s['id']}-magenta.jpg"
        magenta_composite(Image, im, qa_out)
        print(f"  ok {s['id']:<20} -> {qa_out.relative_to(GAME)}")
    print(f"\n{len(specs) - len(missing)}/{len(specs)} composited, {len(missing)} missing")
    return 1 if missing else 0


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("finalize", help="alpha-trim/cover-crop/resize/encode accepted sources into assets/")
    f.add_argument("--dry-run", action="store_true", help="print the asset table; no processing")
    f.add_argument("--only", nargs="*", default=[], help="substring filter on asset id")
    f.add_argument("--force", action="store_true", help="reprocess even if output is newer than source")

    q = sub.add_parser("qa-composites", help="composite every finalized transparent asset over magenta")
    q.add_argument("--dry-run", action="store_true", help="print the asset table; no processing")
    q.add_argument("--only", nargs="*", default=[], help="substring filter on asset id")

    args = ap.parse_args()
    if args.cmd == "finalize":
        return cmd_finalize(args)
    return cmd_qa_composites(args)


if __name__ == "__main__":
    sys.exit(main())
