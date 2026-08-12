#!/usr/bin/env python3
"""Finalize supplied Pillow source art; never downloads or invents assets."""
import argparse
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

ROOT=Path(__file__).parents[1]; EXPECTED={'playroom':'gpt-image-2-playroom.png','title':'gpt-image-2-title.png','star':'gpt-image-2-star.png','cylinder-aqua':'gpt-image-2-cylinder-aqua.png','cylinder-coral':'gpt-image-2-cylinder-coral.png','sound-badge':'gpt-image-2-sound-badge.png','reward-stage':'gpt-image-2-reward-stage.png','muted':'gpt-image-2-muted.png','button':'krea-button.png','hub-tile':'krea-hub-tile.png'}

def local_dark_matte(im):
    """Remove only dark pixels connected to the image border.

    GPT Image 2 and Krea sources were intentionally produced on charcoal. A
    flood fill preserves enclosed dark facial details and lid perforations,
    unlike a global luminance key. The one-pixel contraction removes the
    charcoal edge before a small antialiasing feather.
    """
    rgb=im.convert('RGB'); w,h=rgb.size; px=rgb.load(); seen=bytearray(w*h); q=deque()
    def removable(x,y):
        r,g,b=px[x,y]
        return max(r,g,b) < 92 and (max(r,g,b)-min(r,g,b)) < 38
    def add(x,y):
        i=y*w+x
        if not seen[i] and removable(x,y): seen[i]=1; q.append((x,y))
    for x in range(w): add(x,0); add(x,h-1)
    for y in range(h): add(0,y); add(w-1,y)
    while q:
        x,y=q.popleft()
        if x: add(x-1,y)
        if x+1<w: add(x+1,y)
        if y: add(x,y-1)
        if y+1<h: add(x,y+1)
    alpha=Image.new('L',(w,h),255); ap=alpha.load()
    for y in range(h):
        row=y*w
        for x in range(w):
            if seen[row+x]: ap[x,y]=0
    alpha=alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.55))
    rgba=rgb.convert('RGBA'); rgba.putalpha(alpha); return rgba
def global_dark_matte(im):
    """Remove the charcoal source ground when the asset has no dark details."""
    rgb=im.convert('RGB')
    alpha=Image.new('L',rgb.size,255); source=rgb.load(); dest=alpha.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r,g,b=source[x,y]
            if max(r,g,b) < 92 and (max(r,g,b)-min(r,g,b)) < 38: dest[x,y]=0
    alpha=alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.55))
    rgba=rgb.convert('RGBA'); rgba.putalpha(alpha); return rgba
def trim(im):
    if im.mode != 'RGBA': im=im.convert('RGBA')
    a=im.getchannel('A'); box=a.getbbox()
    return im.crop(box) if box else im
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--source-dir',type=Path,default=ROOT/'assets/source'); ap.add_argument('--output-dir',type=Path,default=ROOT/'assets'); ap.add_argument('--qa',action='store_true'); ap.add_argument('assets',nargs='*',help='asset names or name=path'); args=ap.parse_args()
    picks={}
    for item in args.assets:
        if '=' in item: n,p=item.split('=',1); picks[n]=Path(p)
        elif item in EXPECTED: picks[item]=args.source_dir/EXPECTED[item]
        else: ap.error('unknown asset '+item)
    if not picks: picks={n:args.source_dir/f for n,f in EXPECTED.items()}
    missing=[f'{n}: {p}' for n,p in picks.items() if not p.exists()]
    if missing: raise SystemExit('missing source assets (provide files; no network used):\n'+'\n'.join(missing))
    for n,p in picks.items():
        im=Image.open(p)
        if n=='playroom':
            im=im.convert('RGB').resize((1600,1200),Image.Resampling.LANCZOS); out=args.output_dir/'bg'/'playroom.webp'; out.parent.mkdir(parents=True,exist_ok=True); im.save(out,'WEBP',quality=84,method=6)
        elif n=='hub-tile':
            im=im.convert('RGB').resize((640,533),Image.Resampling.LANCZOS); out=ROOT.parents[1]/'assets'/'hub'/'tiles'/'sound-cylinder-match.jpg'; out.parent.mkdir(parents=True,exist_ok=True); im.save(out,'JPEG',quality=88,optimize=True,progressive=True)
        elif n=='muted':
            # The edit preserves the circular button but includes a soft square
            # preview halo. A fixed circular export mask removes only that
            # authoring surround; it does not redraw the generated icon.
            im=im.convert('RGBA')
            side=min(im.size); left=(im.width-side)//2; top=(im.height-side)//2
            im=im.crop((left,top,left+side,top+side))
            alpha=Image.new('L',(side,side),0)
            from PIL import ImageDraw
            ImageDraw.Draw(alpha).ellipse((34,34,side-34,side-34),fill=255)
            im.putalpha(alpha.filter(ImageFilter.GaussianBlur(.7)))
            im.thumbnail((256,256),Image.Resampling.LANCZOS)
            out=args.output_dir/'art'/'muted.webp'; out.parent.mkdir(parents=True,exist_ok=True); im.save(out,'WEBP',lossless=True,method=6)
            if args.qa:
                bg=Image.new('RGBA',im.size,(255,0,255,255)); bg.alpha_composite(im); qa=args.source_dir/'qa'/'muted-magenta.jpg'; qa.parent.mkdir(parents=True,exist_ok=True); bg.convert('RGB').save(qa,quality=90)
        else:
            im=trim(global_dark_matte(im) if n=='reward-stage' else local_dark_matte(im)); im.thumbnail((720,720),Image.Resampling.LANCZOS); out=args.output_dir/'art'/(n+'.webp'); out.parent.mkdir(parents=True,exist_ok=True); im.save(out,'WEBP',lossless=True,method=6)
            if args.qa:
                bg=Image.new('RGBA',im.size,(255,0,255,255)); bg.alpha_composite(im); qa=args.source_dir/'qa'/(n+'-magenta.jpg'); qa.parent.mkdir(parents=True,exist_ok=True); bg.convert('RGB').save(qa,quality=90)
        print(out)
if __name__=='__main__': main()
