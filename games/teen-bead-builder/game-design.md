# Teen Bead Builder — production game design

## Product promise and capability choice

A child turns ten loose, tactile clay beads into one bundled ten bar, then keeps
counting with extra ones to build every teen number. A second game reverses the
thinking: look at one ten plus some ones and find the matching numeral.

**Audience:** ages 5–6.

**Art direction:** **Claymation** inside the platform's Toy Table world. The
workspace is hand-sculpted clay on a pale wood table; beads have visible holes,
fingerprint texture, soft studio light, and physical cord. Platform navigation,
Fredoka type, and audio/touch conventions remain familiar.

**Why this concept replaced its stub:** the old registered prototype was a
five-round `build-assemble` config with emoji placeholders, a pre-made ten bar,
numbers 11–15 only, and no recorded voice. It asked a child to place a bar
without showing where the bar came from. This replacement makes a missing
platform capability real: a reusable interaction pattern for base-ten
manipulatives—loose units, visible grouping, count-on, model-to-symbol matching,
tap fallback, direct drag, and semantic QA control.

**Release status:** beta until a real child completes both modes on the target
iPad without adult explanation.

## Modes and one skill each

1. **Bundle & Build** — compose a teen number as one ten and some ones. The
   session starts by bundling ten loose ones, then builds four varied targets
   from 11–19.
2. **Bead Detective** — match a base-ten bead model to the correct teen numeral.
   Five rounds use one ten bar, 2–8 loose ones, and three nearby numeral choices.

The number order is deterministically shuffled so replay varies while automated
QA can reproduce any session.

## Screen and navigation map

```text
hub → splash
       ├─ Bundle & Build
       │   └─ fill ten-frame → ten bundles → build 4 teen numbers → end
       └─ Bead Detective
           └─ inspect model → choose numeral × 5 → end

splash Home → hub
play/celebration/end Back → splash
```

The splash mode cards are readable without text: a bundled ten beside loose
ones for Build, and a ten bar beside a numeral card for Detective. Labels remain
real HTML for adults and assistive technology.

## Core loops

### Bundle & Build (roughly 60–100 seconds)

1. Hear “Add ten golden beads.”
2. Tap the infinite bead source, or drag its bead into the glowing ten-frame.
   Each bead fills the next position and can be removed before completion.
3. The tenth bead squeezes inward while a tied ten bar pops into view. The game
   says “Ten ones bundle into one ten.”
4. For each teen target, one bundled ten already sits in the TEN tray. Add the
   exact count of loose ones to the ONES tray.
5. Hear the complete relationship, such as “Ten and four more make fourteen,”
   see `10 + 4 = 14`, celebrate, and continue.

Input is intentionally forgiving. A tap always places the next bead; a drag may
land anywhere within a 45 px expanded tray boundary. Releasing elsewhere gently
returns the bead, wiggles the destination, and repeats the modeled instruction.

### Bead Detective (roughly 45–75 seconds)

1. See one vertical ten bar and 2–8 loose colored beads.
2. Hear “Which number do the beads show?”
3. Tap one of three nearby teen numeral cards.
4. A mismatched card gives a soft boing and remains available. The game says
   “Count the ones after ten.”
5. The matching card pops, the full ten-plus-ones sentence plays, and the
   equation closes the round.

No timer, score, locked content, game-over state, or reading-dependent
instruction is used.

## Spoken script

`assets/audio/lines.json` is authoritative. QLOBE Studio creates a consistent
teacher-voice clip for every line with `qwen3-tts-voiceclone`; every result is
transcribed with Whisper before acceptance. `voice-clips.js` falls back to the
same text through device speech if a recorded clip is missing or cannot decode.

Core lines:

- “Pick one bead game to play.”
- “First, let us make a ten. Add ten golden beads.”
- “Bring the bead to the glowing ten frame.”
- “Ten ones bundle into one ten!”
- “Now count on from ten.”
- “Look at the beads. Which teen number do they show?”
- “Which number do the beads show?”
- “Count the ones after ten. Try another number.”
- “Beautiful building! You really know your teen numbers.”
- number names eleven through nineteen
- nine complete relationships: “Ten and one more make eleven” through “Ten and
  nine more make nineteen”

## Art and media list

