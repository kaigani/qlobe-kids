# Asset production spec — Bug Hotel Observer

Art world: **Paper Garden** (`docs/art-direction.md`; style id `paper-garden` in
`shared/data/generate-templates.json`). Second flagship in the world after Sound Painting.

This file is the **production spec**, written to be executed by a script author with no further
design input: every asset has an id, an output path, output dimensions, a byte budget, the
workflow that makes it, its seed ladder, and its complete generation prompt. Composition
references are the four concept mockups at
`01-game-concepts/bug-hotel-observer/output/ui-mockups/`.

The **provenance table (§7)** is the other half of this file and is filled in *after* generation.
Rows marked `TODO(P4)` / `TODO(P5)` are contracts on the generating agent, not omissions.

All generation runs on the local GenAI API (ComfyUI wrapper on the LAN; host configured via
`QLOBE_QWEN_URL`, never committed). **The local API is one queue and swaps models per request —
generate every asset of a batch before QA-ing any of it, or throughput craters.** Wrap long runs
in `caffeinate -dims`. New assets: CC BY 4.0, created for QLOBE Kids.

---

## 1. Pipeline

```
BATCH A  krea2-turbo-t2i           seeds 42 → 1337 → 9001 → 7
           bg-hotel.jpg  (also THE STYLE ANCHOR for every Batch B edit)
           title.webp
           source/hub/tile-candidate.jpg          (toy-table grammar, STAGED ONLY)
                    │
                    ▼  bg-hotel.jpg accepted = the anchor
BATCH B  qwen-image-edit from the anchor, seed 42
           4 room interiors · journal spread · 12 props/lockups · 24 bug sprites
                    │
                    ▼
BATCH C  qwen-image-layered (async job, layer_2 = true-alpha cutout), seed 42
           every transparent asset (36 of them)
                    │
                    ▼
tools/finalize-art.py   alpha-trim → pad 4% → resize → webp q90 / jpeg q86
                        → magenta composite into assets/source/qa/
tools/pipeline/capture_og_images.mjs   → assets/og-image.jpg

VOICE    qwen3-tts-voiceclone from shared/assets/refs/voice-teacher.wav, seeds 7 → 8 → 9
           ALL 74 lines generated, THEN all 74 whisper-stt QA'd (batch by workflow type)
           → ffmpeg AAC 64k m4a +faststart → assets/audio/manifest.json + qa.json
```

**Batch order is not optional.** Batch A's `bg-hotel.jpg` is the reference image every Batch B
edit is conditioned on ("…matching the artistic style of the reference"); that single anchor is
what makes 41 separately generated files look like one afternoon's papercraft.

---

## 2. Style suffixes — verbatim, do not paraphrase

**`PAPER_GARDEN`** — from `shared/data/generate-templates.json` → `styles.paper-garden.suffix`.
Every prompt in §3–§5 ends with this string, character for character:

```
premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

**`PAPER_GARDEN_LETTERED`** — the documented exception, used by **exactly two assets**
(`title.webp`, `fact-found.webp`) because the suffix's closing sentence would fight a wordmark
(the platform's own `menu-splash-title` template records the same reasoning). It is
`PAPER_GARDEN` with the final sentence replaced, and nothing else changed:

```
premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. The only text anywhere in the image is the lettering described above, cut from paper, spelled exactly as written, with no other letters, words, numbers, captions or watermarks.
```

**`TOY_TABLE`** — from `styles.toy-table.suffix`, used by **exactly one asset**, the staged hub
tile, because hub tiles are one visual system across the whole catalogue regardless of the game's
own art world:

```
Bright, soft 3D cartoon style with rounded, simplified forms and cheerful proportions. Saturated colors, smooth shading, soft highlights, toy-like glossy finish. Premium preschool learning app asset, no text, no letters, no words.
```

**`CUTOUT_BG`** — every asset destined for Batch C cutting appends this sentence **before** the
style suffix, verbatim, to keep alpha fringes out of the papercraft edges:

```
The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background.
```

---

## 3. Batch A — krea2-turbo-t2i

Seed ladder for every row: **42 → 1337 → 9001 → 7**. Text assets get the extended ladder
**42 → 1337 → 9001 → 7 → 2024 → 31337** because lettering is the least reliable generation we do;
review at full size and reroll rather than accepting a near-miss.

### A1 · `assets/bg-hotel.jpg` — hotel exterior **and the style anchor**

| | |
|---|---|
| output | `assets/bg-hotel.jpg` |
| dimensions | 1600 × 1200 (4:3) |
| byte budget | ≤ 300 KB (jpeg q86) |
| workflow | krea2-turbo-t2i |
| seeds | 42 → 1337 → 9001 → 7 |
| composition ref | mockup `01-hotel-select.png` |
| doubles as | the reference image for **every** Batch B edit — accept nothing less than the best of the ladder |

**Prompt:**

```
A handmade paper-craft bug hotel standing in a sunlit paper garden, seen straight on from the front. The hotel is a tall A-frame wooden house built from pale balsa-coloured paper planks, with a steep bright red folded-paper roof and a small dark arched attic opening under the gable. The front of the house is divided by cut-paper beams into four large arched room openings in a two-by-two grid. The upper-left room is packed with layered green paper leaves and moss. The upper-right room is packed with torn brown paper bark chips. The lower-left room is filled with a cluster of hollow cut bamboo tube ends seen end-on as paper rings. The lower-right room is filled with stacked paper log slices and dark soil. Every room is empty: no insects, no creatures, no animals anywhere in the picture. Small torn-cream paper banner labels are pinned blank beneath each room. Around the base of the hotel, layered paper moss, cut paper leaves, a red paper flower, a yellow paper daisy, small paper pebbles and a paper pine cone. A soft pale blue paper sky with a cut yellow paper sun in the upper right and rounded paper clouds. Warm afternoon light, gentle soft shadows between the paper layers, evenly lit with no dark vignette, calm uncluttered composition with generous space around the house. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

