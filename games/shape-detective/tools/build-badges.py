#!/usr/bin/env python3
"""Build deterministic raster rosette badges from approved cutouts."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image, ImageDraw

GAME=Path(__file__).resolve().parents[1]; ROOT=GAME.parents[1]; REW=GAME/'assets/rewards'; QA=GAME/'assets/source/qa/badges'
BASE={'properties':'rosette-turquoise','search':'rosette-yellow','place':'rosette-coral'}
SYMBOLS={'circle':'shapes/circle.webp','triangle':'shapes/triangle.webp','square':'shapes/square.webp','magnifier':'ui/magnifier.webp'}
def main():
 p=argparse.ArgumentParser(); p.add_argument('--force',action='store_true'); a=p.parse_args(); QA.mkdir(parents=True,exist_ok=True); receipt={}; panels=[]
 for mode,base in BASE.items():
  out=REW/f'badge-{mode}.webp'; mag=QA/f'badge-{mode}-magenta.png'; b=Image.open(REW/f'{base}.webp').convert('RGBA'); placements={'properties':[('circle',55,80,42),('triangle',112,72,42),('square',145,120,42)],'search':[('magnifier',112,112,105)],'place':[('triangle',112,70,65),('square',112,150,55)]}[mode]
  for name,x,y,size in placements:
   src=Image.open(GAME/'assets'/SYMBOLS[name]).convert('RGBA'); src.thumbnail((size,size),Image.Resampling.LANCZOS); b.alpha_composite(src,(int(x-src.width/2),int(y-src.height/2)))
  b.save(out,'WEBP',quality=90,method=6); qa=Image.new('RGBA',b.size,(255,0,255,255)); qa.alpha_composite(b); qa.convert('RGB').save(mag)
  panels.append((mode,qa)); receipt[mode]={'base':base,'output':str(out.relative_to(ROOT)),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'placements':placements,'size':list(b.size),'method':'Pillow alpha composite; WebP q90 method6'}
 sheet=Image.new('RGB',(675,225),(255,0,255)); d=ImageDraw.Draw(sheet)
 for i,(name,im) in enumerate(panels): im.thumbnail((225,200)); sheet.paste(im,(i*225,0)); d.text((i*225+5,205),name,fill='white')
 sheet.save(QA/'contact-sheet.png'); (QA/'processing.json').write_text(json.dumps(receipt,indent=2)+'\n')
if __name__=='__main__': main()
