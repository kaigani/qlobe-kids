#!/usr/bin/env python3
import argparse, io, json, os, time, urllib.request
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps

GAME=Path(__file__).resolve().parents[1]; REPO=GAME.parents[1]; SRC=GAME/'assets/source/gpt-image-2'; OUT=GAME/'assets';
OBJECTS={'title':('title-magenta.png',None,'ui/title.webp',1000),'island':('landform-cards-charcoal.png',(0,0,627,627),'ui/card-island.webp',520),'lake':('landform-cards-charcoal.png',(627,0,1254,627),'ui/card-lake.webp',520),'peninsula':('landform-cards-charcoal.png',(0,627,627,1254),'ui/card-peninsula.webp',520),'bay':('landform-cards-charcoal.png',(627,627,1254,1254),'ui/card-bay.webp',520),'clay-lump':('props-charcoal.png',(0,0,512,512),'ui/clay-lump.webp',520),'scoop':('props-charcoal.png',(512,0,1024,512),'ui/scoop.webp',520),'boat':('boat-magenta.png',None,'world/boat.webp',380),'fish':('props-charcoal.png',(0,512,512,1024),'world/fish.webp',260),'turtle':('turtle-magenta.png',None,'world/turtle.webp',260),'action-plaque':('action-plaque-magenta.png',None,'ui/action-plaque.webp',520)}

def base_url(a):
 c={}
 try:c=json.loads((REPO/'tools/state/local.json').read_text())
 except Exception:pass
 return (a.qwen_url or os.getenv('QLOBE_QWEN_URL') or c.get('qwenUrl','')).rstrip('/')
def post(url,fields,img):
 b='----qlobe-land'; body=bytearray()
 for k,v in fields.items(): body+=f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
 body+=f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="{img.name}"\r\nContent-Type: image/png\r\n\r\n'.encode()+img.read_bytes()+f'\r\n--{b}--\r\n'.encode()
 req=urllib.request.Request(url,data=body,headers={'Content-Type':f'multipart/form-data; boundary={b}'})
 with urllib.request.urlopen(req,timeout=300) as r:return r.read()
def get(u):
 with urllib.request.urlopen(u,timeout=300) as r:return r.read()
