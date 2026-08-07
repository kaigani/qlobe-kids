# Throwing Target Garden — production design

**Category:** movement-outdoor · **Ages:** 5–6 · **Status:** beta until iPad playtest
**Art world:** Paper Garden — cozy felt fabric production variant · **Engine:** custom DOM/canvas runtime
**Concept:** `../../../01-game-concepts/_completed/throwing-target-garden/`
**Supersedes:** the current `coach-timer` beta in this folder

## Product promise

Throwing Target Garden turns a real soft beanbag toss into a magical match in a
handmade felt garden. A child listens for a number, color, or sequence target,
aims toward the matching part of the camera view, and tosses the beanbag into a
soft landing basket placed safely below and in front of the tablet. The garden
answers by recognizing the on-screen target, modeling the intended safe landing
with a beanbag shown inside the basket, and giving dancing flowers and a short
celebration. The browser does not claim that it verified a physical basket catch.

The game never directs a child to hit the tablet. The digital target is a
symbolic aiming direction. A grown-up places the tablet on a stable stand and a
soft landing basket where the front camera can see the throw pass. Only red,
yellow, or blue soft beanbags, rolled socks, or fabric balls are invited.

If camera permission is unavailable, denied, lost, or simply unwanted, the
same three games remain complete through **Touch Toss**: drag a raster beanbag
from the basket and flick it toward the target. Camera play and Touch Toss call
the same semantic `resolveThrow()` path and receive the same feedback.

## Capability contribution

The production rebuild adds a privacy-minimal, local-only color-object throw
tracker for browser games. It deliberately does less than general computer
vision:

- explicit-gesture front-camera request with robust late-grant and teardown;
- low-resolution RGB/HSV segmentation for only red, yellow, and blue soft
  objects;
- largest-component position, area, velocity, and approach-growth summaries;
- a temporal throw event emitted only after a moving component is armed;
- coarse normalized impact position and color, never a frame or identity;
- no face, body, pose, person, environment, or object-category recognition;
- no recording, `MediaRecorder`, Blob, upload, persistence, or network access;
- pure image/trajectory functions with synthetic-frame browser tests;
- a first-class manual fallback that exercises the identical game rules.

The tracker is useful to future physical-digital games, but its first shipping
consumer is this game. Its public surface exposes only status, coarse component
summaries, and throw events. Raw pixels remain inside its closure.

## Learning design

| Mode | One skill | Loop | Completion |
| --- | --- | --- | --- |
| Number Hunt | recognize numerals 1–5 from speech and shape | hear a number → aim → toss → see the named numeral respond | 5 targets |
| Color Match | match spoken/seen red, yellow, and blue | choose the called beanbag → aim → toss → color is checked gently | 5 targets |
| Sequence Trail | follow ascending order while aiming in space | see three shuffled target positions → match the next number | 3 trails of 3 targets |

A Number Hunt or Color Match visit lasts about 60–90 seconds. A Sequence Trail
lasts about 75–100 seconds. A complete three-mode visit remains within roughly
4–7 minutes. No score, grade, miss counter, streak, time limit, or “game over”
appears.

## Safety contract

The brief's wording about throwing “towards the tablet screen area” is rejected.
The production setup is:

1. A grown-up places the tablet on a stable stand, outside the landing zone.
   The landscape tablet is 60–90 cm above the floor and tilted downward about
   10–15 degrees; it may not balance on a chair edge or sit inside the basket.
2. A laundry basket, cushion nest, or empty fabric bin with a 50–80 cm opening
   is centered 50–80 cm in front of the tablet. The tablet remains behind and
   above the basket, outside every underhand landing arc.
3. The child stands another 1.2–1.8 m beyond the basket, facing the tablet, and
   tosses underhand into the basket. The front camera looks across the upper
   throw path. It detects a beanbag crossing the view; it does not require
   contact with the tablet, stand, or a physical screen plane.
4. Only soft fabric objects are used. Hard balls, weighted bags, food, and toys
   are never suggested.
