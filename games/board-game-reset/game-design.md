# Board Game Reset Ritual — production game design

## Product promise

**Board Game Reset Ritual** is a one-minute cooperative toy-board adventure for
ages 5–6. Biscuit the puppy and Miso the kitten travel one winding path
together. An early board wobble is guaranteed: the game calmly names the
disappointed feeling, then lets the child perform a tactile three-part reset —
**breathe, hug, tidy** — before the friends continue and arrive together.

There is no winner, loser, score, penalty, red X, or game-over state. The
setback is the central play fantasy and the reset is the child's useful power.

## Learning promise

- **Primary skill:** rehearse a short, repeatable self-regulation routine after
  a disappointing game moment.
- **Social skill:** see comfort and cleanup as cooperative repair, not forced
  compliance or punishment.
- **Executive-function skill:** complete three concrete actions in a stable
  order, then return to the interrupted activity.

## Canonical art direction

**Toy** (`toy-table` is the legacy runtime label).

The entire child-facing field is a tactile tabletop set: carved and painted
wood, linen, softly molded forms, rounded safe edges, subtle grain, warm window
light, and restrained contact shadows. Biscuit and Miso are clearly wooden toy
figures, not plush, clay, stickers, emoji, or generic app mascots. The path,
spinner, breathing cloud, heart, basket, loose pieces, plaques, and reward badge
all share the same material, camera, light, and edge treatment.

Primary art is authored raster imagery. CSS and DOM provide layout, invisible
hit areas, transforms, focus rings, masks, and feedback only; they do not draw
the board, characters, spinner, ritual objects, buttons, plaques, or pieces.
Functional labels remain HTML over authored raster plaques and are never
required to understand play. The generated title lockup is spell-checked at
full resolution.

## Cast

- **Biscuit:** a honey-brown carved-wood puppy with a cream muzzle and blaze,
  floppy darker ears, a teal collar, and a round gold tag. Biscuit has the
  disappointed moment.
- **Miso:** a warm coral-pink carved-wood kitten with darker stripes, a plum
  collar, and a matching gold tag. Miso is Biscuit's calm board-game partner.

Keeping one stable pair instead of the brief's five selectable tokens protects
identity fidelity across emotional poses and makes the cooperative relationship
immediately legible. The pair may be expanded into avatar selection only after
the flagship loop is child-tested.

## Screen map and navigation

```text
splash
  -> board / await-spin
  -> board / moving
     -> ordinary landing -> board / await-spin
     -> guaranteed early wobble -> setback / validate-feeling
        -> ritual / breathe
        -> ritual / hug
        -> ritual / tidy
        -> ready-again
        -> board / await-spin
     -> final landing -> end / together

play Back -> splash
ritual Back -> splash
end Back -> splash
splash Home -> catalog
end Again -> fresh board
```

Only the splash contains a catalog link. Every deeper Back control returns to
the in-game splash.

## Core loop and pacing

The path has ten visual stops. A seeded move deck produces values from one to
three; the second spin is adjusted to land on the reset-heart stop so the
ritual appears early without feeling like a scripted interruption. After the
ritual, two or three short moves reach the shared star destination.

Target duration on first play: **55–90 seconds**.

1. The first real gesture unlocks recorded narration, SFX, and a quiet
   vibraphone/woodwind-like toy melody.
2. Tap the physical spinner. It turns and settles; Biscuit and Miso hop together
   along the authored path.
3. On the reset-heart stop, three loose wooden pieces tumble onto the table and
   Biscuit changes to the worried pose.
4. The guide validates the feeling, never blaming the child or character.
5. **Breathe:** tap the wooden cloud. It slowly grows and settles during one
   narrated in/out breath.
6. **Hug:** drag Miso to Biscuit, or tap either friend for the equal tap path.
   The two figures meet in the authored hug pose.
7. **Tidy:** drag each loose wooden piece into the basket, or tap a piece to fly
   it into the same basket. Every action is accepted; there is no wrong bin.
8. The authored high-five pose appears with a short celebration. The board is
   restored and the spinner becomes available again.
9. Reaching the shared star opens the Together screen. Again starts a fresh
   seeded run; Back returns to the splash.

## State machine

```text
screen: splash | play | end
phase:
  splash
  await-spin
  spinning
  moving
  setback
  breathe
  hug
  tidy
  ready
  together
```

Input is locked during spin/move/transition choreography. Every asynchronous
beat is guarded by a run generation so Back or replay cannot let a stale
animation mutate the new game. Screen exit clears timers, idle nudges, pointer
captures, drag ghosts, voice, and celebration layers.

