# Little Artist — production game design

**Stable route / id:** `games/loose-parts-collage/` / `loose-parts-collage`<br>
**Concept:** `../01-game-concepts/little-artist/`<br>
**Category:** Art & Music · **Age:** 5–6 · **Release status:** beta until child iPad playtest<br>
**Art world:** Paper Garden — papercraft and cozy felt appliqué on a warm real-paper workbench<br>
**Production constraint:** local LAN workflows only. Do not use GPT Image 2. The concept video is a storyboard reference; no frame from it ships.

## Product promise

Little Artist is an open-ended digital craft table. A child chooses a tactile
treasure, drags it onto warm paper, turns and layers it, or draws a soft yarn
trail directly with one finger. Teddy offers invitations but never judges the
result. Finished pieces live in a private on-device gallery and can be saved as
a local PNG for a grown-up.

The former Loose Parts Collage beta asked the child to fit emoji placeholders
onto fixed ghost slots. It proved the old build-assemble path, but it contradicted
the concept's central fantasy: making something nobody else prescribed. This
replacement keeps the stable route while becoming a custom mixed-media creator.

## Capability contribution

This game makes an existing platform capability broader and more robust:

- It gives `shared/js/freeform-board.js` a second production creator consumer
  with arbitrary craft sprites, direct manipulation, explicit transforms,
  normalized persistence, strand-proof drag, and export.
- It combines a raster-piece board and a semantic textured-stroke canvas in one
  reversible artwork document.
- It proves a reusable textured-material drawing substrate for yarn, ribbon,
  string, chalk, or comparable authored brush textures.
- It defines a local mixed-media compositor: background, semantic strokes, and
  z-ordered bitmap pieces become a PNG without a network call.
- It exercises current-draft recovery, a capped gallery, orientation-safe
  snapshots, and deterministic visual QA in one child-safe workflow.

## Modes and one skill each

| Mode | Child-facing title | One skill | Invitation |
| --- | --- | --- | --- |
| `collage` | Free Collage | spatial composition through choosing, layering, rotating, and sizing | Choose any treasures and arrange them your way. |
| `yarn` | Yarn Magic | continuous fine-motor path planning through loops, spirals, curves, and crossings | Draw a soft yarn trail, then add a few tiny treasures if desired. |
| `teddy` | Teddy's Idea | intentional visual storytelling from an open-ended spoken prompt | Teddy offers one idea; the child interprets it with every material available. |

The creative workbench is shared, but each mode opens with a different tool
emphasis and spoken goal. A satisfying creation takes about 30–90 seconds.
There is no score, timer, correctness test, minimum shape, or game-over state.
The finish rosette unlocks after the first completed yarn stroke or placed
piece; before that it gently models where to begin.

### Teddy's invitations

One is selected from a seeded, nonrepeating shuffle each time:

1. **Something that grows** — flower, tree, garden, imaginary plant, or anything else.
2. **Something that can fly** — bird, kite, rocket, winged invention, or anything else.
3. **A funny face** — human, animal, monster, abstract expression, or anything else.
4. **A repeating pattern** — any child-authored repetition; it is never evaluated.

The prompt card is a small composition of the same runtime craft sprites—not
a separate baked answer picture—so it suggests without prescribing.

## Screen map and navigation

```text
catalog → splash ───────────────→ gallery → keepsake
            │      resume draft ↗    ↑          │
            ├→ Free Collage ─────────┤          │
            ├→ Yarn Magic ───→ workbench → reveal / keepsake
            └→ Teddy's Idea ─────────┘     ↙       │
                   ↑              make another / reopen
                   └───────────────────────────────┘

splash Home → catalog
workbench / gallery / keepsake Back → splash
Sound → replay the current invitation
```

### Splash

- Full-bleed papercraft workshop plate with a quiet central paper area.
- Generated, spell-checked `Little Artist` graphic lockup; the accessible name
  remains real markup.
- Teddy peeks from a paper basket and reacts after the first real gesture.
- Three oversized authored mode cards show the actual materials used in play.
- A gallery-book button appears whenever a saved artwork exists.
- A pinned draft card appears when an unfinished artwork can be resumed.
- Home is the only catalog link.

### Workbench

- Back sits top-left. Prompt/sound sits top-right. Both are at least 96 CSS px.
- The artwork is one central torn-paper sheet inside a calm workbench plate.
- A textured yarn canvas is the bottom creative layer. The freeform craft-piece
  board is directly above it. Both share the exact same normalized bounds.
- Teddy occupies a small noninteractive corner outside the sheet and never
  covers the drawing surface or HUD.
- The Craft Basket is a continuous bottom shelf. Four large material tabs use
  real piece art: Nature, Paper, Buttons, and Cozy Bits. A horizontal shelf can
  swipe; oversized paging buttons are a discoverable fallback.
