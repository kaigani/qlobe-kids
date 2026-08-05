#!/usr/bin/env python3
"""Deterministic finalizer for Weather Scientist raster masters (Pillow only).

The UI kit (control tray, badges, action carriers, wind slider, title, hub
tile) is universal across scenes and only ever comes from the original
meadow production sheets. Each scene contributes its own background and
world production sheet (landmark, 3-stage growth character, weather-state
layers, particles) under assets/source/krea2/<scene>-background-wide.png and
assets/source/qwen-layered/<scene>-world-kit.png.
"""
from pathlib import Path
import argparse, json, sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[1]
SRC = ROOT / 'assets/source'
OUT = ROOT / 'assets'
SCENES = ['meadow', 'desert', 'arctic', 'rainforest']
WORLD = ['tree','flower-seedling','flower-bud','flower-bloom','sun','cloud','rain-cloud','rainbow','puddle','shade','raindrop','leaf-1','leaf-2','leaf-3','wind-curl','sparkle']
UI = ['control-sun','control-wind','control-cloud','control-rain','badge-sun','badge-wind','badge-cloud','badge-rain','control-tray','prompt-banner','wind-track','wind-knob','play','explore','reset','progress-ribbon']
# The authored sheets are a clear 4x4 visual arrangement, but the tall paper
# cards intentionally overhang an equal mathematical cell. Explicit semantic
# regions keep every complete object and exclude its neighbours. Every new
# scene's world sheet is generated to the same 4x4 layout discipline so
# these same boxes keep working without redefinition per scene.
WORLD_BOXES = [
    (25,20,275,290),(285,110,515,290),(525,45,740,290),(775,25,1015,290),
    (20,300,275,535),(270,315,525,535),(510,315,775,535),(760,310,1018,535),
    (20,565,275,750),(270,560,530,750),(535,540,745,750),(755,540,1015,750),
    (20,750,275,1005),(270,750,530,1005),(510,750,780,1005),(755,750,1015,1005),
]
UI_BOXES = [
    (40,20,280,355),(280,20,515,355),(510,20,750,355),(735,20,985,355),
    (35,350,280,600),(270,350,520,600),(510,350,765,600),(755,350,1005,600),
    (20,595,280,805),(275,595,530,805),(520,595,825,805),(815,585,990,805),
    (20,805,295,990),(280,805,550,990),(540,795,745,1015),(735,805,1015,990),
]
# Sheet-cell names stay the production-sheet vocabulary (tree, flower-*);
# runtime filenames use the scene-agnostic scenes[] vocabulary (landmark,
# growth-*) under a per-scene subfolder.
RENAME = {'tree':'landmark','flower-seedling':'growth-seedling','flower-bud':'growth-bud','flower-bloom':'growth-bloom'}

def meaningful_alpha(im):
    if im.mode != 'RGBA': return False
    a = im.getchannel('A')
    return a.getextrema()[0] < 250 and a.getbbox() is not None

def clean_alpha(im, cutoff=8):
    im=im.convert('RGBA'); alpha=im.getchannel('A').point(lambda value: 0 if value < cutoff else value)
    im.putalpha(alpha); return im

def trim(im, pad=8):
    im=clean_alpha(im)
    a = im.getchannel('A'); box = a.getbbox()
    if not box: return im
    box = (max(0,box[0]-pad), max(0,box[1]-pad), min(im.width,box[2]+pad), min(im.height,box[3]+pad))
    return im.crop(box)

