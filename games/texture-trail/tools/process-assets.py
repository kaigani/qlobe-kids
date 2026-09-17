#!/usr/bin/env python3
"""Build Texture Trail runtime assets and deterministic magenta QA previews."""
from __future__ import annotations
import hashlib, json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / "assets"
SRC = ASSET / "source"
QA = SRC / "qa"

def sha256(p):
    h = hashlib.sha256(); h.update(p.read_bytes()); return h.hexdigest()

def alpha_stats(im):
    if "A" not in im.getbands(): return None
    a = im.getchannel("A"); hist = a.histogram(); n = im.width * im.height
    return {"transparentPct": round(hist[0] * 100 / n, 3), "opaquePct": round(hist[255] * 100 / n, 3),
            "partialPct": round((n - hist[0] - hist[255]) * 100 / n, 3)}

def cutout(src, dst, qa, max_size=640, pad=12):
    im = Image.open(src).convert("RGBA")
    a = im.getchannel("A"); box = a.getbbox()
    if box:
        l,t,r,b = box; box = (max(0,l-pad), max(0,t-pad), min(im.width,r+pad), min(im.height,b+pad)); im = im.crop(box)
    if max(im.size) > max_size:
        s = max_size / max(im.size); im = im.resize((max(1,round(im.width*s)), max(1,round(im.height*s))), Image.Resampling.LANCZOS)
    im.save(dst, "WEBP", lossless=True, method=6)
    bg = Image.new("RGBA", im.size, (255,0,255,255)); bg.alpha_composite(im); bg.convert("RGB").save(qa, "PNG", optimize=True)
    return {"source": str(src.relative_to(ROOT)), "output": str(dst.relative_to(ROOT)), "qa": str(qa.relative_to(ROOT)), "dimensions": list(im.size), "bytes": dst.stat().st_size, "alpha": alpha_stats(im)}

def main():
    for d in (ASSET/"art", ASSET/"characters", ASSET/"objects", ASSET/"world", QA, ASSET/"hub"/"tiles"):
        d.mkdir(parents=True, exist_ok=True)
    outputs = {}; sources = {}
    for p in sorted(SRC.rglob("*.png")):
        if "qa" not in p.parts: sources[str(p.relative_to(ROOT))] = sha256(p)
    world = SRC/"gpt-image-2"/"clay-garden-world.png"
    im = Image.open(world).convert("RGB"); target=(1200,900)
    im.thumbnail(target, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", target, (238,224,196)); canvas.paste(im, ((target[0]-im.width)//2,(target[1]-im.height)//2))
    wp=ASSET/"world"/"clay-garden-world.webp"; canvas.save(wp,"WEBP",quality=82,method=6)
    outputs["world"]={"source":str(world.relative_to(ROOT)),"output":str(wp.relative_to(ROOT)),"dimensions":list(canvas.size),"bytes":wp.stat().st_size,"budgetBytes":300000,"budgetPass":wp.stat().st_size<=300000,"alpha":None}
    mappings=[("gpt-image-2/title-lockup.png","art/title-lockup.webp",640),
      ("crops/snails/snail-cheer.png","characters/snail-cheer.webp",320),("crops/snails/snail-hint.png","characters/snail-hint.webp",320),("crops/snails/snail-point.png","characters/snail-point.webp",320),("crops/snails/snail-wait.png","characters/snail-wait.webp",320)]
    for p in sorted((SRC/"crops"/"texture-kit").glob("*.png")): mappings.append((str(p.relative_to(SRC)),"art/"+p.stem+".webp",320))
    for p in sorted((SRC/"crops"/"objects").glob("*.png")): mappings.append((str(p.relative_to(SRC)),"objects/"+p.stem+".webp",320))
    for rel,out,ms in mappings:
        s=SRC/rel; d=ASSET/out; q=QA/(Path(out).stem+"-magenta.png"); outputs[out]=cutout(s,d,q,ms)
    hubsrc=SRC/"gpt-image-2"/"hub-tile-source.png"; hi=Image.open(hubsrc).convert("RGB"); hi=hi.resize((640,533),Image.Resampling.LANCZOS)
    hp=ASSET/"hub"/"tiles"/"texture-trail.jpg"; hi.save(hp,"JPEG",quality=90,optimize=True)
    outputs["hub/tiles/texture-trail.jpg"]={"source":str(hubsrc.relative_to(ROOT)),"output":str(hp.relative_to(ROOT)),"dimensions":[640,533],"bytes":hp.stat().st_size,"alpha":None}
    (SRC/"processing.json").write_text(json.dumps({"processor":"texture-trail/process-assets.py","sources":sources,"outputs":outputs},indent=2)+"\n",encoding="utf-8")
    if outputs["world"]["budgetPass"] is False: raise SystemExit("world exceeds 300KB")
    print(json.dumps({"outputs":len(outputs),"worldBytes":outputs["world"]["bytes"],"qa":len(list(QA.glob("*.png")))},indent=2))
if __name__ == "__main__": main()
