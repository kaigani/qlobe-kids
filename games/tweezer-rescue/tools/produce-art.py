#!/usr/bin/env python3
"""Tweezer Rescue — claymation art production pipeline.

One resumable script that walks the whole art list in `game-design.md` from
nothing to the runtime files under `assets/backdrops/` and `assets/sprites/`,
with every nondeterministic candidate retained under `assets/source/` plus a
JSON sidecar (workflow, prompt, seed, ref) as the provenance record for
ASSETS.md.

Stages — run IN THIS ORDER; each stage is one workflow type, because the
local ComfyUI wrapper is a single queue that swaps models per request and
interleaving workflow types craters throughput (~25x):

    t2i        krea2-turbo-t2i    5 backdrops + 4 from-scratch sprite sources
    lockups    ideogram4-t2i      "Tweezer Rescue" title + "Hooray!" banner
    edit       qwen-image-edit    mockup lifts (isolate X on dark charcoal)
                                  then derived variants (recolors, icon swaps)
    cutout     qwen-image-layered ASYNC jobs; fetch output=layer_2 only
    finalize   local only (PIL)   deterministic key/trim/pad/resize/encode,
                                  tweezer arm split + tweezers.json,
                                  magenta QA composites into assets/source/qa/

Alpha strategy is per-asset:
  - "layered": organic subjects (critters, flowers, nests, pom-poms, leaf,
    badge) go through qwen-image-layered (a generative redraw with true
    alpha).
  - "key": geometric / text subjects (lockups, tweezers, cards, buttons,
    chip, honeycomb, pools) are generated on a perfectly flat dark charcoal
    ground and keyed deterministically by border flood-fill — this preserves
    exact letterforms and the exact tweezer geometry the arm split depends
    on (a layered redraw could move the hinge).

Usage:
    python3 tools/produce-art.py plan                  # full job table, no network
    python3 tools/produce-art.py t2i
    python3 tools/produce-art.py lockups
    python3 tools/produce-art.py edit                  # lifts, then variants
    python3 tools/produce-art.py cutout
    python3 tools/produce-art.py finalize
    python3 tools/produce-art.py qa                    # magenta composites only
    python3 tools/produce-art.py tweezers              # split + tweezers.json only
    python3 tools/produce-art.py edit --only nest --seed 1337 --force   # reroll

Every stage skips outputs that already exist (>4KB) unless --force. Seed
ladder for rerolls: 42 -> 1337 -> 9001 -> 7 (pass --seed explicitly).
Host: $QLOBE_QWEN_URL, else `qwenUrl` in the git-ignored repo
`tools/state/local.json`. The host is never committed.
Run long stages under `caffeinate -dims`.
"""

from __future__ import annotations

import argparse
import io
import json
import mimetypes
import os
import sys
import time
import urllib.request
import urllib.error
import uuid
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]            # games/tweezer-rescue
REPO = GAME.parents[1]                                # qlobe-kids repo root
MOCKUPS = REPO.parent / "01-game-concepts" / "tweezer-rescue" / "output" / "ui-mockups"
ASSETS = GAME / "assets"
SPRITES = ASSETS / "sprites"
UI = ASSETS / "ui"          # code-agent contract (config.json): lockups/cards/buttons/chip/badge
BACKDROPS = ASSETS / "backdrops"
SRC = ASSETS / "source"
RAW = SRC / "raw"          # t2i + ideogram outputs
EDIT = SRC / "edit"        # qwen-image-edit outputs
CUT = SRC / "cutouts"      # layered layer_2 outputs (1024x1024 RGBA)
QA = SRC / "qa"            # magenta composites + tweezer split debug
LOG = SRC / "log.jsonl"

MIN_BYTES = 4 * 1024
SEED_LADDER = [42, 1337, 9001, 7]

M1 = MOCKUPS / "01-rescue-select.png"
M2 = MOCKUPS / "02-tweezer-rescue.png"
M3 = MOCKUPS / "03-rescue-complete.png"

# ---------------------------------------------------------------------------
# Style suffixes — verbatim from game-design.md "Art list"
# ---------------------------------------------------------------------------

CLAY = (
    "Handcrafted claymation stop-motion style, soft modeling clay with visible "
    "fingerprints and sculpted seams, rounded hand-shaped forms, matte plasticine "
    "texture, warm studio light, cheerful preschool garden diorama. No text, no "
    "letters, no watermark."
)

# Lettered variant for the two lockups only: same suffix with the closing
# no-text sentence replaced (it would fight the wordmark).
CLAY_LETTERED = (
    "Handcrafted claymation stop-motion style, soft modeling clay with visible "
    "fingerprints and sculpted seams, rounded hand-shaped forms, matte plasticine "
    "texture, warm studio light. The only text anywhere in the image is the "
    "lettering described above, sculpted from clay, spelled exactly as written, "
    "with no other letters, words, numbers or watermarks."
)

CHARCOAL = (
    "The background is a perfectly flat, solid, uniform dark charcoal background, "
    "no gradient, no texture, no shadows on the background."
)

# ---------------------------------------------------------------------------
# Job tables
# ---------------------------------------------------------------------------

# ---- Stage: t2i (krea2-turbo-t2i) ----------------------------------------

T2I_JOBS = [
    # 5 backdrops, 1600x1200, calm centers (cards/critters overlay them)
    dict(id="bd-splash", out=RAW / "bd-splash.png", w=1600, h=1200, prompt=(
        "A wide claymation garden diorama backdrop: a soft rounded clay dirt path "
        "through bright green clay grass, chunky clay flowers in pink, purple, white "
        "and yellow along the lower left and lower right edges, small round clay trees "
        "and a little wooden clay fence far in the background, fluffy white clay clouds "
        "in a bright blue clay sky. The middle of the scene is calm open grass and sky "
        "with no objects, gentle soft-focus depth. " + CLAY)),
    dict(id="bd-ladybugs", out=RAW / "bd-ladybugs.png", w=1600, h=1200, prompt=(
        "A leafy claymation garden bed backdrop seen from a low friendly angle: big "
        "soft green clay leaves and grass blades at the lower edges and corners, two "
        "or three blurred chunky clay flowers far in the background near the top "
        "corners, bright blue clay sky above. The whole center of the scene is calm "
        "open soft green clay grass with no objects, gentle depth of field. " + CLAY)),
    dict(id="bd-bees", out=RAW / "bd-bees.png", w=1600, h=1200, prompt=(
        "A sunny claymation meadow backdrop: gentle rolling hills of green clay grass "
        "across the lower third, a big bright blue clay sky with fluffy white clay "
        "clouds, a few tiny chunky clay flowers at the lower corners only. The center "
        "of the scene is calm and open with no objects. " + CLAY)),
    dict(id="bd-fish", out=RAW / "bd-fish.png", w=1600, h=1200, prompt=(
        "A claymation pond backdrop seen from above: smooth rippled blue clay water "
        "fills most of the scene, round green clay lily pads and smooth grey clay "
        "pebbles arranged around the outer edges, a soft green clay grass bank along "
        "the top edge. The center of the pond is calm open blue water with no objects. "
        + CLAY)),
    dict(id="bd-pompoms", out=RAW / "bd-pompoms.png", w=1600, h=1200, prompt=(
        "A cozy claymation craft corner backdrop: a warm pale wooden clay tabletop "
        "fills most of the scene seen from above, a soft cream clay cloth along one "
        "edge, a small ball of clay yarn and three round clay buttons tucked into the "
        "outer corners only. The center of the table is calm open wood with no "
        "objects. " + CLAY)),
    # from-scratch sprite sources on flat charcoal (no mockup reference exists)
    dict(id="sp-pompom-red", out=RAW / "sp-pompom-red.png", w=1024, h=1024, prompt=(
        "A single round fluffy craft pom-pom ball sculpted from bright red clay wool, "
        "chubby and soft with short fuzzy sculpted strands, single object, centered. "
        + CHARCOAL + " " + CLAY)),
    dict(id="sp-pool", out=RAW / "sp-pool.png", w=1024, h=768, prompt=(
        "A single round shallow clay water dish seen from a high three-quarter view: "
        "a smooth pale cream clay rim, bright blue clay water surface inside with one "
        "gentle sculpted ripple ring, single object, centered. " + CHARCOAL + " " + CLAY)),
    dict(id="sp-honeycomb", out=RAW / "sp-honeycomb.png", w=1152, h=672, prompt=(
        "A single claymation honeycomb board: a rounded slab of golden amber beeswax "
        "clay with exactly six large open hexagonal cells arranged in two rows of "
        "three, soft thick sculpted wax walls, each cell an empty shallow recess, "
        "single object, centered. " + CHARCOAL + " " + CLAY)),
    dict(id="sp-badge", out=RAW / "sp-badge.png", w=1024, h=1024, prompt=(
        "A single round claymation celebration medal: a chunky yellow clay star in "
        "the center of a scalloped cream clay medallion with a short blue clay ribbon "
        "tail at the bottom, single object, centered. " + CHARCOAL + " " + CLAY)),
]