5. The setup screen speaks and visibly models the safe arrangement before any
   camera request. Camera play requires a deliberate button press.
6. Touch Toss is always adjacent and equally praised. It is not framed as a
   lesser or failed mode.

The setup check makes the mapping visible without displaying camera pixels.
Three authored flower markers represent the basket's left, center, and right as
the child faces the tablet. Waving a beanbag across the landing zone lights the
corresponding flower. The default front-camera mapping mirrors sensor x so the
screen and child's directions agree; a grown-up can tap an authored flip-arrows
control if the device reports the opposite orientation. Play does not unlock
until at least two distinct lanes have lit, or the child chooses Touch Toss.
The spoken check is: “Wave the beanbag on this side. Did the same flower light
up?” No scoring happens during this check.

Camera confidence never gates access to the game. A weak, ambiguous, or stale
blob is ignored; it is never converted into a miss. The child can switch to
Touch Toss at any time.

## Screen map and navigation

1. **Felt garden splash / mode shelf**
   - Exact generated title lockup.
   - Number Hunt, Color Match, and Sequence cards in the mockup's order.
   - One selected card glows; the orange START plate enters setup.
   - Home is the only catalog link and appears only here.
2. **Safe setup / play-path choice**
   - A wordless felt illustration shows a tablet on a stand and a soft basket
     safely in front, with a fabric beanbag landing in the basket.
   - Camera button requests permission from that gesture.
   - Touch Toss button enters the same mode without permission.
   - A grown-up privacy/safety sentence remains real HTML below the art.
3. **Camera ready check** (camera path only)
   - Hidden video begins; no camera preview is shown or stored.
   - Three authored beanbags invite the child to wave one gently across the
     landing zone. A green tracking badge and three-flower lane compass show
     only coarse color/direction. Persistent LEFT/CENTER/RIGHT chips make the
     mapping pictorial at compact sizes. The grown-up can flip left/right mapping.
   - Success enters play; an eight-second timeout offers Touch Toss without
     blocking or nagging.
4. **Garden play field**
   - Back returns in-page to splash and immediately closes camera tracks.
   - Sound replays the current prompt.
   - Top-left tracking/touch badge, top-right felt progress badge, one dominant
     target region, and a calm open center preserve the mockup hierarchy.
   - Camera mode waits for physical throws; Touch Toss exposes a raster
     beanbag basket along the bottom edge. Its status carrier teaches
     “PICK • DRAG • FLICK”; before the first touch, the suggested bag glows and
     a color-aware stitched route is measured from that bag to the active
     target. Selection names the chosen color and re-anchors the route to that
     bag. The same immediate nonverbal cue appears whenever camera play falls
     back to Touch Toss.
5. **Garden match**
   - The same garden shifts to a safety-corrected reward composition: the
     rainbow/color target and optional numeral remain a compact recognition
     cue, while the authored soft basket models the intended safe destination.
     “GARDEN MATCH!”, felt confetti, dancing flower faces, exact progress, and
     one large NEXT TARGET action complete the beat. This celebrates the digital
     lane/number/color match; it does not assert that camera analysis proved a
     physical basket catch.
   - In Sequence Trail, a small match beat advances within the trail; the full
     reward screen follows the third number.
6. **Garden star end**
   - All three beanbags resting in the soft basket celebrate the mode.
   - “Play again” repeats that mode. Back/“choose another” returns to splash.

Navigation follows the platform contract: splash Home → catalog; setup, ready,
play, reward, and end Back → splash. The camera stays live only across the
intentional ready → camera-play transition; every switch, reward, back, end,
hidden, pagehide, and destroy route releases it.

## Interaction loops

### Number Hunt

1. Draw a seeded shuffle of numerals 1–5. Teach the relationship with the first
   target centered, then choose from left/center/right with no immediate repeat.
2. Speak “Number three!” while the large felt numeral target pops in.
3. Camera play waits for a throw event. Touch Toss waits for a flick released
   from the raster basket. As an equal motor-access path, the child may instead
   tap a beanbag once to select it and tap a target once to toss there; selection
   gets an authored glow/scale cue and both gestures call `resolveThrow()`.