- Dragging from the shelf onto the sheet creates a new piece at the release
  point. Tapping a shelf piece also adds it at a gently staggered center point.
- A selected piece exposes four 96 px authored tool buttons: turn, smaller,
  bigger, and recycle. The selection ring is interaction feedback, not visible
  object art.
- Yarn mode opens with six authored yarn-color spools. Drawing uses one primary
  pointer; moving outside and returning cannot strand a stroke. A cancelled
  pointer discards the incomplete stroke.
- Undo restores the last action across both layers. Fresh Paper clears both
  layers, but the immediately available Undo restores the whole artwork.
- The finish rosette is large and visually quiet while disabled. Once one
  complete mark exists it becomes warm gold and Teddy models it once.
- Every state autosaves semantically to one local draft. Back never destroys a
  child's unfinished work.

### Reveal / keepsake

- The completed artwork fills a handmade frame, unchanged from the workbench.
- Teddy celebrates with a bounded paper-fleck burst and a recorded line.
- Three large pictorial actions: save a PNG picture, make another, and gallery.
- The semantic artwork is added to the gallery once, capped at six. Saving the
  same reveal again does not duplicate it.
- `Saved on this device` remains functional HTML for adults; gameplay does not
  require reading it.

### Gallery

- Up to six artworks render from semantic documents into handmade frames.
- Tap a frame to reopen the keepsake. Paging never depends on reading.
- No account, cloud, upload, camera, microphone, or public sharing exists.
- The oldest artwork rolls off only when a seventh is saved. There is no
  child-facing destructive delete control in this first release.

## Interaction and feedback rules

- All child-facing controls and shelf choices are at least 96 CSS px in touch
  layouts, with forgiving hit areas independent of visible sprite bounds.
- Pointer Events own every creative gesture. Only one piece drag or yarn stroke
  is active at a time. Window-level move/up/cancel/blur cleanup prevents
  stranded input.
- New pieces preserve the exact pointer-to-object offset after placement.
- Selected pieces rise above neighbors but otherwise keep stable z-order.
- Size is clamped to 8–55 percent of the sheet; centers may overscan by 8
  percent so edge compositions do not feel trapped.
- The workbench uses authored bitmap materials. DOM/CSS owns layout, hit areas,
  focus, selection rings, masks, and responsive transforms only.
- Yarn is drawn by stamping and joining authored transparent fiber textures
  along semantic points. A plain vector line, CSS gradient, or canvas stroke is
  not the final visible yarn.
- Every placement makes a soft pop; button/wood pieces vary the synthesized
  tactile pitch by family; yarn makes a quiet fiber rustle cadence.
- Teddy celebrates intent, not quality. There is no red X, buzzer, correction,
  score, star rating, or comparison to a target.
- Idle nudges are spoken and reset by any touch. They never count down.
- Reduced motion removes lifts, bounces, confetti, and Teddy spring motion;
  placement, drawing, gallery, and audio remain complete.

## Complete spoken script

These exact strings are the voice-generation and fallback source of truth.

| Key | Spoken line |
| --- | --- |
| `welcome` | “Welcome, little artist! Pick something lovely to make.” |
| `choose` | “Collage, yarn, or a Teddy idea. You choose.” |
| `collage-label` | “Free Collage.” |
| `collage-prompt` | “Choose any treasures. Drag, turn, and layer them your way.” |
| `yarn-label` | “Yarn Magic.” |
| `yarn-prompt` | “Let your finger spin a soft yarn trail. Loop, swirl, or wiggle.” |
| `teddy-label` | “Teddy's Idea.” |
| `teddy-prompt` | “I have a tiny idea for you. Make it any way you imagine.” |
| `idea-grow` | “Can you make something that grows?” |
| `idea-fly` | “Can you make something that can fly?” |
| `idea-face` | “Can you make a funny face?” |
| `idea-pattern` | “Can you make a repeating pattern?” |
| `empty` | “Your paper is waiting. Pick a treasure or draw a yarn trail.” |
| `finish-ready` | “Whenever your art feels ready, tap the golden star.” |
| `fresh` | “Fresh paper. A brand-new beginning.” |
| `saved` | “Your art is safe on this device.” |
| `done` | “Oh, I love what you made!” |
| `gallery` | “Here are your little masterpieces.” |
| `gallery-empty` | “Your gallery is ready for its first masterpiece.” |
| `resume` | “Your artwork is right where you left it.” |

`qwen3-tts-voiceclone` recordings are the primary channel. Every clip is
Whisper-transcribed against the intended line, encoded as AAC/M4A, and listed
in `assets/audio/manifest.json`. `voice-clips.js` retains Web Speech fallback.

## Art direction

