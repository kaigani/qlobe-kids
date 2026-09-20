#!/usr/bin/env python3
"""Build Song Story Remix runtime art from accepted source masters.

This intentionally delegates sheet detection/cropping to the shared cutter.
It is resumable: existing outputs are replaced deterministically and every
source is hashed in the process report.
"""
from __future__ import annotations
import hashlib, json, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets/source/gpt-image-2"
CROPS = ROOT / "assets/source/crops"
ART = ROOT / "assets/art"
QA = ROOT / "assets/source/qa"
CUTTER = ROOT.parents[1] / "tools/cut-asset-sheet.py"
LAYERED_CARD_SOURCE = ROOT / "assets/source/local-api/layered/song-cards-seed42-layer-2.png"
SHEETS = {
    "title": ("title-lockup.png", ["title"]),
    "cards": ("song-cards-sheet.png", ["rainy-day", "space-trip", "jungle-walk"]),
    "tokens": ("story-tokens-sheet.png", ["raindrop", "duck", "umbrella", "star", "frog", "bird", "tiger", "monkey", "parrot"]),
    "performers": ("performers-sheet.png", ["leo", "bird-band", "frog-band", "tiger-band"]),
    "controls": ("controls-sheet.png", ["play", "record", "stop", "replay", "save", "library"]),
    "ui": ("camera-frame.png", ["camera-frame"]),
}
BACKGROUNDS = ["select-background.png", "remix-background.png", "concert-background.png"]

def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()

def save_webp(im, path, alpha=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=88 if alpha else 84, method=6)

def trim(im, pad=10):
    im = im.convert("RGBA")
    box = im.getchannel("A").getbbox()
    if not box: raise ValueError(f"fully transparent: {im}")
    l,t,r,b = box
    return im.crop((max(0,l-pad), max(0,t-pad), min(im.width,r+pad), min(im.height,b+pad)))

def cover(im, size):
    """Resize and center-crop without stretching."""
    target_w, target_h = size
    scale = max(target_w / im.width, target_h / im.height)
    resized = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))

def main():
    for path in SRC.glob("*.png"):
        if path.stat().st_size == 0: raise RuntimeError(f"empty source: {path}")
    if not LAYERED_CARD_SOURCE.is_file():
        raise RuntimeError(f"missing accepted Qwen Layered alpha source: {LAYERED_CARD_SOURCE}")
    QA.mkdir(parents=True, exist_ok=True); ART.mkdir(parents=True, exist_ok=True)
    report = {"cutter": str(CUTTER.relative_to(ROOT.parents[1])), "sources": {}, "assets": []}
    with Image.open(LAYERED_CARD_SOURCE) as layered:
        report["sources"][str(LAYERED_CARD_SOURCE.relative_to(ROOT))] = {
            "sha256": sha(LAYERED_CARD_SOURCE), "dimensions": list(layered.size),
            "purpose": "accepted Qwen Image Layered alpha mask for full-resolution cards",
        }
    qa_items = []
    for folder, (filename, names) in SHEETS.items():
        source = SRC / filename; out = CROPS / folder; out.mkdir(parents=True, exist_ok=True)
        cmd = [sys.executable, str(CUTTER), str(source), str(out), "--names", *names,
               "--expected-count", str(len(names)), "--padding", "12", "--force",
               "--debug-mask", str(out / "mask.png")]
        subprocess.run(cmd, check=True, cwd=ROOT.parents[1])
        manifest = json.loads((out / "boxes.json").read_text(encoding="utf-8"))
        boxes = {asset["name"]: asset["cropBbox"] for asset in manifest["assets"]}
        layered_alpha = None
        if folder == "cards":
            with Image.open(source) as source_image:
                source_size = source_image.size
            with Image.open(LAYERED_CARD_SOURCE) as layered:
                layered_alpha = layered.convert("RGBA").getchannel("A").resize(
                    source_size, Image.Resampling.LANCZOS
                )
        for name in names:
            p = out / f"{name}.png"
            im = Image.open(p).convert("RGBA")
            alpha_source = None
            if layered_alpha is not None:
                alpha = layered_alpha.crop(tuple(boxes[name]))
                if alpha.size != im.size:
                    alpha = alpha.resize(im.size, Image.Resampling.LANCZOS)
                im.putalpha(alpha)
                alpha_source = str(LAYERED_CARD_SOURCE.relative_to(ROOT))
            im = trim(im)
            im.thumbnail((720, 720) if folder == "ui" else (960, 960), Image.Resampling.LANCZOS)
            runtime_folder = "ui" if folder in {"title", "controls", "ui"} else folder
            dest = ART / runtime_folder / f"{name}.webp"; save_webp(im, dest, True)
            qa_items.append((f"{runtime_folder}/{name}", im)); report["assets"].append({"name":f"{runtime_folder}/{name}","source":str(p.relative_to(ROOT)),"alphaSource":alpha_source,"output":str(dest.relative_to(ROOT)),"dimensions":list(im.size),"bytes":dest.stat().st_size,"alpha":True})
        report["sources"][filename] = {"sha256": sha(source), "dimensions": list(Image.open(source).size)}
    for filename in BACKGROUNDS:
        source = SRC / filename; im = Image.open(source).convert("RGB"); im.thumbnail((1920,1080), Image.Resampling.LANCZOS)
        dest = ART / "backgrounds" / filename.replace(".png", ".webp"); save_webp(im, dest, False)
        qa_items.append((f"backgrounds/{filename}", im)); report["assets"].append({"name":f"backgrounds/{filename}","source":str(source.relative_to(ROOT)),"output":str(dest.relative_to(ROOT)),"dimensions":list(im.size),"bytes":dest.stat().st_size,"alpha":False}); report["sources"][filename]={"sha256":sha(source),"dimensions":list(Image.open(source).size)}
    og = cover(Image.open(SRC / "concert-background.png").convert("RGB"), (1200, 630))
    title = trim(Image.open(SRC / "title-lockup.png"), 8)
    title.thumbnail((820, 230), Image.Resampling.LANCZOS)
    og.paste(title, ((og.width - title.width) // 2, 24), title)
    og_path = ROOT / "assets/og-image.jpg"
    og.save(og_path, "JPEG", quality=86, optimize=True, progressive=True)
    report["assets"].append({"name":"og-image","source":"assets/source/gpt-image-2/concert-background.png + title-lockup.png","output":"assets/og-image.jpg","dimensions":[1200,630],"bytes":og_path.stat().st_size,"alpha":False})
    cols=4; tw,th=300,230; canvas=Image.new("RGB",(cols*tw,((len(qa_items)+cols-1)//cols)*th),"#ff00ff"); d=ImageDraw.Draw(canvas)
    for i,(name,im) in enumerate(qa_items):
        im.thumbnail((tw-20,th-35)); x=i%cols*tw+(tw-im.width)//2; y=i//cols*th+25; canvas.paste(im,(x,y),im if im.mode=="RGBA" else None); d.text((i%cols*tw+8,i//cols*th+6),name,fill="white")
    canvas.save(QA/"qa-magenta.jpg", "JPEG", quality=90)
    (QA/"process-report.json").write_text(json.dumps(report,indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"assets":len(report["assets"]),"report":str((QA/"process-report.json").relative_to(ROOT))},indent=2))
if __name__ == "__main__": main()
