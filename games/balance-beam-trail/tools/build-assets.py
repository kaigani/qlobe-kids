"""Build Balance Beam Trail runtime art from committed source PNGs.

Deterministic, resumable: each output is replaced atomically only after encoding.
"""
from pathlib import Path
from PIL import Image, ImageChops
import os

HERE = Path(__file__).resolve().parents[1]
SRC = HERE / "assets" / "source"
MASTER = SRC / "gpt-image-2"
CUTS = SRC / "cuts"
OUT = HERE / "assets" / "art"
QA = SRC / "qa"
OUT.mkdir(parents=True, exist_ok=True); QA.mkdir(parents=True, exist_ok=True)

BACKGROUNDS = {n: f"{n}-master.png" for n in ("select-backdrop", "log-stage", "lava-stage", "hop-stage")}
FERNS = {"ready":"ready", "left-step":"left-step", "right-step":"right-step", "wobble-left":"wobble-left", "wobble-right":"wobble-right", "celebrate":"celebrate"}
UI = {"card-log":"card-log", "card-lava":"card-lava", "card-hop":"card-hop", "action-button":"action-button", "balance-rail":"balance-rail", "star":"star", "finish-flag":"finish-flag", "sound":"sound"}

def require(path):
    if not path.is_file() or path.stat().st_size == 0: raise FileNotFoundError(path)
    return Image.open(path).copy()

def atomic_save(im, path, **kw):
    tmp = path.with_suffix(path.suffix + ".tmp")
    im.save(tmp, format="WEBP", **kw); os.replace(tmp, path)

def alpha_clean(im):
    im = im.convert("RGBA")
    a = im.getchannel("A").point(lambda v: 0 if v <= 224 else (1 + (v-225)*254//29 if v < 255 else 255))
    if a.getbbox() is None: raise ValueError("empty alpha")
    r,g,b,_ = im.split()
    return Image.merge("RGBA", (r,g,b,a))

def trim_pad(im, pad=8):
    box = im.getchannel("A").getbbox()
    if not box: raise ValueError("empty alpha")
    l,t,r,b=box; im=im.crop((l,t,r,b)); out=Image.new("RGBA", (im.width+pad*2,im.height+pad*2)); out.alpha_composite(im,(pad,pad)); return out

def qa(im, name):
    bg=Image.new("RGBA", im.size, (255,0,180,255)); bg.alpha_composite(im); bg.convert("RGB").save(QA/f"final-{name}.jpg", quality=90, optimize=True)

def main():
    report=[]
    for name, fn in BACKGROUNDS.items():
        im=require(MASTER/fn).convert("RGB"); target=(1448,1086)
        scale=max(target[0]/im.width,target[1]/im.height); im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
        left=(im.width-target[0])//2; top=(im.height-target[1])//2; im=im.crop((left,top,left+target[0],top+target[1]))
        atomic_save(im,OUT/f"{name}.webp",quality=82,method=6); report.append((name,OUT/f"{name}.webp"))
    # Completion scene follows the same opaque backdrop treatment.
    im=require(MASTER/'complete-stage-master.png').convert('RGB'); target=(1448,1086)
    scale=max(target[0]/im.width,target[1]/im.height); im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
    left=(im.width-target[0])//2; top=(im.height-target[1])//2; im=im.crop((left,top,left+target[0],top+target[1]))
    atomic_save(im,OUT/'complete-stage.webp',quality=82,method=6); report.append(('complete-stage',OUT/'complete-stage.webp'))
    # Hub tile is a fixed 640x533 JPEG for the platform tile grid.
    im=require(MASTER/'hub-tile-master.png').convert('RGB'); target=(640,533)
    scale=max(target[0]/im.width,target[1]/im.height); im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
    left=(im.width-target[0])//2; top=(im.height-target[1])//2; im=im.crop((left,top,left+target[0],top+target[1]))
    hub=HERE.parents[1]/'assets'/'hub'/'tiles'/'balance-beam-trail.jpg'; hub.parent.mkdir(parents=True,exist_ok=True); im.save(hub,format='JPEG',quality=88,optimize=True); print(f'hub-tile              {hub.stat().st_size:7} bytes')
    title=trim_pad(alpha_clean(require(MASTER/'title-lockup-master.png')),12)
    if title.width>1100: title=title.resize((1100,round(title.height*1100/title.width)),Image.Resampling.LANCZOS)
    atomic_save(title,OUT/'title-lockup.webp',quality=90,method=6); qa(title,'title-lockup'); report.append(('title-lockup',OUT/'title-lockup.webp'))
    for name, fn in FERNS.items():
        im=trim_pad(alpha_clean(require(CUTS/'fern'/f'{fn}.png')),8); scale=min(1,600/im.height,490/im.width); im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
        out=Image.new('RGBA',(520,640)); out.alpha_composite(im,((520-im.width)//2,640-im.height-8)); atomic_save(out,OUT/f'fern-{name}.webp',quality=90,method=6); qa(out,f'fern-{name}'); report.append((f'fern-{name}',OUT/f'fern-{name}.webp'))
    for name, fn in UI.items():
        source=require(MASTER/'balance-rail-clean-master.png') if name == 'balance-rail' else require(CUTS/'ui'/f'{fn}.png')
        # The generated sheet left a detached white divider in the first 18 px
        # of the action-button crop. Remove only that known source strip before
        # alpha normalization; the flower and button begin farther right.
        if name == 'action-button': source=source.crop((18,0,source.width,source.height))
        im=trim_pad(alpha_clean(source),6); limit=520 if name.startswith('card-') else 640; scale=min(1,limit/max(im.width,im.height));
        if scale<1: im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
        atomic_save(im,OUT/f'{name}.webp',quality=90,method=6); qa(im,name); report.append((name,OUT/f'{name}.webp'))
    print(f"built {len(report)} assets")
    for n,p in report: print(f"{n:20} {p.stat().st_size:7} bytes")
    # Decode and enforce alpha/corner checks.
    for n,p in report:
        im=Image.open(p); im.load()
        if n != 'complete-stage' and n not in BACKGROUNDS and im.mode != 'RGBA': raise AssertionError(f'{n}: no alpha')
        if n != 'complete-stage' and n not in BACKGROUNDS and im.getpixel((0,0))[3] != 0: raise AssertionError(f'{n}: corner not transparent')
    for n in FERNS:
        if Image.open(OUT/f'fern-{n}.webp').size != (520,640): raise AssertionError(n)

if __name__ == '__main__': main()
