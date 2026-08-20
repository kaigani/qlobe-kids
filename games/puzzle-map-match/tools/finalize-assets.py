#!/usr/bin/env python3
"""Deterministically finalize puzzle-map-match raster assets."""
from __future__ import annotations
import argparse, json, shutil, gc
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "source"
OUT = ROOT / "assets"

def accepted_qwen_sheets() -> set[str]:
    try:
        report = json.loads((OUT / 'qwen-assets-report.json').read_text())
        return set(report.get('visualReview', {}).get('accepted', []))
    except (OSError, ValueError, TypeError):
        return set()

def valid_qwen_sheet(path: Path, expected=(1448, 1086)) -> bool:
    try:
        with Image.open(path) as image:
            image.load()
            if image.size != expected or 'A' not in image.getbands():
                return False
            histogram = image.convert('RGBA').getchannel('A').histogram()
            total = image.width * image.height
            return sum(histogram[:16]) / total >= 0.02 and sum(histogram[240:]) / total >= 0.25
    except (OSError, ValueError):
        return False

def trim_pad(im: Image.Image, pad: int = 8, size=(512, 512)) -> Image.Image:
    im = im.convert("RGBA")
    a = im.getchannel("A")
    box = a.getbbox()
    if box: im = im.crop(box)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    scale = min((size[0]-2*pad)/max(1, im.width), (size[1]-2*pad)/max(1, im.height), 1)
    if scale != 1:
        im = im.resize((max(1, round(im.width*scale)), max(1, round(im.height*scale))), Image.Resampling.LANCZOS)
    canvas.alpha_composite(im, ((size[0]-im.width)//2, (size[1]-im.height)//2))
    return canvas

def trim_pad_natural(im: Image.Image, pad: int = 16) -> Image.Image:
    """Alpha-trim an image and add modest transparent padding, preserving aspect."""
    im = im.convert("RGBA")
    box = im.getchannel("A").getbbox()
    if box:
        im = im.crop(box)
    canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.alpha_composite(im, (pad, pad))
    return canvas

def save(im, path, quality=90):
    """Encode atomically so an interrupted WebP write never replaces a card."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    im.save(temporary, "WEBP", quality=quality, method=4)
    temporary.replace(path)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--force', action='store_true'); args = ap.parse_args()
    report = {"version": 1, "outputs": []}
    def emit(rel, transform, im=None, alpha=False):
        path = OUT / rel; valid = False
        if path.exists() and not args.force:
            try:
                with Image.open(path) as old:
                    old.load()
                    valid = old.size == (im.size if im else old.size) and (not alpha or old.mode in ('RGBA','LA'))
            except Exception: pass
        if not valid and not args.dry_run and im is not None: save(im, path)
        if im is not None: size = list(im.size)
        else: size = list(Image.open(path).size) if path.exists() else None
        report['outputs'].append({'path': str(Path('assets')/rel), 'transform': transform, 'size': size, 'alpha': alpha})
        if im is not None:
            im.close()
            gc.collect()
    with Image.open(SRC/'splash-background-gpt-image-2.png') as source:
        splash_source = source.convert('RGB')
        splash = splash_source.resize((1440,1080), Image.Resampling.LANCZOS)
        play_texture = splash_source.crop((424, 80, 1024, 580)).resize((1440, 1080), Image.Resampling.LANCZOS)
        splash_source.close()
    emit('backgrounds/splash.webp','resize 1448x1086 -> 1440x1080',splash)
    emit('backgrounds/play-texture.webp','clean blue-paper crop (424, 80, 1024, 580) -> 1440x1080',play_texture)
    with Image.open(OUT/'ui/title.png') as source:
        title = trim_pad_natural(source, 16)
    emit('ui/title.webp','alpha-trim, natural aspect, pad 16',title,True)
    with Image.open(SRC/'play-plate-gpt-image-2-edit.png') as source:
        plate = source.convert('RGB')
    for name, box in {'map-board':(40,115,1408,863),'prompt-ribbon':(274,0,1174,165),'tray':(70,760,1378,1086)}.items():
        emit('ui/'+name+'.webp', f'crop {box}', plate.crop(box))
    plate.close()
    gc.collect()
    names = {'animals':['panda','elephant','kangaroo','bison','llama','ibex'],'foods':['bananas','watermelon','lamington','corn','cacao','pretzel'],'landmarks':['great-wall','pyramids','sydney-opera-house','statue-of-liberty','machu-picchu','eiffel-tower']}
    accepted_sheets = accepted_qwen_sheets()
    for cat, arr in names.items():
        qwen_sheet = SRC / f'{cat}-layer2.png'
        qwen_relative = str(Path('assets/source') / qwen_sheet.name)
        sheet_source = qwen_sheet if qwen_relative in accepted_sheets and valid_qwen_sheet(qwen_sheet) else SRC / f'{cat}-chroma-alpha.png'
        with Image.open(sheet_source) as source:
            sheet = source.convert('RGBA')
        xs=[0,483,966,1448]; ys=[0,543,1086]
        for i,n in enumerate(arr):
            cell = sheet.crop((xs[i%3],ys[i//3],xs[i%3+1],ys[i//3+1]))
            card = trim_pad(cell)
            cell.close()
            emit(
                f'cards/{n}.webp',
                f'{sheet_source.name}: cell crop, alpha-trim, pad/center 512x512',
                card,
                True,
            )
        sheet.close()
        gc.collect()
    conf = ROOT.parent/'globe-spin-stories/assets/ui/confetti.webp'
    target=OUT/'ui/confetti.webp'
    if args.force or not target.exists():
        if not args.dry_run:
            target.parent.mkdir(parents=True,exist_ok=True)
            temporary = target.with_name(f".{target.name}.tmp")
            shutil.copy2(conf, temporary)
            temporary.replace(target)
    report['outputs'].append({'path':'assets/ui/confetti.webp','transform':'copy papercraft confetti','size':list(Image.open(conf).size) if conf.exists() else None,'alpha':True})
    with Image.open(conf) as source:
        burst = source.convert('RGBA').crop((560, 20, 860, 300))
    emit('ui/success-burst.webp', 'crop local paper-star burst (560, 20, 860, 300)', burst, True)
    if not args.dry_run:
        report_path = OUT/'finalize-report.json'
        report_temporary = report_path.with_name(f".{report_path.name}.tmp")
        report_temporary.write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
        report_temporary.replace(report_path)
    print(json.dumps(report, sort_keys=True, indent=2))
if __name__ == '__main__': main()
