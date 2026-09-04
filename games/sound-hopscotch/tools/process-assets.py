#!/usr/bin/env python3
"""Finalize Sound Hopscotch raster art from the asset-cutter silhouettes."""
from pathlib import Path
import argparse, hashlib, json
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets' / 'source' / 'crops'
OUT = ROOT / 'assets'

def matte(src: Path, group: str, pad=18):
    """Apply the exact connected-component mask emitted by cut-asset-sheet.py.

    Color-distance alpha made cocoa facial details translucent and retained
    low-contrast bands from the charcoal sheet. The cutter's debug mask is the
    authoritative silhouette: shrink it one pixel, then feather back to the
    detected boundary for a clean, antialiased edge without eating dark detail.
    """
    group_dir = SRC / group
    meta = json.loads((group_dir / 'boxes.json').read_text(encoding='utf-8'))
    entry = next(item for item in meta['assets'] if item['file'] == src.name)
    sheet_mask = Image.open(SRC / f'{group}-mask.png').convert('L')
    alpha = sheet_mask.crop(tuple(entry['cropBbox']))
    rgb = Image.open(src).convert('RGB')
    if alpha.size != rgb.size:
        alpha = alpha.resize(rgb.size, Image.Resampling.NEAREST)
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.72))
    out = rgb.convert('RGBA')
    out.putalpha(alpha)
    box = alpha.getbbox()
    out = out.crop(box) if box else out
    canvas = Image.new('RGBA', (out.width + pad * 2, out.height + pad * 2))
    canvas.alpha_composite(out, (pad, pad))
    return canvas

def save(im, path, quality=92, lossless=False):
    path.parent.mkdir(parents=True,exist_ok=True)
    im.save(path, 'WEBP', lossless=lossless, quality=quality, method=6)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--check',action='store_true'); args=ap.parse_args()
    files=[]
    title=matte(SRC/'title/title-lockup.png', 'title'); title.thumbnail((1100,1100),Image.Resampling.LANCZOS); save(title,OUT/'title.webp',90); files.append(OUT/'title.webp')
    poses=[]; pose_dir=OUT/'characters'
    for p in sorted((SRC/'bunny').glob('*.png')):
      im=matte(p, 'bunny'); poses.append(im)
    cw,ch=560,620; norm=[]
    for p,im in zip(sorted((SRC/'bunny').glob('*.png')),poses):
      scale=min((cw-20)/im.width,(ch-20)/im.height); q=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
      c=Image.new('RGBA',(cw,ch)); c.alpha_composite(q,((cw-q.width)//2,ch-q.height-10)); out=pose_dir/(p.stem+'.webp'); save(c,out,91); files.append(out); norm.append(c)
    for p in sorted((SRC/'kawaii-kit').glob('*.png')):
      im=matte(p, 'kawaii-kit'); name=p.stem
      dest='pads' if name.startswith('pad-') else ('effects' if name in ('progress-flower','reward-star') else 'ui')
      out=OUT/dest/(name+'.webp'); save(im,out,92); files.append(out)
    for p in sorted((SRC/'interaction-cues').glob('*.png')):
      im=matte(p, 'interaction-cues'); out=OUT/'ui'/(p.stem+'.webp')
      im.thumbnail((640,640),Image.Resampling.LANCZOS); save(im,out,92); files.append(out)
    bg=Image.open(ROOT/'assets/source/gpt-image-2/meadow-world-master.png').convert('RGB'); bg.thumbnail((1440,1080),Image.Resampling.LANCZOS)
    canvas=Image.new('RGB',(1440,1080),(190,227,245)); canvas.paste(bg,((1440-bg.width)//2,(1080-bg.height)//2)); out=OUT/'backgrounds/meadow.webp'; save(canvas,out,82); files.append(out)
    report=[]
    for f in files:
      im=Image.open(f); b=f.read_bytes(); alpha=im.getchannel('A') if 'A' in im.getbands() else None
      histogram=alpha.histogram() if alpha else None; total=im.width*im.height
      report.append({'file':str(f.relative_to(ROOT)).replace('\\','/'),'bytes':len(b),'width':im.width,'height':im.height,'alpha':bool(alpha),'transparentCorners': bool(alpha and all(alpha.getpixel(x)==0 for x in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)])),'alphaStats': ({'transparentPct':round(100*histogram[0]/total,3),'opaquePct':round(100*histogram[255]/total,3),'partialPct':round(100*(total-histogram[0]-histogram[255])/total,3)} if alpha else None),'sha256':hashlib.sha256(b).hexdigest()})
    alpha_files=[f for f in files if 'A' in Image.open(f).getbands()]
    cell_w,cell_h,cols=300,235,4; rows=(len(alpha_files)+cols-1)//cols
    sheet=Image.new('RGB',(cell_w*cols,cell_h*rows),(255,0,255))
    for index,f in enumerate(alpha_files):
      im=Image.open(f).convert('RGBA'); im.thumbnail((cell_w-24,cell_h-38),Image.Resampling.LANCZOS)
      cell=Image.new('RGBA',(cell_w,cell_h),(255,0,255,255)); cell.alpha_composite(im,((cell_w-im.width)//2,8+(cell_h-30-im.height)//2))
      draw=ImageDraw.Draw(cell); draw.rectangle((0,cell_h-27,cell_w,cell_h),fill=(35,28,49,255)); draw.text((8,cell_h-21),f.stem,fill=(255,255,255,255))
      sheet.paste(cell.convert('RGB'),((index%cols)*cell_w,(index//cols)*cell_h))
    qa_dir=SRC.parent/'qa'; qa_dir.mkdir(parents=True,exist_ok=True); sheet.save(qa_dir/'alpha-contact-sheet.png','PNG',optimize=True)
    (SRC.parent/'finalize-report.json').write_text(json.dumps({'outputs':report},indent=2)+'\n')
    bad=[r for r in report if r['bytes']>500000]; print(json.dumps({'outputs':len(report),'oversize':bad,'check':args.check},indent=2)); raise SystemExit(1 if bad else 0)
if __name__=='__main__': main()
