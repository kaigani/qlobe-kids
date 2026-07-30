#!/usr/bin/env python3
"""World Music Dance — image production pipeline.

Six resumable, individually-runnable stages that walk the paper-garden-night
art world from scratch to shipping runtime pose-actor packs. Prompts are
copied VERBATIM from `assets/source/PROMPTS.md` (frozen 2026-07-29) — do not
paraphrase them here.

  scenes    krea2-turbo-t2i -> assets/source/gen/scenes/{map-night,stage-night}.png
  ui        krea2-turbo-t2i -> assets/source/gen/ui/{title-lockup,card-backing,lantern}.png
  masters   krea2-turbo-t2i, 1024x1024 charcoal ground, 6 dancers standing at
            rest -> assets/source/gen/masters/<culture>-neutral.png. This
            master ALSO stands in for the "neutral" pose at cutout time.
  derives   qwen-image-edit, conditioned on the approved neutral master, one
            call per (culture, move-1|move-2|move-3|celebrate) ->
            assets/source/gen/derives/<culture>-<pose>.png
  cutouts   qwen-image-layered (ASYNC job flow — sync=true would return the
            green composite, not the alpha cutout) on all 30 dancer poses
            (5 poses x 6 cultures: neutral + move-1..3 + celebrate) plus
            title-lockup, card-backing and lantern -> assets/source/gen/cutouts/*.png,
            with a magenta-composite QA jpg written next to every cutout for
            alpha inspection.
  assemble  writes a per-culture assembly spec and calls
            tools/pipeline/pose_actor_assemble.py to emit
            assets/pose-actors/<culture>/poses.json + poses/*.webp, plus a
            3x2 contact strip per culture in assets/source/gen/contact/.

Every stage is idempotent: an output that already exists and is >5KB is
skipped unless --force (global) or --reroll <name> (per-item) names it.

Usage:
    export QLOBE_QWEN_URL=http://<host>:<port>
    python3 games/world-music-dance/tools/gen-images.py --stage all
    python3 games/world-music-dance/tools/gen-images.py --stage masters --only india
    python3 games/world-music-dance/tools/gen-images.py --stage derives --reroll india-move-2
    python3 games/world-music-dance/tools/gen-images.py --stage derives --reroll india-move-2:2
    python3 games/world-music-dance/tools/gen-images.py --stage cutouts --force

The seed ladder is 42 -> 1337 -> 9001 -> 7 (indices 0-3). `--reroll
<name>` (no index) bumps that item's remembered index by one step (capped at
the last rung); `--reroll <name>:<index>` jumps straight to a rung. The
current index per item persists in assets/source/gen/seed-state.json so a
later re-run without --reroll keeps using the rung that worked.

Batch by workflow type (all t2i -> all edits -> all layered) — one shared
ComfyUI queue swaps models per request, and thrashing between workflow types
craters throughput roughly 25x (see MEMORY: comfyui-model-thrash).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SRC = GAME / "assets" / "source"
GEN = SRC / "gen"
POSE_OUT = GAME / "assets" / "pose-actors"
ASSEMBLE_TOOL = REPO / "tools" / "pipeline" / "pose_actor_assemble.py"

SEED_LADDER = [42, 1337, 9001, 7]
STATE_PATH = GEN / "seed-state.json"

MIN_BYTES = 5 * 1024

# --------------------------------------------------------------------------
# Style suffixes (verbatim, assets/source/PROMPTS.md)
# --------------------------------------------------------------------------

PG_NIGHT = (
    "premium handmade cut-paper collage: layered construction paper, cardstock and "
    "felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, "
    "slight handmade imperfections, occasional tiny stitched details, and soft "
    "tactile shadows between stacked layers; saturated kraft-paper brights glowing "
    "against a deep ink-blue cardstock night field, warm golden paper-lantern light, "
    "festival night mood, magical and welcoming, never spooky; child-safe toy "
    "proportions and handmade warmth. No text, no letters, no words."
)

PG_CHAR = (
    "premium handmade cut-paper collage character: layered construction paper, "
    "cardstock and felt with visible fibre texture, softly rounded die-cut edges, "
    "tiny stitched details, soft tactile shadows between layers; saturated "
    "kraft-paper brights; child-safe proportions, sweet friendly face, handmade "
    "warmth. Full body, head to feet, facing the viewer. The background is a "
    "perfectly flat, solid, uniform dark charcoal background, no gradient, no "
    "texture, no shadows on the background. No text, no letters, no words."
)

# Just the ground clause of PG_CHAR — used where "{PG_CHAR ground clause}" is
# named in PROMPTS.md (card-backing, lantern: props, not characters).
PG_CHAR_GROUND = (
    "The background is a perfectly flat, solid, uniform dark charcoal background, "
    "no gradient, no texture, no shadows on the background."
)

DERIVE_TMPL = (
    "Redraw this exact same cut-paper dancer character now {action}. Keep the "
    "character, face, costume, colours, proportions and cut-paper art style "
    "completely identical to the reference — only the pose changes. Full body, "
    "head to feet. The background stays a perfectly flat, solid, uniform dark "
    "charcoal, no gradient, no texture, no shadows on the background."
)

# CUTOUT is verbatim for the dancer subject ("cut-paper dancer"); the {subject}
# slot is a documented, non-verbatim extension (see final report) so the same
# template also drives the title lockup / card backing / lantern cutouts,
# mirroring how games/flashlight-cave/tools/gen-actors.py parameterizes
# `subject` through its cutout() helper.
CUTOUT_TMPL = (
    "Solid flat green background layer. Top layer: the exact same {subject} from "
    "the image. Keep it identical to the input image."
)

MASTER_INTRO = (
    "Standing at rest: upright and still, facing the viewer, weight even on both "
    "feet, arms relaxed, smiling."
)

# --------------------------------------------------------------------------
# Scenes (krea2-turbo-t2i)
# --------------------------------------------------------------------------

SCENES = [
    {
        "name": "map-night",
        "width": 2048,
        "height": 1280,
        "prompt": (
            "A cut-paper world map for young children on a deep ink-blue cardstock "
            "sea: simple, rounded, friendly continent shapes layered from saturated "
            "kraft-paper brights — leaf green, coral, golden yellow, warm pink, "
            "orange — with softly rounded die-cut edges and visible fibre texture; "
            "tiny paper stars scattered in the sea; a string of small glowing golden "
            "paper lanterns draped across the very top edge; continents kept simple, "
            "calm and uncluttered with gentle low-contrast centres so game cards can "
            "sit on them; no country borders, no labels. " + PG_NIGHT
        ),
    },
    {
        "name": "stage-night",
        "width": 1600,
        "height": 1200,
        "prompt": (
            "A festival night stage made of cut paper: deep ink-blue cardstock sky "
            "with tiny paper stars, two strings of glowing golden paper lanterns "
            "arching across the top corners, layered paper bunting in saturated "
            "brights along the upper edge, a simple wide rounded kraft-paper stage "
            "floor across the bottom quarter; the central sixty percent calm, dark, "
            "and uncluttered so a dancer character reads clearly in front of it. "
            + PG_NIGHT
        ),
    },
]

# --------------------------------------------------------------------------
# UI cutout sources (krea2-turbo-t2i on charcoal -> layered later)
# --------------------------------------------------------------------------

UI_ITEMS = [
    {
        "name": "title-lockup",
        "width": 1344,
        "height": 768,
        "cutout_subject": "hand-cut paper title lockup lettering",
        "prompt": (
            'Hand-cut paper lettering that says exactly "World Music Dance" in '
            "playful chunky cut-paper capital letters, arranged on two lines, each "
            "letter cut from a different saturated bright cardstock with stitched "
            "detail outlines, a small glowing golden paper lantern hanging from the "
            "first letter and two tiny cut-paper music notes tucked beside the last "
            "word; premium handmade cut-paper collage with visible fibre texture "
            "and soft tactile shadows. The background is a perfectly flat, solid, "
            "uniform dark charcoal background, no gradient, no texture."
        ),
    },
    {
        "name": "card-backing",
        "width": 512,
        "height": 640,
        "cutout_subject": "blank dance card",
        "prompt": (
            "A single blank dance card cut from layered cream cardstock: a rounded "
            "rectangle with a golden stitched border frame, a tiny cut-paper music "
            "note at the top centre, the inner face plain warm cream paper with "
            "visible fibre texture, empty. " + PG_CHAR_GROUND
        ),
    },
    {
        "name": "lantern",
        "width": 512,
        "height": 640,
        "cutout_subject": "glowing golden paper lantern",
        "prompt": (
            "One glowing golden paper lantern for a children's festival game, "
            "cut-paper style with visible folds and fibre texture, hanging from a "
            "small paper loop with a soft warm halo of light around it. "
            + PG_CHAR_GROUND
        ),
    },
]

# --------------------------------------------------------------------------
# Cultures — dancer masters + pose derive actions (verbatim, PROMPTS.md)
# --------------------------------------------------------------------------

CULTURES = [
    {
        "id": "india",
        "label": "India",
        "dance": "Kathak",
        "master": (
            "A joyful young Kathak dancer girl from India standing at rest, "
            "wearing a bright marigold-orange and pink lehenga with gold trim, a "
            "flowing pink dupatta, gold bangles, and tiny golden ankle bells, dark "
            "hair in a braid with a small flower."
        ),
        "moves": {
            "move-1": "spinning in a graceful twirl, arms raised overhead, skirt flaring out",
            "move-2": "stamping one foot with ankle bells, one arm curved up high, other hand at the waist",
            "move-3": "swaying with both arms flowing to one side like a gentle wave",
            "celebrate": "jumping for joy, both arms high, big smile",
        },
    },
    {
        "id": "brazil",
        "label": "Brazil",
        "dance": "Samba",
        "master": (
            "A joyful young samba dancer girl from Brazil standing at rest, "
            "wearing a sunny yellow and green carnival dress with a small feather "
            "headdress in green, gold and blue, beaded bracelets, dark curly hair."
        ),
        "moves": {
            "move-1": "bouncing on quick feet, knees lifted, elbows bent and pumping",
            "move-2": "arms stretched out wide, leaning into a happy sway",
            "move-3": "spinning with one arm overhead, dress and feathers flying",
            "celebrate": "jumping for joy, both arms high, big smile",
        },
    },
    {
        "id": "japan",
        "label": "Japan",
        "dance": "Bon Odori",
        "master": (
            "A joyful young Bon Odori dancer child from Japan standing at rest, "
            "wearing an indigo-blue summer yukata with a red obi sash and a round "
            "white paper fan tucked in the sash, dark hair in a neat bun."
        ),
        "moves": {
            "move-1": "reaching both hands up and to one side, gazing up, one foot stepping forward",
            "move-2": "clapping hands together at chest height, stepping forward",
            "move-3": "sweeping the round paper fan across in front, arms extended",
            "celebrate": "jumping for joy, both arms high, fan raised, big smile",
        },
    },
    {
        "id": "ghana",
        "label": "Ghana",
        "dance": "Kpanlogo",
        "master": (
            "A joyful young Kpanlogo dancer child from Ghana standing at rest, "
            "wearing a bright kente-pattern wrap in gold, green and red with a "
            "matching headband and beaded necklaces."
        ),
        "moves": {
            "move-1": "stomping one foot, clapping hands, elbows out wide",
            "move-2": "knees bent low, both arms rowing forward together",
            "move-3": "one knee lifted, arms making a great big circle overhead",
            "celebrate": "jumping for joy, both arms high, big smile",
        },
    },
    {
        "id": "mexico",
        "label": "Mexico",
        "dance": "Folklórico",
        "master": (
            "A joyful young folklórico dancer girl from Mexico standing at rest, "
            "wearing a wide fuchsia-pink folklórico dress with white and purple "
            "ribbon trim on the skirt, a small flower crown, dark hair in braids."
        ),
        "moves": {
            "move-1": "holding the wide skirt out to one side in a big swish",
            "move-2": "tapping heels, holding the skirt slightly out on both sides",
            "move-3": "twirling with the skirt flared out in a full circle like a flower",
            "celebrate": "jumping for joy, skirt flared, both arms high, big smile",
        },
    },
    {
        "id": "ireland",
        "label": "Ireland",
        "dance": "Jig",
        "master": (
            "A joyful young Irish step dancer child from Ireland standing at rest, "
            "wearing a shamrock-green dance dress with golden celtic swirl trim and "
            "a small matching cape, curly auburn hair."
        ),
        "moves": {
            "move-1": "hopping with one leg kicked straight forward, arms held straight down at the sides",
            "move-2": "pointing one toe forward, arms straight at the sides, chin up proudly",
            "move-3": "mid-skip with quick feet, one foot behind the other, arms at the sides",
            "celebrate": "jumping for joy, both arms high, big smile",
        },
    },
]

POSES_ORDER = ["neutral", "move-1", "move-2", "move-3", "celebrate"]

STAGES = ["scenes", "ui", "masters", "derives", "cutouts", "assemble"]

# --------------------------------------------------------------------------
# HTTP plumbing (mirrors games/flashlight-cave/tools/gen-actors.py)
# --------------------------------------------------------------------------


def api(path: str) -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        sys.exit("QLOBE_QWEN_URL is not set (see .claude/skills/local-genai)")
    return f"{base}{path}"


def post_multipart(url: str, fields: dict, files: dict | None = None) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n"
            f"{value}\r\n"
        ).encode()
    for name, path in (files or {}).items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
            f"filename=\"{Path(path).name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        ).encode()
        body += Path(path).read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        url, data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        return resp.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=900) as resp:
        return resp.read()


def t2i(prompt: str, width: int, height: int, seed: int) -> bytes:
    return post_multipart(
        api("/workflows/krea2-turbo-t2i?sync=true"),
        {"prompt": prompt, "width": str(width), "height": str(height), "seed": str(seed)})


def edit(prompt: str, image_path: Path, seed: int) -> bytes:
    return post_multipart(
        api("/workflows/qwen-image-edit?sync=true"),
        {"prompt": prompt, "seed": str(seed)},
        {"image": str(image_path)})


def layered_cutout(prompt: str, image_path: Path, seed: int) -> bytes:
    """qwen-image-layered, ASYNC job flow. layer_2 is the subject with true alpha."""
    job = json.loads(post_multipart(
        api("/workflows/qwen-image-layered"),
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
        {"image": str(image_path)}))
    job_id = job.get("job_id")
    if not job_id:
        raise RuntimeError(f"no job id: {job}")
    for _ in range(120):
        time.sleep(5)
        state = json.loads(get(api(f"/jobs/{job_id}")))
        status = state.get("status")
        if status == "completed":
            return get(api(f"/jobs/{job_id}/result?output=layer_2"))
        if status in ("failed", "error"):
            raise RuntimeError(f"job {status}: {state.get('error')}")
    raise RuntimeError("job timed out")


def write_magenta_qa(rgba_path: Path, jpg_path: Path) -> None:
    """Composite the cutout over solid magenta so alpha fringes are eyeballable."""
    try:
        from PIL import Image
    except Exception as exc:  # noqa: BLE001
        print(f"    !! PIL unavailable, skipping magenta QA: {exc}")
        return
    img = Image.open(rgba_path).convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 0, 255, 255))
    bg.alpha_composite(img)
    bg.convert("RGB").save(jpg_path, "JPEG", quality=90)


# --------------------------------------------------------------------------
# Seed ladder / resumability state
# --------------------------------------------------------------------------


def load_state() -> dict:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except Exception:  # noqa: BLE001
            return {}
    return {}


def save_state(state: dict) -> None:
    GEN.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=1, sort_keys=True) + "\n")


def parse_reroll(items: list[str]) -> dict:
    out = {}
    for item in items:
        if ":" in item:
            name, idx = item.split(":", 1)
            try:
                out[name] = int(idx)
            except ValueError:
                out[name] = None
        else:
            out[item] = None
    return out


def seed_for(name: str, state: dict, reroll: dict) -> int:
    if name in reroll:
        idx = reroll[name]
        if idx is None:
            idx = min(state.get(name, 0) + 1, len(SEED_LADDER) - 1)
        idx = max(0, min(idx, len(SEED_LADDER) - 1))
        state[name] = idx
    else:
        idx = state.get(name, 0)
    return SEED_LADDER[idx]


def should_run(name: str, path: Path, args, reroll: dict) -> bool:
    if name in reroll:
        return True
    if args.force:
        return True
    return not (path.exists() and path.stat().st_size > MIN_BYTES)


def matches_only(name: str, only: list[str]) -> bool:
    if not only:
        return True
    return any(o.lower() in name.lower() for o in only)


# --------------------------------------------------------------------------
# Stages
# --------------------------------------------------------------------------


def stage_scenes(args, reroll, state, results):
    out_dir = GEN / "scenes"
    out_dir.mkdir(parents=True, exist_ok=True)
    for item in SCENES:
        name = item["name"]
        if not matches_only(name, args.only):
            continue
        out = out_dir / f"{name}.png"
        if not should_run(name, out, args, reroll):
            print(f"  skip {name}")
            results.append({"stage": "scenes", "name": name, "status": "skip", "bytes": out.stat().st_size})
            continue
        seed = seed_for(name, state, reroll)
        print(f"  scene {name} ({item['width']}x{item['height']}, seed {seed})")
        try:
            data = t2i(item["prompt"], item["width"], item["height"], seed)
            out.write_bytes(data)
            results.append({"stage": "scenes", "name": name, "status": "ok", "bytes": len(data)})
        except Exception as exc:  # noqa: BLE001
            print(f"    !! FAIL {name}: {exc}")
            results.append({"stage": "scenes", "name": name, "status": "fail", "bytes": 0})


def stage_ui(args, reroll, state, results):
    out_dir = GEN / "ui"
    out_dir.mkdir(parents=True, exist_ok=True)
    for item in UI_ITEMS:
        name = item["name"]
        if not matches_only(name, args.only):
            continue
        out = out_dir / f"{name}.png"
        if not should_run(name, out, args, reroll):
            print(f"  skip {name}")
            results.append({"stage": "ui", "name": name, "status": "skip", "bytes": out.stat().st_size})
            continue
        seed = seed_for(name, state, reroll)
        print(f"  ui {name} ({item['width']}x{item['height']}, seed {seed})")
        try:
            data = t2i(item["prompt"], item["width"], item["height"], seed)
            out.write_bytes(data)
            results.append({"stage": "ui", "name": name, "status": "ok", "bytes": len(data)})
        except Exception as exc:  # noqa: BLE001
            print(f"    !! FAIL {name}: {exc}")
            results.append({"stage": "ui", "name": name, "status": "fail", "bytes": 0})


def stage_masters(args, reroll, state, results):
    out_dir = GEN / "masters"
    out_dir.mkdir(parents=True, exist_ok=True)
    for culture in CULTURES:
        cid = culture["id"]
        name = f"{cid}-neutral"
        if not matches_only(name, args.only) and not matches_only(cid, args.only):
            continue
        out = out_dir / f"{name}.png"
        if not should_run(name, out, args, reroll):
            print(f"  skip {name}")
            results.append({"stage": "masters", "name": name, "status": "skip", "bytes": out.stat().st_size})
            continue
        seed = seed_for(name, state, reroll)
        prompt = f"{MASTER_INTRO} {culture['master']} {PG_CHAR}"
        print(f"  master {name} (seed {seed})")
        try:
            data = t2i(prompt, 1024, 1024, seed)
            out.write_bytes(data)
            results.append({"stage": "masters", "name": name, "status": "ok", "bytes": len(data)})
        except Exception as exc:  # noqa: BLE001
            print(f"    !! FAIL {name}: {exc}")
            results.append({"stage": "masters", "name": name, "status": "fail", "bytes": 0})


def stage_derives(args, reroll, state, results):
    masters_dir = GEN / "masters"
    out_dir = GEN / "derives"
    out_dir.mkdir(parents=True, exist_ok=True)
    for culture in CULTURES:
        cid = culture["id"]
        master = masters_dir / f"{cid}-neutral.png"
        for pose, action in culture["moves"].items():
            name = f"{cid}-{pose}"
            if not matches_only(name, args.only) and not matches_only(cid, args.only):
                continue
            out = out_dir / f"{name}.png"
            if not should_run(name, out, args, reroll):
                print(f"  skip {name}")
                results.append({"stage": "derives", "name": name, "status": "skip", "bytes": out.stat().st_size})
                continue
            if not master.exists():
                print(f"  !! {name}: missing master {master}, run --stage masters first")
                results.append({"stage": "derives", "name": name, "status": "fail", "bytes": 0})
                continue
            seed = seed_for(name, state, reroll)
            prompt = DERIVE_TMPL.format(action=action)
            print(f"  derive {name} (from {master.name}, seed {seed})")
            try:
                data = edit(prompt, master, seed)
                out.write_bytes(data)
                results.append({"stage": "derives", "name": name, "status": "ok", "bytes": len(data)})
            except Exception as exc:  # noqa: BLE001
                print(f"    !! FAIL {name}: {exc}")
                results.append({"stage": "derives", "name": name, "status": "fail", "bytes": 0})


def _cutout_jobs():
    """Yield (name, source_path, subject) for every layered-cutout call."""
    masters_dir = GEN / "masters"
    derives_dir = GEN / "derives"
    for culture in CULTURES:
        cid = culture["id"]
        for pose in POSES_ORDER:
            name = f"{cid}-{pose}"
            src = masters_dir / f"{cid}-neutral.png" if pose == "neutral" else derives_dir / f"{name}.png"
            yield name, src, "cut-paper dancer", cid
    for item in UI_ITEMS:
        yield item["name"], GEN / "ui" / f"{item['name']}.png", item["cutout_subject"], None


def stage_cutouts(args, reroll, state, results):
    out_dir = GEN / "cutouts"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, src, subject, cid in _cutout_jobs():
        if not matches_only(name, args.only) and not (cid and matches_only(cid, args.only)):
            continue
        out = out_dir / f"{name}.png"
        qa = out_dir / f"{name}.qa.jpg"
        if not should_run(name, out, args, reroll):
            print(f"  skip {name}")
            results.append({"stage": "cutouts", "name": name, "status": "skip", "bytes": out.stat().st_size if out.exists() else 0})
            continue
        if not src.exists():
            print(f"  !! {name}: missing source {src}")
            results.append({"stage": "cutouts", "name": name, "status": "fail", "bytes": 0})
            continue
        seed = seed_for(name, state, reroll)
        prompt = CUTOUT_TMPL.format(subject=subject)
        print(f"  cutout {name} (seed {seed})")
        try:
            data = layered_cutout(prompt, src, seed)
            out.write_bytes(data)
            write_magenta_qa(out, qa)
            results.append({"stage": "cutouts", "name": name, "status": "ok", "bytes": len(data)})
        except Exception as exc:  # noqa: BLE001
            print(f"    !! FAIL {name}: {exc}")
            results.append({"stage": "cutouts", "name": name, "status": "fail", "bytes": 0})


def stage_assemble(args, reroll, state, results):
    cutouts_dir = GEN / "cutouts"
    contact_dir = GEN / "contact"
    contact_dir.mkdir(parents=True, exist_ok=True)
    for culture in CULTURES:
        cid = culture["id"]
        if not matches_only(cid, args.only):
            continue
        have = []
        poses_spec = []
        for pose in POSES_ORDER:
            src = cutouts_dir / f"{cid}-{pose}.png"
            if not src.exists():
                continue
            have.append(pose)
            poses_spec.append({
                "pose": pose,
                "source": str(src),
                "output": str(POSE_OUT / cid / "poses" / f"{pose}.webp"),
            })
        if "neutral" not in have:
            print(f"  !! {cid}: no neutral cutout — cannot assemble")
            results.append({"stage": "assemble", "name": cid, "status": "fail", "bytes": 0})
            continue
        (POSE_OUT / cid / "poses").mkdir(parents=True, exist_ok=True)
        spec = {
            "canvas": 1024,
            "maxArt": 900,
            "baseline": 972,
            "alphaFloor": 8,
            "bboxThreshold": 24,
            "quality": 90,
            "contact": str(contact_dir / f"{cid}.webp"),
            "poses": poses_spec,
        }
        spec_path = GEN / f"assemble-{cid}.json"
        spec_path.write_text(json.dumps(spec, indent=1))
        print(f"  assemble {cid} ({len(have)}/{len(POSES_ORDER)} poses)")
        result = subprocess.run(
            [sys.executable, str(ASSEMBLE_TOOL), "--spec", str(spec_path)],
            capture_output=True, text=True)
        try:
            info = json.loads(result.stdout)
        except Exception:  # noqa: BLE001
            info = {}
        if not info.get("ok"):
            reason = info.get("reason") or result.stderr.strip()[:300] or "unknown failure"
            print(f"    !! {cid} assemble FAILED: {reason}")
            results.append({"stage": "assemble", "name": cid, "status": "fail", "bytes": 0})
            continue
        anchor = info.get("anchor") or [0.5, spec["baseline"] / spec["canvas"]]
        label = f"{culture['label']} {culture['dance']} dancer"
        manifest = {
            "format": "qlobe-pose-actor",
            "formatVersion": 1,
            "id": cid,
            "label": label,
            "canvas": [spec["canvas"], spec["canvas"]],
            "anchor": anchor,
            "transition": {"kind": "paper-pop", "durationMs": 220},
            "poses": {
                p: {"art": f"poses/{p}.webp", "alt": f"{label} — {p} pose"}
                for p in have
            },
        }
        (POSE_OUT / cid / "poses.json").write_text(json.dumps(manifest, indent=1) + "\n")
        total_bytes = info.get("totalBytes", 0)
        print(f"    ok — {len(have)} poses, {total_bytes} bytes")
        results.append({"stage": "assemble", "name": cid, "status": "ok", "bytes": total_bytes})


STAGE_FN = {
    "scenes": stage_scenes,
    "ui": stage_ui,
    "masters": stage_masters,
    "derives": stage_derives,
    "cutouts": stage_cutouts,
    "assemble": stage_assemble,
}


# --------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------


def print_summary(results: list[dict]) -> None:
    print()
    print("=== summary ===")
    if not results:
        print("(nothing processed)")
        return
    name_w = max(len(r["name"]) for r in results) + 1
    stage_w = max(len(r["stage"]) for r in results) + 1
    ok = sum(1 for r in results if r["status"] == "ok")
    skip = sum(1 for r in results if r["status"] == "skip")
    fail = sum(1 for r in results if r["status"] == "fail")
    for r in results:
        mark = {"ok": "OK", "skip": "--", "fail": "!!"}[r["status"]]
        print(f"  [{mark}] {r['stage']:<{stage_w}} {r['name']:<{name_w}} {r['bytes']:>10} bytes")
    print(f"  {ok} ok, {skip} skipped, {fail} failed, {len(results)} total")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", choices=STAGES + ["all"], default="all")
    ap.add_argument("--only", nargs="*", default=[], help="substring filter on item/culture name")
    ap.add_argument("--force", action="store_true", help="regenerate even if output exists")
    ap.add_argument("--reroll", nargs="*", default=[],
                     help="name or name:seedIndex to bump the seed ladder and force regen")
    args = ap.parse_args()

    GEN.mkdir(parents=True, exist_ok=True)
    reroll = parse_reroll(args.reroll)
    state = load_state()
    results: list[dict] = []

    stages = STAGES if args.stage == "all" else [args.stage]
    for st in stages:
        print(f"--- stage: {st} ---")
        STAGE_FN[st](args, reroll, state, results)

    save_state(state)
    print_summary(results)


if __name__ == "__main__":
    main()