| Asset | Final use | Renderer |
|---|---|---|
| Clay workshop plate | 1600 px WebP, 97 KB, full-bleed | GPT Image 2 source → deterministic WebP |
| Graphic title lockup | transparent WebP, 75 KB | GPT Image 2 magenta source → chroma removal → alpha QA |
| Hub tile | 640×533 JPEG, 46 KB | Studio `menu-game-tile`, Krea 2 seed 42 |
| Six loose-bead colors | six lossless-alpha 240×240 WebP cutouts, 32–48 KB each | accepted coral bead → individual Qwen color edits → Qwen Layered extraction → shared 220 px subject registration; no runtime crop enlargement |
| Empty cord-and-knot rack | transparent 60×900 WebP, 20 KB | GPT Image 2 cutout; exactly ten bead sprites are composed over it at runtime |
| Turquoise work tray | transparent 900×625 WebP, 64 KB | GPT Image 2 cutout; reused behind ten-frame, ones-frame, and model layouts |
| Blank numeral tablets | three transparent WebP cutouts, 24–28 KB each | GPT Image 2 clay atlas; HTML numerals remain crisp and accessible above them |
| Teacher voice | AAC/M4A clips + manifest | Qwen voice clone + Whisper QA |
| Tactile SFX | runtime WebAudio | shared `sfx.js` |

The background deliberately keeps the center and lower-middle calm. All
functional numerals, equations, labels, and controls remain runtime HTML instead
of baked image text. DOM/CSS supplies responsive geometry, hit areas, slot
guides, animation, and state; the authored WebP cutouts supply the visible
material identity of every primary manipulative.

Two generated complete-rack candidates were rejected because they showed twelve
and eleven beads. The production rack deliberately separates art from quantity:
one authored empty cord sprite sits behind exactly ten authored bead instances.
This keeps the claymation appearance while making the base-ten relationship
mathematically deterministic.

## Interaction and feedback rules

- Primary controls are 96 px or larger in tested tablet layouts.
- Tap and drag share the same `addBead()` state transition.
- One active pointer drag is captured; blur and pointer cancel cleanly reset it.
- First real pointer input unlocks recorded voice, Web Speech, and WebAudio.
- A placed bead can be removed before the quantity completes.
- Correct input pops and speaks; off-tray drag returns; wrong numeral wiggles.
- Idle guidance repeats after nine seconds and visually pulses the relevant
  destination.
- Celebration always offers a large Next control and also auto-advances.
- Reduced motion collapses movement while preserving every state and control.
- Landscape, compact landscape, and portrait receive separate responsive
  layouts; safe-area insets protect the HUD.

## Brief and mockup departures

- The brief's “drag ten beads to TENS” is made mathematically explicit: ten
  loose beads first fill a ten-frame and visibly transform into one bundled ten.
  Later rounds reuse that bar so the child does not repeat ten setup taps for
  every target.
- The mockup's separate number-select campaign screen and star economy are
  replaced with two immediately playable mode cards. There are no locks or
  extrinsic points.
- TENS and ONES labels stay for mathematical vocabulary and adult support, but
  the visual grouping carries the lesson for a pre-reader.
- The original mockup showed colored loose beads already sitting in the TENS
  frame. The final game uses a tied vertical golden bar after bundling, making
  one ten perceptually distinct from one loose bead.
- The old prototype's numeral-card placement was removed. Bead Detective gives
  the numeral-symbol connection its own focused loop instead of mixing it into
  quantity construction.
- Asset-authored claymation replaces the mockup's generic glossy-vector
  rendering across the foreground manipulatives as well as the environment.
  The bright blue field, cream tray contrast, and large central target remain.

## Shared systems and offline behavior

The custom game uses `voice-clips.js`, `speech.js`, `sfx.js`, and `tap.js`. All
model calls are authoring-time only. Production makes no request to GPT, Krea,
Qwen, Whisper, analytics, accounts, or remote storage.

There is no microphone, persistence, personal data, or permission. A missing
voice manifest or clip falls back locally to the exact scripted device-speech
line.

## QLOBE_DEBUG

Format version 1 exposes:

- `ready`, `listModes()`, and deterministic `startMode(id)`
- serializable `getState()` including screen, phase, target, round, placed
  quantity, tutorial state, seed, transition, and mute
- truthful semantic `getTargets()` plus `tap(id)` through real handlers
- `winRound()` for bundle, build, match, and celebration paths
- `mute(value)`, `seed(value)`, `fastTimers(scale)`, and `home()`
- `getAudioLog()` / `clearAudioLog()` for clip-path verification

## Release gate

- syntax and `git diff --check`
- registry sync/check and usage-index rebuild/check
- full repository validator with no new errors
- game-local real-Chrome automation covering both modes, tap, drag, wrong
  numeral, every navigation level, recorded voice, landscape, portrait,
  reduced motion, and zero unexpected errors/failed requests
- full-size visual review of splash, bundling, teen build, wrong choice,
  celebration, end, portrait, and compact landscape captures
- foreground material-fidelity review: beads, cord rack, tray, and numeral
  tablets must match the backdrop's clay texture, lighting, dimensionality, and
  edge treatment; responsive correctness alone cannot pass this gate
- production deployment and the same smoke/visual suite against `https://qlo.be`
- real iPad child playtest before changing beta to live