4. The impact x-coordinate is compared with a generous target band. The y-axis
   never requires precision because physical camera geometry varies by stand.
5. A match opens Garden Match. A clear side miss makes the target and nearest flower
   lean toward the target while the narrator says “So close! Try that garden
   lane again.” A calm clue ribbon and TRY HERE chip keep that correction
   visible without a red mark or miss count.
6. NEXT TARGET advances. The fifth match opens Garden Star.

### Color Match

1. Draw five colors from red/yellow/blue with no run longer than two.
2. Speak and show the target color. Three physical beanbag portraits remain at
   the lower edge as a visual choice cue.
3. Camera play checks the classified throw color. Touch Toss requires the child
   to drag the matching raster bag from the basket, or to tap that bag and then
   tap the target. Both routes call `resolveThrow()` with the selected color.
4. The correct color opens Garden Match. A confidently detected different color
   still produces a warm landing bounce: “Nice toss! This target is looking for
   blue.” A COLOR CLUE ribbon and MATCH chip identify the correct resting bag;
   the round stays ready.
5. Uncertain color is ignored and never called wrong. After a gentle idle nudge,
   the correct beanbag portrait pulses once.

### Sequence Trail

1. Present three numbered targets in shuffled horizontal positions. Trails are
   1–2–3, 2–3–4, and 3–4–5.
2. Speak “Find one first,” then “Now two,” then “Trail ends with three.” The
   phrase names sequence order explicitly because targets occupy shuffled
   spatial lanes.
3. A throw aimed into the correct target's generous x-band makes that target
   bloom into rainbow rings and marks it with a stitched flower.
4. A throw toward another number keeps all targets visible, gives the attempted
   numeral a soft “NICE TRY” halo, and labels the expected numeral “NEXT.” No
   red error mark, loss state, or miss count appears.
5. The third match opens Garden Match for that trail. Three completed trails open
   Garden Star.

## Camera tracker and impact semantics

The authored canvas is 1600 × 1200 and maps by cover-fit. The private camera
analysis canvas is at most 160 × 120 and processes at 10–15 frames per second.

1. Convert sampled pixels to HSV and keep only high-saturation red, yellow, or
   blue candidates inside conservative hue/value bands.
2. Build 4-connected components and retain the largest plausible component.
   Tiny noise, full-frame color washes, and edge-only slivers are rejected.
3. Normalize its centroid and area; mirror x for the user-facing front camera.
4. Arm only after two consecutive moving samples. A throw requires meaningful
   normalized speed plus either approach-area growth or a fast exit after a
   previously strong component.
5. Apply an 800 ms cooldown so one beanbag cannot score twice.
6. Emit `{ x, y, color, speed, confidence, at }`. Never expose pixels, the
   hidden video, or persistent histories.

Number/Color targets accept x within a broad 0.30–0.36 normalized band.
Sequence targets accept within 0.18–0.22. Target bands expand on narrow or
portrait layouts. Auto-aim may snap a high-confidence throw to the nearest
target only when it is already within 15% beyond the normal band; it never turns
an opposite-side throw into a hit.

## Spoken script (verbatim)

### Shared and setup

- `welcome`: “Welcome to Throwing Target Garden! Pick a garden game.”
- `setup-safe`: “Grown-up setup. Put the tablet safely on a stand. Place a soft basket below and in front. Throw only soft beanbags into the basket—never at the tablet.”
- `setup-choice`: “Use the camera to spot your throws, or choose Touch Toss. Both are fun!”
- `camera-requesting`: “Getting the garden tracker ready.”
- `camera-ready`: “Tracking is ready! Wave a red, yellow, or blue soft beanbag across the basket.”
- `camera-seen`: “I see your beanbag. Let’s play!”
- `camera-timeout`: “The tracker is still looking. You can keep trying, or choose Touch Toss.”
- `camera-lost`: “The tracker is resting. Let’s keep playing with Touch Toss!”
- `camera-denied`: “That’s okay. Touch Toss is ready!”
- `touch-ready`: “Drag a beanbag from the basket and flick it toward the target.”
- `near-miss`: “So close! Try that garden lane again.”
- `next-target`: “Ready for the next target?”
- `garden-star`: “Target Garden star! Your aiming was amazing!”