# ---- Stage: lockups (ideogram4-t2i) --------------------------------------

LOCKUP_JOBS = [
    dict(id="title", out=RAW / "title.png", w=1408, h=576, prompt=(
        "Product logo typography reading exactly 'Tweezer Rescue'. Spell both words "
        "perfectly. A single centered title lockup in two balanced lines, the word "
        "Tweezer above the word Rescue, chunky rounded letters hand-sculpted from "
        "cream and white modeling clay with visible fingerprints and soft warm "
        "shadows, decorated with one small pair of open blue clay toy tweezers and "
        "two tiny pink clay flowers as ornaments beside the letters. On a perfectly "
        "flat solid uniform dark charcoal background, no gradient, no texture. "
        + CLAY_LETTERED)),
    dict(id="hooray", out=RAW / "hooray.png", w=1248, h=448, prompt=(
        "Festive banner typography reading exactly 'Hooray!'. Spell it perfectly. A "
        "single centered word sculpted from chunky rounded cream and white modeling "
        "clay letters sitting on a soft green clay ribbon banner with gently curled "
        "ends, three tiny clay confetti dots around it. On a perfectly flat solid "
        "uniform dark charcoal background, no gradient, no texture. " + CLAY_LETTERED)),
]

# ---- Stage: edit (qwen-image-edit) ---------------------------------------
# Lifts pull the EXACT subject out of a mockup onto flat charcoal (better
# identity than regenerating). Variants carry an accepted sibling's identity.
# Variants whose ref is another edit's output run after it automatically
# (jobs execute in list order; a missing ref is a hard skip with a warning).