The entire child-facing field uses the Paper Garden world: visible paper fiber,
hand-cut edges, felt nap, stitched details, real button holes, yarn twist, and
small physical shadows. The palette is warm cream, leaf green, teal, coral,
marigold, plum, and sky blue. The center sheet stays calm enough for arbitrary
child art. Teddy is a cozy felt appliqué with paper patches, so the companion
belongs to the same material world rather than introducing a 3-D cartoon style.

The concept video's inviting craft-table fantasy, basket, teddy host, and yarn
spiral are retained. Its glossy device mockup, tiny text controls, photographic
child hand, 3-D bear rendering, and baked title frame are reference only.

### Asset list: visible renderer and interaction substrate

| Runtime asset | Target / budget | Visible renderer | Interaction substrate |
| --- | ---: | --- | --- |
| `assets/workshop.webp` | 1600×1200 opaque WebP, ≤300 KB | authored Krea papercraft workbench plate | full-screen CSS background positioning |
| `assets/paper/*.webp` (3 sheets) | 1200×900 opaque WebP, ≤180 KB each | authored torn watercolor/craft paper | workbench background layer and export canvas |
| `assets/title.webp` | transparent, ≤150 KB | Qwen-edited, spell-checked papercraft title lockup | accessible `<img>` |
| `assets/teddy/welcome.webp` | transparent, ≤100 KB | felt-appliqué Teddy waving | noninteractive splash image |
| `assets/teddy/peek.webp` | transparent, ≤100 KB | same Teddy peeking over basket | noninteractive workbench image |
| `assets/teddy/celebrate.webp` | transparent, ≤100 KB | same Teddy clapping | noninteractive reveal image |
| `assets/modes/*.webp` (3) | 560×360 WebP, ≤100 KB each | authored material still life for each mode | semantic mode-card button |
| `assets/ui/basket.webp` | wide transparent, ≤120 KB | woven paper/felt craft shelf | fixed dock behind scrolling controls |
| `assets/ui/frame.webp` | transparent, ≤120 KB | layered handmade keepsake frame | reveal/gallery frame overlay |
| `assets/ui/gallery.webp` | transparent, ≤70 KB | stitched paper gallery book | gallery button |
| `assets/ui/finish.webp` | transparent, ≤60 KB | gold paper rosette | finish button |
| `assets/ui/recycle.webp` | transparent, ≤60 KB | smiling paper recycling bin | selected-piece remove target |
| `assets/ui/tools.webp` sliced family | transparent, ≤50 KB each | papercraft turn/smaller/bigger/undo/fresh/picture icons | semantic buttons |
| `assets/pieces/nature/*.webp` (8) | transparent, 30–80 KB | leaves, pressed flowers, twig, acorn, pinecone | freeform-board bitmap pieces |
| `assets/pieces/paper/*.webp` (8) | transparent, 30–80 KB | textured cut-paper shapes and scraps | freeform-board bitmap pieces |
| `assets/pieces/buttons/*.webp` (6) | transparent, 30–80 KB | real-looking colored buttons and sequins | freeform-board bitmap pieces |
| `assets/pieces/cozy/*.webp` (6) | transparent, 30–80 KB | felt patches, ribbon bow, lace loop, pom-pom | freeform-board bitmap pieces |
| `assets/yarn/*.webp` (6) | transparent 256×64 tiles, ≤35 KB | authored twisted yarn fibers in six colors | textured-stroke canvas stamps/joins along semantic paths |
| `assets/hub source` | 768×640 source | Krea Toy Table still life, no text | hand-curated root hub tile at 640×533 |
| teacher voice (20 clips) | mono AAC/M4A | approved cloned teacher voice | `voice-clips.js` + semantic buttons |

All image sources use `krea2-turbo-t2i` first (seed ladder 42 → 1337 → 9001
→ 7), `qwen-image-edit` for accepted-style/identity variants, and
`qwen-image-layered` `layer_2` for cutouts. No flood fill creates transparency.
Every cutout is reviewed on saturated magenta before deterministic trim, pad,
resize, and WebP encoding. Sources and recipes remain under
`assets/source/local-api/` and are logged in `ASSETS.md`.

## Architecture and data model

The game is a pure static custom ES-module game:

```text
index.html
config.js                  thin fetch shim
config.json                modes, voice, materials, prompts, art paths
css/style.css
js/main.js                 screen/router and orchestration
js/textured-stroke-canvas.js
js/artwork-renderer.js     preview/export compositor
game.json
game-design.md
ASSETS.md
assets/
tools/qa.mjs
```

One artwork document composes existing normalized formats:

```js
{
  format: 'qlobe-little-artist',
  formatVersion: 1,
  id, createdAt, updatedAt,
  mode, promptId, paperId,
  yarn: { format: 'qlobe-textured-strokes', formatVersion: 1, strokes: [] },
  collage: { format: 'qlobe-freeform-board', formatVersion: 1, items: [] }
}
```

