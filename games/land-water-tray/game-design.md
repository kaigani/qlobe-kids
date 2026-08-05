# Land Explorer — production game design

## Product promise

A child works at a warm Montessori land-and-water tray that feels built from
real beech, blue resin, and soft green modeling clay. With one finger they pour
new land or scoop water through it, then watch the game recognize an island,
lake, peninsula, or bay. The same tactile system becomes a clue game and a
pressure-free miniature archipelago sandbox.

**Audience:** ages 4–7, tuned for the platform's ages 5–6 core.

**Concept source:** `01-game-concepts/land-explorer/brief.md` and its four
GPT Image 2 overview/UI mockups.

**Replaces:** the registered `land-water-tray` `build-assemble` stub at the same
id and route. The old prototype asks a child to arrange five emoji squares; it
does not simulate, shape, or visually teach land and water.

**Art world:** **Claymation**. Every child-facing carrier is photographed or
rendered as a tactile stop-motion object: rounded beech trays, translucent blue
resin water, hand-worked green clay, and softly worn wooden tools. Runtime HTML
is reserved for exact functional words, while generated raster plates and
sprites carry the visible material identity.

**Release status:** beta until a real iPad child playtest confirms that the
stroke tolerance, automatic recognition, audio pacing, and free-play payoff are
understandable and fun.

## Modes and one skill each

1. **Build Landforms** — spatially construct four land/water relationships:
   island, lake, peninsula, and bay.
2. **Mystery Maps** — recognize the same four landforms from a spoken clue and
   an authored picture card.
3. **Free Explorer** — explore cause and effect by pouring connected coasts,
   scooping inlets, and launching a tiny boat around the result.

The guided builder is the flagship mode. Mystery Maps reinforces vocabulary
without adding a second skill to a construction round. Free Explorer removes
evaluation entirely and lets the interaction itself be the toy.

## Screen and navigation map

```text
hub → splash
       ├─ Build Landforms → landform shelf
       │                    ├─ island build → reward → shelf
       │                    ├─ lake build → reward → shelf
       │                    ├─ peninsula build → reward → shelf
       │                    └─ bay build → reward → shelf / all-four finale
       ├─ Mystery Maps → 4 spoken clue rounds → explorer finale
       └─ Free Explorer → open tray → launch boat → keep shaping

splash Home → hub
all deeper Back buttons → splash
```

The splash uses three large tactile picture plaques and speaks their purpose;
reading is not required. The guided shelf then shows the concept mockup's four
landform cards. Completed cards keep a small authored fish token so progress is visible, but
all cards remain replayable.

## Core loops

### Build Landforms (roughly 25–60 seconds per shape)

1. Tap one picture card and hear its short definition.
2. The tray opens with one obvious active tool. Island and peninsula use the
   green clay pourer; lake and bay use the wooden scoop.
3. Tap for a mound or drag a broad finger path. The clay rises or parts under
   the same pointer path, with resin water always visible beneath it.
4. A quiet dashed guide models the relationship. Recognition is automatic and
   forgiving after a stroke ends; no checkmark or reading-dependent button is
   required.
5. On success, the guide dissolves, a pale shoreline glows, the landform name
   is spoken, and a tiny boat or creature visits the finished shape.
6. Return to the shelf or continue to another landform. Completing all four
   turns the tray into a miniature archipelago celebration.

Recognition checks semantics as well as target overlap:

- an **island** is one detached land mass that touches no tray edge;
- a **lake** is an enclosed water hole with preserved land around it;
- a **peninsula** is one land mass connected to the left mainland and extending
  into water;
- a **bay** is water connected to the right tray edge and scooped into a
  preserved mainland on three sides.

The target is deliberately generous. A recognizable child's shape succeeds;
the game never asks for pixel-perfect tracing.

### Mystery Maps (roughly 35–70 seconds)

1. Hear one landform clue.
2. Tap one of four authored wooden picture cards.
3. A correct card lifts into the water tray, gains a shoreline sparkle, and
   speaks the name. A different card only rocks softly while the clue is
   modeled again.
4. Four seeded rounds cover every landform once, then the tray celebrates.

### Free Explorer

Pour and scoop anywhere, switch tools at any time, clear with the authored
reset plaque, and launch the boat after at least three meaningful strokes. The
launch never scores the child. It names the closest recognizable relationship
when confidence is high; otherwise it says the child made a brand-new coast.
The boat glides across the live basin while fish and a turtle peek through the
water. The child can immediately keep shaping.

## Spoken script

These exact lines are the recording source of truth and will be mirrored in
`config.json` and `assets/audio/lines.json`.

