#!/usr/bin/env python3
"""Deterministically turn the approved Cleanup Timer Quest sheets into game assets."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from PIL import Image

ROOMS = ("playroom", "bedroom", "living-room")
ITEMS = {
    "playroom": ("teddy", "bunny", "elephant", "red-cube", "blue-arch", "yellow-roof-block"),
    "bedroom": ("star-sweater", "striped-sock-pair", "moon-pajamas", "moon-picture-book", "animal-picture-book", "rainbow-book"),
    "living-room": ("red-toy-train", "yellow-toy-car", "blue-toy-plane", "small-drum", "maracas", "rainbow-xylophone"),
}
BINS = ("teddy-basket", "block-box", "shirt-hamper", "book-crate", "wheel-garage", "drum-basket")

def cover(im, size):
    scale = max(size[0] / im.width, size[1] / im.height)
    x = max(1, round(im.width * scale)); y = max(1, round(im.height * scale))
    im = im.resize((x, y), Image.Resampling.LANCZOS)
    return im.crop(((x-size[0])//2, (y-size[1])//2, (x+size[0])//2, (y+size[1])//2))

def sheet_cells(im, cols, rows):
    xs = [round(i * im.width / cols) for i in range(cols + 1)]
    ys = [round(i * im.height / rows) for i in range(rows + 1)]
    return [im.crop((xs[c], ys[r], xs[c+1], ys[r+1])) for r in range(rows) for c in range(cols)]

def prune_islands(alpha, minimum_ratio=.18):
    """Drop small disconnected sheet-bleed islands while preserving pairs."""
    w, h = alpha.size; pixels = alpha.load(); seen = bytearray(w * h); components = []
    for y in range(h):
        for x in range(w):
            offset = y * w + x
            if seen[offset] or pixels[x, y] == 0: continue
            seen[offset] = 1; queue = [(x, y)]; component = []
            for cx, cy in queue:
                component.append((cx, cy))
                for ny in range(max(0, cy-1), min(h, cy+2)):
                    for nx in range(max(0, cx-1), min(w, cx+2)):
                        index = ny * w + nx
                        if not seen[index] and pixels[nx, ny] > 0:
                            seen[index] = 1; queue.append((nx, ny))
            components.append(component)
    if not components: return alpha
    floor = len(max(components, key=len)) * minimum_ratio
    for component in components:
        if len(component) >= floor: continue
        for x, y in component: pixels[x, y] = 0
    return alpha

def keyed(cell, out_size, padding):
    """Trim a Qwen Layered RGBA cutout and fit it with deterministic padding."""
    rgba = cell.convert("RGBA"); w, h = rgba.size
    alpha = rgba.getchannel("A").point(lambda value: 0 if value < 16 else value)
    alpha = prune_islands(alpha)
    opaque = alpha.point(lambda value: 255 if value else 0)
    rgba = Image.composite(rgba, Image.new("RGBA", rgba.size, (0,0,0,0)), opaque)
    rgba.putalpha(alpha); box = alpha.getbbox()
    if box is None: raise ValueError("empty cutout")
    if any(alpha.getpixel(p) > 0 for p in ((0,0),(w-1,0),(0,h-1),(w-1,h-1))): raise ValueError("opaque corner")
    area = (box[2]-box[0])*(box[3]-box[1])
    if area >= w*h*.94: raise ValueError("near-full foreground coverage")
    fg = rgba.crop(box); inner = (out_size[0]-2*padding, out_size[1]-2*padding)
    scale = min(inner[0]/fg.width, inner[1]/fg.height)
    fg = fg.resize((max(1,round(fg.width*scale)), max(1,round(fg.height*scale))), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", out_size, (0,0,0,0)); out.alpha_composite(fg, ((out_size[0]-fg.width)//2,(out_size[1]-fg.height)//2))
    return out

def save(im, path, lossless=False, quality=82):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6, lossless=lossless)

def save_jpeg(im, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(path, "JPEG", quality=88, optimize=True, progressive=True)

def main():
    ap=argparse.ArgumentParser(description=__doc__); ap.add_argument("--game-dir", type=Path, default=Path(__file__).parents[1]); args=ap.parse_args(); root=args.game_dir; repo=root.parents[1]; src=root/"assets/source"; made=[]
    try:
        title=Image.open(src/"title-alpha.png").convert("RGBA"); box=title.getchannel("A").getbbox()
        if not box: raise ValueError("title-alpha is empty")
        title = title.crop(box)
        if title.width > 1100:
            title = title.resize((1100, round(title.height * 1100 / title.width)), Image.Resampling.LANCZOS)
        save(title, root/"assets/title.webp"); made.append(root/"assets/title.webp")
        for room in ROOMS:
            scene=Image.open(src/f"{room}-gpt-image-2.png").convert("RGB"); out=cover(scene,(1600,1200)); save(out,root/f"assets/scenes/{room}.webp"); made.append(root/f"assets/scenes/{room}.webp")
            save(cover(out,(520,420)),root/f"assets/rooms/{room}.webp"); made.append(root/f"assets/rooms/{room}.webp")
            sheet=Image.open(src/f"qwen-layered/{room}-items-layer2.png");
            for name,cell in zip(ITEMS[room],sheet_cells(sheet,3,2)):
                p=root/f"assets/items/{name}.webp"; save(keyed(cell,(320,320),18),p,quality=88); made.append(p)
        bs=Image.open(src/"qwen-layered/bins-layer2.png")
        for name,cell in zip(BINS,sheet_cells(bs,3,2)):
            p=root/f"assets/bins/{name}.webp"; save(keyed(cell,(440,340),16),p,quality=88); made.append(p)
        track=Image.open(src/"qwen-layered/timer-track-layer2.png"); p=root/"assets/timer-track.webp"; save(keyed(track,(900,180),18),p,quality=88); made.append(p)
        hub=Image.open(src/"hub/qwen-badge-fix-seed42.png"); p=repo/"assets/hub/tiles/cleanup-timer-quest.jpg"; save_jpeg(cover(hub,(640,533)),p); made.append(p)
    except Exception as e:
        print(json.dumps({"ok":False,"error":str(e)})); return 1
    summary={"ok":True,"assets":[{"path":str(p.relative_to(root) if p.is_relative_to(root) else p.relative_to(repo)),"dimensions":list(Image.open(p).size),"bytes":p.stat().st_size} for p in made]}; print(json.dumps(summary,sort_keys=True)); return 0
if __name__ == "__main__": sys.exit(main())