### Number Hunt

- `number-intro`: “Listen for the number. Use the basket for camera play, or flick to the felt target in Touch Toss.”
- `number-1`: “Number one!”
- `number-2`: “Number two!”
- `number-3`: “Number three!”
- `number-4`: “Number four!”
- `number-5`: “Number five!”
- `number-hit-1`: “Garden match! You found one!”
- `number-hit-2`: “Garden match! You found two!”
- `number-hit-3`: “Garden match! You found three!”
- `number-hit-4`: “Garden match! You found four!”
- `number-hit-5`: “Garden match! You found five!”
- `number-end`: “You found every number in the garden!”

### Color Match

- `color-intro`: “Listen for the color. Use the basket for camera play, or flick the matching bag to its felt target in Touch Toss.”
- `color-red`: “Red beanbag. Match red!”
- `color-yellow`: “Yellow beanbag. Match yellow!”
- `color-blue`: “Blue beanbag. Match blue!”
- `color-hit-red`: “Garden match! Red matched!”
- `color-hit-yellow`: “Garden match! Yellow matched!”
- `color-hit-blue`: “Garden match! Blue matched!”
- `color-nudge-red`: “Nice toss! This target is looking for red.”
- `color-nudge-yellow`: “Nice toss! This target is looking for yellow.”
- `color-nudge-blue`: “Nice toss! This target is looking for blue.”
- `color-end`: “You matched every garden color!”

### Sequence Trail

- `sequence-intro`: “Follow the number trail. Use the basket lanes for camera play, or flick the numbers in order in Touch Toss.”
- `sequence-first-1`: “Find one first.”
- `sequence-first-2`: “Find two first.”
- `sequence-first-3`: “Find three first.”
- `sequence-next-2`: “Now two.”
- `sequence-next-3`: “Now three.”
- `sequence-next-4`: “Now four.”
- `sequence-last-3`: “Trail ends with three.”
- `sequence-last-4`: “Trail ends with four.”
- `sequence-last-5`: “Trail ends with five.”
- `sequence-nudge`: “Look at the number trail. Which number comes next?”
- `sequence-trail`: “Trail complete! The numbers are in order.”
- `sequence-end`: “You finished every number trail!”

`assets/audio/lines.json` is the runtime source of truth. When installed, final
clips use the approved teacher voice through `qwen3-tts-voiceclone`, AAC/M4A
encoding, and `whisper-stt` transcript QA. Until that approved LAN batch is
produced, Web Speech remains the explicit missing-clip fallback.

## Art direction and complete inventory

World: **Paper Garden — cozy felt fabric production variant**. Paper Garden is
the canonical platform world for layered handmade materials and explicitly
allows felt, fibers, imperfect edges, stitching, and physical shadows. This
game uses one material consistently—cozy stuffed felt—rather than mixing paper
and felt. The movement-outdoor Field Journal default is intentionally overridden:
its quiet watercolor observation language suits looking and journaling, while
this physical aiming game needs the mockup's bold, high-contrast, tactile
targets to remain readable from standing distance. This is a reasoned material
variant of Paper Garden, not a new platform world.

The supplied mockups are the visual north star:
real fuzzy fibers, embroidered seams, stuffed depth, imperfect hand-cut edges,
warm physical shadows, smiling plush flowers, and saturated fabric colors. The
garden must feel touchable at full tablet size.

The final visual-development audit also preserves the requested model order:
four accepted 4:3 Krea 2 felt studies establish the world, core objects, mode
shelf, and reward vocabulary; a subsequent GPT Image 2 safety-setup synthesis
uses all four as hash-bound style references. Two Krea safety compositions were
rejected rather than normalized because their tablet/basket geometry was
ambiguous. `ASSETS.md` and the source-side recipes carry the exact prompts,
hashes, and disposition.