| Key | Verbatim line |
|---|---|
| `welcome` | “Welcome, land explorer! Choose a way to play.” |
| `guided-intro` | “Pick a landform to build.” |
| `island-prompt` | “Pour green land into the water. Make an island!” |
| `island-clue` | “An island is land with water all around it.” |
| `island-hint` | “Keep the green land away from every edge.” |
| `lake-prompt` | “Scoop water into the middle. Make a lake!” |
| `lake-clue` | “A lake is water with land all around it.” |
| `lake-hint` | “Make one blue pool inside the green land.” |
| `peninsula-prompt` | “Pour land out from the shore. Make a peninsula!” |
| `peninsula-clue` | “A peninsula is land with water around three sides.” |
| `peninsula-hint` | “Connect the new land to the shore.” |
| `bay-prompt` | “Scoop water into the shore. Make a bay!” |
| `bay-clue` | “A bay is water with land around three sides.” |
| `bay-hint` | “Open the blue water to the edge.” |
| `pour-tool` | “Pour green land with your finger.” |
| `scoop-tool` | “Scoop water through the land.” |
| `made-island` | “You made an island! Water goes all the way around.” |
| `made-lake` | “You made a lake! Land goes all the way around.” |
| `made-peninsula` | “You made a peninsula! It reaches out from the shore.” |
| `made-bay` | “You made a bay! Water reaches into the land.” |
| `all-built` | “You built all four landforms. Amazing exploring!” |
| `mystery-intro` | “Listen to the clue, then tap the matching landform.” |
| `mystery-nudge` | “Look closely at where the land meets the water.” |
| `mystery-cheer` | “That's it! You found the landform.” |
| `free-intro` | “Build any coast you can imagine. Pour land or scoop water.” |
| `sail-nudge` | “Add a little more land, then launch your boat.” |
| `sail-ready` | “Your little boat is ready to explore!” |
| `new-coast` | “You made a brand-new coast. Let's sail around it!” |
| `idle` | “Touch the green clay, or choose the wooden scoop.” |
| `again` | “Ready to explore another shape?” |

`qwen3-tts-voiceclone` uses the approved teacher reference, normally seed 7
then 8 and 9 for rejected takes. Every final clip is transcribed with Whisper;
a materially wrong landform word is rejected. `voice-clips.js` supplies the
offline Web Speech fallback.

## Art and media list

| Asset | Intended final | Visible renderer / role |
|---|---|---|
| Tray environment | 1280×960 opaque WebP | GPT Image 2 edit of the active-screen mockup; empty beech workbench and resin basin with calm center |
| Splash diorama | composed from the tray plate and transparent props | Same production tray plus the authored clay lump, boat, title, and picture plaques; no second backdrop or baked UI text |
| Graphic title lockup | transparent WebP, roughly 900×260 | GPT Image 2 exact “Land Explorer” wood-and-clay lettering → Qwen Layered `layer_2` |
| Four landform cards | transparent WebP family, roughly 380×420 each | GPT Image 2 coordinated contact sheet → deterministic cells → Qwen Layered; exact labels remain HTML |
| Green clay lump | transparent WebP, roughly 520×300 | GPT Image 2 style-matched prop → Qwen Layered; source affordance for the pour tool |
| Wooden scoop | transparent WebP, roughly 560×260 | GPT Image 2 style-matched prop → Qwen Layered; scoop affordance |
| Blank wood plaque / action pebble | transparent WebP family | Authored raster carriers for exact runtime labels and controls |
| Boat, fish, turtle | transparent WebP sprite family | GPT Image 2 claymation contact sheet → deterministic slicing and true-alpha extraction |
| Dynamic land | transparent Canvas over resin plate | Shared mass-conserving `HeightfieldClay` plus `ClayRenderer`; genuine clay shading, thickness, grain, and persistent material edits |
| Shoreline / guide | Canvas interaction effect | Dynamic pale-water halo and forgiving dashed target; guidance/effect substrate, never the material identity |
| Hub tile | 640×533 JPEG | Studio `menu-game-tile`, Krea 2 seed 42; toy-object hub grammar, no title/UI |
| Teacher guide voice | about 30 AAC/M4A clips | Qwen voice clone + Whisper transcript QA |
| Link preview | 1200×630 JPEG | Screenshot of the real splash through `capture_og_images.mjs` |

The foreground pass is as important as the backdrop. The clay source, scoop,
cards, action carriers, and rewards all use the same light direction, beech
grain, resin color, edge softness, and stop-motion scale as the environment.
No child-facing primary object is an emoji, CSS gradient, vector icon, or plain
rounded rectangle.

