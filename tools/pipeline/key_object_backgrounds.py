#!/usr/bin/env python3
"""Give every sprite in `shared/assets/objects/` a real transparent background.

Why
---
125 of the 203 sprites are truecolour PNGs with no alpha channel and no tRNS —
they carry a painted white background. On a light play-field nobody notices; on
a dark one (Flashlight Cave's cave, any night scene) they render as white boxes.
The other 78 already have transparency and are only re-containered here.

The artwork is NOT regenerated. This changes the background only.

Method — the two-step, not a flood fill
---------------------------------------
A border flood fill leaves halos and chewed anti-aliased edges, and it eats
interior whites it can reach (a whale's belly, a duck's highlight). Instead:

1. `qwen-image-edit`     "Change to a plain grey background". Normalising off
                         white first is what makes step 2 reliable — fed a white
                         background directly, the layered model returns
                         near-blank alpha or invents a different subject.
2. `qwen-image-layered`  async job -> layer_2 = subject on true alpha.
                         `sync=true` returns layer_0, the composite. Not that.

Prompt shape for step 2 matters; name the subject explicitly or the model
redraws something else:

    Background layer: Plain dark grey background
    Top layer: <Subject> on a transparent background

Do NOT add "with drop shadow" — it renders as a light sticker rim that reads as
a white outline on a dark backdrop.

Because the extractor is a *generative redraw*, every result is diffed against
the original before it is accepted: composite over white, compare pixel-for-
pixel, and reject anything that came back as different art rather than the same
art minus its background.

Output is lossless WebP: same pixels, smaller file, and alpha support without
PNG's size penalty.

Staging
-------
Writes to `--out` (default `tmp/objects-webp/`), never straight into
`shared/assets/objects/`. Review, then promote deliberately.

Idempotent and resumable — a word whose output exists is skipped.

    export QLOBE_QWEN_URL=http://<host>:<port>
    python3 tools/pipeline/key_object_backgrounds.py
    python3 tools/pipeline/key_object_backgrounds.py --only bat sun
    python3 tools/pipeline/key_object_backgrounds.py --max-seconds 3600
"""
from __future__ import annotations

import argparse
import io
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: python3 -m pip install pillow")

ROOT = pathlib.Path(__file__).resolve().parents[2]
OBJECTS = ROOT / "shared" / "assets" / "objects"
WORDS = ROOT / "shared" / "data" / "words.json"
LETTER_OBJECTS = ROOT / "shared" / "data" / "letter-objects.json"
SEEDS = (42, 1337, 9001)

# How far the extracted subject may drift from the original before we refuse it.
MAX_MAE = 12.0          # mean abs. error over RGB, composited on white
MAX_BIG_PIXELS = 0.12   # fraction of pixels off by more than 30 levels


def api_base() -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        sys.exit("QLOBE_QWEN_URL is not set (see .claude/skills/local-genai)")
    return base


def _post(url: str, fields: dict, files: dict, timeout: int = 900) -> bytes:
    boundary = "----qlobe" + str(int(time.time() * 1000))
    body = io.BytesIO()
    for k, v in fields.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode())
        body.write(f"{v}\r\n".encode())
    for k, (name, data) in files.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(f'Content-Disposition: form-data; name="{k}"; filename="{name}"\r\n'.encode())
        body.write(b"Content-Type: application/octet-stream\r\n\r\n")
        body.write(data)
        body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        url, data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def to_grey(base: str, src: pathlib.Path, seed: int) -> bytes:
    return _post(
        f"{base}/workflows/qwen-image-edit?sync=true",
        {"prompt": "Change to a plain grey background", "seed": str(seed)},
        {"image": (src.name, src.read_bytes())},
    )


def extract(base: str, png: bytes, subject: str, seed: int) -> bytes | None:
    prompt = (
        "Background layer: Plain dark grey background\n"
        f"Top layer: {subject} on a transparent background"
    )
    raw = _post(
        f"{base}/workflows/qwen-image-layered",
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
        {"image": ("in.png", png)},
    )
    job = json.loads(raw).get("job_id")
    if not job:
        return None
    for _ in range(120):
        time.sleep(4)
        with urllib.request.urlopen(f"{base}/jobs/{job}", timeout=60) as r:
            st = json.loads(r.read()).get("status")
        if st == "completed":
            with urllib.request.urlopen(
                f"{base}/jobs/{job}/result?output=layer_2", timeout=300
            ) as r:
                return r.read()
        if st == "failed":
            return None
    return None