No child-facing screen may contain emoji, SVG illustration, CSS-drawn objects,
CSS gradients, canvas-drawn object art, generic vector panels, or placeholder
geometry. CSS/DOM/canvas may provide layout, hit regions, focus outlines,
clipping, transforms, ballistic motion, collision guides, and particles only.
Functional changing words and numerals may be HTML on authored felt carriers;
the title remains a reviewed raster lockup and “GARDEN MATCH!” uses the authored
wide green felt carrier.

| Runtime asset | Final target | Visible renderer / interaction substrate |
| --- | --- | --- |
| `assets/scenes/garden-day.webp` | 1600×1200 opaque | full-bleed calm felt garden / cover-fit background |
| `assets/ui/title.webp` | ≤1100×500 alpha | exact stitched title / noninteractive image |
| `assets/ui/mode-number.webp` | 480×420 alpha | illustrated number card / invisible ≥160px button |
| `assets/ui/mode-color.webp` | 480×420 alpha | illustrated color card / invisible ≥160px button |
| `assets/ui/mode-sequence.webp` | 480×420 alpha | illustrated sequence card / invisible ≥160px button |
| `assets/ui/button-orange.webp` | 760×240 alpha | START/Again carrier / HTML label + button |
| `assets/ui/button-green.webp` | 760×240 alpha | NEXT TARGET carrier / HTML label + button |
| `assets/ui/button-blue.webp` | 760×240 alpha | camera/touch choice carrier / HTML label + button |
| `assets/ui/badge-tracking.webp` | 420×140 alpha | tracking/touch state carrier / HTML status |
| `assets/ui/badge-progress.webp` | 380×140 alpha | exact current progress carrier / HTML count |
| `assets/ui/setup-safe.webp` | ≤760×620 alpha | safe stand/basket diagram / noninteractive image |
| `assets/ui/tracking-compass.webp` | 760×220 alpha | left/center/right felt flowers / coarse status only |
| `assets/ui/flip-mapping.webp` | 240×240 alpha | stitched opposing arrows / ≥96px button |
| `assets/targets/cream.webp` | 620×620 alpha | standard numeral target / target choice region |
| `assets/targets/rainbow.webp` | 720×720 alpha | on-screen recognition cue / image transform |
| `assets/targets/red.webp` | 620×620 alpha | red color target / target choice region |
| `assets/targets/yellow.webp` | 620×620 alpha | yellow color target / target choice region |
| `assets/targets/blue.webp` | 620×620 alpha | blue color target / target choice region |
| `assets/numerals/1.webp` … `5.webp` | normalized 260×320 alpha | stitched numerals / nested target images |
| `assets/beanbags/red.webp`, `yellow.webp`, `blue.webp` | normalized 280×280 alpha | physical/touch throw objects / drag source or animated image |
| `assets/ui/basket.webp` | 620×390 alpha | physical/touch landing destination and reward/end carrier |
| `assets/ui/flower-happy.webp`, `flower-cheer.webp` | 340×420 alpha | foreground mascot states / noninteractive images |
| `assets/ui/confetti-*.webp` | ≤90×90 alpha | authored felt particles / DOM transforms |
| `assets/hub/tiles/throwing-target-garden.jpg` | 640×533 opaque | full-frame felt target garden + rope basket + three separated resting beanbags / hub link |

Nondeterministic masters remain under `assets/source/`. Transparent masters are
reviewed on saturated magenta before deterministic trim, padding,
normalization, resize, and WebP encoding. `ASSETS.md` records every available
reference, model/workflow, processing step, rejection, creator, and license,
and explicitly identifies the original GPT Image 2 prompt/seed metadata that
could not be recovered instead of inventing it.

