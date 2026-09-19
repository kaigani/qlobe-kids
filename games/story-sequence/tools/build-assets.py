"""Build optimized Story Sequence runtime art from immutable cutter outputs."""
from __future__ import annotations
import hashlib, json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
SRC = ROOT / "assets" / "source"
ART = ROOT / "assets" / "art"
STORIES = ("slide", "bake", "plant", "brush")

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def relative_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(path.relative_to(REPO)).replace("\\", "/")

def cut_card(story: str, item: dict) -> Path:
    master = Image.open(SRC / "gpt-image-2" / f"{story}-story-sheet.png").convert("RGBA")
    mask = Image.open(SRC / "cuts" / f"{story}-mask.png").convert("L")
    x0, y0, x1, y1 = item["foregroundBbox"]
    rgba = master.crop((x0, y0, x1, y1))
    detected = mask.crop((x0, y0, x1, y1))
    # The charcoal isolation ground is close to real painted details such as
    # black hair, oven interiors, and deep shadows. Fill only zero-valued mask
    # regions that cannot reach the crop edge: this restores those enclosed
    # details without importing the exterior ground around the rounded card.
    exterior_marked = detected.copy()
    ImageDraw.floodfill(exterior_marked, (0, 0), 128, thresh=0)
    solid = exterior_marked.point(lambda value: 0 if value == 128 else 255)
    # Feather inward only: pixels outside the cutter silhouette stay at zero.
    feather = solid.filter(ImageFilter.GaussianBlur(0.8))
    alpha = ImageChops.darker(solid, feather).point(lambda value: 0 if value <= 3 else value)
    rgba.putalpha(alpha)
    rgba.thumbnail((720, 720), Image.Resampling.LANCZOS)
    out = ART / "cards" / f"{story}-{item['name'].split('-', 1)[1]}.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    # Visually transparent illustrations do not benefit enough from lossless
    # storage to justify the download cost on a child's first play.
    rgba.save(out, "WEBP", quality=88, method=6, exact=True)
    assert rgba.getchannel("A").getbbox(), out
    return out

def cut_decor(item: dict) -> Path:
    source = Image.open(SRC / "cuts" / "decor" / item["file"]).convert("RGBA")
    alpha = source.getchannel("A")
    bbox = alpha.getbbox()
    assert bbox, item["name"]
    image = source.crop(bbox)
    image.thumbnail((640, 640), Image.Resampling.LANCZOS)
    out = ART / "decor" / f"{item['name']}.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, "WEBP", quality=88, method=6, exact=True)
    return out

def main() -> None:
    outputs = []
    for story in STORIES:
        manifest = json.loads((SRC / "cuts" / story / "boxes.json").read_text())
        assert len(manifest["assets"]) == 3 and {a["name"] for a in manifest["assets"]} == {f"{story}-{p}" for p in ("first", "next", "last")}
        outputs.extend(cut_card(story, item) for item in manifest["assets"])
    decor_manifest = json.loads((SRC / "cuts" / "decor" / "boxes.json").read_text())
    assert len(decor_manifest["assets"]) == 4
    outputs.extend(cut_decor(item) for item in decor_manifest["assets"])
    for name in ("library", "meadow"):
        image = Image.open(SRC / "gpt-image-2" / f"{name}-backdrop.png").convert("RGB").resize((1600, 1200), Image.Resampling.LANCZOS)
        out = ART / "backdrops" / f"{name}.webp"; out.parent.mkdir(parents=True, exist_ok=True)
        image.save(out, "WEBP", quality=84, method=6); outputs.append(out)
    hub_source = SRC / "local-api" / "krea" / "hub-tile-seed42.png"
    hub_out = REPO / "assets" / "hub" / "tiles" / "story-sequence.jpg"
    hub = ImageOps.fit(Image.open(hub_source).convert("RGB"), (640, 533), method=Image.Resampling.LANCZOS)
    hub_out.parent.mkdir(parents=True, exist_ok=True)
    hub.save(hub_out, "JPEG", quality=91, optimize=True, progressive=True)
    outputs.append(hub_out)
    qa = SRC / "qa"; qa.mkdir(parents=True, exist_ok=True)
    rows = (len(outputs) + 3) // 4
    sheet = Image.new("RGB", (1600, rows * 265), (255, 0, 120)); draw = ImageDraw.Draw(sheet)
    thumb_w, thumb_h = 380, 245
    for i, path in enumerate(outputs):
        x, y = (i % 4) * 400 + 10, (i // 4) * 265 + 10
        im = Image.open(path).convert("RGBA"); im.thumbnail((thumb_w, thumb_h - 28), Image.Resampling.LANCZOS)
        tile = Image.new("RGBA", (thumb_w, thumb_h - 28), (255, 0, 120, 255)); tile.alpha_composite(im, ((thumb_w-im.width)//2, (thumb_h-28-im.height)//2)); sheet.paste(tile.convert("RGB"), (x, y)); draw.text((x, y+thumb_h-24), path.stem, fill="white")
    sheet.save(qa / "contact-sheet-magenta.jpg", quality=90)
    receipt = {"outputs": [{"path": relative_path(p), "dimensions": list(Image.open(p).size), "bytes": p.stat().st_size, "sha256": sha256(p)} for p in outputs], "notes": "Cards use manifest foregroundBbox, sibling cutter masks, enclosed-hole fill, and a 0.8px inward feather so dark painted details remain opaque while the rounded exterior stays transparent; decor uses source alpha; backdrops resize to 1600x1200; the local Krea source fits the platform's 640x533 hub tile."}
    (qa / "processing-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"Built {len(outputs)} runtime assets plus QA receipt/contact sheet")

if __name__ == "__main__": main()