EDIT_JOBS = [
    # -- B2 art-director fix: reroll the title lockup's ornaments only,
    # anchored on the shipped tweezer-arm and flower-pink sprites as real
    # reference images (image2/image3) so the small icons match the actual
    # in-game tool and flower instead of generic clip-art. Letterforms are
    # protected explicitly in the prompt; re-verify spelling after every run.
    dict(id="title-ornaments", ref=RAW / "title.png",
         ref2=EDIT / "tweezers-open.png", ref3=EDIT / "flower-pink.png",
         out=EDIT / "title-ornaments.png", prompt=(
        "Edit only two small decorative elements in this image; do not touch "
        "anything else. (1) Replace the small flat blue tweezer icon that "
        "sits beside the bottom-left of the letter R with a small pair of "
        "clay toy tweezers shaped exactly like the tweezers in the second "
        "reference image: a long wishbone-shaped pair of arms joined by one "
        "round hinge, blue modeling clay outer shells with a pale wood "
        "inner strip, sculpted at the same small scale and angle as the "
        "icon it replaces. (2) Replace BOTH small flower ornaments (one "
        "beside the tweezer icon, one past the last letter of Rescue) with "
        "a small flower shaped exactly like the flower in the third "
        "reference image: round overlapping pink clay petals around a flat "
        "yellow clay center, on a short green stem with two green leaves — "
        "no five-pointed star petals, no dark blotches. Both new ornaments "
        "must be sculpted from soft modeling clay with visible fingerprints "
        "and sculpted seams, matte-to-satin texture, lit by the same warm "
        "studio light as the letters, fully dimensional like the rest of "
        "the image — not flat icons. Do not change the letters 'Tweezer' "
        "and 'Rescue' in any way: keep their exact shapes, spelling, size, "
        "position and clay texture completely identical to the input. Keep "
        "the perfectly flat solid dark charcoal background identical, no "
        "gradient, no texture.")),
    # -- lifts from the mockups --
    dict(id="tweezers-open", ref=M2, out=EDIT / "tweezers-open.png", prompt=(
        "Isolate only the pair of toy tweezers from this picture: two long arms "
        "joined at one end by a round blue clay hinge, blue modeling clay outer "
        "shells and pale wooden inner arms. Redraw the tweezers lying on their "
        "side in a horizontal orientation, like an open pair of scissors or tongs "
        "lying flat: the round hinge positioned on the RIGHT side of the image, "
        "the two arm tips pointing toward the LEFT, open in a wide symmetric V "
        "shape with the top arm and bottom arm mirrored evenly above and below "
        "the horizontal centerline. Remove the ladybug, the basket, the leaf, the "
        "flowers and everything else. Keep the same blue clay and wood colors and "
        "texture as the input, complete and unclipped, fully horizontal, "
        "centered. " + CHARCOAL)),
    dict(id="ladybug", ref=M2, out=EDIT / "ladybug.png", prompt=(
        "Isolate only the ladybug that is standing on the green leaf: a round red "
        "modeling clay ladybug with black clay spots, a black clay head, two big "
        "friendly white eyes with black pupils, a little smile and short black clay "
        "legs. Remove the leaf and everything else. Keep the ladybug identical to the "
        "input, complete with all its legs, centered. " + CHARCOAL)),
    dict(id="leaf", ref=M2, out=EDIT / "leaf.png", prompt=(
        "Isolate only the big green clay leaf with its sculpted veins and short stem. "
        "Remove the ladybug standing on it and everything else. Keep the leaf "
        "identical to the input, complete and unclipped, centered. " + CHARCOAL)),
    dict(id="nest-base", ref=M2, out=EDIT / "nest-base.png", prompt=(
        "Isolate only the woven basket: a brown woven clay basket with a rim of "
        "chunky yellow clay petals and a soft pink clay cushion inside. Remove "
        "everything else. Keep the basket identical to the input, complete and "
        "unclipped, centered. " + CHARCOAL)),
    dict(id="bee", ref=M1, out=EDIT / "bee.png", prompt=(
        "Isolate only the bee from the yellow card: a chubby yellow and black striped "
        "modeling clay bee with round white clay wings, big friendly eyes and a "
        "little smile. Remove the card, the flower, the leaves and everything else. "
        "Keep the bee identical to the input, complete with both wings, centered. "
        + CHARCOAL)),
    dict(id="goldfish", ref=M1, out=EDIT / "goldfish.png", prompt=(
        "Isolate only the orange goldfish from the blue card: a chubby orange "
        "modeling clay goldfish with big friendly eyes, a smiling mouth and wavy "
        "sculpted fins and tail. Remove the water, the seaweed, the pebbles, the card "
        "frame and everything else. Keep the fish identical to the input, complete "
        "with all its fins, centered. " + CHARCOAL)),
    dict(id="flower-pink", ref=M3, out=EDIT / "flower-pink.png", prompt=(
        "Isolate only the pink flower on the left: chunky rounded pink clay petals "
        "around a flat open yellow clay center, on a short green clay stem with two "
        "green clay leaves. Remove the ladybug sitting on it and everything else. "
        "The open flower face points up, fully visible and empty. Keep the flower "
        "identical to the input, complete and unclipped, centered. " + CHARCOAL)),
    dict(id="flower-white", ref=M3, out=EDIT / "flower-white.png", prompt=(
        "Isolate only the white flower in the middle: chunky rounded cream-white "
        "clay petals around a flat open yellow clay center, on a short green clay "
        "stem with two green clay leaves. Remove the ladybug sitting on it and "
        "everything else. The open flower face points up, fully visible and empty. "
        "Keep the flower identical to the input, complete and unclipped, centered. "
        + CHARCOAL)),
    dict(id="flower-purple", ref=M3, out=EDIT / "flower-purple.png", prompt=(
        "Isolate only the purple flower on the right: chunky rounded purple clay "
        "petals around a flat open yellow clay center, on a short green clay stem "
        "with two green clay leaves. Remove the ladybug sitting on it and everything "
        "else. The open flower face points up, fully visible and empty. Keep the "
        "flower identical to the input, complete and unclipped, centered. " + CHARCOAL)),
    dict(id="card-ladybugs", ref=M1, out=EDIT / "card-ladybugs.png", prompt=(
        "Isolate only the left game card: a tall rounded rectangle card with a thick "
        "cream clay frame, a bright green clay interior, and a red clay ladybug "
        "sitting on a green clay leaf inside it. Keep the card identical to the "
        "input, complete and unclipped, centered. " + CHARCOAL)),
    dict(id="card-bees", ref=M1, out=EDIT / "card-bees.png", prompt=(
        "Isolate only the middle game card: a tall rounded rectangle card with a "
        "thick cream clay frame, a warm yellow clay interior, a striped clay bee "
        "flying above a white clay daisy inside it. Keep the card identical to the "
        "input, complete and unclipped, centered. " + CHARCOAL)),
    dict(id="card-fish", ref=M1, out=EDIT / "card-fish.png", prompt=(
        "Isolate only the right game card: a tall rounded rectangle card with a "
        "thick cream clay frame, a blue clay water interior, an orange clay goldfish "
        "swimming among green clay seaweed inside it. Keep the card identical to the "
        "input, complete and unclipped, centered. " + CHARCOAL)),
    dict(id="btn-back", ref=M2, out=EDIT / "btn-back.png", prompt=(
        "Isolate only the blue button in the top left corner: a rounded square of "
        "blue modeling clay with a soft cream clay border and a chunky cream clay "
        "arrow pointing left. Keep the button identical to the input, complete and "
        "unclipped, centered. " + CHARCOAL)),
    dict(id="btn-next", ref=M3, out=EDIT / "btn-next.png", prompt=(
        "Isolate only the green NEXT button: a wide green clay pill with a cream "
        "clay frame. Replace the word NEXT with one big chunky cream clay arrow "
        "pointing right, sculpted from clay, no letters anywhere. Keep the green "
        "clay pill and its cream frame identical to the input, centered. " + CHARCOAL)),
    dict(id="counter-chip", ref=M2, out=EDIT / "counter-chip.png", prompt=(
        "Isolate only the small cream pill-shaped chip that sits below the blue "
        "banner, and remove all text and numbers from it so it is a plain smooth "
        "cream clay pill with a soft sculpted border and nothing written on it. "
        "Completely remove the blue banner, the tweezers, the ladybugs and "
        "everything else in the picture — the only object in the output is the "
        "single cream pill, fully isolated with nothing else visible anywhere in "
        "the frame, not even a fragment or edge of another object. Keep the "
        "pill's shape identical to the input, centered. " + CHARCOAL)),
    # -- variants derived from accepted lifts / t2i sources --
    dict(id="btn-home", ref=EDIT / "btn-back.png", out=EDIT / "btn-home.png", prompt=(
        "Replace the cream arrow with a simple chunky cream clay house icon with a "
        "little triangular roof and a small door. Keep the blue clay button, its "
        "cream border and the flat dark charcoal background exactly identical. "
        + CHARCOAL)),
    dict(id="btn-sound-on", ref=EDIT / "btn-back.png", out=EDIT / "btn-sound-on.png", prompt=(
        "Replace the cream arrow with a chunky cream clay speaker icon with two "
        "curved cream clay sound waves beside it. Keep the blue clay button, its "
        "cream border and the flat dark charcoal background exactly identical. "
        + CHARCOAL)),
    dict(id="btn-sound-off", ref=EDIT / "btn-sound-on.png", out=EDIT / "btn-sound-off.png", prompt=(
        "Remove the two curved sound waves so only the chunky cream clay speaker "
        "icon remains on the button. Keep the blue clay button, its cream border, "
        "the speaker and the flat dark charcoal background exactly identical. "
        + CHARCOAL)),
    dict(id="nest-red", ref=EDIT / "nest-base.png", out=EDIT / "nest-red.png", prompt=(
        "Change the yellow clay petals around the basket rim to bright red clay "
        "petals and the pink cushion inside to soft warm red. Keep the brown woven "
        "clay basket, its shape and the flat dark charcoal background exactly "
        "identical. " + CHARCOAL)),
    dict(id="nest-yellow", ref=EDIT / "nest-base.png", out=EDIT / "nest-yellow.png", prompt=(
        "Change the pink cushion inside the basket to soft warm yellow, matching the "
        "yellow petals. Keep the brown woven clay basket, the yellow petals and the "
        "flat dark charcoal background exactly identical. " + CHARCOAL)),
    dict(id="nest-blue", ref=EDIT / "nest-base.png", out=EDIT / "nest-blue.png", prompt=(
        "Change the yellow clay petals around the basket rim to bright blue clay "
        "petals and the pink cushion inside to soft blue. Keep the brown woven clay "
        "basket, its shape and the flat dark charcoal background exactly identical. "
        + CHARCOAL)),
    dict(id="nest-green", ref=EDIT / "nest-base.png", out=EDIT / "nest-green.png", prompt=(
        "Change the yellow clay petals around the basket rim to bright green clay "
        "petals and the pink cushion inside to soft green. Keep the brown woven clay "
        "basket, its shape and the flat dark charcoal background exactly identical. "
        + CHARCOAL)),
    dict(id="pompom-yellow", ref=RAW / "sp-pompom-red.png", out=EDIT / "pompom-yellow.png", prompt=(
        "Change the pom-pom ball's color from red to bright sunny yellow. Keep its "
        "fuzzy clay-wool texture, shape, lighting and the flat dark charcoal "
        "background exactly identical. " + CHARCOAL)),
    dict(id="pompom-blue", ref=RAW / "sp-pompom-red.png", out=EDIT / "pompom-blue.png", prompt=(
        "Change the pom-pom ball's color from red to bright sky blue. Keep its fuzzy "
        "clay-wool texture, shape, lighting and the flat dark charcoal background "
        "exactly identical. " + CHARCOAL)),
    dict(id="pompom-green", ref=RAW / "sp-pompom-red.png", out=EDIT / "pompom-green.png", prompt=(
        "Change the pom-pom ball's color from red to bright grass green. Keep its "
        "fuzzy clay-wool texture, shape, lighting and the flat dark charcoal "
        "background exactly identical. " + CHARCOAL)),
    dict(id="card-pompoms", ref=EDIT / "card-ladybugs.png", out=EDIT / "card-pompoms.png", prompt=(
        "Replace the ladybug and the leaf with a cheerful pile of four fuzzy craft "
        "pom-pom balls sculpted from clay wool, one red, one yellow, one blue and "
        "one green, and change the bright green card interior to soft lavender "
        "clay. Keep the thick cream clay frame, the card shape and the flat dark "
        "charcoal background exactly identical. " + CHARCOAL)),
]

# ---- Stage: cutout (qwen-image-layered, async) ---------------------------
# Only the "layered" alpha-path assets. src -> cutouts/<id>.png (layer_2).