PROMPTS={'title':'Background layer: flat bright magenta only. Top layer: the complete exact title lockup; preserve all lettering and edges.','island':'Background layer: flat dark charcoal only. Top layer: the complete wooden island landform card including its blank label band.','lake':'Background layer: flat dark charcoal only. Top layer: the complete wooden lake landform card including its blank label band.','peninsula':'Background layer: flat dark charcoal only. Top layer: the complete wooden peninsula landform card including its blank label band.','bay':'Background layer: flat dark charcoal only. Top layer: the complete wooden bay landform card including its blank label band.','clay-lump':'Background layer: flat dark charcoal only. Top layer: the complete clay lump.','scoop':'Layer 1 is only the flat dark charcoal background. Layer 2 must be the entire light beech wooden scoop alone on true transparency. The scoop is the foreground subject: its bowl interior, rim, handle, end cap, wood texture, and every pixel inside its outer silhouette must be opaque; everything outside that silhouette must be fully transparent.','boat':'Layer 1 is only the flat bright magenta background. Layer 2 must be the one entire toy sailboat alone on true transparency. The foreground sailboat includes ALL of its parts as one subject: the complete pale wooden oval bowl-shaped hull across the bottom, both teal sails, the full central wooden mast, and the complete coral flag at the top. Keep the hull and coral flag fully opaque and connected with the mast and sails; do not omit any part or isolate only the sail or mast. Everything outside the complete boat silhouette must be fully transparent.','fish':'Background layer: flat dark charcoal only. Top layer: the complete fish.','turtle':'Layer 1 is only the flat bright magenta background. Layer 2 must be the one entire green clay turtle alone on true transparency. The turtle is the foreground subject: keep its complete dark-green shell, head and eye, all four light-green flippers, and small triangular tail fully opaque as one connected animal. The subject has no strings, cords, whiskers, scribbles, or long thin trailing lines: exclude all such artifacts. Do not turn the turtle into a transparent hole or keep the magenta outside. Everything outside the complete turtle silhouette must be fully transparent.','action-plaque':'Layer 1 is only the flat bright magenta background. Layer 2 must be the one entire blank action plaque alone on true transparency. Keep the complete continuous pale beechwood outer frame on all four sides AND its large deep-teal clay inset as one fully opaque foreground object; the teal middle is part of the plaque, not a hole or background. Everything outside the complete plaque silhouette must be fully transparent.'}
VISUAL_REJECTIONS={
 'boat':[{'seed':9001,'source':'slices/boat.png','reason':'human magenta review: wooden hull omitted'},{'seed':2718,'source':'slices/boat.png','reason':'human magenta review: coral flag omitted'}],
 'turtle':[{'seed':9001,'source':'slices/turtle.png','reason':'alpha matte inverted'},{'seed':1337,'source':'slices/turtle.png','reason':'background retained'},{'seed':2718,'source':'slices/turtle.png','reason':'human magenta review: long trailing line artifacts'}],
 'action-plaque':[{'seed':2718,'source':'slices/action-plaque.png','reason':'alpha matte inverted'},{'seed':1337,'source':'slices/action-plaque.png','reason':'human magenta review: upper wood frame omitted'},{'seed':31415,'source':'slices/action-plaque.png','reason':'alpha matte inverted'}],
}
def prompt(n): return PROMPTS[n]+' Preserve exact colors, texture, shape, position, and scale; do not crop, redraw, rearrange, add, remove, or add shadows.'

def clean_alpha_components(alpha):
 """Drop small disconnected Layered debris without synthesizing transparency.

 Qwen Layered remains the alpha authority. This only removes tiny islands from
 its returned matte; it does not flood-fill, chroma-key, or infer an outline.
 A two-pixel dilation around accepted core components retains their original
 antialiasing while keeping charcoal/magenta flecks out of the runtime WebP.
 """
 width,height=alpha.size; values=alpha.tobytes(); count=width*height
 core=bytearray(1 if value>=24 else 0 for value in values); seen=bytearray(count); keep=bytearray(count)
 minimum=max(96,int(count*.00008)); components=0; kept=0; removed_components=0
 for start in range(count):
  if not core[start] or seen[start]: continue
  components+=1; seen[start]=1; queue=deque([start]); pixels=[]
  while queue:
   index=queue.popleft(); pixels.append(index); x=index%width
   for neighbour in (index-1,index+1,index-width,index+width):
    if neighbour<0 or neighbour>=count or seen[neighbour] or not core[neighbour]: continue
    if neighbour==index-1 and x==0 or neighbour==index+1 and x==width-1: continue
    seen[neighbour]=1; queue.append(neighbour)
  if len(pixels)>=minimum:
   kept+=1
   for index in pixels: keep[index]=255
  else: removed_components+=1
 expanded=Image.frombytes('L',(width,height),bytes(keep)).filter(ImageFilter.MaxFilter(5)).tobytes()
 cleaned=bytearray(values); removed_pixels=0
 for index,value in enumerate(cleaned):
  if value and not expanded[index]: cleaned[index]=0; removed_pixels+=1
 return Image.frombytes('L',(width,height),bytes(cleaned)), {'componentCount':components,'keptComponents':kept,'removedComponents':removed_components,'removedAlphaPixels':removed_pixels,'minimumCorePixels':minimum}

