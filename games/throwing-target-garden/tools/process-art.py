from PIL import Image, ImageDraw
from pathlib import Path
from collections import deque
import json
ROOT=Path(__file__).resolve().parents[1]; A=ROOT/'assets'; SRC=A/'source/gpt-image-2'

def chroma(im):
 im=im.convert('RGBA'); px=im.load()
 for y in range(im.height):
  for x in range(im.width):
   r,g,b,a=px[x,y]; d=g-max(r,b)
   # The generated sheets use luminous chroma green. Fade pixels toward
   # transparency only when BOTH absolute green and green dominance are high,
   # preserving the darker natural greens used by felt leaves and vines.
   green_strength=max(0.0,min(1.0,(g-130)/100))
   dominance_strength=max(0.0,min(1.0,(d-35)/100))
   strength=min(green_strength,dominance_strength)
   if strength>0:
    alpha=max(0,min(255,round(a*(1-strength))))
    # Remove chroma contamination from the feathered fringe before encoding.
    despilled_green=min(g,max(r,b)+14) if alpha<245 else g
    px[x,y]=(r,despilled_green,b,alpha)
 return im

def despill(im, mode='natural'):
 if mode=='natural': return im
 px=im.load()
 for y in range(im.height):
  for x in range(im.width):
   r,g,b,a=px[x,y]; d=g-max(r,b)
   should_clean=(mode=='no-green' and a>0 and d>8) or (mode=='low-alpha' and 0<a<210 and d>8)
   if not should_clean: continue
   alpha=a
   if d>28:
    alpha=round(a*max(0.0,min(1.0,(62-d)/34)))
   px[x,y]=(r,max(r,b),b,alpha)
 return im

def clear_edge_chroma(raw, im):
 """Clear only the saturated source-key field connected to the crop edge."""
 px=raw.load(); out=im.load(); w,h=raw.size; pending=deque(); seen=set()
 def keyed(x,y):
  r,g,b,_=px[x,y]
  return g>=180 and g-max(r,b)>=100
 def seed(x,y):
  if (x,y) not in seen and keyed(x,y): seen.add((x,y)); pending.append((x,y))
 for x in range(w): seed(x,0); seed(x,h-1)
 for y in range(h): seed(0,y); seed(w-1,y)
 while pending:
  x,y=pending.popleft(); out[x,y]=(0,0,0,0)
  for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
   if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen and keyed(nx,ny):
    seen.add((nx,ny)); pending.append((nx,ny))
 return im