LAYERED_JOBS = [
    dict(id="ladybug", src=EDIT / "ladybug.png",
         desc="round red clay ladybug with black spots, black head, big white eyes and little black legs"),
    dict(id="bee", src=EDIT / "bee.png",
         desc="chubby yellow and black striped clay bee with round white wings and big friendly eyes"),
    dict(id="goldfish", src=EDIT / "goldfish.png",
         desc="chubby orange clay goldfish with big friendly eyes, smiling mouth and wavy fins"),
    dict(id="flower-pink", src=EDIT / "flower-pink.png",
         desc="chunky pink clay flower with a flat open yellow center on a green stem with leaves"),
    dict(id="flower-white", src=EDIT / "flower-white.png",
         desc="chunky cream-white clay flower with a flat open yellow center on a green stem with leaves"),
    dict(id="flower-purple", src=EDIT / "flower-purple.png",
         desc="chunky purple clay flower with a flat open yellow center on a green stem with leaves"),
    dict(id="leaf", src=EDIT / "leaf.png",
         desc="big green clay leaf with sculpted veins and a short stem"),
    dict(id="nest-red", src=EDIT / "nest-red.png",
         desc="brown woven clay basket with red clay petals around the rim and a red cushion inside"),
    dict(id="nest-yellow", src=EDIT / "nest-yellow.png",
         desc="brown woven clay basket with yellow clay petals around the rim and a yellow cushion inside"),
    dict(id="nest-blue", src=EDIT / "nest-blue.png",
         desc="brown woven clay basket with blue clay petals around the rim and a blue cushion inside"),
    dict(id="nest-green", src=EDIT / "nest-green.png",
         desc="brown woven clay basket with green clay petals around the rim and a green cushion inside"),
    dict(id="pompom-red", src=RAW / "sp-pompom-red.png",
         desc="single round fluffy red clay-wool pom-pom ball"),
    dict(id="pompom-yellow", src=EDIT / "pompom-yellow.png",
         desc="single round fluffy yellow clay-wool pom-pom ball"),
    dict(id="pompom-blue", src=EDIT / "pompom-blue.png",
         desc="single round fluffy blue clay-wool pom-pom ball"),
    dict(id="pompom-green", src=EDIT / "pompom-green.png",
         desc="single round fluffy green clay-wool pom-pom ball"),
    dict(id="badge", src=RAW / "sp-badge.png",
         desc="round cream clay medal with a yellow clay star center and a short blue ribbon tail"),
]

# ---- Stage: finalize ------------------------------------------------------
# kind: "opaque"  cover-crop to exact WxH, JPEG under budget
#       "canvas"  alpha sprite -> trim, pad, contain-fit onto WxH canvas, PNG
#       "fit"     alpha sprite -> trim, contain within WxH box (own aspect), PNG
# alpha src: "key:<path>" = deterministic border flood key of a flat-charcoal
# candidate; otherwise a cutouts/<id>.png with real alpha from Layered.

FINAL_SPECS = [
    dict(id="backdrop-splash", kind="opaque", src=RAW / "bd-splash.png",
         dst=BACKDROPS / "splash.jpg", w=1600, h=1200, budget_kb=300),
    dict(id="backdrop-ladybugs", kind="opaque", src=RAW / "bd-ladybugs.png",
         dst=BACKDROPS / "ladybugs.jpg", w=1600, h=1200, budget_kb=300),
    dict(id="backdrop-bees", kind="opaque", src=RAW / "bd-bees.png",
         dst=BACKDROPS / "bees.jpg", w=1600, h=1200, budget_kb=300),
    dict(id="backdrop-fish", kind="opaque", src=RAW / "bd-fish.png",
         dst=BACKDROPS / "fish.jpg", w=1600, h=1200, budget_kb=300),
    dict(id="backdrop-pompoms", kind="opaque", src=RAW / "bd-pompoms.png",
         dst=BACKDROPS / "pompoms.jpg", w=1600, h=1200, budget_kb=300),

    # NOTE: B2 art-director defect — the generated tweezer icon (flat, wrong
    # silhouette) and both flower ornaments (blotches, wrong petal shape)
    # broke the claymation world. A qwen-image-edit reroll anchored on the
    # shipped tweezer-arm/flower-pink sprites (image2/image3 ref slots) was
    # tried at seeds 42 and 1337 — both times the model collapsed onto a
    # near-verbatim copy of the reference image and discarded the actual
    # title canvas, a repeatable failure of this workflow with 3 stacked
    # images. Falling back to the review's explicitly-blessed simplest fix:
    # deterministically erase the ornaments (their colors — clay blue,
    # petal pink/red, center yellow — are far outside the cream letterform
    # palette) and ship the clay letters alone. See erase_color_blobs.
    dict(id="title", kind="fit", key=RAW / "title.png", close_holes=True,
         erase=([
             lambda r, g, b: b > r + 30 and b > g + 10 and b > 80,   # tweezer blue
             lambda r, g, b: (r - g) > 50 and (r - b) > 40,          # flower petal pink/red
             lambda r, g, b: r > 180 and g > 100 and b < 100,        # flower center yellow
         ], 150),
         dst=UI / "title.png", w=1400, h=560, budget_kb=150),
    dict(id="hooray", kind="fit", key=RAW / "hooray.png", close_holes=True,
         clean_components=True,
         dst=UI / "banner-hooray.png", w=1200, h=400, budget_kb=150),

    dict(id="card-ladybugs", kind="canvas", key=EDIT / "card-ladybugs.png",
         dst=UI / "card-ladybugs.png", w=640, h=800, budget_kb=170),
    dict(id="card-bees", kind="canvas", key=EDIT / "card-bees.png",
         dst=UI / "card-bees.png", w=640, h=800, budget_kb=170),
    # NOTE: M2 art-director defect — a ~2px outward bulge in the right frame
    # edge from y~322-352 (source EDIT/card-fish.png px), ~18 rows, fused
    # directly onto the frame's own anti-aliased boundary (not a disconnected
    # island — keep_largest_component and a morphological opening pass both
    # verified powerless against it: dilation always reconnects to the true
    # nearby edge value). Clone-stamp a clean patch of the same straight
    # edge from 60px above (donor rows are jump-free per a full boundary
    # scan) before keying — the RGB gradient there matches this row's
    # exactly, so the deterministic key derives the correct alpha for free.
    dict(id="card-fish", kind="canvas", key=EDIT / "card-fish.png",
         clean_components=True,
         patch=[(790, 318, 818, 356, 0, -60)],
         dst=UI / "card-fish.png", w=640, h=800, budget_kb=170),
    dict(id="card-pompoms", kind="canvas", key=EDIT / "card-pompoms.png",
         dst=UI / "card-pompoms.png", w=640, h=800, budget_kb=170),

    # NOTE: qwen-image-layered failed all 4 seed-ladder attempts on the
    # ladybug (near-blank alpha wash / wrong-subject redraw) — its black
    # head/legs sit too close in luminance to the charcoal ground and
    # confuse the generative separator. EDIT/ladybug.png is a clean,
    # sharp-edged, single-object lift with no fine fuzz needing a
    # generative alpha, so fall back to the deterministic "key" strategy
    # (same as honeycomb/pools/buttons/cards).
    dict(id="ladybug", kind="canvas", key=EDIT / "ladybug.png",
         dst=SPRITES / "ladybug.png", w=360, h=300, budget_kb=80),
    # NOTE: same failure as the ladybug — qwen-image-layered failed all 4
    # seed-ladder attempts (near-blank alpha / partial-fragment redraw), most
    # likely because the bee's black stripes/legs/eyes sit close in luminance
    # to the charcoal ground. EDIT/bee.png is a clean sharp-edged lift, so
    # fall back to the deterministic "key" strategy.
    dict(id="bee", kind="canvas", key=EDIT / "bee.png",
         dst=SPRITES / "bee.png", w=360, h=320, budget_kb=80),
    dict(id="goldfish", kind="canvas", src=CUT / "goldfish.png",
         dst=SPRITES / "goldfish.png", w=400, h=300, budget_kb=80),
    dict(id="flower-pink", kind="canvas", src=CUT / "flower-pink.png",
         dst=SPRITES / "flower-pink.png", w=420, h=420, budget_kb=90),
    dict(id="flower-white", kind="canvas", src=CUT / "flower-white.png",
         dst=SPRITES / "flower-white.png", w=420, h=420, budget_kb=90),
    dict(id="flower-purple", kind="canvas", src=CUT / "flower-purple.png",
         dst=SPRITES / "flower-purple.png", w=420, h=420, budget_kb=90),
    dict(id="leaf", kind="canvas", src=CUT / "leaf.png",
         dst=SPRITES / "leaf.png", w=460, h=340, budget_kb=90),
    dict(id="honeycomb", kind="canvas", key=RAW / "sp-honeycomb.png",
         dst=SPRITES / "honeycomb.png", w=900, h=520, budget_kb=150),
    dict(id="pool-big", kind="canvas", key=RAW / "sp-pool.png",
         dst=SPRITES / "pool-big.png", w=560, h=420, budget_kb=110),
    dict(id="pool-medium", kind="canvas", key=RAW / "sp-pool.png",
         dst=SPRITES / "pool-medium.png", w=440, h=330, budget_kb=90),
    dict(id="pool-little", kind="canvas", key=RAW / "sp-pool.png",
         dst=SPRITES / "pool-little.png", w=330, h=248, budget_kb=70),
    dict(id="pompom-red", kind="canvas", src=CUT / "pompom-red.png",
         dst=SPRITES / "pompom-red.png", w=260, h=260, budget_kb=70),
    dict(id="pompom-yellow", kind="canvas", src=CUT / "pompom-yellow.png",
         dst=SPRITES / "pompom-yellow.png", w=260, h=260, budget_kb=70),
    dict(id="pompom-blue", kind="canvas", src=CUT / "pompom-blue.png",
         dst=SPRITES / "pompom-blue.png", w=260, h=260, budget_kb=70),
    dict(id="pompom-green", kind="canvas", src=CUT / "pompom-green.png",
         dst=SPRITES / "pompom-green.png", w=260, h=260, budget_kb=70),
    dict(id="nest-red", kind="canvas", src=CUT / "nest-red.png",
         dst=SPRITES / "nest-red.png", w=460, h=340, budget_kb=100),
    dict(id="nest-yellow", kind="canvas", src=CUT / "nest-yellow.png",
         dst=SPRITES / "nest-yellow.png", w=460, h=340, budget_kb=100),
    dict(id="nest-blue", kind="canvas", src=CUT / "nest-blue.png",
         dst=SPRITES / "nest-blue.png", w=460, h=340, budget_kb=100),
    dict(id="nest-green", kind="canvas", src=CUT / "nest-green.png",
         dst=SPRITES / "nest-green.png", w=460, h=340, budget_kb=100),
    dict(id="btn-back", kind="canvas", key=EDIT / "btn-back.png",
         dst=UI / "btn-back.png", w=256, h=256, budget_kb=60),
    dict(id="btn-home", kind="canvas", key=EDIT / "btn-home.png",
         dst=UI / "btn-home.png", w=256, h=256, budget_kb=60),
    dict(id="btn-sound-on", kind="canvas", key=EDIT / "btn-sound-on.png",
         dst=UI / "btn-sound-on.png", w=256, h=256, budget_kb=60),
    dict(id="btn-sound-off", kind="canvas", key=EDIT / "btn-sound-off.png",
         dst=UI / "btn-sound-off.png", w=256, h=256, budget_kb=60),
    dict(id="btn-next", kind="canvas", key=EDIT / "btn-next.png",
         dst=UI / "btn-next.png", w=640, h=280, budget_kb=90),
    dict(id="counter-chip", kind="canvas", key=EDIT / "counter-chip.png",
         dst=UI / "chip.png", w=360, h=200, budget_kb=60),
    dict(id="badge", kind="canvas", src=CUT / "badge.png",
         dst=UI / "badge.png", w=360, h=360, budget_kb=80),
]

