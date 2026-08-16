#!/usr/bin/env python3
"""Deterministic offline finalizer for Name Puzzle raster masters."""
from pathlib import Path
from collections import deque
import json
import math
import statistics
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets/source/gpt-image-2'; OUT = ROOT / 'assets'
QA = ROOT / 'assets/source/qa-local'; QA.mkdir(parents=True, exist_ok=True)
ROSTER = 'aria belle ellie emma ezra hazel henry jack james liam levi lily lucas lucy luna mateo noah nora owen sofia'.split()

def matte(im):
    im = im.convert('RGBA'); p = im.load(); w,h=im.size; q=deque()
    seen=set()
    for x in range(w): q.extend([(x,0),(x,h-1)]); seen.update(((x,0),(x,h-1)))
    for y in range(h): q.extend([(0,y),(w-1,y)]); seen.update(((0,y),(w-1,y)))
    while q:
        x,y=q.popleft()
        if not (0<=x<w and 0<=y<h): continue
        r,g,b,a=p[x,y]
        if a==0 or max(r,g,b)>105 or (max(r,g,b)-min(r,g,b)>28): continue
        p[x,y]=(r,g,b,0)
        for n in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if n not in seen: seen.add(n); q.append(n)
    return im

def charcoal_key(im):
    """Remove the flat charcoal everywhere, including gaps enclosed by curls."""
    rgb = im.convert('RGB'); w,h = rgb.size
    border = []
    for x in range(w): border.extend((rgb.getpixel((x,0)), rgb.getpixel((x,h-1))))
    for y in range(h): border.extend((rgb.getpixel((0,y)), rgb.getpixel((w-1,y))))
    bg = tuple(statistics.median(pixel[channel] for pixel in border) for channel in range(3))
    alpha = Image.new('L', (w,h)); out = alpha.load()
    for y in range(h):
        for x in range(w):
            pixel = rgb.getpixel((x,y))
            distance = math.sqrt(sum((pixel[channel]-bg[channel])**2 for channel in range(3)))
            if distance <= 10: value = 0
            elif distance >= 26: value = 255
            else:
                t = (distance-10)/16
                value = round(255*t*t*(3-2*t))
            out[x,y] = value
    rgba = rgb.convert('RGBA'); rgba.putalpha(alpha); return rgba

def trim(im, alpha=True):
    if alpha:
        a=im.getchannel('A'); box=a.point(lambda v: 255 if v>8 else 0).getbbox()
    else: box=im.convert('RGB').getbbox()
    return im.crop(box) if box else im

def fit(im, size, alpha=True):
    im=trim(im,alpha); im.thumbnail(size, Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',size,(0,0,0,0)); canvas.paste(im,((size[0]-im.width)//2,(size[1]-im.height)//2),im if im.mode=='RGBA' else None); return canvas

def alpha_component_boxes(im, minimum=500):
    """Find independent authored objects after the extraction matte is removed."""
    alpha = im.convert('RGBA').getchannel('A'); p = alpha.load(); w,h = im.size
    seen = bytearray(w*h); boxes = []
    for y in range(h):
        for x in range(w):
            pos = y*w+x
            if seen[pos] or p[x,y] <= 8: continue
            seen[pos] = 1; q = deque([(x,y)]); count = 0
            left=right=x; top=bottom=y
            while q:
                px,py = q.popleft(); count += 1
                left=min(left,px); right=max(right,px); top=min(top,py); bottom=max(bottom,py)
                for nx,ny in ((px+1,py),(px-1,py),(px,py+1),(px,py-1)):
                    if not (0<=nx<w and 0<=ny<h): continue
                    npos = ny*w+nx
                    if seen[npos] or p[nx,ny] <= 8: continue
                    seen[npos] = 1; q.append((nx,ny))
            if count >= minimum: boxes.append((count,(left,top,right+1,bottom+1)))
    return [box for _,box in sorted(boxes,reverse=True)]

def save(im,path,quality=90): path.parent.mkdir(parents=True,exist_ok=True); im.save(path,'WEBP',quality=quality,method=6)

for name in ROSTER:
    source = Image.open(SRC/f'{name}-master.png')
    cutout = charcoal_key(source) if name == 'belle' else matte(source)
    save(fit(cutout,(640,720)),OUT/f'characters/{name}.webp')

save(Image.open(SRC/'classroom-master.png').convert('RGB'),OUT/'art/classroom.webp',84)
save(fit(Image.open(SRC/'title-master.png'),(900,600)),OUT/'ui/title.webp')
save(fit(Image.open(SRC/'star-medal-master.png'),(340,420)),OUT/'ui/star-medal.webp')
save(fit(matte(Image.open(SRC/'name-board-master.png')),(1200,1200)),OUT/'ui/name-board.webp')

def grid(master, names, cols, rows, size):
    im=matte(Image.open(SRC/master)); w,h=im.size
    for i,n in enumerate(names):
        c,r=i%cols,i//cols; cell=im.crop((c*w//cols,r*h//rows,(c+1)*w//cols,(r+1)*h//rows))
        save(fit(cell,size),OUT/f'ui/{n}.webp')

def component_grid(master, names, size):
    im=matte(Image.open(SRC/master)); boxes=alpha_component_boxes(im)
    if len(boxes) < len(names): raise RuntimeError(f'{master}: expected {len(names)} isolated objects, found {len(boxes)}')
    boxes=sorted(boxes[:len(names)],key=lambda box: box[0])
    for name,box in zip(names,boxes): save(fit(im.crop(box),size),OUT/f'ui/{name}.webp')
grid('letter-kit-master.png','letter-red letter-orange letter-yellow letter-green letter-teal letter-sky letter-lavender letter-slot'.split(),4,2,(300,300))
grid('panel-kit-master.png','panel-coral panel-mustard panel-green panel-lavender panel-plum panel-teal'.split(),3,2,(560,360))
component_grid('navigation-kit-master.png','hud-home hud-back hud-sound pager-prev pager-next'.split(),(300,300))

# Magenta checker contact sheet and machine-readable alpha report.
files=list((OUT/'characters').glob('*.webp'))+list((OUT/'art').glob('*.webp'))+list((OUT/'ui').glob('*.webp'))
report={}; thumbs=[]
for f in sorted(files):
    im=Image.open(f).convert('RGBA'); a=im.getchannel('A'); hist=a.histogram(); transparent=hist[0]; data=a.get_flattened_data(); report[str(f.relative_to(ROOT))]={'size':im.size,'transparent_pixels':transparent,'alpha_min':min(data),'alpha_max':max(data)}
    t=im.copy(); t.thumbnail((160,120)); thumbs.append((f.name,t))
W=640; H=((len(thumbs)+3)//4)*155; sheet=Image.new('RGB',(W,H),(255,0,180)); d=ImageDraw.Draw(sheet)
for i,(n,t) in enumerate(thumbs):
    x=(i%4)*160; y=(i//4)*155
    for yy in range(y,y+120,16):
      for xx in range(x,x+160,16): d.rectangle((xx,yy,xx+15,yy+15),fill=(255,0,180) if ((xx//16+yy//16)%2==0) else (255,180,240))
    sheet.paste(t,(x+(160-t.width)//2,y+(120-t.height)//2),t); d.text((x+3,y+122),n,fill='white')
sheet.save(QA/'contact-sheet.png'); (QA/'alpha-report.json').write_text(json.dumps(report,indent=2))
