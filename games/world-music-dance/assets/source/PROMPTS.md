# World Music Dance — generation prompt sheet (frozen 2026-07-29)

Style: **Paper Garden — festival night**. Do not commit API hosts. Image seed
ladder `42 → 1337 → 9001 → 7`. Batch by workflow type (all t2i → all edits →
all layered → all TTS → all whisper).

## Style suffixes

`PG_NIGHT` (scenes):

> premium handmade cut-paper collage: layered construction paper, cardstock and
> felt with visible fibre texture, softly rounded die-cut and scissor-cut
> edges, slight handmade imperfections, occasional tiny stitched details, and
> soft tactile shadows between stacked layers; saturated kraft-paper brights
> glowing against a deep ink-blue cardstock night field, warm golden
> paper-lantern light, festival night mood, magical and welcoming, never
> spooky; child-safe toy proportions and handmade warmth. No text, no letters,
> no words.

`PG_CHAR` (characters/props on charcoal for cutout):

> premium handmade cut-paper collage character: layered construction paper,
> cardstock and felt with visible fibre texture, softly rounded die-cut edges,
> tiny stitched details, soft tactile shadows between layers; saturated
> kraft-paper brights; child-safe proportions, sweet friendly face, handmade
> warmth. Full body, head to feet, facing the viewer. The background is a
> perfectly flat, solid, uniform dark charcoal background, no gradient, no
> texture, no shadows on the background. No text, no letters, no words.

`DERIVE` (qwen-image-edit, conditioned on the approved neutral master):

> Redraw this exact same cut-paper dancer character now {ACTION}. Keep the
> character, face, costume, colours, proportions and cut-paper art style
> completely identical to the reference — only the pose changes. Full body,
> head to feet. The background stays a perfectly flat, solid, uniform dark
> charcoal, no gradient, no texture, no shadows on the background.

`CUTOUT` (qwen-image-layered, async, fetch `output=layer_2`):

> Solid flat green background layer. Top layer: the exact same cut-paper
> dancer from the image. Keep it identical to the input image.

## Scenes (krea2-turbo-t2i)

**map-night** — 2048×1280:
> A cut-paper world map for young children on a deep ink-blue cardstock sea:
> simple, rounded, friendly continent shapes layered from saturated
> kraft-paper brights — leaf green, coral, golden yellow, warm pink, orange —
> with softly rounded die-cut edges and visible fibre texture; tiny paper
> stars scattered in the sea; a string of small glowing golden paper lanterns
> draped across the very top edge; continents kept simple, calm and
> uncluttered with gentle low-contrast centres so game cards can sit on them;
> no country borders, no labels. {PG_NIGHT}

**stage-night** — 1600×1200:
> A festival night stage made of cut paper: deep ink-blue cardstock sky with
> tiny paper stars, two strings of glowing golden paper lanterns arching
> across the top corners, layered paper bunting in saturated brights along the
> upper edge, a simple wide rounded kraft-paper stage floor across the bottom
> quarter; the central sixty percent calm, dark, and uncluttered so a dancer
> character reads clearly in front of it. {PG_NIGHT}

## UI cutouts (krea2-turbo-t2i on charcoal → layered)

**title-lockup** — 1344×768 (spell-check at full size; reroll ANY malformed
letter; text clause intentionally overrides the no-text rule):
> Hand-cut paper lettering that says exactly "World Music Dance" in playful
> chunky cut-paper capital letters, arranged on two lines, each letter cut
> from a different saturated bright cardstock with stitched detail outlines,
> a small glowing golden paper lantern hanging from the first letter and two
> tiny cut-paper music notes tucked beside the last word; premium handmade
> cut-paper collage with visible fibre texture and soft tactile shadows. The
> background is a perfectly flat, solid, uniform dark charcoal background, no
> gradient, no texture.

**card-backing** — 512×640 (opaque card face; outer alpha only):
> A single blank dance card cut from layered cream cardstock: a rounded
> rectangle with a golden stitched border frame, a tiny cut-paper music note
> at the top centre, the inner face plain warm cream paper with visible
> fibre texture, empty. {PG_CHAR ground clause}

**lantern** — 512×640 (runtime-tinted per culture accent):
> One glowing golden paper lantern for a children's festival game, cut-paper
> style with visible folds and fibre texture, hanging from a small paper loop
> with a soft warm halo of light around it. {PG_CHAR ground clause}

## Dancer identity masters (krea2-turbo-t2i, 1024×1024, charcoal ground)

All end with `{PG_CHAR}`. Standing at rest: upright and still, facing the
viewer, weight even on both feet, arms relaxed, smiling.