## Spoken script

All production clips use the approved platform teacher voice. Text below is
verbatim and is also the Web Speech fallback.

| Key | Exact line |
| --- | --- |
| `welcome` | “Biscuit and Miso play together. Tap the spinner and help them reach the star.” |
| `spin` | “Give the spinner a whirl!” |
| `move` | “Hop, hop, hop. Together we go.” |
| `setback` | “Oops. The board got wobbly. Biscuit feels disappointed, and that feeling is okay.” |
| `reset-intro` | “Let’s do our reset ritual together.” |
| `breathe-prompt` | “First, tap the breathing cloud.” |
| `breathe` | “Breathe in slowly... and blow it out.” |
| `hug-prompt` | “Now bring Miso close for a cozy hug.” |
| `hug-done` | “Kind hearts help wobbly feelings.” |
| `tidy-prompt` | “Last, put each loose piece in the basket.” |
| `tidy-one` | “One piece cozy.” |
| `tidy-two` | “Two pieces cozy.” |
| `tidy-done` | “Everything is back in its place.” |
| `ready` | “You did it. The board is ready, and so are our friends!” |
| `resume` | “High five! Tap the spinner when you’re ready.” |
| `finish` | “Biscuit and Miso made it together. Kind hearts can try again.” |
| `idle-spin` | “The spinner is waiting for your hand.” |
| `idle-breathe` | “Tap the cloud for one slow breath.” |
| `idle-hug` | “Bring the kitten and puppy together.” |
| `idle-tidy` | “Put a piece into the basket.” |

Idle prompts fire at most once per phase. The sound button repeats the current
phase's useful line through a debounced control.

## Raster production inventory

Every source master and final has a `qlobe-recipe` sidecar or a matching recipe
entry documented in `ASSETS.md`.

| Final | Nominal final | Visible renderer | Interaction substrate |
| --- | ---: | --- | --- |
| `assets/world/splash-table.webp` | 1600×1200 | full Toy splash scene, quiet center/top title area | screen background |
| `assets/world/board-table.webp` | 1600×1200 | overhead winding board on linen/wood, ten clear stops | screen background + configured path coordinates |
| `assets/world/ritual-table.webp` | 1600×1200 | closer quiet board-reset table with open center | ritual background |
| `assets/world/responsive-{portrait,wide}.webp` | 1086×1448 / 1915×821 | edge-authored Toy tabletop extensions with calm centers | responsive raster environment behind board/ritual layers |
| `assets/ui/title.webp` | up to 1100×420 alpha | exact “Board Game Reset Ritual” wooden lockup | decorative image + hidden H1 |
| `assets/ui/play-medallion.webp` | 360×220 alpha | wooden heart/play medallion, no baked text | 128px+ button |
| `assets/ui/spinner.webp` | 460×460 alpha | six-sector wooden spinner with no text | 150px+ button, CSS rotation only |
| `assets/ui/wood-plaque.webp` | 900×260 alpha | blank carved-wood plaque | live HTML prompt/title carrier |
| `assets/ui/breathe-cloud.webp` | 380×320 alpha | sleepy wooden cloud with wind curls | 170px+ button, scale transform |
| `assets/ui/tidy-basket.webp` | 420×360 alpha | open woven toy basket | drag/tap destination |
| `assets/ui/together-badge.webp` | 420×420 alpha | star-and-heart wooden reward medallion | celebration image |
| `assets/characters/biscuit-neutral.webp` | 420×520 alpha | neutral happy puppy toy | image in board/ritual layers |
| `assets/characters/biscuit-worried.webp` | 420×520 alpha | same puppy, gentle disappointed pose | image swap only |
| `assets/characters/miso-neutral.webp` | 420×520 alpha | supportive kitten toy | draggable/tappable image button |
| `assets/characters/friends-hug.webp` | 760×540 alpha | identity-matched pair in side hug | ritual success pose |
| `assets/characters/friends-high-five.webp` | 760×560 alpha | identity-matched pair high-fiving | ready/end pose |
| `assets/pieces/heart.webp` | 240×240 alpha | coral wooden heart piece | draggable/tappable piece |
| `assets/pieces/star.webp` | 240×240 alpha | golden wooden star piece | draggable/tappable piece |
| `assets/pieces/flower.webp` | 240×240 alpha | plum-and-cream wooden flower piece | draggable/tappable piece |
| `assets/pieces/pawn-biscuit.webp` | 220×220 alpha | puppy portrait pawn | moving board token |
| `assets/pieces/pawn-miso.webp` | 220×220 alpha | kitten portrait pawn | moving board token |