TWEEZER_CANVAS_W = 1200   # shared canvas width for both arm sprites

# ---------------------------------------------------------------------------
# Plumbing
# ---------------------------------------------------------------------------

def host() -> str:
    h = os.environ.get("QLOBE_QWEN_URL")
    if not h:
        state = REPO / "tools" / "state" / "local.json"
        if state.exists():
            h = json.loads(state.read_text()).get("qwenUrl")
    if not h:
        sys.exit("No API host: set QLOBE_QWEN_URL or tools/state/local.json qwenUrl")
    return h.rstrip("/")


def log_event(**kw):
    kw["at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f:
        f.write(json.dumps(kw) + "\n")


def sidecar(out: Path, **kw):
    out.with_suffix(out.suffix + ".json").write_text(json.dumps(kw, indent=2, default=str))


def multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    buf = io.BytesIO()
    for k, v in fields.items():
        buf.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    for k, p in files.items():
        ctype = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
        buf.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; "
                  f"filename=\"{Path(p).name}\"\r\nContent-Type: {ctype}\r\n\r\n".encode())
        buf.write(Path(p).read_bytes())
        buf.write(b"\r\n")
    buf.write(f"--{boundary}--\r\n".encode())
    return buf.getvalue(), boundary


def post(url: str, fields: dict, files: dict, timeout=1200) -> bytes:
    body, boundary = multipart(fields, files)
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def get(url: str, timeout=120) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def fresh(p: Path) -> bool:
    return p.exists() and p.stat().st_size > MIN_BYTES