def judge(cut: bytes, original: pathlib.Path) -> tuple[bool, str]:
    """Same art minus its background, or different art? Refuse the latter."""
    new = Image.open(io.BytesIO(cut)).convert("RGBA")
    old = Image.open(original).convert("RGBA")
    W, H = old.size

    a = new.getchannel("A").histogram()
    tot = sum(a)
    transp = sum(a[:8]) / tot
    opaque = sum(a[248:]) / tot
    if transp < 0.15:
        return False, f"barely transparent ({transp:.0%}) — got a plate back"
    if opaque < 0.05:
        return False, f"near-blank ({opaque:.0%} opaque)"

    ob = Image.new("RGB", (W, H), (255, 255, 255)); ob.paste(old, (0, 0), old)
    nr = new.resize((W, H), Image.LANCZOS)
    nb = Image.new("RGB", (W, H), (255, 255, 255)); nb.paste(nr, (0, 0), nr)
    po, pn = ob.load(), nb.load()
    tot_e = big = n = 0
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            c, d = po[x, y], pn[x, y]
            e = (abs(c[0] - d[0]) + abs(c[1] - d[1]) + abs(c[2] - d[2])) / 3
            tot_e += e
            big += e > 30
            n += 1
    mae, frac = tot_e / n, big / n
    if mae > MAX_MAE or frac > MAX_BIG_PIXELS:
        return False, f"art changed — MAE {mae:.1f}, {frac:.1%} of pixels off"
    return True, f"transp {transp:.0%} MAE {mae:.1f} off {frac:.1%}"


def subjects() -> dict[str, str]:
    """Best available description per word, for the layered prompt.

    This is load-bearing, not a nicety. The extractor separates by recognising
    the subject, so "Top layer: big on a transparent background" gives it
    nothing to find and it hands back an opaque plate. Both data files carry a
    real `img` description ("a cute friendly purple bat with round wings") —
    use it. An earlier version of this function silently resolved to {} through
    an operator-precedence bug and every sprite got its bare word instead;
    12 of the first 16 takes came back as plates.
    """
    out: dict[str, str] = {}
    if WORDS.exists():
        data = json.loads(WORDS.read_text())
        words = data.get("words", []) if isinstance(data, dict) else data
        for w in words:
            if isinstance(w, dict) and w.get("word"):
                out[w["word"]] = w.get("img") or w["word"]
    for v in json.loads(LETTER_OBJECTS.read_text())["objects"].values():
        for o in v:
            out[o["word"]] = o.get("img") or o["word"]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "tmp" / "objects-webp"))
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--max-seconds", type=float, default=0.0)
    args = ap.parse_args()

    base = api_base()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "source").mkdir(exist_ok=True)
    desc = subjects()

    todo = sorted(OBJECTS.glob("*.png"))
    if args.only:
        want = set(args.only)
        todo = [p for p in todo if p.stem in want]

    report = out / "report.json"
    log = json.loads(report.read_text()) if report.exists() else {}
    started = time.time()
    passthru = keyed = failed = skipped = 0

    for i, src in enumerate(todo, 1):
        word = src.stem
        dst = out / f"{word}.webp"
        if dst.exists() and not args.force:
            skipped += 1
            continue

        im = Image.open(src).convert("RGBA")
        a = im.getchannel("A").histogram()
        if sum(a[:8]) / sum(a) >= 0.01:
            # Already transparent — re-container only, never touch the pixels.
            im.save(dst, lossless=True, method=6)
            log[word] = {"action": "passthrough", "bytes": dst.stat().st_size}
            passthru += 1
            continue

        if args.max_seconds and time.time() - started > args.max_seconds:
            print(f"\n-- stopping at the {args.max_seconds:.0f}s budget; re-run to continue")
            break

        subject = desc.get(word, word)
        print(f"[{i}/{len(todo)}] {word} ({subject})", flush=True)
        done = False
        for seed in SEEDS:
            try:
                grey = to_grey(base, src, seed)
                cut = extract(base, grey, subject, seed)
                if not cut:
                    print(f"    seed {seed}: extractor failed")
                    continue
                ok, why = judge(cut, src)
                if not ok:
                    print(f"    seed {seed}: rejected — {why}")
                    continue
                new = Image.open(io.BytesIO(cut)).convert("RGBA").resize(im.size, Image.LANCZOS)
                new.save(dst, lossless=True, method=6)
                (out / "source" / f"{word}-grey-{seed}.png").write_bytes(grey)
                print(f"    seed {seed}: OK — {why} -> {dst.stat().st_size:,}B")
                log[word] = {"action": "keyed", "seed": seed,
                             "bytes": dst.stat().st_size, "note": why}
                keyed += 1
                done = True
                break
            except (urllib.error.URLError, OSError, ValueError) as exc:
                print(f"    seed {seed}: {type(exc).__name__}: {exc}")
        if not done:
            failed += 1
            log[word] = {"action": "FAILED"}
        report.write_text(json.dumps(log, indent=2, sort_keys=True))

    print(f"\ndone: {keyed} keyed, {passthru} passed through, "
          f"{skipped} already staged, {failed} failed")
    print(f"staged in {out} — review, then promote into shared/assets/objects/")


if __name__ == "__main__":
    main()