The garden backdrop composition is fixed before generation: a scalloped dark
teal felt canopy across the top; two stitched trees and layered shrubs framing
the sides; smiling plush flowers low at both edges; textured sky and grass; and
a calm, unobstructed central 55% for targets, setup art, and functional HTML.
No title, numeral, target, beanbag, control, label, or confetti is baked into the
plate.

### Cast decision

No recurring platform child appears. The concept's one-off “Garden Buddy” is
omitted because the supplied mockups communicate through smiling flowers and a
single dominant target, and adding a new humanoid would crowd the throwing lane
and dilute the established shared cast. The flowers are environmental feedback
props, not speaking characters; the neutral teacher narrator supplies guidance.
This is an explicit no-cast decision, not an unmade casting choice.

## Audio, feedback, and motion

- Recorded teacher voice is the primary instruction channel.
- Shared `sfx.js` supplies tactile pop, whoosh, sparkle, and tada layers.
- The physical throw receives a large, readable response: a raster beanbag
  drops into the basket, the recognized target blooms separately, flowers
  cheer, and felt confetti falls. No beanbag travels toward or rests on the
  display target.
- Motion is tuned at tablet distance. Reduced motion replaces drops, blooms, and
  falling confetti with immediate state swaps and sound; no information is
  lost.
- Idle nudges repeat the current prompt, then pulse the target or correct bag.
  They never count down or call inactivity a failure.

## Camera privacy, permission, and lifecycle

- No camera request occurs on load, splash, automatic mode entry, or Touch Toss.
- `getUserMedia` is invoked synchronously from the camera button's gesture.
- Camera frames are downsampled in a private in-memory canvas, never displayed,
  serialized, logged, debug-exposed, uploaded, or saved.
- Leaving ready/play for a non-camera screen, entering reward, returning to
  splash, switching to Touch Toss, `visibilitychange`, `pagehide`, stream loss,
  error, or destroy stops every media track and clears samples. The eight-second
  ready nudge deliberately keeps the live tracker available while offering an
  immediate Touch Toss choice; choosing it stops the track.
- A late permission grant after timeout or navigation is stopped immediately.
- The game never claims to recognize a child, face, body, pose, identity,
  environment, precise physical impact, or object beyond supported color blobs.
- Debug state exposes only service state, color label, normalized centroid,
  confidence, and last semantic throw.

Physical validation uses a real iPad in the measured arrangement above. Run a
separate 30-throw set in each of three conditions—daylight, warm indoor light,
and dim indoor light—for **90 adult-test throws total**. Each set contains 10
left, 10 center, and 10 right soft underhand throws, followed by 15 stationary
no-throw seconds. Each lane must visibly map to its matching flower; every
condition must emit exactly one event for at least 24/30 deliberate throws, no
event may double-score, and every stationary interval must emit zero events.
These are tuning gates, not child-visible scores. Sequence target bands may
widen if the real setup cannot meet them without precise throwing. The target
child playtest is a separate observation gate after the adult throw matrix.

## Explicit departures

### From the brief

- The child throws into a safe basket, never at the tablet. The camera observes
  the beanbag crossing the landing zone rather than claiming a literal screen
  collision.
- “Garden Match” means the supported color/number/lane condition matched on
  screen. The tracker cannot see or prove a physical basket entry; the reward
  basket is an authored model of the intended safe destination, not a measured
  claim.
- General object boundary detection and “hard item blocking” are omitted. A
  browser camera cannot prove an object is soft. Safety is handled through a
  grown-up setup, explicit soft-object instruction, and a non-impact layout.
- No parental analytics dashboard, accuracy score, session limiter, or player
  tracking is added. The game stores no camera data or performance metrics.
- Number Hunt, Color Match, and Sequence are the complete launch family. Free
  play can follow only after the three learning loops pass child playtest.

### From the mockups

- Functional prompts, status, progress, and changing button labels are exact
  HTML on authored felt carriers rather than baked generated text.
- Back and sound follow the platform HUD grammar; the mockup settings gear is
  omitted.
- A safety/setup screen precedes camera play. It protects the child and device
  without changing the promised garden fantasy.