- **india** — A joyful young Kathak dancer girl from India standing at rest,
  wearing a bright marigold-orange and pink lehenga with gold trim, a flowing
  pink dupatta, gold bangles, and tiny golden ankle bells, dark hair in a
  braid with a small flower.
- **brazil** — A joyful young samba dancer girl from Brazil standing at rest,
  wearing a sunny yellow and green carnival dress with a small feather
  headdress in green, gold and blue, beaded bracelets, dark curly hair.
- **japan** — A joyful young Bon Odori dancer child from Japan standing at
  rest, wearing an indigo-blue summer yukata with a red obi sash and a round
  white paper fan tucked in the sash, dark hair in a neat bun.
- **ghana** — A joyful young Kpanlogo dancer child from Ghana standing at
  rest, wearing a bright kente-pattern wrap in gold, green and red with a
  matching headband and beaded necklaces.
- **mexico** — A joyful young folklórico dancer girl from Mexico standing at
  rest, wearing a wide fuchsia-pink folklórico dress with white and purple
  ribbon trim on the skirt, a small flower crown, dark hair in braids.
- **ireland** — A joyful young Irish step dancer child from Ireland standing
  at rest, wearing a shamrock-green dance dress with golden celtic swirl trim
  and a small matching cape, curly auburn hair.

## Pose derive actions (qwen-image-edit via `DERIVE`, seed 42→1337→9001)

| culture | move-1 | move-2 | move-3 | celebrate |
|---|---|---|---|---|
| india | spinning in a graceful twirl, arms raised overhead, skirt flaring out | stamping one foot with ankle bells, one arm curved up high, other hand at the waist | swaying with both arms flowing to one side like a gentle wave | jumping for joy, both arms high, big smile |
| brazil | bouncing on quick feet, knees lifted, elbows bent and pumping | arms stretched out wide, leaning into a happy sway | spinning with one arm overhead, dress and feathers flying | jumping for joy, both arms high, big smile |
| japan | reaching both hands up and to one side, gazing up, one foot stepping forward | clapping hands together at chest height, stepping forward | sweeping the round paper fan across in front, arms extended | jumping for joy, both arms high, fan raised, big smile |
| ghana | stomping one foot, clapping hands, elbows out wide | knees bent low, both arms rowing forward together | one knee lifted, arms making a great big circle overhead | jumping for joy, both arms high, big smile |
| mexico | holding the wide skirt out to one side in a big swish | tapping heels, holding the skirt slightly out on both sides | twirling with the skirt flared out in a full circle like a flower | jumping for joy, skirt flared, both arms high, big smile |
| ireland | hopping with one leg kicked straight forward, arms held straight down at the sides | pointing one toe forward, arms straight at the sides, chin up proudly | mid-skip with quick feet, one foot behind the other, arms at the sides | jumping for joy, both arms high, big smile |

Review a 3×2 contact strip per culture BEFORE cutout: identity (face, costume,
colours), anatomy (hands, feet, limbs), readability of the pose at card size.
Any drift or malformed anatomy = reroll on the seed ladder, never repaired
downstream.

## Assembly

`tools/pipeline/pose_actor_assemble.py` per culture: canvas 1024, maxArt 900,
baseline 972, alphaFloor 8, bboxThreshold 24, WebP q90. Manifest
`format: qlobe-pose-actor`, poses `neutral, move-1, move-2, move-3, celebrate`,
transition `paper-pop` 220ms. Alpha QA on magenta composite.

## Instrument one-shot experiment (ltx2-3 → audio extract)

Prompt pattern (5s, static camera, no `audio` input so the model generates it):
> Close-up of {INSTRUMENT}. A single clean {STRIKE}, then silence. No music,
> no melody, no voice, no singing, one single note only, quiet room.

Candidates: sitar (single plucked note), koto (single plucked note), tabla
(one open "na" hit / one bass "ge" hit), taiko (one deep drum strike), djembe
(one open slap / one bass hit), fiddle (one short bowed note), tin whistle
(one short clear note), agogo bell (one high hit / one low hit).

Post: `ffmpeg -i clip.mp4 -vn wav` → `vocal-separator` (keep `instrumental`) →
trim to onset + tail fade → loudness normalize → measure baseMidi (tonal) →
`shared/assets/instruments/` + manifest entry. Reject: room tone, smeared
attack, multiple notes, hum. Failure of any/all samples is acceptable
(config `bandFallback`).

## Voice

45 lines frozen in `game-design.md` → `tools/gen-voice.py` (clone of
`games/sink-or-float/tools/gen-voice.py`): qwen3-tts-voiceclone seeds 7→8→9,
whisper-small `language=en` QA, normalized compare with per-line alternates
for loanwords, ffmpeg AAC 64k `+faststart`, manifest + lines.json.