def run_sync_job(wf: str, job: dict, seed: int, files: dict, fields: dict,
                 force: bool, dry: bool) -> str:
    out: Path = job["out"]
    if fresh(out) and not force:
        return "exists"
    if dry:
        return "would-run"
    out.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    try:
        data = post(f"{host()}/workflows/{wf}?sync=true", fields, files)
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        log_event(id=job["id"], workflow=wf, seed=seed, status="error", error=str(e))
        return f"ERROR {e}"
    if len(data) < MIN_BYTES:
        log_event(id=job["id"], workflow=wf, seed=seed, status="tiny", bytes=len(data))
        return f"ERROR tiny output ({len(data)}B)"
    out.write_bytes(data)
    sidecar(out, id=job["id"], workflow=wf, seed=seed, prompt=fields.get("prompt"),
            ref=str(files.get("image", "")), generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    log_event(id=job["id"], workflow=wf, seed=seed, status="ok",
              bytes=len(data), secs=round(time.time() - t0, 1))
    return f"ok ({len(data)//1024}KB, {round(time.time()-t0)}s)"


# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------

def stage_t2i(args):
    for job in select(T2I_JOBS, args.only):
        fields = dict(prompt=job["prompt"], seed=args.seed, width=job["w"], height=job["h"])
        print(f"[t2i] {job['id']:<16}", run_sync_job("krea2-turbo-t2i", job, args.seed, {}, fields, args.force, args.dry_run), flush=True)


def stage_lockups(args):
    for job in select(LOCKUP_JOBS, args.only):
        fields = dict(prompt=job["prompt"], seed=args.seed, width=job["w"], height=job["h"])
        print(f"[lockup] {job['id']:<14}", run_sync_job("ideogram4-t2i", job, args.seed, {}, fields, args.force, args.dry_run), flush=True)


def stage_edit(args):
    for job in select(EDIT_JOBS, args.only):
        ref = Path(job["ref"])
        if not ref.exists():
            print(f"[edit] {job['id']:<16} SKIP missing ref {ref.name}", flush=True)
            continue
        files = {"image": ref}
        for key, slot in (("ref2", "image2"), ("ref3", "image3")):
            extra = job.get(key)
            if extra:
                extra = Path(extra)
                if not extra.exists():
                    print(f"[edit] {job['id']:<16} SKIP missing {key} {extra.name}", flush=True)
                    files = None
                    break
                files[slot] = extra
        if files is None:
            continue
        fields = dict(prompt=job["prompt"], seed=args.seed)
        print(f"[edit] {job['id']:<16}", run_sync_job("qwen-image-edit", job, args.seed, files, fields, args.force, args.dry_run), flush=True)


def stage_cutout(args):
    h = None
    for job in select(LAYERED_JOBS, args.only):
        out = CUT / f"{job['id']}.png"
        if fresh(out) and not args.force:
            print(f"[cutout] {job['id']:<16} exists", flush=True)
            continue
        src = Path(job["src"])
        if not src.exists():
            print(f"[cutout] {job['id']:<16} SKIP missing src {src.name}", flush=True)
            continue
        if args.dry_run:
            print(f"[cutout] {job['id']:<16} would-run", flush=True)
            continue
        h = h or host()
        prompt = (f"Background layer: plain flat dark charcoal background. Top layer: "
                  f"the exact same {job['desc']} from the image, on a transparent "
                  f"background. Keep it identical to the input image.")
        t0 = time.time()
        try:
            resp = json.loads(post(f"{h}/workflows/qwen-image-layered",
                                   dict(prompt=prompt, seed=args.seed, layers=2),
                                   {"image": src}))
            jid = resp.get("job_id") or resp.get("id")
            status = None
            for _ in range(240):                     # up to ~20 min
                time.sleep(5)
                st = json.loads(get(f"{h}/jobs/{jid}"))
                status = st.get("status")
                if status in ("completed", "failed", "error"):
                    break
            if status != "completed":
                print(f"[cutout] {job['id']:<16} ERROR job {status}", flush=True)
                log_event(id=job["id"], workflow="qwen-image-layered", seed=args.seed, status=str(status))
                continue
            data = get(f"{h}/jobs/{jid}/result?output=layer_2")
        except Exception as e:                        # noqa: BLE001
            print(f"[cutout] {job['id']:<16} ERROR {e}", flush=True)
            log_event(id=job["id"], workflow="qwen-image-layered", seed=args.seed, status="error", error=str(e))
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        sidecar(out, id=job["id"], workflow="qwen-image-layered", seed=args.seed,
                prompt=prompt, ref=str(src), output="layer_2",
                generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        log_event(id=job["id"], workflow="qwen-image-layered", seed=args.seed,
                  status="ok", bytes=len(data), secs=round(time.time() - t0, 1))
        print(f"[cutout] {job['id']:<16} ok ({len(data)//1024}KB, {round(time.time()-t0)}s)", flush=True)


# ---------------------------------------------------------------------------
# Deterministic finalize (PIL, no network)
# ---------------------------------------------------------------------------

def _pil():
    from PIL import Image, ImageFilter  # noqa: PLC0415
    return Image, ImageFilter


def clone_stamp(im, box, dx, dy):
    """Deterministic clone-stamp repair: paste a nearby clean patch (box
    shifted by dx,dy — same material/edge, different position) over box.

    For a localized source-render blemish (e.g. a card frame edge that
    bulges outward by a couple of px over a short run of rows) that no
    keying / connected-component / opening pass can distinguish from real
    geometry, because the defect region's own gradient is smooth and
    internally consistent — it is only wrong *relative to its neighbors*.
    Operates on the RGB source before key_charcoal, so the deterministic
    border-flood key derives a correct alpha for the patched area for free.
    """
    x0, y0, x1, y1 = box
    donor = im.crop((x0 + dx, y0 + dy, x1 + dx, y1 + dy))
    im.paste(donor, (x0, y0))
    return im


def erase_color_blobs(im, rules, min_area=150, dilate=2):
    """Deterministically erase decorative color-blob ornaments (e.g. a
    generated icon glued beside a wordmark) from an otherwise clean source:
    any 8-connected component whose pixels match one of `rules` (each a
    predicate(r, g, b) -> bool) with area >= min_area gets painted over with
    the image's own flat background color (sampled the same way
    key_charcoal estimates it — median of the four corner patches), so a
    later key_charcoal border-flood treats the erased area as background.

    Small, scattered color matches (e.g. a warm shadow pixel inside a
    letter's clay texture that happens to pass a color rule) fall below
    min_area and are left untouched — only real solid ornament blobs
    qualify, so letterforms are never touched.
    """
    from collections import deque  # noqa: PLC0415
    Image, _ = _pil()
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    samples = []
    for cx, cy in [(0, 0), (w - 12, 0), (0, h - 12), (w - 12, h - 12)]:
        for x in range(cx, cx + 12):
            for y in range(cy, cy + 12):
                samples.append(px[x, y])
    samples.sort()
    bg = samples[len(samples) // 2]
    mask = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if any(rule(r, g, b) for rule in rules):
                mask[y * w + x] = 1
    labels = [0] * (w * h)
    current = 0
    erase_boxes = []
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if not mask[i0] or labels[i0]:
                continue
            current += 1
            dq = deque([(x0, y0)])
            labels[i0] = current
            minx = maxx = x0
            miny = maxy = y0
            area = 0
            while dq:
                cx, cy = dq.popleft()
                area += 1
                if cx < minx: minx = cx
                if cx > maxx: maxx = cx
                if cy < miny: miny = cy
                if cy > maxy: maxy = cy
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            ni = ny * w + nx
                            if mask[ni] and not labels[ni]:
                                labels[ni] = current
                                dq.append((nx, ny))
            if area >= min_area:
                erase_boxes.append((minx, miny, maxx, maxy, area))
    if not erase_boxes:
        return im
    for minx, miny, maxx, maxy, area in erase_boxes:
        x0 = max(0, minx - dilate); y0 = max(0, miny - dilate)
        x1 = min(w, maxx + dilate + 1); y1 = min(h, maxy + dilate + 1)
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = bg
        print(f"[erase] blob at ({minx},{miny})-({maxx},{maxy}) area={area}px -> background")
    return im


def key_charcoal(src, close_holes: bool = False, patch=None, erase=None):
    """Border flood-fill key of a flat dark-charcoal candidate -> RGBA.

    src may be a Path (opened and converted to RGB) or an already-loaded RGB
    Image (e.g. pre-patched by clone_stamp).

    close_holes=True additionally keys any background-colored pixel by color
    alone, not just border-connected — for pure typography lockups where a
    charcoal swath fully enclosed by letterforms (the gap between two text
    lines, a closed letter counter like the loop of 'e' or 'R') must also
    read as transparent. Do NOT set this for organic "key" sprites (e.g. the
    ladybug's black head/spots) whose genuinely dark, enclosed interior
    regions must stay opaque.

    patch, if given, is a list of (x0, y0, x1, y1, dx, dy) clone-stamp specs
    applied to the RGB source before keying (see clone_stamp).

    erase, if given, is a (rules, min_area) pair passed to erase_color_blobs
    to deterministically drop decorative ornaments before keying.
    """
    Image, ImageFilter = _pil()
    im = Image.open(src).convert("RGB") if isinstance(src, Path) else src.convert("RGB")
    if patch:
        for x0, y0, x1, y1, dx, dy in patch:
            clone_stamp(im, (x0, y0, x1, y1), dx, dy)
    if erase:
        rules, min_area = erase
        im = erase_color_blobs(im, rules, min_area=min_area)
    w, h = im.size
    px = im.load()
    # background estimate: median of the four corners' 12x12 patches
    samples = []
    for cx, cy in [(0, 0), (w - 12, 0), (0, h - 12), (w - 12, h - 12)]:
        for x in range(cx, cx + 12):
            for y in range(cy, cy + 12):
                samples.append(px[x, y])
    samples.sort()
    br, bg_, bb = samples[len(samples) // 2]
    tol2 = 42 ** 2
    from collections import deque  # noqa: PLC0415
    mask = bytearray(w * h)        # 1 = background
    dq = deque()
    for x in range(w):
        dq.append((x, 0)); dq.append((x, h - 1))
    for y in range(h):
        dq.append((0, y)); dq.append((w - 1, y))
    while dq:
        x, y = dq.popleft()
        i = y * w + x
        if mask[i]:
            continue
        r, g, b = px[x, y]
        if (r - br) ** 2 + (g - bg_) ** 2 + (b - bb) ** 2 > tol2:
            continue
        mask[i] = 1
        if x > 0: dq.append((x - 1, y))
        if x < w - 1: dq.append((x + 1, y))
        if y > 0: dq.append((x, y - 1))
        if y < h - 1: dq.append((x, y + 1))
    if close_holes:
        for i in range(w * h):
            if mask[i]:
                continue
            x, y = i % w, i // w
            r, g, b = px[x, y]
            if (r - br) ** 2 + (g - bg_) ** 2 + (b - bb) ** 2 <= tol2:
                mask[i] = 1
    alpha = Image.frombytes("L", (w, h), bytes(255 - m * 255 for m in mask))
    # soften the cut edge slightly, then re-harden the core
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def keep_largest_component(im, min_area_ratio=0.01, touch_pad=3, threshold=12):
    """Connected-component alpha cleanup: keep the dominant silhouette (by
    pixel area) plus any component whose (padded) bounding box overlaps it —
    e.g. a ribbon tail rendered a pixel or two short of touching. Any other
    component below min_area_ratio of the dominant's area is a stray
    cutout/trim leftover (same defect class as ASSETS.md defect #3, chip.png)
    and gets zeroed out. Pure-PIL (no numpy), same BFS idiom as key_charcoal.
    """
    from collections import deque  # noqa: PLC0415
    Image, _ = _pil()
    w, h = im.size
    a = im.getchannel("A")
    ap = a.load()
    mask = bytearray(w * h)          # 1 = opaque-enough
    for y in range(h):
        for x in range(w):
            if ap[x, y] > threshold:
                mask[y * w + x] = 1
    labels = [0] * (w * h)
    comps = []                       # list of dict(id, area, bbox)
    current = 0
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if not mask[i0] or labels[i0]:
                continue
            current += 1
            dq = deque([(x0, y0)])
            labels[i0] = current
            minx = maxx = x0
            miny = maxy = y0
            area = 0
            while dq:
                cx, cy = dq.popleft()
                area += 1
                if cx < minx: minx = cx
                if cx > maxx: maxx = cx
                if cy < miny: miny = cy
                if cy > maxy: maxy = cy
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            ni = ny * w + nx
                            if mask[ni] and not labels[ni]:
                                labels[ni] = current
                                dq.append((nx, ny))
            comps.append(dict(id=current, area=area, bbox=(minx, miny, maxx, maxy)))
    if len(comps) <= 1:
        return im
    dominant = max(comps, key=lambda c: c["area"])
    dx0, dy0, dx1, dy1 = dominant["bbox"]
    dx0 -= touch_pad; dy0 -= touch_pad; dx1 += touch_pad; dy1 += touch_pad
    keep_ids = {dominant["id"]}
    dropped = []
    for c in comps:
        if c["id"] == dominant["id"]:
            continue
        cx0, cy0, cx1, cy1 = c["bbox"]
        overlaps = cx0 <= dx1 and cx1 >= dx0 and cy0 <= dy1 and cy1 >= dy0
        if overlaps and c["area"] >= dominant["area"] * min_area_ratio:
            keep_ids.add(c["id"])
        else:
            dropped.append(c)
    if not dropped:
        return im
    px = im.load()
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if mask[i] and labels[i] not in keep_ids:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    print(f"[cleanup] dropped {len(dropped)} stray component(s), "
          f"area {[c['area'] for c in dropped]}px vs dominant {dominant['area']}px")
    return im


def alpha_trim(im, threshold=12, pad_frac=0.04):
    Image, _ = _pil()
    a = im.getchannel("A").point(lambda v: 255 if v > threshold else 0)
    bbox = a.getbbox()
    if not bbox:
        raise ValueError("empty alpha")
    im = im.crop(bbox)
    pad = int(max(im.size) * pad_frac)
    canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    return canvas


def encode_png(im, dst: Path, budget_kb: int):
    """PNG with an adaptive-palette fallback to hit the byte budget."""
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    if len(buf.getvalue()) > budget_kb * 1024:
        Image, _ = _pil()
        q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
        buf2 = io.BytesIO()
        q.save(buf2, "PNG", optimize=True)
        if len(buf2.getvalue()) < len(buf.getvalue()):
            buf = buf2
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(buf.getvalue())
    return len(buf.getvalue()) // 1024


def finalize_one(spec, force: bool) -> str:
    Image, _ = _pil()
    dst: Path = spec["dst"]
    src: Path = spec.get("src") or spec.get("key")
    if not src or not Path(src).exists():
        return f"SKIP missing source {src}"
    if dst.exists() and not force and dst.stat().st_size > 1024 \
            and dst.stat().st_mtime >= Path(src).stat().st_mtime:
        return "up-to-date"
    if spec["kind"] == "opaque":
        im = Image.open(src).convert("RGB")
        tw, th = spec["w"], spec["h"]
        scale = max(tw / im.width, th / im.height)
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        x = (im.width - tw) // 2
        y = (im.height - th) // 2
        im = im.crop((x, y, x + tw, y + th))
        for q in (86, 82, 78, 72, 66, 60):
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
            if len(buf.getvalue()) <= spec["budget_kb"] * 1024:
                break
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(buf.getvalue())
        return f"ok jpg q{q} {len(buf.getvalue())//1024}KB"
    # alpha paths
    im = key_charcoal(Path(src), close_holes=spec.get("close_holes", False),
                       patch=spec.get("patch"), erase=spec.get("erase")) \
        if "key" in spec else Image.open(src).convert("RGBA")
    if spec.get("clean_components"):
        im = keep_largest_component(im)
    im = alpha_trim(im)
    tw, th = spec["w"], spec["h"]
    scale = min(tw / im.width, th / im.height)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    if spec["kind"] == "canvas":
        canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        canvas.paste(im, ((tw - im.width) // 2, (th - im.height) // 2))
        im = canvas
    kb = encode_png(im, dst, spec["budget_kb"])
    return f"ok png {kb}KB"


def stage_finalize(args):
    for spec in select(FINAL_SPECS, args.only):
        print(f"[finalize] {spec['id']:<18}", finalize_one(spec, args.force), flush=True)
    if not args.only or any("tweez" in o for o in args.only):
        stage_tweezers(args)
    stage_qa(args)


def stage_qa(args):
    """Magenta composites of every finalized alpha sprite -> assets/source/qa/."""
    Image, _ = _pil()
    QA.mkdir(parents=True, exist_ok=True)
    targets = sorted(SPRITES.glob("*.png")) + sorted(UI.glob("*.png"))
    for p in targets:
        if args.only and not any(o in p.stem for o in args.only):
            continue
        im = Image.open(p).convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 0, 255, 255))
        bg.alpha_composite(im)
        bg.convert("RGB").save(QA / f"{p.stem}.magenta.png", "PNG")
    print(f"[qa] {len(targets)} magenta composites -> {QA}")


# ---------------------------------------------------------------------------
# Tweezer split — deterministic raster split of the keyed open tweezer
# ---------------------------------------------------------------------------

def stage_tweezers(args):
    """Split the keyed open-tweezer cutout into top/bottom arm sprites sharing
    one canvas, plus tweezers.json {canvas,pivot,tipTop,tipBottom}.

    Geometry assumption (matches mockup 02): hinge at the RIGHT end, the two
    arms open toward the LEFT with a transparent wedge between them. Columns
    where the silhouette is a single vertical run belong to the hinge zone and
    are copied to BOTH arms so rotation about the pivot never uncovers it.
    """
    Image, ImageFilter = _pil()
    src = EDIT / "tweezers-open.png"
    if not src.exists():
        print("[tweezers] SKIP missing", src)
        return
    dst_top = SPRITES / "tweezer-arm-top.png"
    dst_bot = SPRITES / "tweezer-arm-bottom.png"
    if dst_top.exists() and dst_bot.exists() and not args.force \
            and dst_top.stat().st_mtime >= src.stat().st_mtime:
        print("[tweezers] up-to-date")
        return
    im = alpha_trim(key_charcoal(src), pad_frac=0.03)
    w, h = im.size
    a = im.getchannel("A")
    ap = a.load()
    solid = 96

    def runs(x):
        out_, start = [], None
        for y in range(h):
            if ap[x, y] > solid:
                if start is None:
                    start = y
            elif start is not None:
                out_.append((start, y - 1)); start = None
        if start is not None:
            out_.append((start, h - 1))
        # merge runs separated by tiny (<6px) gaps (specular holes)
        merged = []
        for r in out_:
            if merged and r[0] - merged[-1][1] < 6:
                merged[-1] = (merged[-1][0], r[1])
            else:
                merged.append(list(r))
        return [tuple(r) for r in merged]

    # per-column classification
    split_y = [None] * w          # y of the gap midline where 2 runs exist
    single = [False] * w          # single-run (hinge zone) columns
    empty = [False] * w           # no opaque pixels at all (padding) columns
    for x in range(w):
        rr = runs(x)
        if len(rr) >= 2:
            # widest gap between consecutive runs
            gaps = [(rr[i + 1][0] - rr[i][1], (rr[i][1] + rr[i + 1][0]) // 2)
                    for i in range(len(rr) - 1)]
            split_y[x] = max(gaps)[1]
        elif len(rr) == 1:
            single[x] = True
        else:
            empty[x] = True
    # hinge zone = the contiguous single-run region at the right edge. The
    # rightmost columns are alpha_trim's padding (empty, zero runs) — skip
    # over those before requiring single-run contiguity, or the scan breaks
    # on the very first (empty) column and never finds the hinge.
    hinge_left = w
    started = False
    for x in range(w - 1, -1, -1):
        if empty[x] and not started:
            continue
        if single[x]:
            hinge_left = x
            started = True
        else:
            break
    # pivot = centroid of opaque pixels in the hinge zone
    sx = sy = n = 0
    for x in range(hinge_left, w):
        for y in range(h):
            if ap[x, y] > solid:
                sx += x; sy += y; n += 1
    if n == 0:
        print("[tweezers] ERROR no hinge zone found — inspect", src)
        return
    pivot = (sx / n, sy / n)
    # fill split_y through any interior single-run columns by interpolation
    last = None
    for x in range(w):
        if split_y[x] is None and x < hinge_left:
            split_y[x] = last if last is not None else h // 2
        elif split_y[x] is not None:
            last = split_y[x]
    top = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bot = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ip = im.load()
    tp = top.load()
    bp = bot.load()
    for x in range(w):
        for y in range(h):
            p = ip[x, y]
            if p[3] == 0:
                continue
            if x >= hinge_left:
                tp[x, y] = p
                bp[x, y] = p
            elif y <= split_y[x]:
                tp[x, y] = p
            else:
                bp[x, y] = p

    def tip(img):
        pp = img.load()
        best, bd = None, -1
        for x in range(w):
            for y in range(h):
                if pp[x, y][3] > solid:
                    d = (x - pivot[0]) ** 2 + (y - pivot[1]) ** 2
                    if d > bd:
                        bd, best = d, (x, y)
        return best

    tip_top, tip_bot = tip(top), tip(bot)
    # scale everything to the shared target canvas width
    scale = TWEEZER_CANVAS_W / w
    cw, ch = TWEEZER_CANVAS_W, round(h * scale)
    top = top.resize((cw, ch), Image.LANCZOS)
    bot = bot.resize((cw, ch), Image.LANCZOS)
    for img, dst in ((top, dst_top), (bot, dst_bot)):
        kb = encode_png(img, dst, 130)
        print(f"[tweezers] {dst.name} {kb}KB")
    meta = dict(
        canvas=dict(w=cw, h=ch),
        pivot=dict(x=round(pivot[0] * scale), y=round(pivot[1] * scale)),
        tipTop=dict(x=round(tip_top[0] * scale), y=round(tip_top[1] * scale)),
        tipBottom=dict(x=round(tip_bot[0] * scale), y=round(tip_bot[1] * scale)),
    )
    (SPRITES / "tweezers.json").write_text(json.dumps(meta, indent=2) + "\n")
    print("[tweezers] tweezers.json", json.dumps(meta))
    # QA: recomposite arms and diff against the source cutout
    recombined = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    recombined.alpha_composite(bot)
    recombined.alpha_composite(top)
    orig = im.resize((cw, ch), Image.LANCZOS)
    qa_img = Image.new("RGBA", (cw, ch * 2 + 8), (255, 0, 255, 255))
    qa_img.alpha_composite(orig, (0, 0))
    qa_img.alpha_composite(recombined, (0, ch + 8))
    # mark pivot + tips
    from PIL import ImageDraw  # noqa: PLC0415
    d = ImageDraw.Draw(qa_img)
    for pt, col in ((meta["pivot"], (0, 255, 0)), (meta["tipTop"], (255, 255, 0)), (meta["tipBottom"], (0, 255, 255))):
        x, y = pt["x"], pt["y"] + ch + 8
        d.line([(x - 14, y), (x + 14, y)], fill=col, width=3)
        d.line([(x, y - 14), (x, y + 14)], fill=col, width=3)
    QA.mkdir(parents=True, exist_ok=True)
    qa_img.convert("RGB").save(QA / "tweezers-split.magenta.png")
    print("[tweezers] QA composite ->", QA / "tweezers-split.magenta.png")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def select(jobs, only):
    if not only:
        return jobs
    return [j for j in jobs if any(o in j["id"] for o in only)]


def stage_plan(args):
    print(f"mockups: {MOCKUPS}  (exist: {M1.exists()})")
    for name, jobs, wf in (("t2i", T2I_JOBS, "krea2-turbo-t2i"),
                           ("lockups", LOCKUP_JOBS, "ideogram4-t2i"),
                           ("edit", EDIT_JOBS, "qwen-image-edit")):
        for j in jobs:
            status = "DONE" if fresh(j["out"]) else "todo"
            print(f"{name:<8} {wf:<18} {j['id']:<18} {status}  -> {j['out'].relative_to(GAME)}")
    for j in LAYERED_JOBS:
        status = "DONE" if fresh(CUT / (j["id"] + ".png")) else "todo"
        print(f"{'cutout':<8} {'qwen-image-layered':<18} {j['id']:<18} {status}")
    for s in FINAL_SPECS:
        status = "DONE" if s["dst"].exists() else "todo"
        print(f"{'final':<8} {s['kind']:<18} {s['id']:<18} {status}  -> {s['dst'].relative_to(GAME)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("stage", choices=["plan", "t2i", "lockups", "edit", "cutout",
                                      "finalize", "qa", "tweezers"])
    ap.add_argument("--only", nargs="*", help="substring filter on job ids")
    ap.add_argument("--seed", type=int, default=42, help="seed (ladder: 42 1337 9001 7)")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    {"plan": stage_plan, "t2i": stage_t2i, "lockups": stage_lockups,
     "edit": stage_edit, "cutout": stage_cutout, "finalize": stage_finalize,
     "qa": stage_qa, "tweezers": stage_tweezers}[args.stage](args)


if __name__ == "__main__":
    main()
