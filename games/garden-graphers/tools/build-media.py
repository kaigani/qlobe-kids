#!/usr/bin/env python3
"""Resumable Garden Graphers media builder (LAN Qwen Layered, layer_2 only)."""
from __future__ import annotations
import argparse, json, mimetypes, time, uuid
from collections import deque
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image, ImageFilter, ImageOps
from PIL import ImageDraw, ImageFont

GAME=Path(__file__).resolve().parents[1]; ROOT=GAME.parents[1]
SRC=GAME/'assets/source'; GPT=SRC/'gpt-image-2'; LOCAL=SRC/'local-api'; QA=SRC/'qa'; OUT=GAME/'assets'
STATE=ROOT/'tools/state/local.json'

def multipart(url, fields, files):
 b='----qlobe-'+uuid.uuid4().hex; parts=[]
 for k,v in fields.items(): parts += [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()]
 for k,p in files.items(): parts += [f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{p.name}"\r\nContent-Type: {mimetypes.guess_type(p.name)[0] or "application/octet-stream"}\r\n\r\n'.encode(),p.read_bytes(),b'\r\n']
 parts.append(f'--{b}--\r\n'.encode())
 with urlopen(Request(url,data=b''.join(parts),method='POST',headers={'Content-Type':f'multipart/form-data; boundary={b}'}),timeout=180) as r:return json.load(r)
def job(base, image, prompt, receipt):
 r=multipart(base+'/workflows/qwen-image-layered',{'prompt':prompt,'layers':2},{'image':image}); jid=r.get('job_id') or r.get('id')
 if not jid: raise RuntimeError('Layered submit returned no job id')
 for _ in range(450):
  time.sleep(2)
  with urlopen(base+'/jobs/'+jid,timeout=60) as h:s=json.load(h)
  st=str(s.get('status','')).lower()
  if st in ('completed','complete','success','succeeded'): break
  if st in ('failed','error','cancelled','canceled'): raise RuntimeError(str(s))
 else: raise TimeoutError(jid)
 with urlopen(base+'/jobs/'+jid+'/result?output=layer_2',timeout=300) as h: data=h.read()
 receipt.update({'job_id':jid,'status':'completed','output':'layer_2','bytes':len(data)})
 p=LOCAL/'layered'/f'{receipt["name"]}-layer_2.png'; p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(data); return p
def valid(p):
 try:
  with Image.open(p) as im: im.load(); return im.width>20 and im.height>20
 except Exception:return False
def local_extract(src, name):
 """Remove only the contiguous flat corner matte from an immutable master."""
 im=Image.open(src).convert('RGBA'); rgb=im.convert('RGB'); px=rgb.load(); w,h=im.size
 # The title's explicit chroma-magenta plate has enclosed letter counters that
 # cannot be reached by a corner flood fill. Key its strongly magenta pixels
 # everywhere, with a narrow soft fringe, while preserving the coral/green art.
 if name == 'title':
  a=Image.new('L',(w,h),255); ap=a.load()
  for y in range(h):
   for x in range(w):
    r,g,b=px[x,y]
    if r>155 and b>135 and g<145 and (r+b-2*g)>150:
     distance=((r-255)**2+g**2+(b-255)**2)**.5
     ap[x,y]=max(0,min(255,round((distance-55)*4.6)))
  im.putalpha(a); p=LOCAL/'fallback'/f'{name}.png';p.parent.mkdir(parents=True,exist_ok=True);im.save(p);return p
 samples=[px[0,0],px[w-1,0],px[0,h-1],px[w-1,h-1]]; bg=tuple(sum(c[i] for c in samples)//4 for i in range(3))
 a=Image.new('L',(w,h),255); ap=a.load(); seen=set(); stack=[(0,0),(w-1,0),(0,h-1),(w-1,h-1)]; threshold=58 if max(bg)-min(bg)>80 else 44
 while stack:
  x,y=stack.pop()
  if (x,y) in seen or not(0<=x<w and 0<=y<h): continue
  seen.add((x,y)); c=px[x,y]
  if sum((c[i]-bg[i])**2 for i in range(3))**.5>threshold: continue
  ap[x,y]=0; stack.extend(((x+1,y),(x-1,y),(x,y+1),(x,y-1)))
 im.putalpha(a); p=LOCAL/'fallback'/f'{name}.png';p.parent.mkdir(parents=True,exist_ok=True);im.save(p);return p
def checker_extract(src, dest, name):
 """Remove GPT's contiguous neutral checker matte from a character edit."""
 im=Image.open(src).convert('RGBA'); rgb=im.convert('RGB'); px=rgb.load(); w,h=im.size
 alpha=Image.new('L',(w,h),255); ap=alpha.load(); seen=bytearray(w*h); queue=deque()
 for x in range(w): queue.extend(((x,0),(x,h-1)))
 for y in range(1,h-1): queue.extend(((0,y),(w-1,y)))
 while queue:
  x,y=queue.popleft(); offset=y*w+x
  if seen[offset]: continue
  seen[offset]=1; c=px[x,y]
  # The generated matte alternates warm-white and pale-gray squares. Restrict
  # removal to contiguous, nearly neutral high-value pixels so Ari's enclosed
  # cream face, eyes, and belly remain untouched.
  if min(c)<225 or max(c)-min(c)>14: continue
  ap[x,y]=0
  if x: queue.append((x-1,y))
  if x+1<w: queue.append((x+1,y))
  if y: queue.append((x,y-1))
  if y+1<h: queue.append((x,y+1))
 alpha=alpha.filter(ImageFilter.GaussianBlur(.55)).point(lambda value:max(0,min(255,round((value-18)*1.12))))
 im.putalpha(alpha); bbox=alpha.point(lambda value:255 if value>=24 else 0).getbbox()
 if not bbox: raise RuntimeError(name+': checker extraction produced empty art')
 im=ImageOps.expand(im.crop(bbox),border=18,fill=(0,0,0,0)); im.thumbnail((640,640),Image.Resampling.LANCZOS)
 dest.parent.mkdir(parents=True,exist_ok=True); im.save(dest,'WEBP',quality=88,method=6)
 q=QA/f'{name}-magenta.png'; q.parent.mkdir(parents=True,exist_ok=True); matte=Image.new('RGB',im.size,(255,0,255)); matte.paste(im,mask=im.getchannel('A')); matte.save(q)
 return {'workflow':'gpt-image-2 edit + deterministic contiguous checker-matte extraction','source':str(src.relative_to(GAME)),'final':str(dest.relative_to(GAME)),'dimensions':list(im.size),'bytes':dest.stat().st_size,'qa':str(q.relative_to(GAME))}
def storybook_characters(records):
 """Build watercolor Ari variants while retaining canonical sources."""
 variants={
  'ari-notice-watercolor':('ari-notice-watercolor-source.png','ari-notice.webp'),
  'ari-celebrate-watercolor':('ari-celebrate-watercolor-source.png','ari-celebrate.webp'),
 }
 for name,(source,final) in variants.items():
  records[name]=checker_extract(GPT/source,OUT/'characters'/final,name)
def finish(raw, dest, edge, name, bg=False):
 with Image.open(raw) as im:
  if bg:
   im.convert('RGB').resize((1600,1200),Image.Resampling.LANCZOS).save(dest,'WEBP',quality=80,method=6); return {'dimensions':[1600,1200]}
  im=im.convert('RGBA'); a=im.getchannel('A')
  if not a.getbbox(): raise RuntimeError(name+': empty alpha')
  # Layered must remove matte; reject opaque corners rather than chroma-keying.
  if any(a.getpixel(pt)>16 for pt in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]): raise RuntimeError(name+': boxed/non-transparent background')
  bbox=a.point(lambda x:255 if x>=24 else 0).getbbox(); im=ImageOps.expand(im.crop(bbox),border=14,fill=(0,0,0,0)); im.thumbnail((edge,edge),Image.Resampling.LANCZOS)
  quality=82 if name=='title' else 84 if name=='journal' else 92
  dest.parent.mkdir(parents=True,exist_ok=True); im.save(dest,'WEBP',quality=quality,method=6)
  q=QA/f'{name}-magenta.png'; q.parent.mkdir(parents=True,exist_ok=True); m=Image.new('RGB',im.size,(255,0,255));m.paste(im,mask=im.getchannel('A'));m.save(q)
  return {'dimensions':list(im.size),'bytes':dest.stat().st_size,'qa':str(q.relative_to(GAME))}
def chart_keys(records):
 """Compose deterministic raster nameplates from accepted runtime art."""
 font_path='/System/Library/Fonts/Supplemental/Verdana Bold.ttf'
 labels={'bee':'BEE','butterfly':'BUTTERFLY','ladybug':'LADYBUG'}
 for key,label in labels.items():
  dest=OUT/'ui'/f'key-{key}.webp'; plate=Image.open(OUT/'ui/action-button.webp').convert('RGBA').resize((420,150),Image.Resampling.LANCZOS)
  icon=Image.open(OUT/'visitors'/f'{key}.webp').convert('RGBA'); icon.thumbnail((54,54),Image.Resampling.LANCZOS)
  plate.alpha_composite(icon,(18,48))
  d=ImageDraw.Draw(plate); font=ImageFont.truetype(font_path,32)
  # Fit the longest label while keeping a generous, legible right-hand field.
  while d.textbbox((0,0),label,font=font)[2]>315: font=ImageFont.truetype(font_path,font.size-1)
  box=d.textbbox((0,0),label,font=font); x=92; y=(150-(box[3]-box[1]))//2-3
  d.text((x+2,y+2),label,font=font,fill=(38,61,38,150)); d.text((x,y),label,font=font,fill=(255,250,214,255),stroke_width=1,stroke_fill=(38,61,38,255))
  dest.parent.mkdir(parents=True,exist_ok=True); plate.save(dest,'WEBP',quality=90,method=6)
  q=QA/f'key-{key}-magenta.png'; m=Image.new('RGB',plate.size,(255,0,255));m.paste(plate,mask=plate.getchannel('A'));m.save(q)
  records[f'key-{key}']={'workflow':'deterministic PIL raster composition','sources':['assets/ui/action-button.webp',f'assets/visitors/{key}.webp'],'final':str(dest.relative_to(GAME)),'dimensions':list(plate.size),'bytes':dest.stat().st_size,'qa':str(q.relative_to(GAME))}
def slice_sheet(src, layer, specs, tag, records):
 with Image.open(src) as s, Image.open(layer) as l:
  cols,rows=3,2; sw,sh=s.size; lw,lh=l.size
  for name,(x,y,dest,edge) in specs.items():
   # exact thirds/halves, avoiding no guessed gutters in the approved sheets
   box=(round(x*lw/cols),round(y*lh/rows),round((x+1)*lw/cols),round((y+1)*lh/rows)); raw=LOCAL/'slices'/f'{name}.png';raw.parent.mkdir(parents=True,exist_ok=True);l.crop(box).save(raw)
   records[name]={'source':str(src.relative_to(GAME)),'layer2':str(layer.relative_to(GAME)),'final':dest,**finish(raw,OUT/dest,edge,name)}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--execute',action='store_true'); args=ap.parse_args()
 if not args.execute: print('Safe plan: use --execute to build LAN media'); return
 base=json.loads(STATE.read_text())['qwenUrl'].rstrip('/'); LOCAL.mkdir(exist_ok=True); records={}; receipts=[]
 OUT.joinpath('bg').mkdir(parents=True,exist_ok=True); bg=OUT/'bg/garden.webp';
 if not bg.exists(): finish(GPT/'garden-background-source.png',bg,1600,'garden',True)
 specs={'bee':(0,0,'visitors/bee.webp',512),'butterfly':(1,0,'visitors/butterfly.webp',512),'ladybug':(2,0,'visitors/ladybug.webp',512),'daisies':(0,1,'flowers/daisies.webp',560),'coneflowers':(1,1,'flowers/coneflowers.webp',560),'sunflowers':(2,1,'flowers/sunflowers.webp',560)}
 carriers={'mode-card':(0,0,'ui/mode-card.webp',720),'prompt-banner':(1,0,'ui/prompt-banner.webp',720),'action-button':(2,0,'ui/action-button.webp',720),'badge-sort':(0,1,'ui/badge-sort.webp',512),'badge-count':(1,1,'ui/badge-count.webp',512),'badge-compare':(2,1,'ui/badge-compare.webp',512)}
 for name,src,spec,prompt in [('specimens','specimen-sheet-source.png',specs,'separate every specimen on transparency'),('carriers','ui-carriers-sheet-source.png',carriers,'separate every UI carrier on transparency')]:
  rec={'name':name}; layer=LOCAL/'layered'/f'{name}-layer_2.png'
  if not valid(layer):
   try: layer=job(base,GPT/src,prompt+', preserve exact 3 by 2 positions; no text changes; output only transparent top layer',rec)
   except Exception as e: rec.update({'status':'fallback','error':str(e),'workflow':'local contiguous corner-matte extraction'}); layer=local_extract(GPT/src,name+'-sheet')
  receipts.append(rec); slice_sheet(GPT/src,layer,spec,GAME,records)
 for name,src,dest,edge,prompt in [('journal','journal-board-source.png','ui/journal.webp',1100,'isolate the complete open journal'),('title','title-source.png','ui/title.webp',1000,'isolate the complete painted title lettering')]:
  layer=LOCAL/'layered'/f'{name}-layer_2.png'; rec={'name':name}
  if not valid(layer):
   try: layer=job(base,GPT/src,prompt+', preserve artwork exactly on transparent background',rec)
   except Exception as e: rec.update({'status':'fallback','error':str(e),'workflow':'local contiguous corner-matte extraction'}); layer=local_extract(GPT/src,name)
 receipts.append(rec); records[name]={'source':str((GPT/src).relative_to(GAME)),'layer2':str(layer.relative_to(GAME)),'final':dest,**finish(layer,OUT/dest,edge,name)}
 chart_keys(records)
 storybook_characters(records)
 write={'workflow':'gpt-image-2 masters + qwen-image-layered output=layer_2; deterministic 3x2 slicing','assets':records,'jobs':receipts}
 (SRC/'media-provenance.json').write_text(json.dumps(write,indent=2)+'\n')
if __name__=='__main__': main()
