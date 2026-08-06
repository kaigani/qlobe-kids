#!/usr/bin/env python3
"""Deterministically remove chroma, crop sheets, normalize and encode art."""
from pathlib import Path
import json, subprocess
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets/source/gpt-image-2'
OUT = ROOT / 'assets'
TMP = ROOT / 'assets/source/processed'
HELPER = Path('/Users/kaigani/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py')

def keyed(name):
    p = TMP / (Path(name).stem + '.png'); p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        subprocess.run(['python3', str(HELPER), '--input', str(SRC/name), '--out', str(p), '--auto-key', 'border', '--soft-matte', '--transparent-threshold','12','--opaque-threshold','220','--despill','--force'], check=True)
    return Image.open(p).convert('RGBA')

def bbox(im):
    a = im.getchannel('A'); b = a.getbbox()
    return im.crop(b) if b else im

def save(im, rel, size=None, opaque=False):
    if size:
        scale=min(size[0]/im.width,size[1]/im.height)
        im=im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.Resampling.LANCZOS)
        c = Image.new('RGBA', size, (0,0,0,0)); c.paste(im, ((size[0]-im.width)//2,(size[1]-im.height)//2), im); im=c
    if opaque: im = im.convert('RGB')
    path = OUT / rel; path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, 'WEBP', quality=92, method=4)

def sheet(name, cols, rows, inset=10):
    im=keyed(name); w,h=im.size
    return [[im.crop((c*w//cols+inset,r*h//rows+inset,(c+1)*w//cols-inset,(r+1)*h//rows-inset)) for c in range(cols)] for r in range(rows)]

def pip(cell):
    s=bbox(cell); scale=min(620/s.width,760/s.height); s=s.resize((round(s.width*scale),round(s.height*scale)),Image.Resampling.LANCZOS)
    c=Image.new('RGBA',(720,820),(0,0,0,0)); c.paste(s,((720-s.width)//2,780-s.height),s); return c

def carrier(cell, size, fill=.94):
    s=bbox(cell); target=(round(size[0]*fill),round(size[1]*fill)); s=s.resize(target,Image.Resampling.LANCZOS)
    c=Image.new('RGBA',size,(0,0,0,0)); c.paste(s,((size[0]-s.width)//2,(size[1]-s.height)//2),s); return c

def sparkle_clean(im):
    im=im.copy(); im.putalpha(im.getchannel('A').point(lambda v: v if v >= 120 else 0)); return im

def music_clean(im):
    im=im.copy(); px=im.load();
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=px[x,y]
            if a < 24: px[x,y]=(r,g,b,0)
            else:
                if max(r,g,b)-min(r,g,b) < 45 and max(r,g,b) < 150: r,g,b=108,42,176
                px[x,y]=(r,g,b,max(a,220))
    return im

def freeze_clean(im, source):
    im=im.copy(); source=source.convert('RGB'); w,h=im.size; pix=im.load(); source_pix=source.load()
    mask=Image.new('L',(w,h),0); mask_pix=mask.load()
    for y in range(h):
        for x in range(w):
            r,g,b=source_pix[x,y]
            magenta=r>150 and b>125 and min(r,b)-g>68
            if not magenta: mask_pix[x,y]=255
    mask=mask.filter(ImageFilter.GaussianBlur(1.1)); mask_pix=mask.load()
    for y in range(h):
        for x in range(w):
            alpha=mask_pix[x,y]
            if alpha:
                r,g,b=source_pix[x,y]
                blue=(b-r)>45 and (g-r)>20 and b>100
                magenta_edge=r>135 and b>110 and min(r,b)-g>35
                if magenta_edge: r,g,b=(240,218,181)
                elif not blue and max(r,g,b)<190: r,g,b=(154,118,82)
                pix[x,y]=(r,g,b,alpha)
            else: pix[x,y]=(0,0,0,0)
    return im

def main():
    report=[]
    for n in ('forest-day.png','forest-night.png'):
        im=Image.open(SRC/n).convert('RGB').resize((1600,1200),Image.Resampling.LANCZOS); save(im,'scenes/'+n.replace('.png','.webp'),opaque=True)
    # lockups and single props
    for source,out,size in [('title-chroma.png','ui/title.webp',(1200,460)),('freeze-chroma.png','ui/freeze.webp',(1050,340))]:
        art=keyed(source)
        if source.startswith('freeze'): art=freeze_clean(art,Image.open(SRC/source))
        save(bbox(art),out,size)
    p=sheet('pip-poses-chroma.png',3,2, inset=8); names={(0,0):'pip-dance.webp',(1,0):'pip-freeze.webp',(2,0):'pip-cheer.webp',(0,1):'pip-wide.webp',(1,1):'pip-tall.webp',(2,1):'pip-tiny.webp'}
    for rc,n in names.items(): save(pip(p[rc[1]][rc[0]]),'characters/'+n)
    # duplicate wide source as star silhouette where inventory requires it
    save(pip(p[1][0]),'characters/pip-star.webp')
    a=sheet('animals-chroma.png',4,2, inset=8); an=['owl','fox','raccoon','bunny']
    for i,n in enumerate(an): save(bbox(a[0][i]),f'animals/{n}-hidden.webp',(360,360)); save(bbox(a[1][i]),f'animals/{n}-reveal.webp',(560,640))
    m=sheet('mode-cards-chroma.png',3,1, inset=28)
    # Keep a generous transparent inset around the irregular clay rims. Without
    # it, the cards read as clipped when three are packed into short-wide screens.
    for i,n in enumerate(('mode-dance','mode-lookout','mode-statues')): save(carrier(m[0][i],(520,420),.88),f'ui/{n}.webp')
    u=sheet('ui-props-chroma.png',3,3, inset=30); un={(0,0):('camera',(300,300)),(0,1):('skip-star',(300,300)),(0,2):('mirror-frame',(560,420)),(1,0):('prompt-plaque',(900,210)),(1,1):('action-button',(900,280)),(1,2):('focus-star',(650,650)),(2,0):('snowflake',(480,480)),(2,1):('music-note',(480,480)),(2,2):('sparkle-cluster',(160,160))}
    carriers={'mirror-frame','prompt-plaque','action-button'}
    for (r,c),(n,sz) in un.items():
        art=carrier(u[r][c],sz) if n in carriers else bbox(u[r][c])
        if n == 'sparkle-cluster': art=sparkle_clean(art)
        if n == 'music-note': art=music_clean(art)
        save(art,f'ui/{n}.webp',None if n in carriers else sz)
    # QA contact sheet: magenta backing makes halos obvious
    files=sorted((OUT/'scenes').glob('*.webp'))+sorted((OUT/'characters').glob('*.webp'))+sorted((OUT/'animals').glob('*.webp'))+sorted((OUT/'ui').glob('*.webp'))
    thumb=Image.new('RGB',(1200,((len(files)+5)//6)*180),(255,0,255))
    for i,f in enumerate(files):
        x=(i%6)*200; y=(i//6)*180; q=Image.open(f).convert('RGBA'); q.thumbnail((190,160)); thumb.paste(q,(x+(190-q.width)//2,y),q)
    qa=OUT/'qa'; qa.mkdir(exist_ok=True); thumb.save(qa/'contact-magenta.webp','WEBP',quality=88,method=4)
    for f in files:
        im=Image.open(f); a=im.getchannel('A') if 'A' in im.getbands() else None
        near_white_border = any(all(v > 245 for v in im.convert('RGB').getpixel((x,y))) for x,y in [(x,0) for x in range(im.width)]+[(x,im.height-1) for x in range(im.width)]+[(0,y) for y in range(im.height)]+[(im.width-1,y) for y in range(im.height)])
        bb=a.getbbox() if a else None
        report.append({'file':str(f.relative_to(OUT)),'width':im.width,'height':im.height,'alpha':a is not None,'bbox_occupancy': [round((bb[2]-bb[0])/im.width,3),round((bb[3]-bb[1])/im.height,3)] if bb else [0,0],'opaque_corners': bool(a and all(a.getpixel(pt)>250 for pt in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)])),'near_white_border':near_white_border})
    (qa/'report.json').write_text(json.dumps({'assets':report},indent=2))

if __name__=='__main__': main()