**Accept only if:** the four arches are clearly separated and roughly two-by-two; the rooms are
**empty of bugs**; the banners carry **no lettering**; the plate is evenly lit (the lens
magnifies whatever it is given, and a baked highlight becomes a smear).

### A2 · `assets/title.webp` — title lockup

| | |
|---|---|
| output | `assets/title.webp` (transparent) |
| dimensions | ~1400 × 760 after alpha-trim |
| byte budget | ≤ 150 KB (webp q92) |
| workflow | krea2-turbo-t2i → Batch C cutout |
| seeds | 42 → 1337 → 9001 → 7 → 2024 → 31337 |
| composition ref | mockup `01-hotel-select.png`, the torn card upper-left |
| suffix | **`PAPER_GARDEN_LETTERED`** |

**Prompt:**

```
A torn-edged cream handmade paper card, slightly layered over a second sheet, held by a small brass paper clip, carrying a large chunky playful cut-paper title on three lines that reads exactly "Bug Hotel Observer" and nothing else. Each letter is individually cut from thick coloured paper with soft rounded corners and a small drop shadow onto the card. The word "Bug" is cut from warm red paper, the word "Hotel" from deep blue paper, and the word "Observer" from leaf-green paper. A tiny paper fern sprig and one small paper ladybug rest on the lower-left corner of the card. Centred, seen straight on, complete and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. The only text anywhere in the image is the lettering described above, cut from paper, spelled exactly as written, with no other letters, words, numbers, captions or watermarks.
```

**Accept only if:** the three words are spelled **exactly** `Bug Hotel Observer`, checked at full
size with the image zoomed to 100 %, with no extra letters, no doubled letters and no stray
marks. **A failed lockup ships later and the voice covers the beat — it is never replaced by
HTML type** (`docs/art-direction.md`).

### A3 · `assets/source/hub/tile-candidate.jpg` — hub tile, **STAGED ONLY**

