#!/usr/bin/env python3
"""Deterministic Pillow finalizer for Bean Sprout Watch art masters."""
from pathlib import Path
import argparse,json,sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[1]; AS=ROOT/'assets'; SRC=AS/'source'; LOCAL=AS/'source-local-api'; QA=SRC/'qa'
PLANTS=['stage-0','stage-1','stage-2','stage-3','stage-4','stage-5']
TOOLS=['water','sun','nature-badge']
CARRIERS=['day-card','action-terracotta','action-green','prompt-banner','reset-seed','progress-vine']
UI=TOOLS+CARRIERS+['brush-stamp']
SIZES={
 'water':(270,270),'sun':(250,250),'nature-badge':(270,270),
 'day-card':(340,460),'action-terracotta':(540,210),'action-green':(540,210),
 'prompt-banner':(760,220),'reset-seed':(270,270),'progress-vine':(780,190),
}
def alpha_ok(im): return im.mode=='RGBA' and im.getchannel('A').getbbox() is not None and im.getchannel('A').getextrema()[0]<250
def trim(im,pad=8):
 im=im.convert('RGBA'); a=im.getchannel('A'); b=a.getbbox()
 if not b:return im
 return im.crop((max(0,b[0]-pad),max(0,b[1]-pad),min(im.width,b[2]+pad),min(im.height,b[3]+pad)))
def fit(im,size,baseline=False):
 im=trim(im); m=10; sc=min((size[0]-2*m)/im.width,(size[1]-2*m)/im.height); n=(max(1,round(im.width*sc)),max(1,round(im.height*sc))); im=im.resize(n,Image.Resampling.LANCZOS); c=Image.new('RGBA',size); c.alpha_composite(im,((size[0]-n[0])//2,size[1]-m-n[1] if baseline else (size[1]-n[1])//2)); return c
def save(im,p,quality=88):
 p.parent.mkdir(parents=True,exist_ok=True); im.save(p,'WEBP',quality=quality,method=6,exact=True)
def metric(im,p,report):
 a=im.getchannel('A'); report[str(p.relative_to(ROOT))]={'dimensions':im.size,'bytes':p.stat().st_size,'alpha_bbox':a.getbbox(),'corner_alpha':[im.getpixel(x)[3] for x in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]]}
def cell(sheet,index,cols,rows,inset=0):
 x=index%cols*sheet.width//cols; y=index//cols*sheet.height//rows
 return sheet.crop((x+inset,y+inset,x+sheet.width//cols-inset,y+sheet.height//rows-inset))
def crop_frac(sheet,box):
 return sheet.crop(tuple(round(v*(sheet.width if i%2==0 else sheet.height)) for i,v in enumerate(box)))
def key_magenta(im):
 im=im.convert('RGBA'); pixels=[]
 for r,g,b,_ in im.get_flattened_data():
  is_key=r>145 and b>135 and g<125 and (r+b-2*g)>120
  pixels.append((0,0,0,0) if is_key else (r,g,b,255))
 out=Image.new('RGBA',im.size); out.putdata(pixels); return out
def qa_copy(out,name):
 QA.mkdir(parents=True,exist_ok=True); q=Image.new('RGBA',out.size,(255,0,180,255)); q.alpha_composite(out); q.convert('RGB').save(QA/f'{name}.jpg',quality=85)
def build():
 report={}; growth=Image.open(SRC/'gpt-image-2/growth-tools-sheet-alpha.png').convert('RGBA'); ui=Image.open(SRC/'gpt-image-2/ui-carriers-sheet-alpha.png').convert('RGBA')
 if not alpha_ok(growth) or not alpha_ok(ui): raise ValueError('sheet alpha invalid')
 for i,n in enumerate(PLANTS):
  source=cell(growth,i,3,3,8); out=fit(source,(470,470),True); p=AS/'plants'/f'{n}.webp'; save(out,p); metric(out,p,report); qa_copy(out,n)
 for i,n in enumerate(TOOLS):
  source=cell(growth,i+6,3,3,8); source=source.crop((0,38,source.width,source.height)); out=fit(source,SIZES[n]); p=AS/'ui'/f'{n}.webp'; save(out,p); metric(out,p,report); qa_copy(out,n)
 carrier_boxes={
  'day-card':(.025,.05,.30,.63),'action-terracotta':(.32,.25,.66,.53),
  'action-green':(.66,.25,.99,.53),'prompt-banner':(.04,.66,.38,.93),
  'reset-seed':(.39,.61,.62,.96),'progress-vine':(.62,.65,.995,.91),
 }
 carrier_cells={n:crop_frac(ui,carrier_boxes[n]) for n in CARRIERS}
 for n in CARRIERS:
  out=fit(carrier_cells[n],SIZES[n]); p=AS/'ui'/f'{n}.webp'; save(out,p); metric(out,p,report); qa_copy(out,n)
 # A small authored watercolor dab derived from the green carrier's paper texture.
 texture=trim(carrier_cells['action-green'],0)
 box=(texture.width*3//8,texture.height//4,texture.width*5//8,texture.height*3//4)
 texture=texture.crop(box).resize((112,52),Image.Resampling.LANCZOS)
 mask=Image.new('L',texture.size); ImageDraw.Draw(mask).ellipse((5,5,106,46),fill=220)
 mask=mask.filter(ImageFilter.GaussianBlur(4)); texture.putalpha(ImageChops.multiply(texture.getchannel('A'),mask))
 p=AS/'ui/brush-stamp.webp'; save(texture,p); metric(texture,p,report); qa_copy(texture,'brush-stamp')
 for n,src in [('garden','bean-sprout-watch-garden-seed42.png'),('hub','bean-sprout-watch-hub-seed42.png')]:
  im=Image.open(LOCAL/src).convert('RGB'); target=(1344,768) if n=='garden' else (640,533); im=im.resize(target,Image.Resampling.LANCZOS); p=(AS/'backgrounds/bean-sprout-watch-garden.webp') if n=='garden' else (ROOT.parents[1]/'assets/hub/tiles/bean-sprout-watch.jpg'); p.parent.mkdir(parents=True,exist_ok=True); im.save(p,'WEBP' if n=='garden' else 'JPEG',quality=88,optimize=True); report[str(p.relative_to(ROOT.parents[1]))]={'dimensions':im.size,'bytes':p.stat().st_size}
 title=key_magenta(Image.open(SRC/'gpt-image-2/title-chroma.png')); p=AS/'ui/title.webp'; out=fit(title,(960,320)); save(out,p); metric(out,p,report); qa_copy(out,'title')
 (QA/'metrics.json').write_text(json.dumps(report,indent=2))
def check():
 for p in [AS/'backgrounds/bean-sprout-watch-garden.webp',ROOT.parents[1]/'assets/hub/tiles/bean-sprout-watch.jpg',AS/'ui/title.webp']+[AS/'plants'/f'{n}.webp' for n in PLANTS]+[AS/'ui'/f'{n}.webp' for n in UI]:
  if not p.exists(): raise FileNotFoundError(p)
  Image.open(p).load()
 print('outputs present; --check does not mutate outputs')
if __name__=='__main__':
 ap=argparse.ArgumentParser(); ap.add_argument('--check',action='store_true'); a=ap.parse_args()
 try: check() if a.check else build()
 except Exception as e: print(f'process-art: {e}',file=sys.stderr); sys.exit(2)
