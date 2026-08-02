#!/usr/bin/env python3
"""Bug Hotel Observer — art generation pipeline (P4).

Three resumable, network-driving subcommands that walk the Paper Garden art
world from nothing to raw candidates under `assets/source/`, exactly matching
the pipeline in `ASSETS.md` §1-§5. This script makes NO decisions about which
candidate wins — it only generates and files sidecar provenance; a human (or
a later polish pass) looks at the output and finalize-art.py deterministically
crops/resizes/encodes the accepted files into `assets/`.

    batch-a   krea2-turbo-t2i (no reference image)
              bg-hotel.jpg anchor, title lockup, hub-tile candidate
    batch-b   qwen-image-edit, conditioned on the accepted bg-hotel anchor
              (except the 12 "happy" bug frames, each conditioned on its own
              accepted "idle" frame instead — run AFTER the idle sub-stage):
              4 room interiors, journal spread, 12 props/lockups,
              12 idle bug sprites, 12 happy bug sprites
    batch-c   qwen-image-layered (ASYNC job flow, layer_2 = true-alpha cutout)
              for every one of the 37 transparent assets enumerated in
              ASSETS.md §5

Batch discipline is not optional: the local ComfyUI wrapper is ONE queue that
swaps models per request, and thrashing between workflow types craters
throughput ~25x (see MEMORY: comfyui-model-thrash). Run batch-a to
completion, review the anchor at full size, THEN batch-b, THEN batch-c. Never
interleave `python3 gen-art.py batch-a` and `batch-c` calls in the same
sitting.

Usage:
    export QLOBE_QWEN_URL=http://<host>:<port>      # never committed
    python3 tools/gen-art.py batch-a --dry-run
    python3 tools/gen-art.py batch-a
    python3 tools/gen-art.py batch-b --only bg-room  # rooms + journal only
    python3 tools/gen-art.py batch-b --only bug-     # all 24 bug sprites
    python3 tools/gen-art.py batch-c --only magnifier
    python3 tools/gen-art.py batch-a --seed-step 1   # reroll everything to seed 1337
    python3 tools/gen-art.py batch-b --only title --seed-step 2 --force

Every job is resumable: an existing output file (>5KB) is skipped unless
--force. `--only <substring>` filters jobs by id (nargs='*', OR'd together).
`--dry-run` prints the full job table (id, workflow, seed, prompt preview,
output path) and makes zero network calls; it needs no host at all. Every
generated file gets a `<name>.json` sidecar recording {id, workflow, prompt,
seed, ref, generated_at} — the provenance record for ASSETS.md §7.

The host is NEVER hardcoded: QLOBE_QWEN_URL, else `qwenUrl` in the git-ignored
`tools/state/local.json` at the repo root (see .claude/skills/local-genai).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]          # games/bug-hotel-observer
REPO = GAME.parents[1]                               # repo root
SRC = GAME / "assets" / "source"
ANCHORS = SRC / "anchors"
RAW_EDIT = SRC / "raw-edit"
CUTOUTS = SRC / "cutouts"
HUB = SRC / "hub"

SEED_LADDER = [42, 1337, 9001, 7]
TEXT_SEED_LADDER = [42, 1337, 9001, 7, 2024, 31337]  # title, fact-found: lettering is the least reliable gen
MIN_BYTES = 5 * 1024

# --------------------------------------------------------------------------
# Style suffixes — verbatim from ASSETS.md §2 / shared/data/generate-templates.json
# --------------------------------------------------------------------------

PAPER_GARDEN = (
    'premium handmade cut-paper collage: layered construction paper, cardstock and felt '
    'with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight '
    'handmade imperfections, occasional tiny stitched details, and soft tactile shadows '
    'between stacked layers; saturated kraft-paper brights on a warm cream field; '
    'child-safe toy proportions and handmade warmth. No text, no letters, no words.'
)

PAPER_GARDEN_LETTERED = (
    'premium handmade cut-paper collage: layered construction paper, cardstock and felt '
    'with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight '
    'handmade imperfections, occasional tiny stitched details, and soft tactile shadows '
    'between stacked layers; saturated kraft-paper brights on a warm cream field; '
    'child-safe toy proportions and handmade warmth. The only text anywhere in the image '
    'is the lettering described above, cut from paper, spelled exactly as written, with '
    'no other letters, words, numbers, captions or watermarks.'
)

TOY_TABLE = (
    'Bright, soft 3D cartoon style with rounded, simplified forms and cheerful '
    'proportions. Saturated colors, smooth shading, soft highlights, toy-like glossy '
    'finish. Premium preschool learning app asset, no text, no letters, no words.'
)

CUTOUT_BG = (
    'The subject is centred, complete, and unclipped on a flat dark charcoal background, '
    'with no scenery, no floor, no shadow cast onto the background.'
)

IDLE_HEAD = 'A single friendly papercraft '
IDLE_TAIL = (
    'Seen from a gentle three-quarter view from slightly above, whole body visible, big '
    'simple friendly cartoon eyes with white paper highlights, calm closed smile, no '
    'scenery around it, matching the artistic style, paper materials, lighting and '
    'colour palette of the reference image.'
)

# --------------------------------------------------------------------------
# Bugs — 12 rows, verbatim from ASSETS.md §4.4
# --------------------------------------------------------------------------

BUGS = [
    dict(id="ladybug", room="leaf",
         subject="ladybug with a domed bright red paper shell, six round black paper spots, "
                 "a glossy black paper head, two thin black paper antennae with tiny round "
                 "tips, and six short black paper legs.",
         idle_pose="Resting still on all six legs, antennae angled gently forward.",
         happy_pose="it lifts its red wing covers slightly to show pale cream paper flying "
                    "wings underneath, and raises one front leg in a little wave."),
    dict(id="caterpillar", room="leaf",
         subject="caterpillar made of eight soft rounded segments of bright green paper in "
                 "two alternating shades, with a slightly larger green paper head, two short "
                 "paper antennae, and many tiny stubby paper legs along the underside.",
         idle_pose="Stretched out gently in a shallow S curve, antennae forward.",
         happy_pose="it arches the middle of its body up into a tall friendly hump and lifts "
                    "its head high."),
    dict(id="snail", room="leaf",
         subject="snail with a soft pale cream paper body and a big spiral shell cut from "
                 "warm caramel and cream paper with a clear curling spiral line, and two long "
                 "paper eye stalks with little round eyes on the ends.",
         idle_pose="Gliding slowly forward, both eye stalks stretched out and level.",
         happy_pose="it stretches both eye stalks tall and curves them outward, and lifts the "
                    "front of its body up off the ground."),
    dict(id="ant", room="bark",
         subject="ant with three rounded segments of deep russet-brown paper, a slightly "
                 "shiny head, two bent paper antennae, and six thin dark paper legs.",
         idle_pose="Standing on all six legs facing slightly forward, antennae angled up.",
         happy_pose="it rears up on its back legs and holds a tiny crumb of pale paper high "
                    "above its head."),
    dict(id="roly-poly", room="bark",
         subject="pill woodlouse with a bumpy armoured back made of seven overlapping curved "
                 "plates cut from soft slate-grey paper, a small rounded head, two short paper "
                 "antennae, and many tiny paper legs.",
         idle_pose="Walking flat and low, all plates lying smooth, antennae forward.",
         happy_pose="it curls halfway into a round ball, tucking its head under, with just "
                    "its face and antennae peeking out of the curl."),
    dict(id="worm", room="bark",
         subject="earthworm made of many soft ringed segments of warm pink paper shading to a "
                 "slightly deeper pink at the tail, with a pale paper band around the middle "
                 "and a small rounded head with two friendly eyes.",
         idle_pose="Lying in a long relaxed wave shape, head slightly raised.",
         happy_pose="it rears the front third of its long body straight upward while the "
                    "rest lies along the ground, head tipped back — its body stays one open "
                    "line and never curls into a circle or ring."),
    dict(id="bee", room="bamboo",
         subject="bee with a fuzzy oval body striped in bright golden-yellow and deep black "
                 "paper, a black paper head, two rounded translucent cream paper wings, two "
                 "paper antennae, and six small black paper legs.",
         idle_pose="Standing with wings folded neatly back along its body.",
         happy_pose="both wings are spread wide and lifted as if buzzing, and it hovers "
                    "slightly with its legs tucked up."),
    dict(id="butterfly", room="bamboo",
         subject="butterfly with two large paper wings cut in layered orange, cream and deep "
                 "blue paper with round paper spots along their edges, a slim dark paper "
                 "body, and two long curling paper antennae.",
         idle_pose="Wings held half open and tilted, resting.",
         happy_pose="both wings are opened completely flat and wide to show the full pattern, "
                    "and its antennae curl upward."),
    dict(id="grasshopper", room="bamboo",
         subject="grasshopper with a long slender bright green paper body, a pointed green "
                 "paper head, two very long folded back legs like paper springs, four smaller "
                 "front legs, and two long thin paper antennae.",
         idle_pose="Crouched low with its back legs folded, antennae swept back.",
         happy_pose="its back legs are extended straight and it is caught mid-leap in the air "
                    "with its front legs tucked up."),
    dict(id="beetle", room="log",
         subject="beetle with a broad glossy shell cut from deep sapphire-blue paper with a "
                 "soft sheen, a rounded black paper head, two short curved paper horns, and "
                 "six sturdy dark paper legs.",
         idle_pose="Standing squarely on all six legs, horns level.",
         happy_pose="it lifts its front end up, raising both front legs off the ground and "
                    "tipping its horns proudly upward."),
    dict(id="spider", room="log",
         subject="round friendly spider with a soft charcoal-grey paper body, a small paper "
                 "head with several tiny round eyes, and eight long bent paper legs in a "
                 "lighter grey.",
         idle_pose="Standing calmly with all eight legs evenly spread.",
         happy_pose="it lifts two front legs up in a cheerful wave and hangs from one thin "
                    "pale paper thread."),
    dict(id="cricket", room="log",
         subject="cricket with a glossy dark chestnut-brown paper body, folded paper wing "
                 "covers along its back, strong bent back legs, and two extremely long thin "
                 "paper antennae curving back over its body.",
         idle_pose="Standing still with wings folded flat and antennae swept back.",
         happy_pose="it lifts its wing covers slightly as if chirping and raises both long "
                    "antennae up and apart."),
]

# --------------------------------------------------------------------------
# HTTP plumbing (matches games/world-music-dance/tools/gen-images.py and
# games/flashlight-cave/tools/gen-art.py, same server)
# --------------------------------------------------------------------------


def api_base() -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        local = REPO / "tools" / "state" / "local.json"
        if local.exists():
            try:
                base = str(json.loads(local.read_text()).get("qwenUrl", "")).rstrip("/")
            except Exception:  # noqa: BLE001
                pass
    if not base:
        sys.exit("QLOBE_QWEN_URL is not set and tools/state/local.json has no qwenUrl "
                  "(see .claude/skills/local-genai); --dry-run needs neither")
    return base


def api(path: str) -> str:
    return f"{api_base()}{path}"


def post_multipart(url: str, fields: dict, files: dict | None = None, max_time: int = 900) -> bytes:
    boundary = "----qlobebho" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n"
                  f"{value}\r\n").encode()
    for name, path in (files or {}).items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
                  f"filename=\"{Path(path).name}\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode()
        body += Path(path).read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=bytes(body),
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=max_time) as resp:
        return resp.read()


def get(url: str, timeout: int = 120) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return resp.read()


def call_t2i(prompt: str, w: int, h: int, seed: int) -> bytes:
    return post_multipart(api("/workflows/krea2-turbo-t2i?sync=true"),
                           {"prompt": prompt, "width": str(w), "height": str(h), "seed": str(seed)})


def call_edit(prompt: str, ref: Path, seed: int) -> bytes:
    return post_multipart(api("/workflows/qwen-image-edit?sync=true"),
                           {"prompt": prompt, "seed": str(seed)}, {"image": str(ref)})


def call_layered(prompt: str, ref: Path, seed: int, layers: int = 2) -> bytes:
    """qwen-image-layered, ASYNC job flow. sync=true would return layer_0 (the
    composite); this polls /jobs/{id} and fetches layer_2 (true-alpha subject)."""
    job = json.loads(post_multipart(api("/workflows/qwen-image-layered"),
                                    {"prompt": prompt, "layers": str(layers), "seed": str(seed)},
                                    {"image": str(ref)}))
    job_id = job.get("job_id") or job.get("id")
    if not job_id:
        raise RuntimeError(f"no job id in response: {job}")
    deadline = time.time() + 600
    status = None
    while time.time() < deadline:
        time.sleep(5)
        status = json.loads(get(api(f"/jobs/{job_id}")))
        st = status.get("status")
        if st in ("completed", "failed", "error"):
            break
    if not status or status.get("status") != "completed":
        raise RuntimeError(f"job did not complete: {status}")
    return get(api(f"/jobs/{job_id}/result?output=layer_2"), timeout=120)


# --------------------------------------------------------------------------
# Job table builders — one dict per generated file: id, workflow, seed,
# prompt (the exact text sent to the API), out (Path), ref (Path or None),
# w/h (t2i only).
# --------------------------------------------------------------------------


def _seed(step: int, ladder: list[int] = SEED_LADDER) -> int:
    return ladder[max(0, min(step, len(ladder) - 1))]


def jobs_batch_a(step: int) -> list[dict]:
    jobs = []

    jobs.append(dict(
        id="bg-hotel", workflow="krea2-turbo-t2i", seed=_seed(step),
        w=1600, h=1200, ref=None, out=ANCHORS / "bg-hotel.png",
        prompt=(
            'A handmade paper-craft bug hotel standing in a sunlit paper garden, seen '
            'straight on from the front. The hotel is a tall A-frame wooden house built '
            'from pale balsa-coloured paper planks, with a steep bright red folded-paper '
            'roof and a small dark arched attic opening under the gable. The front of the '
            'house is divided by cut-paper beams into four large arched room openings in a '
            'two-by-two grid. The upper-left room is packed with layered green paper leaves '
            'and moss. The upper-right room is packed with torn brown paper bark chips. The '
            'lower-left room is filled with a cluster of hollow cut bamboo tube ends seen '
            'end-on as paper rings. The lower-right room is filled with stacked paper log '
            'slices and dark soil. Every room is empty: no insects, no creatures, no '
            'animals anywhere in the picture. Small torn-cream paper banner labels are '
            'pinned blank beneath each room. Around the base of the hotel, layered paper '
            'moss, cut paper leaves, a red paper flower, a yellow paper daisy, small paper '
            'pebbles and a paper pine cone. A soft pale blue paper sky with a cut yellow '
            'paper sun in the upper right and rounded paper clouds. Warm afternoon light, '
            'gentle soft shadows between the paper layers, evenly lit with no dark '
            'vignette, calm uncluttered composition with generous space around the house. '
            + PAPER_GARDEN
        ),
    ))

    jobs.append(dict(
        id="title", workflow="krea2-turbo-t2i", seed=_seed(step, TEXT_SEED_LADDER),
        w=1600, h=900, ref=None, out=ANCHORS / "title.png",
        prompt=(
            'A torn-edged cream handmade paper card, slightly layered over a second '
            'sheet, held by a small brass paper clip, carrying a large chunky playful '
            'cut-paper title on three lines that reads exactly "Bug Hotel Observer" and '
            'nothing else. Each letter is individually cut from thick coloured paper with '
            'soft rounded corners and a small drop shadow onto the card. The word "Bug" is '
            'cut from warm red paper, the word "Hotel" from deep blue paper, and the word '
            '"Observer" from leaf-green paper. A tiny paper fern sprig and one small paper '
            'ladybug rest on the lower-left corner of the card. Centred, seen straight on, '
            'complete and unclipped on a flat dark charcoal background, with no scenery, '
            'no floor, no shadow cast onto the background. ' + PAPER_GARDEN_LETTERED
        ),
    ))

    jobs.append(dict(
        id="hub-tile", workflow="krea2-turbo-t2i", seed=_seed(step),
        w=768, h=640, ref=None, out=ANCHORS / "hub-tile.png",
        prompt=(
            'A big round magnifying glass held over one arched room of a small wooden bug '
            'hotel, with a bright red ladybug clearly visible and enlarged inside the '
            'glass. ' + TOY_TABLE
        ),
    ))

    return jobs


def _plaque_prompt(icon: str) -> str:
    return (
        'A small torn-edged kraft paper label card, seen straight on, matching the '
        'artistic style, paper materials, lighting and colour palette of the reference '
        'image. The card is a horizontal rounded rectangle of warm tan handmade paper '
        'with softly torn edges, a slightly darker paper backing sheet peeking out behind '
        'it, and two tiny stitched marks at the top corners. Resting on the card, filling '
        f'most of it, is {icon}. The card is completely blank apart from that picture: no '
        'writing of any kind. ' + CUTOUT_BG + ' ' + PAPER_GARDEN
    )


PLAQUES = [
    dict(room="leaf", icon="a single bright green cut-paper leaf with a pale paper centre "
                            "vein and one small notch in its edge"),
    dict(room="bark", icon="a single chunky torn chip of brown paper bark with shingled "
                            "layers and a rough curling edge"),
    dict(room="bamboo", icon="three hollow cut bamboo tubes seen end-on as pale gold paper "
                              "rings of different sizes, grouped together"),
    dict(room="log", icon="a round paper log slice seen end-on, with concentric cut rings "
                           "in soft grey-brown paper and a cushion of green paper moss on "
                           "its lower edge"),
]

ROOMS = ["leaf", "bark", "bamboo", "log"]

ROOM_PROMPTS = {
    "leaf": (
        'Extreme close-up inside one room of a handmade paper bug hotel: a leafy green '
        'chamber, matching the artistic style, paper materials, lighting and colour '
        'palette of the reference image. Layered cut-paper leaves in five shades of green '
        'overlap across the whole frame, with pale paper stems and cushions of crumpled '
        'green paper moss. Set into the leaves are four clearly separated arched hollows, '
        'like small rounded doorways cut back into the layers, each one a quiet '
        'uncluttered pocket of shadowed pale cream and soft olive paper: one hollow '
        'upper-left, one lower-left, one in the middle, one on the right. A single tall '
        'green paper stem rises at the far left edge. Empty rooms: absolutely no insects, '
        'no bugs, no creatures, no animals, no eyes. Even soft daylight, gentle shadows '
        'between paper layers, no dark vignette, the centre of the picture calm and low '
        'contrast. ' + PAPER_GARDEN
    ),
    "bark": (
        'Extreme close-up inside one room of a handmade paper bug hotel: a dry bark '
        'chamber, matching the artistic style, paper materials, lighting and colour '
        'palette of the reference image. Layered torn paper bark chips in warm browns and '
        'tans overlap in shingled slabs across the whole frame, with small crumbs of '
        'darker paper and a scatter of pale green paper moss along the lower edge. Set '
        'into the bark are four clearly separated arched hollows, like small rounded '
        'doorways cut back into the layers, each one a quiet uncluttered pocket of '
        'shadowed kraft and soft chocolate paper: one upper-left, one lower-left, one in '
        'the middle, one on the right. A few cut green paper leaves lean in from the right '
        'edge. The whole frame is filled with the inside of this one single room only: no '
        'roof, no red roof, no building exterior, no second storey, no wooden frame '
        'dividing multiple rooms, no sky, no clouds, no sun. '
        'Empty rooms: absolutely no insects, no bugs, no creatures, no animals, no '
        'eyes. Even soft daylight, gentle shadows between paper layers, no dark vignette, '
        'the centre of the picture calm and low contrast. ' + PAPER_GARDEN
    ),
    "bamboo": (
        'Extreme close-up inside one room of a handmade paper bug hotel: a bamboo-tube '
        'chamber, matching the artistic style, paper materials, lighting and colour '
        'palette of the reference image. A bundle of hollow cut bamboo tubes seen end-on '
        'fills the frame as a cluster of pale gold and kraft paper rings of different '
        'sizes, packed together with tiny paper fibres between them. Four of the tube '
        'mouths are much larger than the rest and clearly separated from each other, each '
        'one a quiet uncluttered pocket of soft shadowed cream paper: one on the left, one '
        'upper-centre, one lower-centre, one on the right. Two tall green paper bamboo '
        'stalks with pale binding rings stand at the left edge, and a few cut green paper '
        'leaves lean in from the top. Empty tubes: absolutely no insects, no bugs, no '
        'creatures, no animals, no eyes. Even soft daylight, gentle shadows between paper '
        'layers, no dark vignette, the centre of the picture calm and low contrast. '
        + PAPER_GARDEN
    ),
    "log": (
        'Extreme close-up inside one room of a handmade paper bug hotel: a damp old log '
        'chamber, matching the artistic style, paper materials, lighting and colour '
        'palette of the reference image. Stacked paper log slices with concentric cut '
        'rings, soft grey-brown weathered paper wood and dark crumbly paper soil fill the '
        'frame, with small pale cream paper bracket fungus shelves and a few cushions of '
        'deep green paper moss. Set into the wood are four clearly separated arched '
        'hollows, like small rounded doorways burrowed back into the layers, each one a '
        'quiet uncluttered pocket of shadowed warm grey and soft umber paper: one on the '
        'left, one upper-centre, one lower-centre, one on the right. A curl of pale paper '
        'bark lifts at the lower-right edge. The whole frame is filled with the inside of '
        'this one single room only: no roof, no red roof, no building exterior, no second '
        'storey, no wooden frame dividing multiple rooms, no sky, no clouds, no sun. '
        'Empty hollows: absolutely no insects, no '
        'bugs, no creatures, no animals, no eyes. Even soft daylight, gentle shadows '
        'between paper layers, no dark vignette, the centre of the picture calm and low '
        'contrast. ' + PAPER_GARDEN
    ),
}

JOURNAL_PROMPT = (
    'An open spiral-bound nature journal lying flat, seen straight on from above, '
    'matching the artistic style, paper materials, lighting and colour palette of the '
    'reference image. A dark brown wire spiral binding runs down the left edge. The open '
    'spread is warm kraft and cream handmade paper with soft torn edges and a faint '
    'pressed-leaf ghost print. A wide calm cream paper panel fills the middle and right of '
    'the spread, completely blank and evenly lit, ready to hold pictures. Around the '
    'outside edges of the spread, pressed paper botanicals: cut green paper leaves and '
    'fern fronds along the right and top edges, a white paper daisy with a yellow centre '
    'at the lower left, a few slim paper grass blades at the bottom right, and a small '
    'torn kraft paper tab on the right edge. Absolutely no insects, no creatures, no '
    'animals, no handwriting, no printed text, no ruled lines. Even soft daylight, gentle '
    'shadows between paper layers, no dark vignette. ' + PAPER_GARDEN
)

MAGNIFIER_PROMPT = (
    'A large handmade paper magnifying glass seen straight on, matching the artistic '
    'style, paper materials, lighting and colour palette of the reference image. A thick '
    'perfectly circular ring cut from pale cream cardstock with a slightly narrower inner '
    'ring of soft grey paper, and a completely empty transparent circular opening in the '
    'middle with nothing at all inside it. A straight chunky handle cut from warm '
    'chocolate-brown paper joins the ring at the lower right and angles down to the '
    'right, with a slightly darker paper band where it meets the ring. Seen from directly '
    'in front, no perspective tilt. The centre of the ring is fully open and empty, '
    'showing the background straight through. ' + CUTOUT_BG + ' ' + PAPER_GARDEN
)

MODE_PROMPTS = {
    "mode-hunt": (
        'A handmade paper magnifying glass with a cream paper ring and a chocolate-brown '
        'paper handle, resting at an angle over a single large bright green cut-paper '
        'leaf, seen straight on from above, matching the artistic style, paper materials, '
        'lighting and colour palette of the reference image. The circular opening of the '
        'glass is empty and shows the leaf straight through it, slightly larger inside '
        'the glass than outside. Nothing else in the picture, no insects, no creatures. '
        + CUTOUT_BG + ' ' + PAPER_GARDEN
    ),
    "mode-detective": (
        'A handmade paper magnifying glass with a cream paper ring and a chocolate-brown '
        'paper handle, resting at an angle over a small torn cream paper card, seen '
        'straight on from above, matching the artistic style, paper materials, lighting '
        'and colour palette of the reference image. On the card, seen through the empty '
        'circular opening of the glass, is one simple flat dark charcoal-paper silhouette '
        'of a small round beetle shape with tiny antennae, cut as a solid shadow with no '
        'face, no eyes, no colour and no detail. The card is otherwise completely blank. '
        + CUTOUT_BG + ' ' + PAPER_GARDEN
    ),
    "mode-book": (
        'A small closed spiral-bound nature notebook standing at a gentle three-quarter '
        'angle, matching the artistic style, paper materials, lighting and colour palette '
        'of the reference image. The cover is warm kraft handmade paper with softly torn '
        'edges, a dark brown wire spiral along the left, and a slim green paper band '
        'across the lower third. Stuck slightly crooked on the middle of the cover is one '
        'bright red paper ladybug with black paper spots and a black paper head, like a '
        'sticker with a pale paper border around it. A tiny green paper leaf peeks out '
        'from between the pages. The cover carries no writing of any kind. ' + CUTOUT_BG
        + ' ' + PAPER_GARDEN
    ),
}

JOURNAL_TAB_PROMPT = (
    'A small kraft paper bookmark tab, seen straight on, matching the artistic style, '
    'paper materials, lighting and colour palette of the reference image. A rounded '
    'square of warm tan handmade paper with softly torn edges and a short dark brown '
    'paper spiral binding curl along its left side, layered over a slightly larger cream '
    'paper sheet. A slim green paper leaf and one tiny paper fern sprig lie diagonally '
    'across it. Completely blank apart from those, with no writing of any kind. '
    + CUTOUT_BG + ' ' + PAPER_GARDEN
)

STICKER_BACKING_PROMPT = (
    'A blank round sticker cut from cream handmade paper, seen straight on from directly '
    'above, matching the artistic style, paper materials, lighting and colour palette of '
    'the reference image. A soft circle of pale cream paper with a slightly scalloped '
    'die-cut edge and a thin warm tan paper rim, layered over a barely larger circle of '
    'soft sage-green paper so a narrow green border shows all the way around. One corner '
    'lifts very slightly off the surface. The middle of the sticker is completely empty: '
    'no picture, no writing, no pattern of any kind. ' + CUTOUT_BG + ' ' + PAPER_GARDEN
)

FACT_CARD_PROMPT = (
    'A blank horizontal note panel cut from cream handmade paper, seen straight on, '
    'matching the artistic style, paper materials, lighting and colour palette of the '
    'reference image. A wide rounded rectangle of pale cream paper with softly torn '
    'edges, layered over a slightly larger sheet of warm kraft paper so a narrow tan '
    'border shows around it. A dashed stitched border of small tan paper dashes runs just '
    'inside the edge of the cream panel. A few cut green paper leaves are tucked behind '
    'the lower-left corner and one small paper fern sprig behind the upper right. The '
    'whole middle of the panel is completely empty and evenly lit: no picture, no '
    'writing, no ruled lines. ' + CUTOUT_BG + ' ' + PAPER_GARDEN
)

FACT_FOUND_PROMPT = (
    'A torn strip of soft sage-green handmade paper, wider than it is tall, like a banner '
    'ripped from a sheet, seen straight on, matching the artistic style, paper materials, '
    'lighting and colour palette of the reference image. Sitting on the banner is a large '
    'chunky playful cut-paper phrase on one line that reads exactly "Fact found!" and '
    'nothing else, each letter individually cut from deep forest-green paper with soft '
    'rounded corners and a small drop shadow onto the banner. The banner is otherwise '
    'empty. ' + CUTOUT_BG + ' ' + PAPER_GARDEN_LETTERED
)


def idle_prompt(bug: dict) -> str:
    return (IDLE_HEAD + bug["subject"] + " " + bug["idle_pose"] + " " + IDLE_TAIL + " "
            + CUTOUT_BG + " " + PAPER_GARDEN)



# bark/log kept re-rendering the whole hotel when conditioned on the exterior
# anchor; they are material-swap edits of the ACCEPTED leaf interior instead.
ROOM_SIBLING_SWAP = {
    "bark-disabled": (
        'Keep the exact same composition, camera angle, framing, lighting, arched '
        'hollows in the same positions, and layered cut-paper construction as the '
        'reference image. Change only the materials: replace every green cut-paper leaf, '
        'stem and green bush with layered torn paper bark chips in warm browns and tans '
        'overlapping in shingled slabs, with small crumbs of darker brown paper, and keep '
        'a little pale green paper moss only along the lower edge. Each arched hollow '
        'stays a quiet uncluttered pocket of shadowed kraft and soft chocolate paper. '
        'Empty rooms: absolutely no insects, no bugs, no creatures, no animals, no eyes. '
        'Even soft daylight, gentle shadows between paper layers, no dark vignette. '
        + PAPER_GARDEN
    ),
    "log-disabled": (
        'Keep the exact same composition, camera angle, framing, lighting, arched '
        'hollows in the same positions, and layered cut-paper construction as the '
        'reference image. Change only the materials: replace every green cut-paper leaf, '
        'stem and green bush with stacked paper log slices showing concentric cut rings, '
        'soft grey-brown weathered paper wood, dark crumbly paper soil along the bottom, '
        'small pale cream paper bracket fungus shelves, and a few cushions of deep green '
        'paper moss. Each arched hollow stays a quiet uncluttered pocket of shadowed '
        'warm grey and soft umber paper. Empty hollows: absolutely no insects, no bugs, '
        'no creatures, no animals, no eyes. Even soft daylight, gentle shadows between '
        'paper layers, no dark vignette. ' + PAPER_GARDEN
    ),
}


def happy_prompt(bug: dict) -> str:
    subject_short = bug["id"].replace("-", " ")
    if bug["id"] == "roly-poly":
        return (
            'The exact same papercraft pill woodlouse as the reference image. Keep every '
            'armour plate exactly the same soft slate-grey paper colour as the reference '
            '— grey plates only, no coloured plates, no patterns drawn on the plates. '
            'Change only two things: its eyes are wide and delighted with an open happy '
            'smile, and its body curls a little so its back arches up. '
            + CUTOUT_BG + ' ' + PAPER_GARDEN
        )
    return (
        f'The exact same papercraft {subject_short} as the reference image, identical '
        f'paper colours, identical cut shapes and identical size. It is still a '
        f'papercraft {bug["subject"]} Change only its pose: '
        f'{bug["happy_pose"]} Its eyes are wide and delighted and its smile is open and '
        f'happy. It stays a plain single cutout figure: no sticker outline, no die-cut '
        f'border, no white edge, no backing card, no backing papers, no extra shapes '
        f'behind it, no rainbow colours that the reference does not have. '
        + CUTOUT_BG + ' ' + PAPER_GARDEN
    )


def jobs_batch_b(step: int) -> list[dict]:
    anchor = ANCHORS / "bg-hotel.png"
    jobs = []

    for room in ROOMS:
        # bark/log resisted the anchor reference (it kept re-rendering the whole
        # hotel), so they material-swap from the accepted leaf interior instead.
        room_ref = RAW_EDIT / "bg-room-leaf.png" if room in ROOM_SIBLING_SWAP else anchor
        jobs.append(dict(
            id=f"bg-room-{room}", workflow="qwen-image-edit", seed=_seed(step),
            ref=room_ref, w=None, h=None, out=RAW_EDIT / f"bg-room-{room}.png",
            prompt=ROOM_SIBLING_SWAP.get(room, ROOM_PROMPTS.get(room)),
        ))

    jobs.append(dict(
        id="bg-journal", workflow="qwen-image-edit", seed=_seed(step),
        ref=anchor, w=None, h=None, out=RAW_EDIT / "bg-journal.png",
        prompt=JOURNAL_PROMPT,
    ))

    jobs.append(dict(
        id="magnifier", workflow="qwen-image-edit", seed=_seed(step),
        ref=anchor, w=None, h=None, out=RAW_EDIT / "magnifier.png",
        prompt=MAGNIFIER_PROMPT,
    ))

    for p in PLAQUES:
        jobs.append(dict(
            id=f"plaque-{p['room']}", workflow="qwen-image-edit", seed=_seed(step),
            ref=anchor, w=None, h=None, out=RAW_EDIT / f"plaque-{p['room']}.png",
            prompt=_plaque_prompt(p["icon"]),
        ))

    for mode_id, prompt in MODE_PROMPTS.items():
        jobs.append(dict(
            id=mode_id, workflow="qwen-image-edit", seed=_seed(step),
            ref=anchor, w=None, h=None, out=RAW_EDIT / f"{mode_id}.png",
            prompt=prompt,
        ))

    jobs.append(dict(
        id="journal-tab", workflow="qwen-image-edit", seed=_seed(step),
        ref=anchor, w=None, h=None, out=RAW_EDIT / "journal-tab.png",
        prompt=JOURNAL_TAB_PROMPT,
    ))
    jobs.append(dict(
        id="sticker-backing", workflow="qwen-image-edit", seed=_seed(step),
        ref=anchor, w=None, h=None, out=RAW_EDIT / "sticker-backing.png",
        prompt=STICKER_BACKING_PROMPT,
    ))
    jobs.append(dict(
        id="fact-card", workflow="qwen-image-edit", seed=_seed(step),
        ref=anchor, w=None, h=None, out=RAW_EDIT / "fact-card.png",
        prompt=FACT_CARD_PROMPT,
    ))
    jobs.append(dict(
        id="fact-found", workflow="qwen-image-edit", seed=_seed(step, TEXT_SEED_LADDER),
        ref=anchor, w=None, h=None, out=RAW_EDIT / "fact-found.png",
        prompt=FACT_FOUND_PROMPT,
    ))

    # Idle bug sprites — conditioned on the hotel anchor.
    for bug in BUGS:
        jobs.append(dict(
            id=f"bug-{bug['id']}-idle", workflow="qwen-image-edit", seed=_seed(step),
            ref=anchor, w=None, h=None, out=RAW_EDIT / f"bug-{bug['id']}-idle.png",
            prompt=idle_prompt(bug),
        ))

    # Happy bug sprites — conditioned on that bug's OWN idle frame, not the anchor.
    # Run these after the idle jobs above (same batch invocation handles ordering).
    for bug in BUGS:
        idle_ref = RAW_EDIT / f"bug-{bug['id']}-idle.png"
        jobs.append(dict(
            id=f"bug-{bug['id']}-happy", workflow="qwen-image-edit", seed=_seed(step),
            ref=idle_ref, w=None, h=None, out=RAW_EDIT / f"bug-{bug['id']}-happy.png",
            prompt=happy_prompt(bug),
        ))

    return jobs


# --------------------------------------------------------------------------
# Batch C — layered cutouts. One job per transparent asset (37), each naming
# its own raw-edit/anchor source and a short subject description for the
# "solid flat background / top layer: the exact same X" cutout template
# (pattern proven in games/world-music-dance + games/flashlight-cave).
# --------------------------------------------------------------------------

CUTOUT_TMPL = (
    "Solid flat green background layer. Top layer: the exact same {subject} from the "
    "image. Keep it identical to the input image."
)


def _cutout_subjects() -> list[tuple[str, Path, str]]:
    """(id, source path, subject description) for every Batch C job."""
    out = [
        ("title", ANCHORS / "title.png",
         'cut-paper title card reading "Bug Hotel Observer"'),
        ("magnifier", RAW_EDIT / "magnifier.png",
         "cut-paper magnifying glass ring and handle"),
        ("plaque-leaf", RAW_EDIT / "plaque-leaf.png", "cut-paper leaf label card"),
        ("plaque-bark", RAW_EDIT / "plaque-bark.png", "cut-paper bark label card"),
        ("plaque-bamboo", RAW_EDIT / "plaque-bamboo.png", "cut-paper bamboo label card"),
        ("plaque-log", RAW_EDIT / "plaque-log.png", "cut-paper log label card"),
        ("mode-hunt", RAW_EDIT / "mode-hunt.png",
         "cut-paper magnifying glass over a leaf"),
        ("mode-detective", RAW_EDIT / "mode-detective.png",
         "cut-paper magnifying glass over a silhouette card"),
        ("mode-book", RAW_EDIT / "mode-book.png",
         "cut-paper closed nature notebook with a ladybug sticker"),
        ("journal-tab", RAW_EDIT / "journal-tab.png", "cut-paper bookmark tab"),
        ("sticker-backing", RAW_EDIT / "sticker-backing.png", "blank cut-paper round sticker"),
        ("fact-card", RAW_EDIT / "fact-card.png", "blank cut-paper note panel"),
        ("fact-found", RAW_EDIT / "fact-found.png",
         'cut-paper banner reading "Fact found!"'),
    ]
    for bug in BUGS:
        out.append((f"bug-{bug['id']}-idle", RAW_EDIT / f"bug-{bug['id']}-idle.png",
                     f"papercraft {bug['id'].replace('-', ' ')}"))
        out.append((f"bug-{bug['id']}-happy", RAW_EDIT / f"bug-{bug['id']}-happy.png",
                     f"papercraft {bug['id'].replace('-', ' ')}"))
    return out


def jobs_batch_c(step: int) -> list[dict]:
    jobs = []
    for cid, src, subject in _cutout_subjects():
        jobs.append(dict(
            id=cid, workflow="qwen-image-layered", seed=_seed(step), ref=src,
            w=None, h=None, out=CUTOUTS / f"{cid}.png",
            prompt=CUTOUT_TMPL.format(subject=subject),
        ))
    return jobs


BATCH_BUILDERS = {"batch-a": jobs_batch_a, "batch-b": jobs_batch_b, "batch-c": jobs_batch_c}


# --------------------------------------------------------------------------
# Runner
# --------------------------------------------------------------------------


def matches_only(job_id: str, only: list[str]) -> bool:
    if not only:
        return True
    return any(o.lower() in job_id.lower() for o in only)


def write_sidecar(job: dict) -> None:
    sidecar = job["out"].with_suffix(".json")
    payload = {
        "id": job["id"],
        "workflow": job["workflow"],
        "prompt": job["prompt"],
        "seed": job["seed"],
        "ref": str(job["ref"].relative_to(REPO)) if job.get("ref") else None,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    sidecar.write_text(json.dumps(payload, indent=2) + "\n")


def run_job(job: dict, force: bool) -> str:
    out: Path = job["out"]
    if out.exists() and out.stat().st_size > MIN_BYTES and not force:
        return "skip"
    if job.get("ref") is not None and not job["ref"].exists():
        return f"FAIL missing ref {job['ref']}"
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        if job["workflow"] == "krea2-turbo-t2i":
            data = call_t2i(job["prompt"], job["w"], job["h"], job["seed"])
        elif job["workflow"] == "qwen-image-edit":
            data = call_edit(job["prompt"], job["ref"], job["seed"])
        elif job["workflow"] == "qwen-image-layered":
            data = call_layered(job["prompt"], job["ref"], job["seed"])
        else:
            return f"FAIL unknown workflow {job['workflow']}"
    except Exception as exc:  # noqa: BLE001
        return f"FAIL {exc}"
    if len(data) < MIN_BYTES:
        return f"FAIL output too small ({len(data)} bytes)"
    out.write_bytes(data)
    write_sidecar(job)
    return f"ok ({len(data)} bytes)"


def print_dry_run(jobs: list[dict]) -> None:
    print(f"[dry-run] {len(jobs)} job(s); zero network calls made")
    id_w = max((len(j["id"]) for j in jobs), default=2) + 1
    wf_w = max((len(j["workflow"]) for j in jobs), default=2) + 1
    for j in jobs:
        preview = j["prompt"][:80].replace("\n", " ")
        out_rel = j["out"].relative_to(GAME)
        print(f"  {j['id']:<{id_w}} {j['workflow']:<{wf_w}} seed={j['seed']:<6} "
              f"\"{preview}...\"  -> {out_rel}")


def run_batch(name: str, args) -> int:
    jobs = BATCH_BUILDERS[name](args.seed_step)
    jobs = [j for j in jobs if matches_only(j["id"], args.only)]
    if not jobs:
        print(f"no jobs matched --only {args.only!r}")
        return 1

    if args.dry_run:
        print_dry_run(jobs)
        return 0

    print(f"=== {name}: {len(jobs)} job(s) ===")
    results = []
    for j in jobs:
        status = run_job(j, args.force)
        print(f"  [{name}] {j['id']:<24} {status}")
        results.append((j["id"], status))

    ok = sum(1 for _, s in results if s == "skip" or s.startswith("ok"))
    fails = [(i, s) for i, s in results if s.startswith("FAIL")]
    print(f"\n{ok}/{len(results)} ok/skipped, {len(fails)} failed")
    if fails:
        for i, s in fails:
            print(f"  FAILED {i}: {s}")
        return 1
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("batch-a", "batch-b", "batch-c"):
        p = sub.add_parser(name)
        p.add_argument("--dry-run", action="store_true", help="print job table; no network")
        p.add_argument("--only", nargs="*", default=[], help="substring filter on job id")
        p.add_argument("--force", action="store_true", help="regenerate even if output exists")
        p.add_argument("--seed-step", type=int, default=0,
                        help="index into the seed ladder (0=42, 1=1337, 2=9001, 3=7, ...)")
    args = ap.parse_args()
    return run_batch(args.cmd, args)


if __name__ == "__main__":
    sys.exit(main())
