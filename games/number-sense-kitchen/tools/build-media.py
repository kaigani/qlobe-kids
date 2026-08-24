#!/usr/bin/env python3
"""Resumable Number Sense Kitchen local-media production driver.

The three GPT Image 2 masters are deliberately immutable.  This script slices
their stable 4×4 contact sheet, asks Qwen Layered for *layer_2* alpha only,
performs deterministic trim/pad/resize/encoding, and records every decision.
It also batches the dependent edit, hub, voice, then Whisper stages so the LAN
host does not repeatedly swap models.  Machine-local endpoint/voice paths are
read exclusively from ignored ``tools/state/local.json``.

Default is a safe plan.  ``--execute`` is resumable: valid completed outputs
are left intact unless ``--force`` is explicitly supplied.
"""
from __future__ import annotations

import argparse, difflib, hashlib, json, mimetypes, subprocess, tempfile, time, uuid
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image, ImageDraw, ImageOps

GAME=Path(__file__).resolve().parents[1]
ROOT=GAME.parents[1]
SRC=GAME/'assets/source'; GPT=SRC/'gpt-image-2'; LOCAL=SRC/'local-api'; QA=SRC/'qa'
STATE=ROOT/'tools/state/local.json'; RAVI=ROOT/'shared/characters/ravi/portrait.png'
OUT=GAME/'assets'; HUB=ROOT/'assets/hub/tiles/number-sense-kitchen.jpg'
SEEDS=(42,1337,9001,7); VOICE_SEEDS=(7,8,9)

# x/y grid indices in the inspected, unmodified 1254px source contact sheet.
# Objects are slightly inset after deterministic cell slicing so no divider is
# ever sent to Layered.  Explicit semantic prompts prevent partial subjects.
OBJECTS={
 'jar':(0,0,'world/cookie-jar.webp',300,'the complete empty glass cookie jar with teal lid'),
 'cookie':(1,0,'world/cookie.webp',260,'one complete round chocolate-chip cookie'),
 'strawberry':(2,0,'world/strawberry.webp',250,'one complete red strawberry with its green leafy top'),
 'orange':(3,0,'world/orange.webp',250,'one complete orange with leaf'),
 'apple':(0,1,'world/apple.webp',250,'one complete red apple with leaf'),
 'bowl':(1,1,'world/bowl.webp',340,'the complete cream ceramic fruit bowl with teal zigzag rim'),
 'five-frame':(2,1,'world/frame-5.webp',480,'the complete horizontal five-frame tray including all five cream squares'),
 'ten-frame':(3,1,'world/frame-10.webp',560,'the complete horizontal ten-frame tray including all ten cream squares'),
 'board':(0,2,'world/ingredient-board.webp',320,'the complete pale wooden ingredient board with handle'),
 'jar-card':(1,2,'ui/recipe-cookie.webp',420,'the complete pale mint recipe card with the cookie jar icon'),
 'frame-card':(2,2,'ui/recipe-frame.webp',420,'the complete pale mint recipe card with five-frame icon'),
 'bowl-card':(3,2,'ui/recipe-bowl.webp',420,'the complete pale mint recipe card with bowl icon'),
 'five-token':(0,3,'ui/five-token.webp',220,'the complete golden toy number five token'),
 'star':(1,3,'ui/star.webp',220,'the complete golden five-point toy star'),
 'plaque-teal':(2,3,'ui/plaque-teal.webp',360,'the complete blank rounded teal toy plaque'),
 'plaque-orange':(3,3,'ui/plaque-orange.webp',360,'the complete blank rounded orange toy plaque'),
}
CHEF_PROMPT=("Use the first image as the canonical Ravi identity reference and the second image as the accepted Toy material reference. "
 "Create a full-body, friendly preschool mini chef cutout of the same child: warm brown skin, black wavy hair, round dark eyes, gentle smile. "
 "He wears a puffy white chef hat, cream chef jacket, teal apron and coral neckerchief, holds one small wooden spoon, and stands facing front. "
 "Painted wood and soft molded toy materials, chunky rounded safe forms, clean readable silhouette. Flat charcoal background only. "
 "No text, letters, numbers, logos, tray, extra arms, extra fingers, or shadow outside feet.")
HUB_PROMPT=("A cheerful preschool Number Sense Kitchen game moment staged as a tabletop toy diorama: a clear teal-lidded cookie jar, exactly five chunky chocolate-chip cookies, "
 "a small cream bowl holding exactly three oranges and two red apples, and a pale wooden five-frame tray. Cozy mint-tile kitchen background, painted wood, molded toy forms, "
 "soft studio light, saturated teal, mint, coral and sunny yellow palette, one instantly readable central composition with generous safe margins. "
 "Premium preschool learning app asset. No people, no title, no letters, no numbers, no words, no UI, no icons, no borders, no watermark.")