| | |
|---|---|
| output | `assets/source/hub/tile-candidate.jpg` |
| dimensions | 768 × 640 (the `menu-game-tile` template's own size) |
| byte budget | ≤ 200 KB |
| workflow | krea2-turbo-t2i via the `menu-game-tile` grammar (`{subject} {style.suffix}`) |
| seeds | 42 → 1337 → 9001 |
| suffix | **`TOY_TABLE`** — hub tiles are one system across the catalogue, not per-art-world |

**Prompt** (`subject` + `TOY_TABLE`, exactly as the template composes it):

```
A big round magnifying glass held over one arched room of a small wooden bug hotel, with a bright red ladybug clearly visible and enlarged inside the glass. Bright, soft 3D cartoon style with rounded, simplified forms and cheerful proportions. Saturated colors, smooth shading, soft highlights, toy-like glossy finish. Premium preschool learning app asset, no text, no letters, no words.
```

> **HARD RULE — `assets/hub/tiles/` is hand-curated by the maintainer and is NEVER written by
> this build.** The accepted candidate is staged at the path above and handed over. Any script
> that writes into `assets/hub/tiles/` is a bug.

---

## 4. Batch B — qwen-image-edit from the `bg-hotel.jpg` anchor

Every Batch B prompt is submitted with **`assets/bg-hotel.jpg` as the reference image** and
carries the phrase *"matching the artistic style, paper materials, lighting and colour palette of
the reference image"* inside the prompt body (it is written into each prompt below).
Seed ladder for every row: **42 → 1337 → 9001 → 7**.

### 4.1 Room interiors — B1–B4

Shared spec: **1600 × 1200, ≤ 300 KB each (jpeg q86)**, composition ref mockup
`02-find-ladybug.png`. Each plate must contain **four clearly separated arched hollows** whose
interiors are quiet, low-contrast and uncluttered — these are the four authored nooks
(`config.json → rooms[].zones`) and a bug has to read against them. **No insects, no creatures
and no lettering anywhere.** Keep the outer 12 % of the frame busy and the middle calm.

#### B1 · `assets/bg-room-leaf.jpg`

```
Extreme close-up inside one room of a handmade paper bug hotel: a leafy green chamber, matching the artistic style, paper materials, lighting and colour palette of the reference image. Layered cut-paper leaves in five shades of green overlap across the whole frame, with pale paper stems and cushions of crumpled green paper moss. Set into the leaves are four clearly separated arched hollows, like small rounded doorways cut back into the layers, each one a quiet uncluttered pocket of shadowed pale cream and soft olive paper: one hollow upper-left, one lower-left, one in the middle, one on the right. A single tall green paper stem rises at the far left edge. Empty rooms: absolutely no insects, no bugs, no creatures, no animals, no eyes. Even soft daylight, gentle shadows between paper layers, no dark vignette, the centre of the picture calm and low contrast. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

#### B2 · `assets/bg-room-bark.jpg`

```
Extreme close-up inside one room of a handmade paper bug hotel: a dry bark chamber, matching the artistic style, paper materials, lighting and colour palette of the reference image. Layered torn paper bark chips in warm browns and tans overlap in shingled slabs across the whole frame, with small crumbs of darker paper and a scatter of pale green paper moss along the lower edge. Set into the bark are four clearly separated arched hollows, like small rounded doorways cut back into the layers, each one a quiet uncluttered pocket of shadowed kraft and soft chocolate paper: one upper-left, one lower-left, one in the middle, one on the right. A few cut green paper leaves lean in from the right edge. Empty rooms: absolutely no insects, no bugs, no creatures, no animals, no eyes. Even soft daylight, gentle shadows between paper layers, no dark vignette, the centre of the picture calm and low contrast. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

#### B3 · `assets/bg-room-bamboo.jpg`

```
Extreme close-up inside one room of a handmade paper bug hotel: a bamboo-tube chamber, matching the artistic style, paper materials, lighting and colour palette of the reference image. A bundle of hollow cut bamboo tubes seen end-on fills the frame as a cluster of pale gold and kraft paper rings of different sizes, packed together with tiny paper fibres between them. Four of the tube mouths are much larger than the rest and clearly separated from each other, each one a quiet uncluttered pocket of soft shadowed cream paper: one on the left, one upper-centre, one lower-centre, one on the right. Two tall green paper bamboo stalks with pale binding rings stand at the left edge, and a few cut green paper leaves lean in from the top. Empty tubes: absolutely no insects, no bugs, no creatures, no animals, no eyes. Even soft daylight, gentle shadows between paper layers, no dark vignette, the centre of the picture calm and low contrast. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

#### B4 · `assets/bg-room-log.jpg`

```
Extreme close-up inside one room of a handmade paper bug hotel: a damp old log chamber, matching the artistic style, paper materials, lighting and colour palette of the reference image. Stacked paper log slices with concentric cut rings, soft grey-brown weathered paper wood and dark crumbly paper soil fill the frame, with small pale cream paper bracket fungus shelves and a few cushions of deep green paper moss. Set into the wood are four clearly separated arched hollows, like small rounded doorways burrowed back into the layers, each one a quiet uncluttered pocket of shadowed warm grey and soft umber paper: one on the left, one upper-centre, one lower-centre, one on the right. A curl of pale paper bark lifts at the lower-right edge. Empty hollows: absolutely no insects, no bugs, no creatures, no animals, no eyes. Even soft daylight, gentle shadows between paper layers, no dark vignette, the centre of the picture calm and low contrast. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

### 4.2 B5 · `assets/bg-journal.jpg` — the Explorer Journal spread

| | |
|---|---|
| dimensions | 1600 × 1200 · byte budget ≤ 280 KB (jpeg q86) |
| composition ref | mockup `03-ladybug-fact.png` |
| must provide | a calm cream field across the middle-right for the 4 × 3 sticker grid and the fact card |

```
An open spiral-bound nature journal lying flat, seen straight on from above, matching the artistic style, paper materials, lighting and colour palette of the reference image. A dark brown wire spiral binding runs down the left edge. The open spread is warm kraft and cream handmade paper with soft torn edges and a faint pressed-leaf ghost print. A wide calm cream paper panel fills the middle and right of the spread, completely blank and evenly lit, ready to hold pictures. Around the outside edges of the spread, pressed paper botanicals: cut green paper leaves and fern fronds along the right and top edges, a white paper daisy with a yellow centre at the lower left, a few slim paper grass blades at the bottom right, and a small torn kraft paper tab on the right edge. Absolutely no insects, no creatures, no animals, no handwriting, no printed text, no ruled lines. Even soft daylight, gentle shadows between paper layers, no dark vignette. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

### 4.3 Props and lockups — B6–B17

All are cut out in Batch C, so all end with **`CUTOUT_BG` then `PAPER_GARDEN`** (except B17,
which uses `PAPER_GARDEN_LETTERED`). Dimensions below are the **finalized** sizes after
`finalize-art.py` alpha-trims, pads 4 % and resizes.

| id | output | dims | budget | notes |
|---|---|---|---|---|
| B6 | `assets/props/magnifier.webp` | 900 × 900 | ≤ 80 KB | **true-alpha glass hole** — the single most load-bearing cutout in the game |
| B7 | `assets/props/plaque-leaf.webp` | 360 × 360 | ≤ 40 KB | icon-only |
| B8 | `assets/props/plaque-bark.webp` | 360 × 360 | ≤ 40 KB | icon-only |
| B9 | `assets/props/plaque-bamboo.webp` | 360 × 360 | ≤ 40 KB | icon-only |
| B10 | `assets/props/plaque-log.webp` | 360 × 360 | ≤ 40 KB | icon-only |
| B11 | `assets/props/mode-hunt.webp` | 420 × 420 | ≤ 50 KB | splash mode tile face |
| B12 | `assets/props/mode-detective.webp` | 420 × 420 | ≤ 50 KB | splash mode tile face |
| B13 | `assets/props/mode-book.webp` | 420 × 420 | ≤ 50 KB | splash mode tile face |
| B14 | `assets/props/journal-tab.webp` | 300 × 300 | ≤ 30 KB | corner button face |
| B15 | `assets/props/sticker-backing.webp` | 420 × 420 | ≤ 36 KB | one backing, reused 12× |
| B16 | `assets/props/fact-card.webp` | 1100 × 760 | ≤ 90 KB | the dashed panel from mockup 03 |
| B17 | `assets/lockups/fact-found.webp` | 900 × 280 | ≤ 60 KB | **lettered** |

#### B6 · magnifier

```
A large handmade paper magnifying glass seen straight on, matching the artistic style, paper materials, lighting and colour palette of the reference image. A thick perfectly circular ring cut from pale cream cardstock with a slightly narrower inner ring of soft grey paper, and a completely empty transparent circular opening in the middle with nothing at all inside it. A straight chunky handle cut from warm chocolate-brown paper joins the ring at the lower right and angles down to the right, with a slightly darker paper band where it meets the ring. Seen from directly in front, no perspective tilt. The centre of the ring is fully open and empty, showing the background straight through. The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

> **Critical QA:** after Batch C, the glass opening must be **fully transparent alpha**, not a
> pale disc. Check the magenta composite: magenta must show through the whole circle. If the
> layered extraction fills the glass, re-cut with an explicit two-layer prompt ("the ring and
> handle are the subject; the circular opening is background").

#### B7–B10 · room plaques

Composition template — substitute `{ICON}` per row, everything else identical:

```
A small torn-edged kraft paper label card, seen straight on, matching the artistic style, paper materials, lighting and colour palette of the reference image. The card is a horizontal rounded rectangle of warm tan handmade paper with softly torn edges, a slightly darker paper backing sheet peeking out behind it, and two tiny stitched marks at the top corners. Resting on the card, filling most of it, is {ICON}. The card is completely blank apart from that picture: no writing of any kind. The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

| id | `{ICON}` |
|---|---|
| B7 leaf | `a single bright green cut-paper leaf with a pale paper centre vein and one small notch in its edge` |
| B8 bark | `a single chunky torn chip of brown paper bark with shingled layers and a rough curling edge` |
| B9 bamboo | `three hollow cut bamboo tubes seen end-on as pale gold paper rings of different sizes, grouped together` |
| B10 log | `a round paper log slice seen end-on, with concentric cut rings in soft grey-brown paper and a cushion of green paper moss on its lower edge` |

#### B11 · mode tile face — Bug Hunt

```
A handmade paper magnifying glass with a cream paper ring and a chocolate-brown paper handle, resting at an angle over a single large bright green cut-paper leaf, seen straight on from above, matching the artistic style, paper materials, lighting and colour palette of the reference image. The circular opening of the glass is empty and shows the leaf straight through it, slightly larger inside the glass than outside. Nothing else in the picture, no insects, no creatures. The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

#### B12 · mode tile face — Bug Detective

```
A handmade paper magnifying glass with a cream paper ring and a chocolate-brown paper handle, resting at an angle over a small torn cream paper card, seen straight on from above, matching the artistic style, paper materials, lighting and colour palette of the reference image. On the card, seen through the empty circular opening of the glass, is one simple flat dark charcoal-paper silhouette of a small round beetle shape with tiny antennae, cut as a solid shadow with no face, no eyes, no colour and no detail. The card is otherwise completely blank. The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

#### B13 · mode tile face — My Bug Book

```
A small closed spiral-bound nature notebook standing at a gentle three-quarter angle, matching the artistic style, paper materials, lighting and colour palette of the reference image. The cover is warm kraft handmade paper with softly torn edges, a dark brown wire spiral along the left, and a slim green paper band across the lower third. Stuck slightly crooked on the middle of the cover is one bright red paper ladybug with black paper spots and a black paper head, like a sticker with a pale paper border around it. A tiny green paper leaf peeks out from between the pages. The cover carries no writing of any kind. The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

#### B14 · journal tab

```
A small kraft paper bookmark tab, seen straight on, matching the artistic style, paper materials, lighting and colour palette of the reference image. A rounded square of warm tan handmade paper with softly torn edges and a short dark brown paper spiral binding curl along its left side, layered over a slightly larger cream paper sheet. A slim green paper leaf and one tiny paper fern sprig lie diagonally across it. Completely blank apart from those, with no writing of any kind. The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

#### B15 · sticker backing

```
A blank round sticker cut from cream handmade paper, seen straight on from directly above, matching the artistic style, paper materials, lighting and colour palette of the reference image. A soft circle of pale cream paper with a slightly scalloped die-cut edge and a thin warm tan paper rim, layered over a barely larger circle of soft sage-green paper so a narrow green border shows all the way around. One corner lifts very slightly off the surface. The middle of the sticker is completely empty: no picture, no writing, no pattern of any kind. The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

#### B16 · fact card plate

```
A blank horizontal note panel cut from cream handmade paper, seen straight on, matching the artistic style, paper materials, lighting and colour palette of the reference image. A wide rounded rectangle of pale cream paper with softly torn edges, layered over a slightly larger sheet of warm kraft paper so a narrow tan border shows around it. A dashed stitched border of small tan paper dashes runs just inside the edge of the cream panel. A few cut green paper leaves are tucked behind the lower-left corner and one small paper fern sprig behind the upper right. The whole middle of the panel is completely empty and evenly lit: no picture, no writing, no ruled lines. The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

#### B17 · "Fact found!" lockup — **lettered**

Seed ladder **42 → 1337 → 9001 → 7 → 2024 → 31337**. Composition ref: the green torn banner at
the top of mockup `03-ladybug-fact.png`.

```
A torn strip of soft sage-green handmade paper, wider than it is tall, like a banner ripped from a sheet, seen straight on, matching the artistic style, paper materials, lighting and colour palette of the reference image. Sitting on the banner is a large chunky playful cut-paper phrase on one line that reads exactly "Fact found!" and nothing else, each letter individually cut from deep forest-green paper with soft rounded corners and a small drop shadow onto the banner. The banner is otherwise empty. The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. The only text anywhere in the image is the lettering described above, cut from paper, spelled exactly as written, with no other letters, words, numbers, captions or watermarks.
```

**Accept only if** it reads exactly `Fact found!` at full size, including the exclamation mark
and the lower-case `f` in "found".

### 4.4 Bug sprites — B18–B41 (24 files)

**24 sprites = 12 bugs × 2 authored frames.** There are exactly two frames per bug and all motion
comes from `hotspot-scene`'s `wiggle` / `pop` / `pulse` — **no CSS-drawn bug, ever, and no third
frame.**

Shared spec: finalized to **512 px on the longest edge**, **30–60 KB each** (webp q90), Batch C
cutout, seed ladder **42 → 1337 → 9001 → 7**.

**The complete prompt for an IDLE frame is this exact concatenation:**

```
IDLE_HEAD + {subject} + " " + {idle_pose} + " " + IDLE_TAIL + " " + CUTOUT_BG + " " + PAPER_GARDEN
```

with

```
IDLE_HEAD = "A single friendly papercraft "
IDLE_TAIL = "Seen from a gentle three-quarter view from slightly above, whole body visible, big simple friendly cartoon eyes with white paper highlights, calm closed smile, no scenery around it, matching the artistic style, paper materials, lighting and colour palette of the reference image."
```

**The HAPPY frame is a second qwen-image-edit pass conditioned on that bug's own accepted idle
sprite** (not on the hotel anchor), so the two frames are unmistakably the same paper creature:

```
HAPPY_PROMPT = "The exact same papercraft " + {subject_short} + " as the reference image, identical paper colours, identical cut shapes and identical size. Change only its pose: " + {happy_pose} + " Its eyes are wide and delighted and its smile is open and happy. " + CUTOUT_BG + " " + PAPER_GARDEN
```

| id | bug | `{subject}` | `{idle_pose}` | `{happy_pose}` |
|---|---|---|---|---|
| B18/B30 | ladybug | `ladybug with a domed bright red paper shell, six round black paper spots, a glossy black paper head, two thin black paper antennae with tiny round tips, and six short black paper legs.` | `Resting still on all six legs, antennae angled gently forward.` | `it lifts its red wing covers slightly to show pale cream paper flying wings underneath, and raises one front leg in a little wave.` |
| B19/B31 | caterpillar | `caterpillar made of eight soft rounded segments of bright green paper in two alternating shades, with a slightly larger green paper head, two short paper antennae, and many tiny stubby paper legs along the underside.` | `Stretched out gently in a shallow S curve, antennae forward.` | `it arches the middle of its body up into a tall friendly hump and lifts its head high.` |
| B20/B32 | snail | `snail with a soft pale cream paper body and a big spiral shell cut from warm caramel and cream paper with a clear curling spiral line, and two long paper eye stalks with little round eyes on the ends.` | `Gliding slowly forward, both eye stalks stretched out and level.` | `it stretches both eye stalks tall and curves them outward, and lifts the front of its body up off the ground.` |
| B21/B33 | ant | `ant with three rounded segments of deep russet-brown paper, a slightly shiny head, two bent paper antennae, and six thin dark paper legs.` | `Standing on all six legs facing slightly forward, antennae angled up.` | `it rears up on its back legs and holds a tiny crumb of pale paper high above its head.` |
| B22/B34 | roly-poly | `pill woodlouse with a bumpy armoured back made of seven overlapping curved plates cut from soft slate-grey paper, a small rounded head, two short paper antennae, and many tiny paper legs.` | `Walking flat and low, all plates lying smooth, antennae forward.` | `it curls halfway into a round ball, tucking its head under, with just its face and antennae peeking out of the curl.` |
| B23/B35 | worm | `earthworm made of many soft ringed segments of warm pink paper shading to a slightly deeper pink at the tail, with a pale paper band around the middle and a small rounded head with two friendly eyes.` | `Lying in a long relaxed wave shape, head slightly raised.` | `it rears the front third of its body upright in a tall happy loop and tips its head back.` |
| B24/B36 | bee | `bee with a fuzzy oval body striped in bright golden-yellow and deep black paper, a black paper head, two rounded translucent cream paper wings, two paper antennae, and six small black paper legs.` | `Standing with wings folded neatly back along its body.` | `both wings are spread wide and lifted as if buzzing, and it hovers slightly with its legs tucked up.` |
| B25/B37 | butterfly | `butterfly with two large paper wings cut in layered orange, cream and deep blue paper with round paper spots along their edges, a slim dark paper body, and two long curling paper antennae.` | `Wings held half open and tilted, resting.` | `both wings are opened completely flat and wide to show the full pattern, and its antennae curl upward.` |
| B26/B38 | grasshopper | `grasshopper with a long slender bright green paper body, a pointed green paper head, two very long folded back legs like paper springs, four smaller front legs, and two long thin paper antennae.` | `Crouched low with its back legs folded, antennae swept back.` | `its back legs are extended straight and it is caught mid-leap in the air with its front legs tucked up.` |
| B27/B39 | beetle | `beetle with a broad glossy shell cut from deep sapphire-blue paper with a soft sheen, a rounded black paper head, two short curved paper horns, and six sturdy dark paper legs.` | `Standing squarely on all six legs, horns level.` | `it lifts its front end up, raising both front legs off the ground and tipping its horns proudly upward.` |
| B28/B40 | spider | `round friendly spider with a soft charcoal-grey paper body, a small paper head with several tiny round eyes, and eight long bent paper legs in a lighter grey.` | `Standing calmly with all eight legs evenly spread.` | `it lifts two front legs up in a cheerful wave and hangs from one thin pale paper thread.` |
| B29/B41 | cricket | `cricket with a glossy dark chestnut-brown paper body, folded paper wing covers along its back, strong bent back legs, and two extremely long thin paper antennae curving back over its body.` | `Standing still with wings folded flat and antennae swept back.` | `it lifts its wing covers slightly as if chirping and raises both long antennae up and apart.` |

**Worked example — the complete B18 prompt, exactly as it is submitted:**

```
A single friendly papercraft ladybug with a domed bright red paper shell, six round black paper spots, a glossy black paper head, two thin black paper antennae with tiny round tips, and six short black paper legs. Resting still on all six legs, antennae angled gently forward. Seen from a gentle three-quarter view from slightly above, whole body visible, big simple friendly cartoon eyes with white paper highlights, calm closed smile, no scenery around it, matching the artistic style, paper materials, lighting and colour palette of the reference image. The subject is centred, complete, and unclipped on a flat dark charcoal background, with no scenery, no floor, no shadow cast onto the background. premium handmade cut-paper collage: layered construction paper, cardstock and felt with visible fibre texture, softly rounded die-cut and scissor-cut edges, slight handmade imperfections, occasional tiny stitched details, and soft tactile shadows between stacked layers; saturated kraft-paper brights on a warm cream field; child-safe toy proportions and handmade warmth. No text, no letters, no words.
```

**Sprite acceptance rules.**

1. **Readable at ~200 CSS px.** Downscale the candidate to 200 px and look at it. If you cannot
   tell a cricket from a grasshopper, reroll.
2. **Roommates must be distinguishable from each other at 200 px** — check the four room trios
   side by side, not one at a time. `worm` vs `caterpillar` and `spider` vs `cricket` are the
   known-hard pairs.
3. **Idle and happy must be the same creature.** Composite the pair and flick between them; a
   colour or size jump is a reject, and the fix is to re-run the happy pass from the idle sprite,
   not to regenerate the idle.
4. Whole body inside frame, nothing clipped by the canvas edge.
5. No scenery, no leaf, no branch, no ground under the bug — the room provides all of that.

---

## 5. Batch C — cutouts and deterministic finalize

`qwen-image-layered`, async job, `layer_2` = true-alpha cutout, seed 42, for **all 36 transparent
assets**: `title.webp`, `magnifier.webp`, 4 plaques, 3 mode faces, `journal-tab`,
`sticker-backing`, `fact-card`, `fact-found`, and all 24 bug sprites.

Then `tools/finalize-art.py` (adapted from `games/sink-or-float/tools/`), deterministic:

```
alpha-trim → pad 4% → resize to the spec dimension → webp q90 (or jpeg q86 for plates)
           → magenta composite → assets/source/qa/<id>-magenta.png
```

**Magenta QA is mandatory for every one of the 36.** Look for: white or charcoal halos around
paper edges, semi-transparent fringe on antennae and legs (the classic failure — thin dark limbs
on a dark background), and, for `magnifier.webp`, magenta showing cleanly through the entire
glass circle.

**Known retry recipe** (from prior productions): when a cutout keeps filling a hole or eating a
thin limb, re-cut with an explicit two-layer instruction naming what is subject and what is
background, rather than rerolling the seed.

Originals are retained under `assets/source/` (`anchors/`, `raw-edit/`, `cutouts/`, `qa/`,
`hub/`, `voice/`) and are never deleted — the polish pass re-derives from them.

### 5.1 Deterministic repairs — `tools/fix-cutouts.py`

Six repairs, all pure PIL, no network, all idempotent, all re-derived from the retained sources.
Run **after** `tools/finalize-art.py finalize`. This is the file to read before regenerating
anything: five of the six exist because a *model* got something wrong and arithmetic got it
right.

| step | fixes | how |
|---|---|---|
| `title` | `layer_2` kept only the fern accent | luminance dark-key of the cream-on-charcoal anchor |
| `fact_found` | `layer_2` kept the charcoal panel | banner rows auto-detected by green fraction, cropped as an opaque strip |
| `magnifier` | the glass disc rendered opaque charcoal | near-charcoal pixels punched with a luminance-scaled feather |
| `magnifier_glass` **(P6)** | the punch above still left the glass at alpha 60–95 — a 30 % veil over everything the child magnifies | the aperture is found *geometrically* (`glass_aperture()` grows the largest circle inside the ring's opaque inner edge) and punched to a true hole. **It prints the `lens.frame` numbers `config.json` must carry** |
| `spider_legs` **(P6)** | eight pale-grey paper legs dropped against the charcoal backdrop | layered-cutout body silhouette UNION a gradient-tolerant flood key of the raw edit (per-step luminance tolerance, so the vignette does not defeat it) |
| `journal_page` **(P6)** | ~18 % of empty table above and below the notebook, charged against every `cover` fill | one crop to the book, no resampling |

`tools/repair-rooms.py` is the companion, and it is **not** deterministic — it is three one-off
*model* edits, committed so the provenance survives instead of living in a shell history:
lightening the bark diorama's pitch-black hollows, deriving the log interior from the repaired
bark diorama (the hotel anchor kept re-rendering the whole facade at every seed), and the
roly-poly happy face. It needs the local API; `fix-cutouts.py` never does.

`assets/og-image.jpg` (1200 × 630, ≤ 180 KB) is captured from the game's own splash by
`node tools/pipeline/capture_og_images.mjs`, not generated. Regenerate with the tool rather than
editing by hand.

---

## 6. Voice — 74 clips

| | |
|---|---|
| script | **`tools/lines.json`** — `{ "<voice-id>": "<exact spoken text>" }`, 74 entries, the single source for both the recorder and the Web Speech fallback |
| workflow | `qwen3-tts-voiceclone`, reference `shared/assets/refs/voice-teacher.wav` (via `QLOBE_VOICE_REF`) |
| seeds | 7 → 8 → 9 |
| QA | `whisper-stt`, model `small`, language `en`; transcript must match the script |
| encode | `ffmpeg` AAC 64 k → `assets/audio/<id>.m4a` `+faststart` |
| outputs | `assets/audio/manifest.json` + `assets/audio/qa.json`; FLAC sources kept under `assets/source/voice/` |
| budget | ~14 KB per line, ≈ 1.1 MB total; **never preloaded** — `voice-clips.js` streams each one |

**Batch discipline:** generate **all 74** TTS clips first, **then** run **all 74** whisper checks.
Interleaving forces the single local queue to swap models 148 times and throughput craters.

**Whisper loanword bias.** Feed whisper a biased `initial_prompt` containing the game's own
vocabulary — `ladybug, caterpillar, snail, ant, roly-poly, worm, bee, butterfly, grasshopper,
beetle, spider, cricket, bug hotel, magnifying glass, nectar, pollen, antennae` — before
rejecting a take. Several of these are words a general model mis-hears, and a biased re-check
recovers takes that would otherwise be thrown away. If the vocal separator is used at any point,
keep the FLAC source rather than the separated output.

**Failure policy.** A line that fails whisper QA on all three seeds is **omitted from
`manifest.json`**. At runtime `voice-clips.js` finds no clip, and `speech.js` speaks the
identical string from `tools/lines.json`. It degrades; it never breaks. `getAudioLog()` reports
`source: 'speech'` for that id so QA can see exactly which lines are unrecorded.

**Never speak before the first gesture.** `welcome` is armed at boot and played on the first
`pointerdown` (game-design.md §3.1). A recorded line played at page load slips to the system
speech voice, silently.

**Ambience is synthesized — zero audio files.** `js/ambience.js` builds the breeze, the cricket
chirps and the bamboo-room bee hum on `shared/js/sfx.js`'s AudioContext.

---

## 7. Provenance — as shipped

One row per shipped file. Every asset also carries a **sidecar `.json` beside its source**
(`assets/source/{anchors,raw-edit,cutouts}/<id>.json`) holding the workflow, the verbatim prompt,
the seed, the reference image and the generation timestamp — the sidecars are the record of
truth; this table is the summary. Byte sizes are the shipped files after P6.

| id | asset | accepted seed | source retained at | bytes | QA note |
|---|---|---|---|---|---|
| A1 | `assets/bg-hotel.jpg` | 42 · `krea2-turbo-t2i` | `assets/source/anchors/bg-hotel.png` | 246 KB | Doubles as the style anchor for every Batch B edit. Empty compartments, no bugs, no text — as specified. |
| A2 | `assets/title.webp` | 42 · `krea2-turbo-t2i` → `fix-cutouts.py title` | `assets/source/anchors/title.png` | 87 KB | `layer_2` kept only the fern accent, so the lockup is extracted from the anchor by a deterministic luminance dark-key. **Spell-checked at full size: "Bug Hotel Observer" ✓** |
| A3 | `assets/source/hub/tile-candidate.jpg` | 42 | `assets/source/anchors/hub-tile.png` | 68 KB | **Staged only — never written to `assets/hub/tiles/`** (that directory is curated by hand). |
| B1 | `assets/bg-room-leaf.jpg` | 42 · `qwen-image-edit` | `assets/source/raw-edit/bg-room-leaf.png` | 231 KB | Four arched hollows, all legible. |
| B2 | `assets/bg-room-bark.jpg` | 1337 · `qwen-image-edit` (round 2) | `assets/source/raw-edit/bg-room-bark.png` (+`.png.json`) | 242 KB | Seed 42 rejected — kept as `bg-room-bark-round2-rejected.keep`. Palette runs ~12 % hotter in saturation than leaf/bamboo; see game-design.md §11.1. |
| B3 | `assets/bg-room-bamboo.jpg` | 42 · `qwen-image-edit` | `assets/source/raw-edit/bg-room-bamboo.png` | 280 KB | A different build from the other three (tube mouths, not arches) — it has its own zone table. |
| B4 | `assets/bg-room-log.jpg` | 1337 · `qwen-image-edit` (round 2) | `assets/source/raw-edit/bg-room-log.png` (+`.png.json`) | 254 KB | Seed 42 rejected — kept as `bg-room-log-round2-rejected.keep`. Same saturation note as B2. |
| B5 | `assets/bg-journal.jpg` | 42 · `qwen-image-edit` → `fix-cutouts.py journal_page` | `assets/source/raw-edit/bg-journal.png` | 191 KB | **P6 cropped it to the book** (1350×970): the 4:3 finalize crop carried ~18 % of empty table that every `cover` fill charged against the usable page. |
| B6 | `assets/props/magnifier.webp` | 42 · `qwen-image-layered` → `fix-cutouts.py magnifier` + `magnifier_glass` | `assets/source/cutouts/magnifier.png` | 50 KB | The glass rendered opaque charcoal; P4 punched it by luminance and **P6 punched the measured aperture to a TRUE hole** (it was still 60–95 alpha — a 30 % veil). Aperture = r 186 px at (366, 396) of 900×900; those numbers ARE `config.json`'s `lens.frame`. |
| B7–B10 | `assets/props/plaque-{leaf,bark,bamboo,log}.webp` | 42 · `qwen-image-layered` | `assets/source/cutouts/` | 17–28 KB | Icon-only, no lettering ✓. Wide sign inside a square 360×360 canvas, which is why the room hotspots are square. |
| B11–B13 | `assets/props/mode-{hunt,detective,book}.webp` | 42 · `qwen-image-layered` | `assets/source/cutouts/` | 21–35 KB | `mode-book.webp` does double duty as the HUD journal tab (game-design.md §11 row 14). |
| B14 | `assets/props/journal-tab.webp` | 42 · `qwen-image-layered` | `assets/source/cutouts/journal-tab.png` | 13 KB | **Shipped but UNUSED.** At the tab's 128 px it read as a blank white rectangle; the tab wears `mode-book.webp` instead. Retained with its sidecar for a future pass. |
| B15–B16 | `assets/props/{sticker-backing,fact-card}.webp` | 42 · `qwen-image-layered` | `assets/source/cutouts/` | 19 / 45 KB | `fact-card`'s dashed rule sits at 19.5 % / 24 % of the plate — the CSS type box is measured to it. |
| B17 | `assets/lockups/fact-found.webp` | 42 → `fix-cutouts.py fact_found` | `assets/source/cutouts/fact-found.png` | 13 KB | `layer_2` kept the charcoal panel, so the green banner rows are auto-detected and cropped out. **Spell-checked at full size: "Fact found!" ✓** |
| B18–B41 | `assets/bugs/<id>-{idle,happy}.webp` ×24 | 42 · `qwen-image-edit` → `qwen-image-layered` | `assets/source/raw-edit/`, `assets/source/cutouts/` | 30–74 KB each, 1.2 MB total | Reviewed at render size (~200 px): all twelve readable, roommates distinguishable. **Three notes below.** |
| — | `assets/bugs/cricket-happy.webp` | 42 | `assets/source/cutouts/bug-cricket-happy.png` | 74 KB | **The one sprite over its 60 KB budget**, and it cannot be brought under it: the size is dominated by the alpha channel around four hair-thin antennae, so the quality ladder flattens out (q92 → 130 KB, q40 → 72 KB) and `finalize-art.py` bottoms out at its `min_q`. Inspected at render size — no banding, no fringe. Also note the frame pair shifts hue (dark brown idle → orange happy): the edit model recoloured it, and at play it reads as the cricket lighting up rather than as a different insect. |
| — | `assets/bugs/roly-poly-happy.webp` | 42 (+ `.png.json` retry) | `assets/source/raw-edit/bug-roly-poly-happy.png` | 47 KB | **Deliberately byte-identical to `roly-poly-idle.webp`.** The edit model recoloured the grey armour plates on four consecutive attempts, and the face-only repair in `tools/repair-rooms.py` came back unchanged — five takes, no usable happy pose. The greeting is carried by the scene's wiggle/pop instead, which is motion the sprite does not have to contain. Do not "fix" this by regenerating without reading that history first. |
| — | `assets/bugs/spider-{idle,happy}.webp` | 42 → `fix-cutouts.py spider_legs` (P6) | `assets/source/raw-edit/`, `assets/source/cutouts/` | 30 / 36 KB | `layer_2` kept the charcoal body and dropped all eight pale-grey paper legs against the charcoal backdrop — a ball with eyes at render size. Repaired deterministically: the layered cutout's body silhouette UNION a gradient-tolerant flood key of the raw edit. No regeneration. |
| — | `assets/og-image.jpg` | n/a | splash capture | 67 KB | Captured by `tools/pipeline/capture_og_images.mjs --only bug-hotel-observer --force` against the wired-finals splash (P7 recapture — the P6 splash re-composition made the prior 25 KB shot stale). Non-blank (luma stddev 67.7), zero console errors. |
| — | `assets/audio/*.m4a` ×74 | 7 (all 74 accepted on the first seed) | `assets/source/voice/*.flac` + `*-transcript.json` | 3.0 MB total | 74/74 whisper-accepted, min score 0.961, zero omissions. **9 lines needed the biased `initial_prompt` re-check** before acceptance (`*-transcript-biased.json` beside them) — the loanword-bias recipe in §6 recovered every one. Decode verified in real Chrome (`readyState ≥ 2`), not just manifest presence. |
| — | `assets/source/qa/*-magenta.jpg` ×37 | n/a | — | — | Alpha QA composites for every transparent asset. |

---

## 8. Reused shared assets

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka font SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource (@fontsource/fredoka@5.0.13) | Milena Brandão & Hafontia | SIL OFL 1.1 | No UI attribution required | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`, `btn-play.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused unmodified |
| Teacher voice reference (`shared/assets/refs/voice-teacher.wav`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Used as a clone reference only; not shipped in this game |
| Sound effects | N/A — synthesized at runtime via WebAudio (`shared/js/sfx.js`) | N/A | N/A | N/A | No sourced audio assets |
| Ambience | N/A — synthesized at runtime (`js/ambience.js`) | N/A | N/A | N/A | Zero audio files |
| Web Speech fallback voice | N/A — device built-in voices via `shared/js/speech.js` | N/A | N/A | N/A | Fallback when a recorded clip is absent |
| Concept mockups (`01-game-concepts/bug-hotel-observer/output/ui-mockups/*.png`) | Generated for this project from `brief.md` + the concept video | QLOBE Kids | CC BY 4.0 | No | **Composition reference only — not shipped, not redistributed** |

## 9. Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Generated screenshot of this game's own splash screen (1200×630), captured by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand |
