#!/usr/bin/env python3
"""Produce Then & Now runtime art (resumable, authoring-time only)."""
from __future__ import annotations
import argparse, datetime as dt, hashlib, io, json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from statistics import median
from urllib.request import Request, urlopen
from PIL import Image, ImageOps, ImageDraw, ImageFilter

GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SRC = GAME / "assets/source"
ART = GAME / "assets/art"
LAYERED = SRC / "local-api/layered"
QAS = SRC / "qa/produced"
FINALIZE = REPO / "tools/pipeline/cutout_finalize.py"
PROMPT = "Separate the foreground toy object(s) into layer_2 with true transparent alpha. Preserve exact shape, colors, texture, scale, and all details; do not repaint, crop, add, or remove anything."
HUB_PROMPT = "premium preschool game menu still life, an open ivory picture book on a pale wood table with one brass magnifying glass bridging the pages; on the left page a chunky toy candle, feather quill and tiny brass phonograph; on the right page a chunky toy lightbulb, colorful keyboard and headphones; one small hourglass and three gold star stickers complete a joyful balanced tableau, bright soft 3D cartoon toy style, rounded simplified forms, cheerful proportions, saturated but gentle aqua coral lemon and lilac palette, smooth painted-wood and soft-vinyl finish, warm studio light, objects only, no child, no person, no writing, no letters, no numbers, no logos, no UI, no border, no watermark"

def api_url():
    value = os.environ.get("QLOBE_QWEN_URL")
    if value: return value.rstrip("/")
    try: value = json.loads((REPO/"tools/state/local.json").read_text()).get("qwenUrl")
    except (OSError, ValueError): value = None
    if not value: raise RuntimeError("QLOBE_QWEN_URL is not configured and tools/state/local.json has no qwenUrl")
    return str(value).rstrip("/")

def multipart(url, fields, image=None):
    boundary = "----qlobe-then-now-" + str(time.time_ns())
    body = io.BytesIO()
    for key, value in fields.items():
        body.write((f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n").encode())
    if image:
        body.write((f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{image.name}\"\r\nContent-Type: image/png\r\n\r\n").encode()); body.write(image.read_bytes()); body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())
    req = Request(url, body.getvalue(), {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urlopen(req, timeout=900) as r: return json.loads(r.read())

def layered(base, source):
    response = multipart(base+"/workflows/qwen-image-layered", {"prompt": PROMPT, "layers":"2", "seed":"42"}, source)
    job = response.get("job_id") or response.get("id")
    if not isinstance(job, str): raise RuntimeError("layered workflow returned no job id")
    deadline = time.monotonic()+1800
    while time.monotonic() < deadline:
        with urlopen(f"{base}/jobs/{job}", timeout=60) as r: state=json.load(r)
        status=str(state.get("status","")).lower()
        if status in {"done","completed","complete","success","succeeded"}:
            with urlopen(f"{base}/jobs/{job}/result?output=layer_2", timeout=300) as r: return r.read()
        if status in {"failed","error","cancelled","canceled"}: raise RuntimeError(f"layered workflow failed: {status}")
        time.sleep(3)
    raise TimeoutError("layered workflow timed out")

def edge_matte(source, output):
    """Remove only the plain sheet colour connected to the crop's edges.

    Qwen Layered is useful evidence, but a generative layer can omit parts of a
    compound object.  This deterministic fallback preserves every authored
    source pixel inside the cutter-detected silhouette.
    """
    image = Image.open(source).convert("RGBA")
    rgb = image.convert("RGB")
    width, height = rgb.size
    border = []
    band = max(2, min(width, height) // 45)
    pixels = rgb.load()
    for y in range(height):
        for x in range(width):
            if x < band or x >= width-band or y < band or y >= height-band:
                border.append(pixels[x, y])
    background = tuple(round(median(pixel[channel] for pixel in border)) for channel in range(3))
    data = bytearray(width*height)
    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            distance = max(abs(pixel[channel]-background[channel]) for channel in range(3))
            residual = tuple(pixel[channel]-background[channel] for channel in range(3))
            chroma = max(residual)-min(residual)
            if distance >= 28 or chroma >= 18:
                data[y*width+x] = 255
    mask = Image.frombytes("L", (width, height), bytes(data))
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))

    # Keep the largest connected authored shape, then fill any interior holes
    # so dark paint inside a carriage, keyboard, or pocket never disappears.
    raw = mask.tobytes()
    seen = bytearray(width*height)
    best = []
    for y in range(height):
        for x in range(width):
            start = y*width+x
            if seen[start] or not raw[start]:
                continue
            seen[start] = 1
            queue = [(x, y)]
            component = []
            while queue:
                px, py = queue.pop()
                component.append((px, py))
                for ny in range(max(0, py-1), min(height, py+2)):
                    for nx in range(max(0, px-1), min(width, px+2)):
                        offset = ny*width+nx
                        if not seen[offset] and raw[offset]:
                            seen[offset] = 1
                            queue.append((nx, ny))
            if len(component) > len(best):
                best = component
    if not best:
        raise RuntimeError(f"edge matte found no subject in {source}")
    subject = Image.new("L", (width, height), 0)
    subject_pixels = subject.load()
    for x, y in best:
        subject_pixels[x, y] = 255
    # Closing plus a light feather retains watercolor edges without a dark box.
    subject = subject.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    subject = subject.filter(ImageFilter.GaussianBlur(.7))
    result = image.copy()
    result.putalpha(subject)
    result.save(output, "PNG", optimize=True)

def recipe(name, workflow, source, output, extra=None):
    data={"format":"qlobe-recipe","formatVersion":1,"id":"then-now-"+name,"kind":"image","asset":str(output.relative_to(REPO)),"steps":[{"workflow":workflow,"source":source.name}],"sourceSha256":hashlib.sha256(source.read_bytes()).hexdigest(),"createdAt":dt.datetime.now(dt.timezone.utc).isoformat()}
    if extra: data["steps"][0].update(extra)
    output.with_suffix(".qlobe-recipe.json").write_text(json.dumps(data,indent=2)+"\n")

def process(name, source, group, base, force, matte_only):
    runtime_group = "cards" if group in {"then", "now"} else "ui"
    raw=LAYERED/(group+"-"+name+".png"); out=ART/runtime_group/(name+".webp"); qa=QAS/(group+"-"+name+"-magenta.png")
    out.parent.mkdir(parents=True,exist_ok=True); LAYERED.mkdir(parents=True,exist_ok=True); QAS.mkdir(parents=True,exist_ok=True)
    if not matte_only and (force or not raw.exists()): raw.write_bytes(layered(base,source))
    if force or not out.exists():
        matte = out.with_suffix(".matte.png")
        temporary = out.with_suffix(".final.png")
        edge_matte(source, matte)
        subprocess.run([sys.executable,str(FINALIZE),"--input",str(matte),"--output",str(temporary),"--magenta",str(qa),"--max-size","640","--pad","12","--alpha-floor","4"],check=True,cwd=REPO)
        Image.open(temporary).convert("RGBA").save(out,"WEBP",quality=90,method=6,exact=True)
        temporary.unlink(); matte.unlink()
    recipe(group+"-"+name,"qwen-image-layered",source,out,{"model":"qwen-image-layered","prompt":PROMPT,"selectedOutput":"source-cut-edge-matte","layeredQa":"attempt retained in assets/source; runtime uses lossless matte after subject-loss review"})
    return out

def hub(base, force, install):
    folder=SRC/"local-api/hub"; folder.mkdir(parents=True,exist_ok=True); raw=folder/"then-now-krea-seed-42.png"; candidate=folder/"then-now-krea-seed-42.jpg"
    if force or not raw.exists():
        result=multipart(base+"/workflows/krea2-turbo-t2i",{"prompt":HUB_PROMPT,"seed":"42","width":"768","height":"640","steps":"8","cfg":"1"}); job=result.get("job_id") or result.get("id")
        if not job: raise RuntimeError("Krea workflow returned no job id")
        for _ in range(900):
            with urlopen(f"{base}/jobs/{job}",timeout=60) as r: state=json.load(r)
            status = str(state.get("status","")).lower()
            if status in {"done","completed","complete","success","succeeded"}:
                with urlopen(f"{base}/jobs/{job}/result",timeout=300) as r: raw.write_bytes(r.read())
                break
            if status in {"failed","error","cancelled","canceled"}:
                raise RuntimeError(f"Krea workflow failed: {state.get('error') or status}")
            time.sleep(1)
        else: raise TimeoutError("Krea workflow timed out")
    if force or not candidate.exists(): ImageOps.fit(Image.open(raw).convert("RGB"),(640,533),Image.Resampling.LANCZOS).save(candidate,"JPEG",quality=91,optimize=True)
    recipe("hub-krea","krea2-turbo-t2i",raw,candidate,{"prompt":HUB_PROMPT,"seed":42,"width":768,"height":640})
    if install:
        final = REPO/"assets/hub/tiles/then-now-sort.jpg"
        final.parent.mkdir(parents=True,exist_ok=True)
        Image.open(candidate).convert("RGB").save(final,"JPEG",quality=91,optimize=True,progressive=True)

def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument("--skip-layered",action="store_true"); p.add_argument("--matte-only",action="store_true",help="export exact cutter crops without new Layered calls"); p.add_argument("--skip-hub",action="store_true"); p.add_argument("--force",action="store_true"); p.add_argument("--install-hub",action="store_true"); p.add_argument("--workers",type=int,default=3); a=p.parse_args()
    base=None if ((a.skip_layered or a.matte_only) and a.skip_hub) else api_url(); sources=[]
    for group in ("then","now","ui"):
        for source in sorted((SRC/"cuts"/group).glob("*.png")): sources.append((group,source))
    if not a.skip_layered:
        with ThreadPoolExecutor(max_workers=max(1,a.workers)) as pool:
            pending={pool.submit(process,source.stem,source,group,base,a.force,a.matte_only):(group,source.name) for group,source in sources}
            for future in as_completed(pending):
                group,name=pending[future]
                output=future.result()
                print(f"asset {group}/{name} -> {output.relative_to(GAME)}",flush=True)
    title=SRC/"cuts/title/title.png"; (ART/"ui").mkdir(parents=True,exist_ok=True)
    if title.exists(): Image.open(title).convert("RGBA").save(ART/"ui/title.webp","WEBP",quality=92,method=6); recipe("title","source-cut",title,ART/"ui/title.webp")
    for path in sorted((SRC/"gpt-image-2").glob("*background*.png")):
        (ART/"backgrounds").mkdir(parents=True,exist_ok=True); Image.open(path).convert("RGB").save(ART/"backgrounds"/(path.stem+".webp"),"WEBP",quality=90,method=6)
    if not a.skip_hub: hub(base,a.force,a.install_hub)
    thumbs=[]
    for path in sorted(ART.glob("**/*.webp")):
        try: thumbs.append((path,Image.open(path).convert("RGB")))
        except OSError: pass
    if thumbs:
        sheet=Image.new("RGB",(800,((len(thumbs)+5)//6)*140),(255,0,180)); draw=ImageDraw.Draw(sheet)
        for index,(path,image) in enumerate(thumbs):
            x=(index%6)*133; y=(index//6)*140
            rgba=Image.open(path).convert("RGBA"); rgba.thumbnail((120,108))
            tile=Image.new("RGBA",(120,108),(255,0,180,255)); tile.alpha_composite(rgba,((120-rgba.width)//2,(108-rgba.height)//2))
            sheet.paste(tile.convert("RGB"),(x,y)); draw.text((x,y+110),path.stem[:18],fill=(255,255,255))
        QAS.mkdir(parents=True,exist_ok=True); sheet.save(QAS/"contact-sheet.jpg",quality=88)
    (QAS/"processing-receipt.json").write_text(json.dumps({"game":"then-now-sort","assets":len(sources),"generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"flags":{"skipLayered":a.skip_layered,"skipHub":a.skip_hub,"installedHub":a.install_hub}},indent=2)+"\n")
    print("processed",len(sources),"cut assets")
if __name__ == "__main__": main()