- Portrait reflows targets and cards while retaining the same 4:3 plate via
  cover-fit; no mockup-only landscape assumption strands controls.

### From the beta

- The generic `coach-timer` steps, emoji, synthetic voice, and unrelated Field
  Journal background are fully replaced.
- Real camera color/throw tracking and a complete Touch Toss fallback replace
  self-reported “done” buttons.
- Three concept-faithful modes replace Throwing Clinic and unsafe Trick Shots.

- The brief's Garden Buddy is omitted in favor of mockup-faithful environmental
  flowers and the platform narrator; no one-off humanoid character is added.

## `QLOBE_DEBUG` and acceptance gates

`window.QLOBE_DEBUG` v1 exposes readiness, mode selection/start, seeded decks,
screen/round/target truth, input path, tracker state, coarse blob/throw summary,
real-handler semantic throw injection, Touch Toss flick, round win, camera
denied/unavailable/lost/late-grant simulations, timer scaling, audio log, mute,
and home. It never exposes pixels or a media stream.

Release requires:

1. all three modes complete with camera and Touch Toss;
2. synthetic tracker tests for RGB/HSV classification, component rejection,
   centroid mapping, temporal throw arming, cooldown, and mirrored x;
3. camera live, denied, unavailable, timeout, lost-stream, hidden, pagehide,
   and late-grant paths, with all tracks stopped on exit;
4. wrong-position, wrong-color, uncertain-color, and wrong-sequence probes;
5. splash → setup → play → reward → end → splash plus every back route;
6. 4:3 landscape, portrait, wide/short, and reduced-motion captures;
7. prove all 49 checksum-bound recorded clips, plus the exact empty-manifest
   Web Speech fallback, in real Chrome with zero unexpected page errors, failed
   requests, or remote runtime requests;
8. every meaningful target at least 96 px and strand-proof Touch Toss dragging;
   tap-beanbag/tap-target is tested as an equal route to every drag/flick;
9. every GDD asset present, optimized, provenance-logged, and free of
   placeholder/vector/CSS artwork;
10. a blind A/B critic review of every asset family, screen, and meaningful
    interaction state against the supplied mockups; the runtime candidate must
    equal or exceed reference polish, felt fidelity, and warmth;
11. an independent code/regression review after implementation;
12. status remains `beta` until a real iPad camera test and the target child's
    playtest confirm safety, comprehension, tracking robustness, and delight.

Current automated evidence (2026-08-06): the expanded real-Chrome suite passes
192/192 checks and produces exactly 44 canonical captures, including real hub
listing/launch/return, visible mode selection, all three modes through camera
and Touch Toss, a real synthetic `MediaStream` lifecycle, ready timeout, flip,
idle guidance, retry states, all end actions, and teardown on reward, switch,
back, hidden, pagehide, and end. It also hash-checks and selects all 49 recorded
teacher clips, then forces an empty manifest and proves the exact Web Speech
fallback with no remote runtime requests. The independent hash-bound visual
receipt is **PASS**: every one of 44 screens and all 34 shipping assets received
three scores of at least 9.0. The two unsafe legacy controls remain explicitly
rejected; automated QA is not substituted for that disposition.
The tracker evidence includes source=camera scoring from a real 128×96
captureStream with moving/growing pixels, pending-retry camera-loss timer and
DOM cleanup, wrong-color class/ARIA/label/state reset, and lifecycle-race
assertions.
The final rerun also covers stationary captureStream no-score, flipped/unmirrored
side-target hits, and a real track-ended-during-camera-flight path with no stale
reward; the ended path uses the manually dispatched real track `ended` handler.
Recorded teacher clips are complete. Real-iPad and target-child validation
remain open beta gates. The canonical Krea seed-2026 felt hub tile is installed,
hash-bound, and independently accepted at 9.4/9.7/9.3.

At least half of the production pass is reserved for asset fidelity,
composition, motion readability, audio timing, responsive screenshots, and
critic-driven iteration after the first functional build.