def export(src,box,out,size,spill='natural',fill=.98,edge_key=False):
 raw=Image.open(src).crop(box).convert('RGBA')
 im=despill(chroma(raw.copy()),spill); bb=im.getchannel('A').getbbox()
 if edge_key: im=clear_edge_chroma(raw,im)
 if bb: im=im.crop(bb)
 canvas=Image.new('RGBA',size,(0,0,0,0))
 scale=min((size[0]*fill)/im.width,(size[1]*fill)/im.height)
 im=im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.Resampling.LANCZOS)
 im=despill(im,spill)
 canvas.alpha_composite(im,((size[0]-im.width)//2,(size[1]-im.height)//2))
 if spill=='natural': canvas.save(out,'WEBP',quality=95,method=6)
 else: canvas.save(out,'WEBP',lossless=True,method=6,exact=True)

def widen_panel(src,out,size=(1100,240)):
 im=Image.open(src).convert('RGBA'); bb=im.getchannel('A').getbbox()
 if not bb: raise ValueError(f'{src}: empty panel')
 im=im.crop(bb)
 target_h=size[1]-4
 im=im.resize((round(im.width*target_h/im.height),target_h),Image.Resampling.LANCZOS)
 edge=max(36,round(im.width*.24)); middle=max(1,im.width-edge*2)
 target_middle=size[0]-8-edge*2
 if target_middle<1: raise ValueError(f'{out}: target too narrow for panel edges')
 left=im.crop((0,0,edge,im.height)); center=im.crop((edge,0,edge+middle,im.height)); right=im.crop((edge+middle,0,im.width,im.height))
 center=center.resize((target_middle,im.height),Image.Resampling.LANCZOS)
 canvas=Image.new('RGBA',size,(0,0,0,0)); x=4; y=(size[1]-im.height)//2
 canvas.alpha_composite(left,(x,y)); x+=left.width
 canvas.alpha_composite(center,(x,y)); x+=center.width
 canvas.alpha_composite(right,(x,y))
 canvas.save(out,'WEBP',quality=92,method=6,exact=True)

def main():
 for d in ('ui','targets','numerals','beanbags','scenes','qa'): (A/d).mkdir(exist_ok=True)
 export(SRC/'title-target-setup-v2.png',(42,28,982,520),A/'ui/title.webp',(1100,500)); export(SRC/'title-target-setup-v2.png',(42,535,982,935),A/'ui/target-hit.webp',(900,360)); export(SRC/'title-target-setup-v2.png',(85,945,985,1525),A/'ui/setup-safe.webp',(760,620))
 for n,b in zip(('number','color','sequence'),((70,45,515,555),(535,45,1010,555),(1025,45,1470,555))): export(SRC/'modes-carriers-v2.png',b,A/f'ui/mode-{n}.webp',(480,420),edge_key=True)
 for n,b in zip(('1','2','3','4','5'),((22,22,454,370),(484,22,881,370),(906,22,1380,370),(22,396,454,740),(484,396,881,740))): export(SRC/'numerals-kit-v2.png',b,A/f'numerals/{n}.webp',(260,320),'no-green')
 for n,b in zip(('red','yellow','blue'),((22,765,330,1080),(354,765,659,1080),(684,765,987,1080))): export(SRC/'numerals-kit-v2.png',b,A/f'beanbags/{n}.webp',(280,280),'no-green')
 export(SRC/'numerals-kit-v2.png',(1012,765,1380,1080),A/'ui/basket.webp',(620,390))
 for n,b,s in [('flower-happy',(1260,300,1520,535),(340,420)),('flower-cheer',(972,300,1225,535),(340,420)),('end-garland',(15,700,1522,1022),(1100,360))]: export(SRC/'feedback-v2.png',b,A/f'ui/{n}.webp',s)
 for n,b,s,spill in [('button-orange',(35,70,505,340),(760,240),'no-green'),('button-green',(525,70,1015,340),(760,240),'low-alpha'),('button-blue',(1020,70,1505,340),(760,240),'no-green'),('badge-tracking',(65,390,750,620),(420,140),'natural'),('badge-progress',(780,390,1465,620),(380,140),'natural'),('tracking-compass',(65,650,1040,940),(760,220),'natural'),('flip-mapping',(1070,640,1405,965),(240,240),'natural')]: export(SRC/'interface-kit-v3.png',b,A/f'ui/{n}.webp',s,spill)
 widen_panel(A/'ui/button-green.webp',A/'ui/panel-green-wide.webp')
 for n,b,spill in [('cream',(30,180,405,590),'no-green'),('rainbow',(415,180,800,590),'natural'),('red',(810,180,1185,590),'no-green'),('yellow',(1200,190,1560,580),'no-green'),('blue',(1585,180,1970,590),'no-green')]: export(SRC/'targets-chroma.png',b,A/f'targets/{n}.webp',(620,620),spill,.84)
 Image.open(SRC/'garden-day.png').convert('RGB').save(A/'scenes/garden-day.webp','WEBP',quality=82,method=6)
 # confetti use genuine region crops
 export(SRC/'feedback-v2.png',(990,540,1235,700),A/'ui/confetti-dot.webp',(240,160)); export(SRC/'feedback-v2.png',(1235,540,1510,700),A/'ui/confetti-ribbon.webp',(240,160))
 report={'assets':{},'ok':True}
 for p in sorted(A.rglob('*.webp')):
  if 'qa' in p.parts or 'source' in p.parts: continue
  im=Image.open(p); has_alpha='A' in im.getbands(); rgba=im.convert('RGBA'); al=rgba.getchannel('A'); corners=[rgba.getpixel(c)[3] for c in ((0,0),(rgba.width-1,0),(0,rgba.height-1),(rgba.width-1,rgba.height-1))]; bb=al.getbbox()
  spill_pixels=0 if 'scenes' in p.parts else sum(1 for r,g,b,a in rgba.get_flattened_data() if 0<a<220 and g-max(r,b)>8)
  spill_ratio=spill_pixels/max(1,rgba.width*rgba.height)
  valid=('scenes' in p.parts) or (has_alpha and al.getextrema()[0]==0 and al.getextrema()[1]==255 and max(corners)<=8 and bb and bb!=(0,0,rgba.width,rgba.height))
  report['assets'][str(p.relative_to(A))]={'size':rgba.size,'mode':im.mode,'has_alpha':has_alpha,'alpha_extrema':al.getextrema(),'corners':corners,'content_bbox':bb,'low_alpha_green_pixels':spill_pixels,'low_alpha_green_ratio':round(spill_ratio,6),'file_bytes':p.stat().st_size,'valid':valid}; report['ok'] &= valid
 (A/'qa/report.json').write_text(json.dumps(report,indent=2))
 finals=[p for p in sorted(A.rglob('*.webp')) if 'qa' not in p.parts and 'source' not in p.parts]
 for name,bg in [('contact-magenta.webp',(255,0,180,255)),('contact-green.webp',(0,180,80,255))]:
  cell=(220,150); sheet=Image.new('RGBA',(cell[0]*5,cell[1]*((len(finals)+4)//5)),bg)
  d=ImageDraw.Draw(sheet)
  for i,p in enumerate(finals):
   im=Image.open(p).convert('RGBA')
   # Flatten before resizing so color values hidden under alpha cannot bleed as
   # white/key-colored seams in the QA thumbnail.
   opaque=Image.new('RGB',im.size,bg[:3]); opaque.paste(im,mask=im.getchannel('A')); opaque.thumbnail((210,120),Image.Resampling.LANCZOS)
   x=(i%5)*220+5; y=(i//5)*150+5; sheet.paste(opaque,(x+(210-opaque.width)//2,y)); d.text((x,y+122),p.relative_to(A).as_posix()[:30],fill='white')
  sheet.save(A/'qa'/name,'WEBP',quality=90)
if __name__=='__main__': main()
