#!/usr/bin/env python3
"""Build Texture Trail runtime assets and deterministic magenta QA previews."""
from __future__ import annotations
import hashlib, json, subprocess, shutil
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
    for d in (ASSET/"art", ASSET/"characters", ASSET/"objects", ASSET/"world", QA, ASSET/"source"/"voice", ASSET/"audio"):
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
    # Adversarial art review replacement set: these intentionally overwrite the
    # original soft card/marker and add real raster label/reward furniture.
    for p in sorted((SRC/"crops"/"soft-revision").glob("*.png")): mappings.append((str(p.relative_to(SRC)),"art/"+p.stem+".webp",320))
    for p in sorted((SRC/"crops"/"reward-medals").glob("*.png")): mappings.append((str(p.relative_to(SRC)),"art/"+p.stem+".webp",320))
    for rel,out,ms in mappings:
        s=SRC/rel; d=ASSET/out; q=QA/(Path(out).stem+"-magenta.png"); outputs[out]=cutout(s,d,q,ms)
    hubsrc=SRC/"gpt-image-2"/"hub-tile-source.png"; hi=Image.open(hubsrc).convert("RGB"); hi=hi.resize((640,533),Image.Resampling.LANCZOS)
    # Catalog artwork lives at repository root, while the game keeps its source.
    repo = ROOT.parents[1]
    hp=repo/"assets"/"hub"/"tiles"/"texture-trail.jpg"; hp.parent.mkdir(parents=True,exist_ok=True); hi.save(hp,"JPEG",quality=90,optimize=True)
    outputs["hub/tiles/texture-trail.jpg"]={"source":str(hubsrc.relative_to(ROOT)),"output":str(hp.relative_to(repo)),"dimensions":[640,533],"bytes":hp.stat().st_size,"alpha":None}
    # Build the shareable Open Graph composition from the same approved source.
    og=Image.open(hubsrc).convert("RGB"); scale=max(1200/og.width,630/og.height); og=og.resize((round(og.width*scale),round(og.height*scale)),Image.Resampling.LANCZOS)
    left=(og.width-1200)//2; top=(og.height-630)//2; og=og.crop((left,top,left+1200,top+630)); ogp=ASSET/"og-image.jpg"; og.save(ogp,"JPEG",quality=90,optimize=True)
    voice_root=ROOT.parents[1]/"shared"/"media"; manifest={"_v": 1}
    runtime_keys = {
        "welcome": "welcome", "choose": "choose", "complete-choice": "completeChoice",
        "bumpy-explore": "bumpyExplore", "bumpy-trail": "bumpyTrail", "bumpy-nudge": "bumpyNudge", "bumpy-success": "bumpySuccess",
        "smooth-explore": "smoothExplore", "smooth-trail": "smoothTrail", "smooth-nudge": "smoothNudge", "smooth-success": "smoothSuccess",
        "ridged-explore": "ridgedExplore", "ridged-trail": "ridgedTrail", "ridged-nudge": "ridgedNudge", "ridged-success": "ridgedSuccess",
        "soft-explore": "softExplore", "soft-trail": "softTrail", "soft-nudge": "softNudge", "soft-success": "softSuccess",
    }
    voice_folders=sorted(voice_root.glob("texture-trail-voice-*"))
    for folder in voice_folders:
        qa_json=folder/"qa-transcript.json"
        if not qa_json.exists() or not json.loads(qa_json.read_text(encoding="utf-8")).get("match"): continue
        audio=next(folder.glob("*.m4a"),None)
        if audio is None: continue
        key=audio.stem.removeprefix("texture-trail-voice-"); dest=ASSET/"audio"/f"{key}.m4a"; shutil.copy2(audio,dest)
        outdir=SRC/"voice"/key; outdir.mkdir(parents=True,exist_ok=True); shutil.copy2(qa_json,outdir/"qa-transcript.json"); shutil.copy2(folder/"recipe.json",outdir/"recipe.json")
        probe=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",str(audio)],capture_output=True,text=True,check=True)
        runtime_key=runtime_keys.get(key)
        if runtime_key: manifest[runtime_key]={"file":f"{key}.m4a","dur":round(float(probe.stdout.strip()),3)}
    manifest_path=ASSET/"audio"/"manifest.json"
    if voice_folders:
        missing=sorted(set(runtime_keys.values())-set(manifest))
        if missing: raise SystemExit(f"missing accepted voice sources: {', '.join(missing)}")
        manifest_path.write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    else:
        # Voice staging is intentionally not shipped. A clean checkout keeps the
        # already accepted M4As and manifest instead of clobbering them.
        existing=json.loads(manifest_path.read_text(encoding="utf-8"))
        missing=sorted(set(runtime_keys.values())-set(existing))
        if missing: raise SystemExit(f"runtime voice manifest is incomplete: {', '.join(missing)}")
    (SRC/"processing.json").write_text(json.dumps({"processor":"texture-trail/process-assets.py","sources":sources,"outputs":outputs},indent=2)+"\n",encoding="utf-8")
    if outputs["world"]["budgetPass"] is False: raise SystemExit("world exceeds 300KB")
    print(json.dumps({"outputs":len(outputs),"worldBytes":outputs["world"]["bytes"],"qa":len(list(QA.glob("*.png")))},indent=2))
if __name__ == "__main__": main()