def extract(name,src,seed,base,force=False):
 raw=SRC/f'{name}-layer2-seed{seed}.png'
 if raw.exists() and not force: return raw
 j=json.loads(post(base+'/workflows/qwen-image-layered',{'prompt':prompt(name),'layers':'2','seed':str(seed)},src)); jid=j.get('job_id') or j.get('id')
 if not jid: raise RuntimeError(f'Qwen Layered returned no job id for {name}: {j}')
 for _ in range(450):
  time.sleep(4); s=json.loads(get(base+f'/jobs/{jid}'))
  if s.get('status')=='completed':
   d=get(base+f'/jobs/{jid}/result?output=layer_2');
   if not d.startswith(b'\x89PNG'): raise RuntimeError('non-PNG layer_2')
   raw.write_bytes(d); return raw
  if s.get('status') in {'failed','error','cancelled','canceled'}: raise RuntimeError(str(s))
 raise TimeoutError(jid)
def process(name,raw,final,maxedge,seed):
 im=Image.open(raw)
 if im.format!='PNG' or 'A' not in im.getbands(): raise RuntimeError('layer2 must be RGBA PNG')
 im=im.convert('RGBA'); a,component_cleanup=clean_alpha_components(im.getchannel('A')); alpha_floor=16; a=a.point(lambda value:0 if value<alpha_floor else value); im.putalpha(a); orig_size=im.size; corners=[a.getpixel(p) for p in [(0,0),(orig_size[0]-1,0),(0,orig_size[1]-1),(orig_size[0]-1,orig_size[1]-1)]]
 vals=a.tobytes(); transparent=sum(v<16 for v in vals)/len(vals); opaque=sum(v>=224 for v in vals)/len(vals)
 qa_candidate=Image.new('RGBA',im.size,(255,0,255,255)); qa_candidate.alpha_composite(im); qa_candidate.convert('RGB').save(SRC/f'{name}-qa-magenta-seed{seed}.png')
 if max(corners)>16 or transparent<.05 or opaque<.01: raise RuntimeError('layer2 alpha QA failed')
 bbox=a.point(lambda x:255 if x>=24 else 0).getbbox()
 if not bbox: raise RuntimeError('empty alpha')
 cov=(bbox[2]-bbox[0])*(bbox[3]-bbox[1])/(orig_size[0]*orig_size[1])
 if not .03<=cov<=.95: raise RuntimeError('implausible bbox coverage')
 if not bbox: raise RuntimeError('empty alpha')
 im=im.crop(bbox); pad=16; im=ImageOps.expand(im,border=pad,fill=(0,0,0,0)); im.thumbnail((maxedge,maxedge),Image.Resampling.LANCZOS)
 final.parent.mkdir(parents=True,exist_ok=True); im.save(final,'WEBP',quality=88,method=6)
 qa=Image.new('RGB',im.size,(255,0,255)); qa.paste(im,mask=im.getchannel('A')); qa.save(SRC/f'{name}-qa-magenta.png')
 return {'sourceSize':list(orig_size),'size':[im.width,im.height],'alphaBBox':list(bbox),'bboxCoverage':round(cov,4),'alphaHistogram':{'transparentPct':round(transparent*100,3),'opaqueCorePct':round(opaque*100,3),'partialPct':round((1-transparent-opaque)*100,3)},'alphaComponentCleanup':component_cleanup,'alphaFloor':alpha_floor,'originalCornerAlpha':corners,'selectedOutput':'layer_2','rawLayer':str(raw.relative_to(GAME)),'finalKB':round(final.stat().st_size/1024,1),'selectedSeed':seed,'validation':'passed'}