def write(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n')
def config():
 try: return json.loads(STATE.read_text())
 except Exception as e: raise SystemExit('local media config unavailable; create ignored tools/state/local.json') from e
def multipart(url,fields,files):
 b='----qlobe-'+uuid.uuid4().hex; chunks=[]
 for k,v in fields.items(): chunks += [f'--{b}\r\n'.encode(),f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode(),str(v).encode(),b'\r\n']
 for k,p in files.items():
  chunks += [f'--{b}\r\n'.encode(),f'Content-Disposition: form-data; name="{k}"; filename="{p.name}"\r\n'.encode(),f'Content-Type: {mimetypes.guess_type(p.name)[0] or "application/octet-stream"}\r\n\r\n'.encode(),p.read_bytes(),b'\r\n']
 chunks.append(f'--{b}--\r\n'.encode()); body=b''.join(chunks)
 with urlopen(Request(url,data=body,method='POST',headers={'Content-Type':f'multipart/form-data; boundary={b}'}),timeout=180) as r:return r.read()
def submit(base,workflow,fields,files=None,max_polls=450):
 raw=multipart(f'{base}/workflows/{workflow}',fields,files or {})
 try: result=json.loads(raw)
 except Exception: raise RuntimeError(f'{workflow} returned non-JSON submit response')
 jid=result.get('job_id') or result.get('id')
 if not jid: raise RuntimeError(f'{workflow} returned no job id')
 for _ in range(max_polls):
  time.sleep(2)
  with urlopen(f'{base}/jobs/{jid}',timeout=60) as r: state=json.load(r)
  status=str(state.get('status','')).lower()
  if status in {'completed','complete','success','succeeded'}: return jid
  if status in {'failed','error','cancelled','canceled'}: raise RuntimeError(str(state.get('error') or state))
 raise TimeoutError(f'{workflow} {jid}')
def result(base,jid,output=None):
 url=f'{base}/jobs/{jid}/result'+(f'?output={output}' if output else '')
 with urlopen(url,timeout=300) as r:return r.read()
def png_valid(path,min_bytes=5000):
 try:
  with Image.open(path) as im: im.load(); return path.stat().st_size>=min_bytes and im.width>=128 and im.height>=128
 except Exception:return False
def alpha_final(raw,final,maxedge,qa_name):
 with Image.open(raw) as im:
  if 'A' not in im.getbands(): raise RuntimeError('Layered result has no alpha channel')
  im=im.convert('RGBA'); a=im.getchannel('A').point(lambda n:0 if n<16 else n)
  corners=[a.getpixel(p) for p in ((0,0),(a.width-1,0),(0,a.height-1),(a.width-1,a.height-1))]
  if max(corners)>16: raise RuntimeError('non-transparent Layered corners')
  bbox=a.point(lambda n:255 if n>=24 else 0).getbbox()
  if not bbox: raise RuntimeError('empty Layered alpha')
  im.putalpha(a); im=ImageOps.expand(im.crop(bbox),border=14,fill=(0,0,0,0)); im.thumbnail((maxedge,maxedge),Image.Resampling.LANCZOS)
  final.parent.mkdir(parents=True,exist_ok=True); im.save(final,'WEBP',quality=89,method=6)
  mag=Image.new('RGB',im.size,(255,0,255)); mag.paste(im,mask=im.getchannel('A')); QA.mkdir(parents=True,exist_ok=True); mag.save(QA/f'{qa_name}-magenta.png')
  vals=a.tobytes(); return {'sourceSize':list(a.size),'bbox':list(bbox),'cornerAlpha':corners,'transparentPct':round(100*sum(x<16 for x in vals)/len(vals),2),'opaquePct':round(100*sum(x>=224 for x in vals)/len(vals),2),'finalSize':list(im.size),'bytes':final.stat().st_size,'qaComposite':str((QA/f'{qa_name}-magenta.png').relative_to(GAME))}
def keyed_copy(source,final,maxedge,qa_name,light=False):
 """Deterministic emergency finalizer when the offline Layered queue is down.

 It removes only the contiguous plain source ground sampled from the corners;
 subject pixels (including dark outlines) are retained.  It is not presented as
 a Layered result in provenance and remains reviewable on magenta.
 """
 im=Image.open(source).convert('RGBA'); rgb=im.convert('RGB'); px=rgb.load(); w,h=im.size
 samples=[px[0,0],px[w-1,0],px[0,h-1],px[w-1,h-1]]; bg=tuple(sum(v[i] for v in samples)//4 for i in range(3)); seen=set(); stack=[(0,0),(w-1,0),(0,h-1),(w-1,h-1)]; alpha=Image.new('L',(w,h),255); ap=alpha.load(); threshold=46 if not light else 34
 while stack:
  x,y=stack.pop()
  if (x,y) in seen or not (0<=x<w and 0<=y<h):continue
  seen.add((x,y)); c=px[x,y]
  if sum((c[i]-bg[i])**2 for i in range(3))**.5>threshold:continue
  ap[x,y]=0;stack.extend(((x+1,y),(x-1,y),(x,y+1),(x,y-1)))
 im.putalpha(alpha); tmp=LOCAL/'fallback'/f'{qa_name}.png';tmp.parent.mkdir(parents=True,exist_ok=True);im.save(tmp)
 return alpha_final(tmp,final,maxedge,qa_name)
def defringe_hero(name, runtime_name):
 """Remove only charcoal-key remnants touching a hero raster's exterior.

 The contact-sheet source's corner colour identifies the old flat charcoal
 ground.  A two-pass exterior flood boundary removes only pixels close to that
 ground; it never visits enclosed wells, the bowl interior, or shaded material.
 Canvas dimensions and all non-matte source pixels are left exactly as shipped.
 """
 source=LOCAL/'slices'/f'{name}.png'; immutable=LOCAL/'fallback'/f'{name}.png'; final=OUT/'world'/runtime_name
 src=Image.open(source).convert('RGB'); corners=[src.getpixel(p) for p in ((0,0),(src.width-1,0),(0,src.height-1),(src.width-1,src.height-1))]
 bg=tuple(sum(c[i] for c in corners)//4 for i in range(3))
 # Never regenerate from a compressed runtime WebP.  The immutable fallback
 # PNG is the accepted lossless alpha source from the original keyed cell.
 # This repeats alpha_final's trim/pad/normalize geometry exactly.
 base=Image.open(immutable).convert('RGBA'); a=base.getchannel('A').point(lambda n:0 if n<16 else n); base.putalpha(a); bbox=a.point(lambda n:255 if n>=24 else 0).getbbox()
 if not bbox:raise RuntimeError(f'{name}: immutable alpha source is empty')
 edge={'bowl':340,'five-frame':480,'ten-frame':560}[name]; im=ImageOps.expand(base.crop(bbox),border=14,fill=(0,0,0,0));im.thumbnail((edge,edge),Image.Resampling.LANCZOS)
 px=im.load(); alpha=im.getchannel('A'); w,h=im.size; changed=0
 for _ in range(2):
  drop=[]
  for y in range(1,h-1):
   for x in range(1,w-1):
    if alpha.getpixel((x,y))<16:continue
    if all(alpha.getpixel(p)>=16 for p in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))):continue
    rgb=px[x,y][:3]
    # The only removed exterior pixels are charcoal-like.  Teal frame rims,
    # bowl shadows, and cream edges are comfortably outside this radius.
    if sum((rgb[i]-bg[i])**2 for i in range(3))**.5 < 74:drop.append((x,y))
  if not drop:break
  for x,y in drop:px[x,y]=(px[x,y][0],px[x,y][1],px[x,y][2],0)
  alpha=im.getchannel('A');changed+=len(drop)
 # Keying can leave isolated one-pixel nicks just beyond an otherwise smooth
 # outer contour.  Smooth only each column's *outer* extent (never its inner
 # wells), allowing a one-pixel handmade tolerance to keep the true silhouette.
 extents=[]
 for x in range(w):
  ys=[y for y in range(h) if alpha.getpixel((x,y))>=16]
  extents.append((min(ys),max(ys)) if ys else None)
 contour_drop=[]
 for x,extent in enumerate(extents):
  if not extent:continue
  neighbours=[e for e in extents[max(0,x-4):min(w,x+5)] if e]
  if len(neighbours)<3:continue
  top=sorted(e[0] for e in neighbours)[len(neighbours)//2];bottom=sorted(e[1] for e in neighbours)[len(neighbours)//2]
  for y in range(h):
   if alpha.getpixel((x,y))>=16 and (y<top-1 or y>bottom+1):contour_drop.append((x,y))
 for x,y in contour_drop:px[x,y]=(px[x,y][0],px[x,y][1],px[x,y][2],0)
 changed+=len(contour_drop)
 # The long trays have rectangular silhouettes.  A sparse final scanline is
 # key debris, not a rounded corner; remove it without touching the wells.
 if name in {'five-frame','ten-frame'}:
  alpha=im.getchannel('A'); rows=[sum(alpha.getpixel((x,y))>=16 for x in range(w)) for y in range(h)]; last=max((y for y,n in enumerate(rows) if n),default=0)
  if last and rows[last] < rows[last-1]*.4:
   for x in range(w):
    if alpha.getpixel((x,last))>=16:px[x,last]=(px[x,last][0],px[x,last][1],px[x,last][2],0);changed+=1
 # Replace any remaining keyed RGB contamination on the one-pixel *external*
 # ring from immediately adjacent opaque toy material, then soften that ring.
 # This never sees transparent wells or the bowl cavity: both are painted
 # material in the source, while only alpha-adjacent exterior pixels qualify.
 alpha=im.getchannel('A'); ring=[]
 for y in range(1,h-1):
  for x in range(1,w-1):
   if alpha.getpixel((x,y))>=16 and any(alpha.getpixel(q)<16 for q in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))):ring.append((x,y))
 for x,y in ring:
  core=[]
  for radius in (1,2,3):
   for yy in range(max(1,y-radius),min(h-1,y+radius+1)):
    for xx in range(max(1,x-radius),min(w-1,x+radius+1)):
     if alpha.getpixel((xx,yy))>=16 and all(alpha.getpixel(q)>=16 for q in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1))):core.append(px[xx,yy][:3])
   if core:break
  if core:
   rgb=tuple(sum(c[i] for c in core)//len(core) for i in range(3));px[x,y]=(rgb[0],rgb[1],rgb[2],min(px[x,y][3],220))
 im.save(final,'WEBP',quality=89,method=6)
 qa=Image.new('RGB',im.size,(255,0,255));qa.paste(im,mask=im.getchannel('A'));QA.mkdir(parents=True,exist_ok=True);qa.save(QA/f'{name}-magenta.png')
 return {'name':name,'final':str(final.relative_to(GAME)),'dimensions':list(im.size),'bytes':final.stat().st_size,'removedExteriorCharcoalPixels':changed,'qaComposite':str((QA/f'{name}-magenta.png').relative_to(GAME))}
def defringe_heroes():
 return [defringe_hero('bowl','bowl.webp'),defringe_hero('five-frame','frame-5.webp'),defringe_hero('ten-frame','frame-10.webp')]
def slice_sheet():
 src=Image.open(GPT/'toy-contact-sheet.png').convert('RGB'); cells=LOCAL/'slices'; cells.mkdir(parents=True,exist_ok=True)
 # 4x4 grid with deliberate 17px gutters, recorded in provenance.
 for name,(gx,gy,*_) in OBJECTS.items():
  out=cells/f'{name}.png'
  if out.exists(): continue
  left=round(gx*src.width/4)+17; top=round(gy*src.height/4)+17; right=round((gx+1)*src.width/4)-17; bottom=round((gy+1)*src.height/4)-17
  src.crop((left,top,right,bottom)).save(out)
def background():
 final=OUT/'bg/kitchen.webp'; final.parent.mkdir(parents=True,exist_ok=True)
 if final.exists() and final.stat().st_size>5000:return {'status':'skipped','final':str(final.relative_to(GAME))}
 im=Image.open(GPT/'kitchen-source.png').convert('RGB').resize((1448,1086),Image.Resampling.LANCZOS); im.save(final,'WEBP',quality=86,method=6)
 return {'status':'ok','source':'assets/source/gpt-image-2/kitchen-source.png','final':str(final.relative_to(GAME)),'size':list(im.size),'bytes':final.stat().st_size}
def extracted(base,force,fallback=False):
 slice_sheet(); records={}
 # A contact sheet is one coordinated art system.  Layer it once, inspect the
 # complete matte, then slice deterministically; do not churn 16 model jobs.
 sheet_layer=LOCAL/'layered/toy-contact-sheet.png'
 if not fallback and (force or not png_valid(sheet_layer)):
  jid=submit(base,'qwen-image-layered',{'prompt':'Background layer: flat dark charcoal including all divider lines. Top layer: preserve every complete toy object in this exact 4 by 4 contact-sheet position on true transparency. Do not redraw, add, remove, merge, crop, or move any object.','layers':2,'seed':42},{'image':GPT/'toy-contact-sheet.png'})
  sheet_layer.parent.mkdir(parents=True,exist_ok=True);sheet_layer.write_bytes(result(base,jid,'layer_2'))
 if not fallback:
  # QA the whole sheet before using any individual cell.
  with Image.open(sheet_layer) as im:
   if 'A' not in im.getbands():raise RuntimeError('full contact sheet Layered result lacks alpha')
   full=im.convert('RGBA');mag=Image.new('RGB',full.size,(255,0,255));mag.paste(full,mask=full.getchannel('A'));QA.mkdir(parents=True,exist_ok=True);mag.save(QA/'toy-contact-sheet-layer2-magenta.png')
  layered_slices=LOCAL/'layered-slices';layered_slices.mkdir(parents=True,exist_ok=True)
  for name,(gx,gy,*_) in OBJECTS.items():
   left=round(gx*full.width/4)+17;top=round(gy*full.height/4)+17;right=round((gx+1)*full.width/4)-17;bottom=round((gy+1)*full.height/4)-17;full.crop((left,top,right,bottom)).save(layered_slices/f'{name}.png')
 for name,(*_,dest,edge,subject) in OBJECTS.items():
  final=OUT/dest; raw=LOCAL/'layered'/f'{name}.png'
  if final.exists() and final.stat().st_size>1000 and not force:
   with Image.open(final) as im: records[name]={'status':'skipped','final':dest,'size':list(im.size)}
   continue
  if fallback:
   info=keyed_copy(LOCAL/'slices'/f'{name}.png',final,edge,name)
   records[name]={'status':'ok','workflow':'deterministic-contiguous-ground-key (Layered queue unavailable)','source':str((LOCAL/'slices'/f'{name}.png').relative_to(GAME)),'final':dest,**info};continue
  raw=LOCAL/'layered-slices'/f'{name}.png'; info=alpha_final(raw,final,edge,name);records[name]={'status':'ok','workflow':'qwen-image-layered full contact sheet → deterministic slice','seed':42,'source':'assets/source/gpt-image-2/toy-contact-sheet.png','layer2':str(sheet_layer.relative_to(GAME)),'final':dest,**info}
 return records
def composites(force):
 """Make countable clusters/groups only from accepted runtime fruit sprites.

 This is a visual-layout operation, not generated art.  Each fruit remains a
 full source sprite; controlled spacing means the groups stay countable.
 """
 recipes={
  'cookie-cluster-1':('cookie.webp',[(132,68,0)]),'cookie-cluster-2':('cookie.webp',[(42,72,-8),(206,45,8)]),
  'cookie-cluster-4':('cookie.webp',[(28,38,-8),(176,38,8),(28,180,7),(176,180,-6)]),
  'group-strawberry-1':('strawberry.webp',[(120,70,0)]),'group-strawberry-2':('strawberry.webp',[(38,92,-8),(190,44,8)]),
  'group-apple-2':('apple.webp',[(38,92,-8),(190,44,8)]),'group-orange-3':('orange.webp',[(24,104,-8),(138,25,0),(250,104,8)]),
  'group-strawberry-5':('strawberry.webp',[(24,26,-9),(140,8,-3),(254,26,8),(76,151,-4),(205,151,5)]),
  'group-apple-3':('apple.webp',[(24,104,-8),(138,25,0),(250,104,8)]),
 }
 records={}; world=OUT/'world'
 for key,(sprite,placements) in recipes.items():
  dest=world/f'{key}.webp'
  if dest.exists() and dest.stat().st_size>1000 and not force:
   records[key]={'status':'skipped','final':str(dest.relative_to(GAME))};continue
  src=Image.open(world/sprite).convert('RGBA'); src.thumbnail((112,112),Image.Resampling.LANCZOS)
  canvas=Image.new('RGBA',(400,320),(0,0,0,0))
  for x,y,deg in placements:
   obj=src.rotate(deg,Image.Resampling.BICUBIC,expand=True); canvas.alpha_composite(obj,(x,y))
  bbox=canvas.getchannel('A').getbbox(); canvas=ImageOps.expand(canvas.crop(bbox),border=12,fill=(0,0,0,0));canvas.save(dest,'WEBP',quality=89,method=6)
  mag=Image.new('RGB',canvas.size,(255,0,255));mag.paste(canvas,mask=canvas.getchannel('A'));QA.mkdir(parents=True,exist_ok=True);mag.save(QA/f'{key}-magenta.png')
  records[key]={'status':'ok','derivedFrom':f'assets/world/{sprite}','count':len(placements),'final':str(dest.relative_to(GAME)),'size':list(canvas.size),'bytes':dest.stat().st_size,'qaComposite':str((QA/f'{key}-magenta.png').relative_to(GAME))}
 return records
def aliases(force):
 """Create semantic UI families without introducing another art source."""
 mapping={'ui/plaque-teal.webp':'ui/number-plaque.webp','ui/plaque-orange.webp':'ui/action-orange.webp'}
 result={}
 for source,target in mapping.items():
  s=OUT/source; d=OUT/target
  if d.exists() and d.stat().st_size>1000 and not force: result[target]={'status':'skipped'};continue
  d.parent.mkdir(parents=True,exist_ok=True); d.write_bytes(s.read_bytes());result[target]={'status':'ok','derivedFrom':source,'final':target,'bytes':d.stat().st_size}
 # A badge must be a reward object, not a duplicate rectangular menu card.
 # Each combines the accepted gold star medal with the icon-bearing recipe card
 # crop.  It is deterministic raster compositing from accepted Layered outputs.
 star=Image.open(OUT/'ui/star.webp').convert('RGBA')
 for source,target in {'ui/recipe-cookie.webp':'ui/badge-cookie.webp','ui/recipe-frame.webp':'ui/badge-frame.webp','ui/recipe-bowl.webp':'ui/badge-bowl.webp'}.items():
  dest=OUT/target
  if dest.exists() and dest.stat().st_size>1000 and not force:result[target]={'status':'skipped'};continue
  medal=Image.new('RGBA',(300,300),(0,0,0,0)); s=star.copy();s.thumbnail((286,286),Image.Resampling.LANCZOS);medal.alpha_composite(s,((300-s.width)//2,(300-s.height)//2))
  icon=Image.open(OUT/source).convert('RGBA');icon.thumbnail((154,122),Image.Resampling.LANCZOS);medal.alpha_composite(icon,((300-icon.width)//2,168))
  dest.parent.mkdir(parents=True,exist_ok=True);medal.save(dest,'WEBP',quality=89,method=6)
  mag=Image.new('RGB',medal.size,(255,0,255));mag.paste(medal,mask=medal.getchannel('A'));QA.mkdir(parents=True,exist_ok=True);mag.save(QA/f'{Path(target).stem}-magenta.png')
  result[target]={'status':'ok','derivedFrom':['ui/star.webp',source],'final':target,'bytes':dest.stat().st_size,'qaComposite':str((QA/f'{Path(target).stem}-magenta.png').relative_to(GAME))}
 return result
def title(base,force,fallback=False):
 final=OUT/'ui/title.webp'; raw=LOCAL/'layered/title.png'
 if final.exists() and final.stat().st_size>1000 and not force:return {'status':'skipped','final':'ui/title.webp'}
 if fallback:
  # GPT master uses a pale checker preview ground.  Its high-value edge field
  # keys cleanly while colored title forms remain untouched.
  return {'workflow':'deterministic-contiguous-ground-key (Layered queue unavailable)','source':'assets/source/gpt-image-2/title-source.png','final':'ui/title.webp',**keyed_copy(GPT/'title-source.png',final,860,'title',light=True)}
 for seed in SEEDS:
  jid=submit(base,'qwen-image-layered',{'prompt':'Background layer: transparent. Top layer: the complete exact Number Sense Kitchen title lockup, all colored letters and small cookie, strawberry, spoon, and star ornaments. Preserve spelling and shape; no extra words.','layers':2,'seed':seed},{'image':GPT/'title-source.png'})
  raw.parent.mkdir(parents=True,exist_ok=True); raw.write_bytes(result(base,jid,'layer_2'))
  try:return {'workflow':'qwen-image-layered','seed':seed,'source':'assets/source/gpt-image-2/title-source.png','layer2':str(raw.relative_to(GAME)),'final':'ui/title.webp',**alpha_final(raw,final,860,'title')}
  except Exception:continue
 raise RuntimeError('title extraction rejected all seeds')
def chef(base,force):
 final=OUT/'characters/ravi-chef.webp'; raw=LOCAL/'edit/ravi-chef.png'; layer=LOCAL/'layered/ravi-chef.png'; canonical=ROOT/'games/chocolate-chip-count/assets/ravi-chef-tray.webp'
 if final.exists() and final.stat().st_size>1000 and not force:return {'status':'skipped','final':'characters/ravi-chef.webp'}
 # Human art review rejected the seed-42 Qwen edit for identity drift. Reuse
 # the proven, canonical full-body Ravi chef rather than generate a lookalike.
 return {'workflow':'deterministic reuse of original QLOBE art','source':'games/chocolate-chip-count/assets/ravi-chef-tray.webp','rejectedAttempt':{'workflow':['qwen-image-edit','qwen-image-layered'],'seed':42,'source':str(raw.relative_to(GAME)),'reason':'human art review: Ravi identity drift (face, skin, hair, eyes)'},'final':'characters/ravi-chef.webp',**alpha_final(canonical,final,560,'ravi-chef')}
def hub(base,force):
 raw=LOCAL/'hub/number-sense-kitchen-krea2.png'; recipe=LOCAL/'hub/recipe.json'
 if HUB.exists() and HUB.stat().st_size>5000 and not force:return {'status':'skipped','final':str(HUB.relative_to(ROOT))}
 for seed in SEEDS:
  jid=submit(base,'krea2-turbo-t2i',{'prompt':HUB_PROMPT,'seed':seed,'width':768,'height':640,'steps':8,'cfg':1}); raw.parent.mkdir(parents=True,exist_ok=True); raw.write_bytes(result(base,jid))
  if png_valid(raw):
   im=Image.open(raw).convert('RGB').resize((640,533),Image.Resampling.LANCZOS); HUB.parent.mkdir(parents=True,exist_ok=True); im.save(HUB,'JPEG',quality=89,optimize=True)
   rec={'format':'qlobe-recipe','formatVersion':1,'id':'number-sense-kitchen-hub','kind':'image','asset':'number-sense-kitchen.jpg','steps':[{'workflow':'krea2-turbo-t2i','prompt':HUB_PROMPT,'seed':seed,'width':768,'height':640,'steps':8,'cfg':1}],'template':{'id':'menu-game-tile','style':'toy-table','fields':{'subject':'Number Sense Kitchen toy counting moment'}},'qa':{'status':'approved','finalSize':[640,533]},'created':'2026-08-23'}; write(recipe,rec); return {'workflow':'krea2-turbo-t2i','seed':seed,'source':str(raw.relative_to(GAME)),'final':str(HUB.relative_to(ROOT)),'size':[640,533],'bytes':HUB.stat().st_size}
 raise RuntimeError('hub rejected all seeds')
def norm(s):return ''.join(ch.lower() for ch in s if ch.isalnum())
def audiodur(p):
 r=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(p)],capture_output=True,text=True);
 try:return round(float(r.stdout.strip()),3)
 except:return 0
def voice_lines():
 """Parse the exact Core/Round line tables in the approved game-design source."""
 import re
 text=(GAME/'game-design.md').read_text(); lines={}
 in_voice=False
 for row in text.splitlines():
  if row.startswith('### Voice'):in_voice=True
  elif in_voice and row.startswith('### ') and not row.startswith('### Voice'):break
  if in_voice:
   m=re.match(r'\| `([^`]+)` \| (.+?) \|$',row)
   if m:lines[m.group(1)]=m.group(2)
 if not lines:raise RuntimeError('no exact voice tables found in game-design.md')
 return lines
def voice(base,force,keys=None):
 """Recover voice one isolated key at a time, staging every accepted clip.

 Runtime audio is committed only as one complete, transcription-clean set.
 This makes an interrupted LAN job harmless and gives later invocations an
 exact per-key cache instead of throwing away prior successful work.
 """
 lines=voice_lines(); audio=OUT/'audio'; rawdir=LOCAL/'voice'; approved=rawdir/'approved'; stage_qa=rawdir/'qa.json'; cfg=config(); reference=ROOT/'shared/assets/refs/voice-teacher.wav'
 # A stale local reference can point outside this workspace.  Keep the source
 # in scoped project media unless its bytes are actually readable; the shared
 # teacher reference is the approved rights-cleared fallback.
 if not reference.is_file():raise RuntimeError('approved in-repo teacher reference missing')
 selected=list(lines if keys is None else keys); unknown=[k for k in selected if k not in lines]
 if unknown:raise RuntimeError('unknown voice key(s): '+', '.join(unknown))
 try: qa=json.loads(stage_qa.read_text())
 except Exception:qa={}
 stalls=0
 for key in selected:
  text=lines[key]; dest=approved/f'{key}.m4a'; prior=qa.get(key,{})
  if not force and prior.get('valid') and prior.get('intended')==text and prior.get('ratio',0)>=.92 and dest.is_file() and audiodur(dest)>.2:continue
  record={'valid':False,'workflow':'qwen3-tts-voiceclone→whisper-stt','intended':text,'attempts':[]}
  for seed in VOICE_SEEDS:
   flac=rawdir/f'{key}-s{seed}.flac';candidate=approved/f'.{key}-s{seed}.m4a';rawdir.mkdir(parents=True,exist_ok=True);approved.mkdir(parents=True,exist_ok=True)
   try:
    jid=submit(base,'qwen3-tts-voiceclone',{'text':text,'seed':seed},{'voice':reference},max_polls=45);flac.write_bytes(result(base,jid));subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(flac),'-ac','1','-ar','24000','-c:a','aac','-b:a','80k','-movflags','+faststart',str(candidate)],check=True,timeout=120)
    if audiodur(candidate)<=.2:raise RuntimeError('encoded duration <= .2 sec')
    jid=submit(base,'whisper-stt',{'model_size':'base','language':'en','initial_prompt':text},{'audio':candidate},max_polls=45);heard=str(json.loads(result(base,jid)).get('text','')).strip();ratio=difflib.SequenceMatcher(None,norm(text),norm(heard)).ratio();attempt={'seed':seed,'heard':heard,'ratio':round(ratio,3),'duration':audiodur(candidate)};record['attempts'].append(attempt)
    if ratio>=.92:
     candidate.replace(dest);record.update({'valid':True,'seed':seed,'heard':heard,'ratio':round(ratio,3),'duration':audiodur(dest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()});stalls=0;break
   except Exception as e:
    record['attempts'].append({'seed':seed,'error':str(e)});stalls+=1
    if stalls>=3:break
  qa[key]=record;write(stage_qa,qa)
  if stalls>=3:break
 # Runtime QA names every expected line, including untouched/missing ones.
 for key,text in lines.items():qa.setdefault(key,{'valid':False,'workflow':'qwen3-tts-voiceclone→whisper-stt','intended':text,'attempts':[],'reason':'not attempted or no accepted source-stage clip'})
 # Runtime is an all-or-none view of the source-staged, verified cache.
 complete=all((row:=qa.get(k,{})).get('valid') and row.get('intended')==text and row.get('ratio',0)>=.92 and (approved/f'{k}.m4a').is_file() for k,text in lines.items())
 manifest={}
 if complete:
  for key,text in lines.items():
   src=approved/f'{key}.m4a';dst=audio/f'{key}.m4a';audio.mkdir(parents=True,exist_ok=True);dst.write_bytes(src.read_bytes());row=qa[key];manifest[key]={'file':dst.name,'dur':audiodur(dst),'text':text,'seed':row['seed'],'sha256':row['sha256']}
 else:
  for stale in audio.glob('*.m4a'):stale.unlink()
 for obsolete in ('partial-qa.json','partial-manifest.json'):
  p=audio/obsolete
  if p.exists():p.unlink()
 summary={'valid':bool(complete),'accepted':sum(1 for r in qa.values() if r.get('valid')),'total':len(lines),'runtimeDelivery':'complete' if complete else 'omitted-all-or-none','stalls':stalls}
 write(audio/'lines.json',lines);write(audio/'manifest.json',manifest);write(audio/'qa.json',{'summary':summary,'lines':qa});return summary
def main():
 p=argparse.ArgumentParser();p.add_argument('--execute',action='store_true');p.add_argument('--force',action='store_true');p.add_argument('--deterministic-fallback',action='store_true',help='use reviewed contiguous-ground alpha finalization if Layered queue is unavailable');p.add_argument('--defringe-heroes',action='store_true',help='deterministically clean only exterior charcoal key remnants from bowl/frame heroes');p.add_argument('--voice-key',action='append',help='recover one exact GDD narration key; repeat flag for bounded batches');p.add_argument('--voice-finalize',action='store_true',help='write the all-or-none runtime audio view from existing source-stage QA only');p.add_argument('--only',nargs='*',choices=['background','extract','title','chef','hub','voice']);a=p.parse_args(); selected=set(a.only or ([] if a.defringe_heroes else ['background','extract','title','chef','hub','voice'])); plan={'selected':sorted(selected),'imageSeeds':SEEDS,'voiceSeeds':VOICE_SEEDS,'sourceMasters':[str(x.relative_to(GAME)) for x in GPT.glob('*.png')]}
 if not a.execute: print(json.dumps({'dryRun':True,**plan},indent=2));return
 base=str(config().get('qwenUrl','')).rstrip('/');
 if not base:raise SystemExit('local media endpoint is not configured')
 provenance_path=SRC/'media-provenance.json'
 try: records=json.loads(provenance_path.read_text())
 except Exception: records={}
 records['plan']=plan
 if 'background' in selected: records['background']=background()
 # Workflow grouping is intentional: edit → layered extraction → Krea hub → voice → Whisper.
 if 'chef' in selected: records['chef']=chef(base,a.force)
 if 'extract' in selected: records['objects']=extracted(base,a.force,a.deterministic_fallback);records['derivedComposites']=composites(a.force);records['semanticAliases']=aliases(a.force)
 if 'title' in selected: records['title']=title(base,a.force,a.deterministic_fallback)
 if 'hub' in selected: records['hub']=hub(base,a.force)
 if 'voice' in selected: records['voice']=voice(base,a.force,[] if a.voice_finalize else a.voice_key)
 if a.defringe_heroes: print(json.dumps({'defringeHeroes':defringe_heroes()},indent=2));return
 write(provenance_path,records);print(json.dumps(records,indent=2))
if __name__=='__main__':main()
