#!/usr/bin/env python3
"""Build deterministic Silly Sentence Builder runtime art and alpha QA."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
from urllib.request import Request, urlopen
import argparse
import datetime
import hashlib
import json
import os
import time
import uuid

GAME = Path(__file__).resolve().parents[1]
ASSETS = GAME / "assets"
CUTS = ASSETS / "source" / "cuts"
GPT = ASSETS / "source" / "gpt-image-2"
QA = ASSETS / "source" / "qa"

GROUPS = {
    "characters": ["cat", "dinosaur", "robot", "duck", "bunny", "monster"],
    "actions": ["dances", "trumpet", "pancakes", "pogo", "rocket", "paints"],
    "places": ["moon", "bathtub", "castle", "picnic", "garden", "pirate-ship"],
    "manners": ["slowly", "backwards", "jelly", "tiny-hops", "circles", "tutu"],
    "ui": ["sentence-strip", "tray-who", "tray-action", "tray-place", "tray-how", "card-who", "card-action", "card-place", "card-how", "action-button", "progress-star", "label-plaque"],
}
MAX_EDGE = {"characters": 560, "actions": 420, "places": 640, "manners": 420, "ui": 520}
HUB_PROMPT = (
    "QLOBE Kids menu tile, one delightful handmade felt puppet-theater toy tableau: "
    "an orange cat, purple dinosaur, and teal friendly fabric robot peek from three "
    "plump green, orange, and blue stitched story pockets around one completely blank "
    "cream felt sentence strip; bold centered silhouette on a clean airy toy-table field, "
    "warm studio light, tactile wool fibers, visible blanket stitching, cheerful preschool "
    "proportions, premium handcrafted learning-toy photography, 6:5 composition, no words, "
    "letters, numbers, symbols, title, UI chrome, logo, watermark, or cropped character."
)


def alpha_meta(image):
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    total = max(1, sum(histogram))
    return {"extrema": list(alpha.getextrema()), "transparentRatio": round(sum(histogram[:16]) / total, 4), "opaqueRatio": round(sum(histogram[240:]) / total, 4)}


def magenta(image, target):
    plate = Image.new("RGBA", image.size, (255, 0, 255, 255))
    plate.alpha_composite(image.convert("RGBA"))
    target.parent.mkdir(parents=True, exist_ok=True)
    plate.convert("RGB").save(target, "PNG", optimize=True)


def build_group(group, names):
    thumbs, report = [], {}
    for name in names:
        source = CUTS / group / f"{name}.png"
        if not source.is_file():
            raise SystemExit(f"missing cut: {source}")
        image = Image.open(source).convert("RGBA")
        report[name] = alpha_meta(image)
        if report[name]["transparentRatio"] < 0.02:
            raise SystemExit(f"{source} has no meaningful transparent surround")
        image.thumbnail((MAX_EDGE[group], MAX_EDGE[group]), Image.Resampling.LANCZOS)
        target = ASSETS / group / f"{name}.webp"
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", lossless=False, quality=88, method=6, exact=True)
        # Inspect the bytes the browser actually receives, not only the PNG cut.
        runtime = Image.open(target).convert("RGBA")
        magenta(runtime, QA / f"{group}-{name}-magenta.png")
        thumb = ImageOps.contain(runtime, (240, 220), Image.Resampling.LANCZOS)
        cell = Image.new("RGB", (256, 256), "#ff00ff")
        cell.paste(thumb, ((256 - thumb.width) // 2, (220 - thumb.height) // 2 + 8), thumb)
        draw = ImageDraw.Draw(cell)
        draw.rectangle((0, 228, 255, 255), fill="#25152e")
        draw.text((10, 234), name, fill="#fff3ce")
        thumbs.append(cell)
    cols = 4 if len(thumbs) > 6 else 3
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 256, rows * 256), "#351439")
    for index, thumb in enumerate(thumbs):
        sheet.paste(thumb, ((index % cols) * 256, (index // cols) * 256))
    sheet.save(QA / f"{group}-contact-magenta.jpg", "JPEG", quality=94)
    return report


def build_runtime():
    QA.mkdir(parents=True, exist_ok=True)
    reports = {group: build_group(group, names) for group, names in GROUPS.items()}
    background = Image.open(GPT / "theater-background-master.png").convert("RGB")
    background.thumbnail((1600, 1200), Image.Resampling.LANCZOS)
    (ASSETS / "backgrounds").mkdir(parents=True, exist_ok=True)
    background.save(ASSETS / "backgrounds" / "theater.webp", "WEBP", quality=84, method=6)
    title = Image.open(GPT / "title-lockup-master.png").convert("RGBA")
    title.thumbnail((980, 760), Image.Resampling.LANCZOS)
    title_target = ASSETS / "ui" / "title.webp"
    title.save(title_target, "WEBP", lossless=False, quality=90, method=6, exact=True)
    runtime_title = Image.open(title_target).convert("RGBA")
    magenta(runtime_title, QA / "title-magenta.png")
    reports["title"] = alpha_meta(runtime_title)
    (QA / "alpha-report.json").write_text(json.dumps(reports, indent=2) + "\n", encoding="utf-8")
    print(f"built {sum(len(v) for v in GROUPS.values()) + 2} runtime assets")


def multipart(fields):
    boundary = "----qlobe" + uuid.uuid4().hex
    body = b"".join(
        (f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n').encode()
        for key, value in fields.items()
    ) + f"--{boundary}--\r\n".encode()
    return boundary, body


def submit_job(base, workflow, fields):
    boundary, body = multipart(fields)
    request = Request(
        base.rstrip("/") + f"/workflows/{workflow}", data=body, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urlopen(request, timeout=60) as response:
        submitted = json.load(response)
    job_id = submitted.get("job_id") or submitted.get("id")
    if not job_id:
        raise RuntimeError(f"{workflow} returned no job id")
    for _ in range(900):
        with urlopen(base.rstrip("/") + f"/jobs/{job_id}", timeout=60) as response:
            state = json.load(response)
        status = str(state.get("status", "")).lower()
        if status in {"done", "completed", "complete", "success", "succeeded"}:
            return str(job_id)
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"{workflow} failed")
        time.sleep(1)
    raise TimeoutError(f"{workflow} timed out")


def build_hub(seed=42):
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        raise SystemExit("QLOBE_QWEN_URL is required for --hub")
    repo = GAME.parents[1]
    outdir = ASSETS / "source" / "local-api" / "hub"
    outdir.mkdir(parents=True, exist_ok=True)
    raw = outdir / f"silly-sentence-builder-krea2-seed-{seed}.png"
    job_id = submit_job(base, "krea2-turbo-t2i", {"prompt": HUB_PROMPT, "seed": seed, "width": 768, "height": 640, "steps": 8, "cfg": 1})
    with urlopen(base + f"/jobs/{job_id}/result", timeout=300) as response:
        raw.write_bytes(response.read())
    with Image.open(raw) as source:
        source.load()
        if source.width < 512 or source.height < 512 or raw.stat().st_size < 5000:
            raise RuntimeError("undersized Krea hub result")
        image = ImageOps.fit(source.convert("RGB"), (640, 533), Image.Resampling.LANCZOS)
    final = repo / "assets" / "hub" / "tiles" / "silly-sentence-builder.jpg"
    image.save(final, "JPEG", quality=91, optimize=True)
    receipt = {
        "format": "qlobe-recipe", "formatVersion": 1,
        "id": "silly-sentence-builder-hub", "kind": "image",
        "asset": "assets/hub/tiles/silly-sentence-builder.jpg",
        "artDirection": "Toy hub grammar (game interior: Puppet / Cozy felt fabric)",
        "steps": [{"workflow": "krea2-turbo-t2i", "prompt": HUB_PROMPT, "seed": seed, "width": 768, "height": 640, "steps": 8, "cfg": 1}],
        "source": raw.name,
        "sourceSha256": hashlib.sha256(raw.read_bytes()).hexdigest(),
        "finalSha256": hashlib.sha256(final.read_bytes()).hexdigest(),
        "qa": {"status": "pending-human-review", "finalSize": [640, 533], "checks": ["no text or pseudo-lettering", "recognizable story-pocket moment", "legible at hub size"]},
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    (outdir / "recipe.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("generated Krea 2 hub tile; full-size human review required")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hub", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.hub:
        build_hub(args.seed)
    else:
        build_runtime()


if __name__ == "__main__":
    main()