def main():
 p=argparse.ArgumentParser(); p.add_argument('--force',action='store_true'); p.add_argument('--prepare-only',action='store_true'); p.add_argument('--reprocess-only',action='store_true'); p.add_argument('--only',nargs='*'); p.add_argument('--qwen-url'); p.add_argument('--seed',type=int,default=42); a=p.parse_args(); base=base_url(a)
 unknown=[name for name in (a.only or []) if name not in OBJECTS]
 if unknown: raise SystemExit(f"unknown object(s): {', '.join(unknown)}")
 selected_objects={name:value for name,value in OBJECTS.items() if not a.only or name in a.only}
 tray=Image.open(SRC/'tray-empty.png').convert('RGB').resize((1280,960),Image.Resampling.LANCZOS); (OUT/'scenes').mkdir(parents=True,exist_ok=True); tray.save(OUT/'scenes/tray.webp','WEBP',quality=88)
 slices=SRC/'slices'; slices.mkdir(exist_ok=True)
 for n,(sn,cell,_,_) in OBJECTS.items():
  if cell:
   im=Image.open(SRC/sn).crop(cell); im.save(slices/f'{n}.png')
 if a.prepare_only: return
 if a.reprocess_only:
  record_path=SRC/'processing.json'
  rec=json.loads(record_path.read_text())
  for n,(sn,cell,on,edge) in selected_objects.items():
   previous=rec.get('objects',{}).get(n,{})
   candidates=dict.fromkeys((previous.get('selectedSeed'),a.seed,1337,42,9001,2718))
   result=None; selected=None; failures=[]; final=OUT/on
   for seed in candidates:
    raw=SRC/f'{n}-layer2-seed{seed}.png' if seed is not None else None
    if raw is None or not raw.is_file(): continue
    try: result=process(n,raw,final,edge,seed); selected=seed; break
    except Exception as exc: failures.append({'seed':seed,'error':str(exc)})
   if result is None: raise RuntimeError(f'no accepted raw Layered candidate available for {n}: {failures}')
   result.update({'source':str(((slices/f'{n}.png') if cell else SRC/sn).relative_to(GAME)),'crop':list(cell) if cell else None,'prompt':prompt(n),'workflow':'qwen-image-layered','final':str(final.relative_to(GAME)),'rejectedCandidates':[ *previous.get('rejectedCandidates',[]), *failures ],'visualRejections':VISUAL_REJECTIONS.get(n,[])})
   rec.setdefault('objects',{})[n]=result
  rec['alphaCleanup']='small disconnected Layered matte components removed and alpha below 16 floored; no flood fill or chroma key'
  record_path.write_text(json.dumps(rec,indent=2)+'\n'); return
 if not base: raise SystemExit('qwen URL not configured')
 record_path=SRC/'processing.json'
 if a.only and record_path.is_file(): rec=json.loads(record_path.read_text())
 else: rec={'workflow':'qwen-image-layered','tray':{'source':'tray-empty.png','size':[1448,1086],'final':'scenes/tray.webp','finalSize':[1280,960]},'objects':{}}
 for n,(sn,cell,on,edge) in selected_objects.items():
  src=(slices/f'{n}.png') if cell else SRC/sn; final=OUT/on
  if a.force or not final.exists():
   failures=[]
   for seed in dict.fromkeys((a.seed,1337)):
    try:
     raw=extract(n,src,seed,base,a.force)
     result=process(n,raw,final,edge,seed)
     result.update({'source':str(src.relative_to(GAME)),'crop':list(cell) if cell else None,'prompt':prompt(n),'workflow':'qwen-image-layered','final':str(final.relative_to(GAME)),'visualRejections':VISUAL_REJECTIONS.get(n,[])})
     rec['objects'][n]=result
     break
    except Exception as exc:
     failures.append({'seed':seed,'error':str(exc)})
   else:
    raise RuntimeError(f'{n} failed every extraction candidate: {failures}')
   rec['objects'][n]['rejectedCandidates']=failures
  else:
   with Image.open(final) as existing:
    rec['objects'][n]={'existing':True,'source':str(src.relative_to(GAME)),'crop':list(cell) if cell else None,'prompt':prompt(n),'workflow':'qwen-image-layered','selectedOutput':'layer_2','final':str(final.relative_to(GAME)),'size':list(existing.size),'finalKB':round(final.stat().st_size/1024,1)}
 record_path.write_text(json.dumps(rec,indent=2)+'\n')
if __name__=='__main__': main()