Raster sheets may be generated as evenly spaced contact sheets, extracted as a
single alpha layer with Qwen Image Layered, then sliced deterministically.
Contact-sheet gutters must remain empty so cell crops never cut silhouettes.

## Asset-production route

1. **GPT Image 2:** cohesive visual-system masters — splash, board, exact title,
   character sheet, and prop sheet — using the concept mockups as composition
   references while enforcing the canonical Toy material system.
2. **Krea 2:** one alternate uncluttered tabletop plate when useful for
   comparison; it ships only if it matches the GPT Image 2 style anchor.
3. **Qwen Image Edit:** derive the ritual plate from the approved board plate
   and identity-preserving worried/hug/high-five variants when a master cell
   needs correction.
4. **Qwen Image Layered:** extract reviewed character/prop sheets; fetch
   asynchronous `layer_2`, validate real alpha, compare identities, then slice.
5. **Deterministic finalization:** trim/fixed canvas, Lanczos resize, WebP/PNG
   encode, and visual composites over magenta plus actual light/dark plates.
6. **Qwen TTS voice clone:** produce every spoken key from the approved teacher
   reference, convert returned FLAC to AAC M4A, and Whisper-transcribe every
   clip. Material transcript mismatches are rejected and regenerated.

## Responsive and input contract

- Landscape and portrait both keep the board/ritual fantasy full-bleed; layout
  repositions raster objects rather than cropping primary controls.
- Every active target is at least 96×96 CSS px and remains inside safe areas.
- `onTap` provides the one press path. Hug/tidy use strand-proof pointer drag
  with tap alternatives; pointer cancel, window blur, Back, and screen change
  remove every ghost and capture.
- Keyboard/assistive activation follows the same action methods. Images have
  useful names only when they convey state; decorative material is empty-alt.
- Core play never requires reading. Live text is concise and always narrated.
- `prefers-reduced-motion` removes spin/hop/flight/confetti motion while keeping
  sound, state changes, and visual outcomes.

## Shared modules

- `shared/js/screens.js`
- `shared/js/hud.js` + `shared/css/hud.css`
- `shared/js/tap.js`
- `shared/js/audio-unlock.js`
- `shared/js/voice-clips.js` + `shared/js/narrator.js`
- `shared/js/sfx.js`
- `shared/js/bgm.js` + `shared/assets/music/whimsical-toy-workshop.mp3`
- `shared/js/timers.js`
- `shared/js/idle-nudge.js`
- `shared/js/rng.js`
- `shared/js/preload.js`
- `shared/js/stage/drag-to-slot-dom.js`
- `shared/js/celebrate.js`
- `shared/js/debug-harness.js`

## QLOBE_DEBUG v1

The game exposes the required contract plus deterministic helpers:

- `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`,
  `winRound`, `mute`, `seed`, `fastTimers`, `home`
- `spin(value?)`, `forceSetback()`, `completeBreathe()`, `completeHug()`,
  `tidy(pieceId?)`, `completeRitual()`, `finishGame()`, `getAudioLog()`,
  `getMusicStats()`, `getLayout()`

State includes screen, phase, position, turn, reset completion, tidy pieces,
current cue, input lock, seed, timer scale, and reduced-motion status.

## Explicit departures

- **From the stub:** removes the emoji choose-one quiz and both disconnected
  modes. Direct embodied rehearsal better serves the coping ritual than judging
  verbal good-sport answers.
- **From the brief:** uses one polished puppy/kitten partnership instead of five
  selectable animal avatars. This protects identity, emotional readability, and
  asset quality; selection can follow later.
- **From the mockups:** removes instructional text from the three ritual cards
  and guides one full-screen action at a time. Pre-readers get a clearer target,
  larger hit areas, and less visual competition.
- **From the concept video:** interaction timing may inform feel, but the
  canonical Toy world and production mockups control all visible art.

## Release gate

- All art/voice items exist with provenance and budget-compliant finals.
- Recorded audio plays after a real gesture and every clip passes transcript QA.
- Automated real-Chrome QA covers the full board, forced setback, three ritual
  actions, resume, finish, replay, Back routing, mute, portrait, landscape,
  reduced motion, pointer cancellation, keyboard and assistive-tech activation,
  and target sizing.
- Zero console errors, local 404s, or remote game/model/service dependencies;
  the platform's shared non-blocking analytics loader is the sole QA allow-list.
- Adversarial art review accepts material fidelity, hierarchy, crop safety,
  character consistency, state clarity, and moment-to-moment delight.
- Catalog status remains `beta` until a parent/child iPad playtest signs off;
  only then may it be promoted to `live`.
