"""Deterministic production asset cutter for Sandpaper Number Match."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'games' / 'sandpaper-number-match'
SRC = GAME / 'assets' / 'source'
ART = GAME / 'assets' / 'art'
QA = SRC / 'qa' / 'magenta'

def sha(path):
    h=hashlib.sha256(); h.update(path.read_bytes()); return h.hexdigest()
def ensure(path, force):
    if path.exists() and not force: raise FileExistsError(f'refusing overwrite: {path}')
def trim(im):
    im=im.convert('RGBA'); a=im.getchannel('A')
    if a.getbbox() is None: raise ValueError('fully transparent asset')
    return im.crop(a.getbbox())
def pad(im, ratio=.04):
    p=max(1,round(max(im.size)*ratio)); out=Image.new('RGBA',(im.width+2*p,im.height+2*p)); out.paste(im,(p,p),im); return out
def fit(im, limit):
    if max(im.size)>limit: im.thumbnail((limit,limit),Image.Resampling.LANCZOS)
    return im
def record(records, source, final, method):
    records.append({'source':source.relative_to(ROOT).as_posix(),'final':final.relative_to(ROOT).as_posix(),'sha256':sha(final),'dimensions':list(Image.open(final).size),'method':method})
def save_alpha(source, final, limit, records, force):
    ensure(final,force); im=fit(pad(trim(Image.open(source))),limit); im.save(final,'WEBP',quality=92,method=6,exact=True); record(records,source,final,'alpha-trim 4% pad, Lanczos fit, alpha WebP quality 92')
def save_magenta(source, final, force):
    ensure(final,force); im=Image.open(source).convert('RGBA'); bg=Image.new('RGBA',im.size,(255,0,170,255)); bg.alpha_composite(im); bg.convert('RGB').save(final,'PNG')
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--force',action='store_true'); args=ap.parse_args()
    ART.mkdir(parents=True,exist_ok=True); QA.mkdir(parents=True,exist_ok=True)
    records=[]
    world=SRC/'gpt-image-2/world-backdrop-master.png'; out=ART/'world-backdrop.webp'; ensure(out,args.force); Image.open(world).convert('RGB').resize((1448,1086),Image.Resampling.LANCZOS).save(out,'WEBP',quality=86,method=6); record(records,world,out,'RGB resize 1448x1086, quality 86 WebP')
    files=list((SRC/'crops/numerals').glob('numeral-*.png'))+list((SRC/'crops/ui-props').glob('*.png'))
    if len(files)!=22: raise ValueError(f'expected 22 cropped assets, found {len(files)}')
    for source in files:
        limit=480 if source.parent.name=='numerals' or source.stem.startswith(('nav-','star-','pencil','rosette')) else 640
        final=ART/(source.stem+'.webp'); save_alpha(source,final,limit,records,args.force)
        save_magenta(final,QA/(source.stem+'.png'),args.force)
    source=SRC/'gpt-image-2/nav-replay-master.png'; final=ART/'nav-replay.webp'; save_alpha(source,final,480,records,args.force)
    save_magenta(final,QA/'nav-replay.png',args.force)
    source=SRC/'gpt-image-2/title-lockup-master.png'; final=ART/'title-lockup.webp'; save_alpha(source,final,800,records,args.force)
    save_magenta(final,QA/'title-lockup.png',args.force)
    source=SRC/'local-api/hub-krea-seed42.png'; final=ROOT/'assets/hub/tiles/sandpaper-number-match.jpg'; final.parent.mkdir(parents=True,exist_ok=True); ensure(final,args.force); im=Image.open(source).convert('RGB'); ratio=max(640/im.width,533/im.height); im=im.resize((round(im.width*ratio),round(im.height*ratio)),Image.Resampling.LANCZOS); left=(im.width-640)//2; top=(im.height-533)//2; im.crop((left,top,left+640,top+533)).save(final,'JPEG',quality=90,optimize=True); record(records,source,final,'center crop 640x533, JPEG quality 90')
    manifest=SRC/'processing.json'; ensure(manifest,args.force); manifest.write_text(json.dumps({'tool':'build-assets.py','assets':records},indent=2)+'\n',encoding='utf-8')
if __name__=='__main__': main()