def fit(im, size):
    im = trim(im)
    # Keep a transparent internal border so antialiased edges never touch corners.
    margin = 8
    avail = (max(1,size[0]-2*margin), max(1,size[1]-2*margin))
    scale = min(avail[0]/im.width, avail[1]/im.height)
    nw, nh = max(1,round(im.width*scale)), max(1,round(im.height*scale))
    im = im.resize((nw,nh), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', size)
    canvas.alpha_composite(im, ((size[0]-nw)//2, size[1]-margin-nh))
    return canvas

def fit_stretched_carrier(im, size):
    """Fill a blank paper carrier's authored wide target without CSS artwork."""
    im=trim(im); margin=8
    im=im.resize((max(1,size[0]-2*margin),max(1,size[1]-2*margin)),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',size); canvas.alpha_composite(im,(margin,margin)); return canvas

def semantic_crops(path, boxes):
    im = Image.open(path).convert('RGBA')
    if not meaningful_alpha(im): raise ValueError(f'Qwen source lacks meaningful alpha: {path}')
    sx,sy=im.width/1024,im.height/1024
    return [clean_alpha(im.crop((round(x1*sx),round(y1*sy),round(x2*sx),round(y2*sy)))) for x1,y1,x2,y2 in boxes]

def save(im, path, quality=88):
    path.parent.mkdir(parents=True,exist_ok=True)
    if im.mode == 'RGBA': im.save(path,'WEBP',lossless=True,method=6)
    else: im.save(path,'WEBP',quality=quality,method=6)

def build_background(scene_id, bg_source, report):
    """Wide 3:2 working ratio so `.weather-stage`'s full-bleed `object-fit:
    cover` has margin to crop gracefully at any device ratio, plus a
    scene-chooser thumbnail (a straight center crop of the scene's own
    background — it IS authored art, no separate generation needed)."""
    bg = Image.open(bg_source).convert('RGB')
    crop = bg if bg.size == (1536,1024) else bg.resize((1536,1024), Image.Resampling.LANCZOS)
    bp = OUT/'backgrounds'/f'{"observatory-meadow" if scene_id == "meadow" else scene_id}.webp'
    q = 90
    while q >= 35:
        save(crop,bp,q)
        if bp.stat().st_size <= 300000: break
        q -= 5
    side=min(crop.size); left=(crop.width-side)//2; top=max(0,min(int((crop.height-side)*0.28),crop.height-side))
    thumb=crop.crop((left,top,left+side,top+side)).resize((440,440),Image.Resampling.LANCZOS)
    save(thumb,OUT/'ui'/f'scene-{scene_id}.webp',88)
    report['files'][str(bp.relative_to(ROOT))]={'dimensions':crop.size,'bytes':bp.stat().st_size,'quality':q,'opaque':True}

# Per-scene fixups when a generated sheet didn't land every cell in its
# prompted grid position. Maps {new_slot: source_slot} — a slot with no
# entry keeps its own content. Verified cell-by-cell against the actual
# sheet, not assumed from the prompt: desert's puddle(8)/shade(9) came back
# semantically reversed (swap); rainforest's sun(4)/cloud(5) came back
# swapped, and puddle/shade/raindrop/leaf1(8-11) came back rotated by one.
CELL_REMAP = {
    'desert': {8:9, 9:8},
    'rainforest': {4:5, 5:4, 8:9, 9:10, 10:11, 11:8},
}

def build_world(scene_id, qworld_source, report):
    world = semantic_crops(qworld_source, WORLD_BOXES)
    remap = CELL_REMAP.get(scene_id)
    if remap:
        world = [world[remap.get(i,i)] for i in range(len(world))]
    qa=SRC/'qa-magenta'; qa.mkdir(parents=True,exist_ok=True)
    for name,cell in zip(WORLD,world):
        out_name = RENAME.get(name,name)
        size=(560,760) if name=='tree' else ((420,520) if name.startswith('flower-') else (160,160) if name in ('raindrop','leaf-1','leaf-2','leaf-3') else (720,720))
        path=OUT/('particles' if name in ('raindrop','leaf-1','leaf-2','leaf-3') else 'world')/scene_id/(out_name+'.webp'); out=fit(cell,size); save(out,path)
        comp=Image.new('RGBA',out.size,(255,0,180,255)); comp.alpha_composite(out); comp.convert('RGB').save(qa/f'{scene_id}-{out_name}.jpg','JPEG',quality=85)
        report['files'][str(path.relative_to(ROOT))]={'dimensions':out.size,'bytes':path.stat().st_size,'alpha_bbox':out.getchannel('A').getbbox(),'corner_alpha':[out.getpixel((x,y))[3] for x,y in ((0,0),(out.width-1,0),(0,out.height-1),(out.width-1,out.height-1))]}

def build_ui(qui_source, report):
    """Universal 'field kit' chrome — generated once from the meadow
    production pass, reused unchanged by every scene."""
    ui = semantic_crops(qui_source, UI_BOXES)
    qa=SRC/'qa-magenta'; qa.mkdir(parents=True,exist_ok=True)
    for name,cell in zip(UI,ui):
        size=(340,390) if name.startswith('control-') else ((190,190) if name.startswith('badge-') else {'control-tray':(1100,320),'prompt-banner':(780,220),'wind-track':(520,120),'wind-knob':(190,190),'play':(620,220),'explore':(620,220),'reset':(220,220),'progress-ribbon':(500,160)}[name])
        path=OUT/'ui'/(name+'.webp'); out=fit_stretched_carrier(cell,size) if name=='prompt-banner' else fit(cell,size); save(out,path)
        comp=Image.new('RGBA',out.size,(255,0,180,255)); comp.alpha_composite(out); comp.convert('RGB').save(qa/(name+'.jpg'),'JPEG',quality=85)
        alpha=out.getchannel('A'); bbox=alpha.getbbox(); pixels=alpha.get_flattened_data() if hasattr(alpha,'get_flattened_data') else alpha.getdata(); report['files'][str(path.relative_to(ROOT))]={'dimensions':out.size,'bytes':path.stat().st_size,'alpha_bbox':bbox,'alpha_coverage':sum(1 for p in pixels if p>0)/(out.width*out.height),'corner_alpha':[out.getpixel((x,y))[3] for x,y in ((0,0),(out.width-1,0),(0,out.height-1),(out.width-1,out.height-1))]}

def build_splash_background(report):
    """The scene-chooser splash's own backdrop — a neutral 'home' twilight
    observatory, distinct from any destination scene, generated once."""
    src = SRC/'krea2/splash-background-wide.png'
    if not src.exists(): raise FileNotFoundError(f'Missing required Krea2 source: {src}')
    bg = Image.open(src).convert('RGB')
    crop = bg if bg.size == (1536,1024) else bg.resize((1536,1024), Image.Resampling.LANCZOS)
    bp = OUT/'backgrounds/splash.webp'; q = 90
    while q >= 35:
        save(crop,bp,q)
        if bp.stat().st_size <= 300000: break
        q -= 5
    report['files'][str(bp.relative_to(ROOT))]={'dimensions':crop.size,'bytes':bp.stat().st_size,'quality':q,'opaque':True}

def build_hub_and_title(report):
    hub_source = SRC/'gpt-image-2/hub-tile.png'
    if not hub_source.exists(): raise FileNotFoundError(f'Missing required GPT Image 2 source: {hub_source}')
    hub = Image.open(hub_source).convert('RGB')
    target_ratio = 640 / 533
    if hub.width / hub.height > target_ratio:
        crop_width = round(hub.height * target_ratio); left = (hub.width - crop_width) // 2
        hub = hub.crop((left, 0, left + crop_width, hub.height))
    else:
        crop_height = round(hub.width / target_ratio); top = (hub.height - crop_height) // 2
        hub = hub.crop((0, top, hub.width, top + crop_height))
    hub = hub.resize((640,533),Image.Resampling.LANCZOS)
    hub_path = PROJECT/'assets/hub/tiles/weather-scientist.jpg'
    hub_path.parent.mkdir(parents=True,exist_ok=True)
    hub.save(hub_path,'JPEG',quality=88,optimize=True,progressive=True)
    report['hubTile']={'path':'assets/hub/tiles/weather-scientist.jpg','dimensions':hub.size,'bytes':hub_path.stat().st_size,'opaque':True}
    qtitle = SRC/'qwen-layered/title.png'
    if not qtitle.exists(): raise FileNotFoundError(f'Missing required Qwen source: {qtitle}')
    title=Image.open(qtitle).convert('RGBA')
    if not meaningful_alpha(title): raise ValueError(f'Qwen source lacks meaningful alpha: {qtitle}')
    save(fit(title,(980,420)),OUT/'title.webp')

def sources_for(scene_id):
    if scene_id == 'meadow':
        return SRC/'krea2/observatory-meadow-wide.png', SRC/'qwen-layered/world-kit.png'
    return SRC/'krea2'/f'{scene_id}-background-wide.png', SRC/'qwen-layered'/f'{scene_id}-world-kit.png'

def build(scenes):
    report = {'files': {}}
    for scene_id in scenes:
        bg_source, qworld_source = sources_for(scene_id)
        for p in (bg_source, qworld_source):
            if not p.exists(): raise FileNotFoundError(f'Missing required source for scene {scene_id}: {p}')
        build_background(scene_id, bg_source, report)
        build_world(scene_id, qworld_source, report)
    if 'meadow' in scenes:
        qui = SRC/'qwen-layered/ui-kit.png'
        if not qui.exists(): raise FileNotFoundError(f'Missing required Qwen source: {qui}')
        build_ui(qui, report)
        build_hub_and_title(report)
        build_splash_background(report)
    (SRC/'process-art-qa.json').write_text(json.dumps(report,indent=2))

def required_sources(scenes):
    paths = [SRC/'qwen-layered/ui-kit.png', SRC/'qwen-layered/title.png', SRC/'gpt-image-2/hub-tile.png', SRC/'krea2/splash-background-wide.png']
    for scene_id in scenes:
        paths.extend(sources_for(scene_id))
    return paths

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--check',action='store_true')
    ap.add_argument('--scene',action='append',choices=SCENES,help='restrict to one or more scenes (default: all)')
    a=ap.parse_args()
    scenes = a.scene or SCENES
    try:
        if a.check:
            for p in required_sources(scenes):
                if not p.exists(): raise FileNotFoundError(f'Missing required source: {p}')
            print('inputs present; --check does not mutate outputs')
        else: build(scenes)
    except Exception as e: print(f'process-art: {e}',file=sys.stderr); return 2
    return 0
if __name__=='__main__': sys.exit(main())