The loader validates formats, whitelists known material ids/paths, clamps
counts/coordinates/sizes, and ignores malformed saves. `meta.assetId` is the
durable item identity; runtime `src` is rebuilt from config rather than trusted
from storage.

### Shared modules

- `shared/js/freeform-board.js`
- `shared/js/voice-clips.js`
- `shared/js/narrator.js`
- `shared/js/audio-unlock.js`
- `shared/js/sfx.js`
- `shared/js/tap.js`
- `shared/js/celebrate.js`
- `shared/js/idle-nudge.js`
- `shared/js/debug-harness.js`
- `shared/js/rng.js`

The yarn renderer and mixed-media compositor begin game-local. After production
proves their contract and regression suite, promote them to `shared/js/` in a
separate focused change rather than making an unproven cross-cutting API.

## Persistence, privacy, and fallback

- `localStorage` stores one draft and at most six finished semantic documents.
- Storage failure keeps the current in-memory artwork playable and exportable.
- No child name, microphone, camera, photo library read, account, identifier,
  upload, analytics event, or model/runtime network call is used by the game.
- PNG export is rendered locally and initiated by an explicit button.
- All generated runtime assets are committed; reproducible authoring caches are
  excluded, and production works offline after load.
- Missing recorded voice falls back to the exact Web Speech string. Missing
  decorative art fails soft; missing primary craft art is a release-blocking QA
  error and is never replaced with emoji.

## Responsive and accessibility rules

- Landscape reference: 1180×820; touch reference: 1024×768 at DPR 2.
- Portrait reference: 820×1180. The sheet remains fully visible above a
  two-row basket; Teddy moves beside the prompt plaque and never overlaps it.
- Safe-area variables protect every corner control and the bottom shelf.
- Controls expose accessible names, pressed/selected state, and an aria-live
  announcer through the narrator. Functional labels remain HTML.
- Keyboard/assistive input can tap-to-add, select, transform, undo, finish, and
  navigate even though pointer drag is the primary child interaction.
- Focus outlines remain visible. Color is never the sole state cue.
- Reduced motion is a complete mode, not a slowed animation.

## Explicit departures

### From the old beta

- Fixed ghost slots and correctness evaluation are removed; they undermine
  open-ended composition.
- Emoji art, single mode, synthetic-only voice, and engine splash are replaced.
- The route/id stays unchanged so hub links and saved bookmarks do not break.
- The public title changes from `Loose Parts Collage` to `Little Artist`; the
  route remains descriptive enough and avoids a migration.

### From the concept brief/video

- The companion is a felt-and-paper Teddy rather than a glossy 3-D bear so the
  whole field remains one art world.
- Two-finger pinch/rotate is replaced by explicit 96 px transform controls plus
  drag. This is discoverable, works with one hand, and remains accessible.
- Gallery sharing means local PNG export only. No account, upload, camera, or
  system share sheet is required.
- The photographic child's hand is not shown; the child's real hand supplies
  the gesture.
- Text-labeled top-bar controls become platform HUD and pictorial craft tools.

## `QLOBE_DEBUG` v1

The installed debug surface provides:

- `ready`, `listModes()`, and deterministic `startMode(id)`;
- semantic `getState()` with screen, mode, prompt, stroke/item counts, selection,
  draft/save counts, and export state;
- truthful `getTargets()` and same-handler `tap(targetId)`;
- `drawYarn(points, colorId)`, `addPiece(assetId, x, y)`,
  `movePiece(id, x, y)`, `transformPiece(id, changes)`;
- `snapshot()`, `loadArtwork(doc)`, `finishArtwork()`, `savePicture()`;
- `winRound()`, `mute()`, deterministic `seed()`, `fastTimers()`, and
  `clearSaved()`.

## QA and release gate

Release requires:

- all three modes complete through real pointer and debug paths;
- tap-add and tray drag; placed-piece drag/rotate/resize/recycle;
- yarn loop/spiral/cancel; unified undo; clear/undo recovery;
- draft reload, gallery cap/dedupe, keepsake reopen, and nontrivial PNG export;
- recorded teacher voice proven after a real gesture, with fallback tested;
- landscape, portrait, touch/DPR2, and reduced-motion screenshot suites;
- all splash, workbench, prompt, reveal, gallery, and special input states
  visually inspected at full useful detail;
- every primary sprite materially coherent with the backdrop and basket;
- all controls ≥96 px; no clipping, overlap, alpha fringe, external request,
  page error, console error, failed request, 404, or case mismatch;
- direct route and hub route pass locally and on `https://qlo.be`;
- registry sync and full validator add zero new errors.

The game remains `beta` until the target child can choose a mode, make an
artwork, finish it, and reopen the gallery on the real iPad without coaching.