## Interaction and feedback rules

- Every button, card, and tool has at least a 96 px effective target.
- Tool and canvas gestures use Pointer Events, one active pointer, pointer
  capture plus window-level release/cancel, a 10 px slop, and rollback on
  `pointercancel` or blur. A cancelled gesture never completes a shape.
- A tap deposits one friendly mound or one scoop impression; a drag resamples
  the whole path so fast fingers never leave dotted gaps.
- Island/peninsula pouring and lake/bay scooping are the modeled defaults, but
  Free Explorer exposes both tools equally.
- Recognition runs only after an accepted stroke, never on every pointermove.
- A not-yet-complete shape receives a quiet visual hint and, at most once per
  idle ladder, a spoken modeling line. There is no red X, buzzer, timer, score,
  or game over.
- The active clay field renders on demand and settles for a bounded number of
  frames after release. Reduced motion collapses the settle/reward motion while
  preserving the result and audio.
- The first real gesture unlocks recorded voice, fallback speech, and WebAudio.
- Landscape 1180×820, compact/wide 1180×520, portrait 820×1180, and reduced
  motion are release layouts.

## Shared systems and capability contribution

The game adopts:

- `shared/js/clay/heightfield.js` for mass-conserving 2.5D material;
- `shared/js/clay/heightfield-canvas.js` for transparent on-demand clay shading;
- `screens.js`, `hud.js`, `tap.js`, `audio-unlock.js`, `narrator.js`,
  `voice-clips.js`, `sfx.js`, `timers.js`, `rng.js`, `idle-nudge.js`,
  `celebrate.js`, and `debug-harness.js`;
- the shared raster HUD and Fredoka functional type.

The new game-local landform adapter adds reusable evidence for a second,
top-down use of the clay heightfield. It supplies normalized pour/scoop paths,
starting substrates, connectivity analysis, enclosed-water detection, target
coverage, tolerant recognition, and deterministic Node tests. Once the child
playtest validates its thresholds, the geometry layer can be promoted into
`shared/js/clay/` without forcing an unproven API on other games.

All model calls are authoring-time only. Production makes no remote requests.
No account, analytics, microphone, video, or permission is used. Free-play
state is session-local; persistence is deliberately not required for the core
fantasy.

## Explicit departures from the brief, mockups, and old prototype

- The brief's free 3D “pour” is implemented as a tactile top-down 2.5D clay
  field. Landforms are planar relationships, and this representation makes
  islands, holes, inlets, and connected shores both manipulable and testable on
  a tablet without pretending to simulate fluid earth.
- The generated mockup's `BUILD` and `NEXT LANDFORM` text buttons become
  picture-led cards and automatic recognition. This removes reading and an
  unnecessary confirmation tap.
- The mockup's dashed island is retained only as a quiet dynamic guide. The
  guide changes for all four concepts and never acts as a precision trace.
- Labels remain real HTML over authored wooden carriers. AI-generated text is
  used only for the inspected title lockup.
- The brief's global archipelago zoom-out becomes an in-tray miniature boat
  payoff. A real globe/map would add a second geography representation and
  require a camera gesture unrelated to the one-skill loop.
- Mystery Maps is added as a separate vocabulary mode rather than mixing quiz
  questions into construction.
- The old prototype's five emoji squares, generic engine board, and fixed ghost
  slots are replaced completely. Its four landform terms and concise spatial
  definitions are retained.

## QLOBE_DEBUG

Format version 1 exposes the standard ready promise, mode list/start, serializable
state, truthful targets, semantic tap, win round, mute, deterministic seed,
fast timers, and return-to-splash. Domain additions expose current landform,
active tool, stroke count, field revision/volume, recognition metrics, completed
landforms, mystery deck/choice, render count, and semantic debug strokes that
travel through the same `applyStroke` path as a real pointer.

## Release gate

- exact production JS parses and all landform-field unit tests pass;
- registry/manifests agree and the repository validator adds no error;
- real-Chrome QA drives all three modes, all four shapes, a false input, tool
  switching, replay, idle hint, audio fallback, and the full navigation loop;
- recorded clips are proven as `kind: "clip"` after a real gesture;
- landscape, portrait, wide-short, and reduced-motion screenshots cover splash,
  shelf, every active shape, success, mystery retry/success, and free sail;
- foreground material fidelity is reviewed separately from layout: tray,
  cards, clay, scoop, controls, and rewards must all read as one photographed
  set at full useful detail;
- production deployment passes the same smoke suite at `https://qlo.be` with
  zero unexpected console errors, failed requests, or case-sensitive 404s;
- status remains beta until the real iPad child playtest.
