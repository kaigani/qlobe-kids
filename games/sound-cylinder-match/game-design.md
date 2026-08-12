# Sound Cylinder Match — Production Game Design

## Product promise

Sound Cylinder Match turns the Montessori sound-cylinder lesson into a tiny
kawaii listening ritual: hear one coral mystery shaker, then test three
visually identical aqua shakers to find the one that sounds the same. The
child cannot solve the round by color, position, or markings. One skill drives
the whole game: **auditory discrimination and short-term auditory memory**.

- **Audience:** ages 2–5, playable independently by a pre-reader.
- **Session:** four 15–25 second matches; roughly 60–90 seconds total.
- **Art direction:** **Kawaii** (canonical label).
- **Status at handoff:** `beta` until a real iPad child playtest passes.

## Capability contribution

The old registered prototype used the generic `match-pairs` engine, identical
emoji cans, speech-synthesized sound words, and no recorded media. This
replacement keeps the stable route but makes sound itself the authored game
content. It provides a focused example of:

- deterministic sound-only answer construction;
- one iOS-unlocked channel for recorded narration and a separate channel for
  real shaker samples;
- an audio QA surface that reports exactly which reference and candidate clips
  played;
- a custom, responsive listening interaction without modifying shared code.

## Screen map and navigation

```text
catalog → splash → play (four matches) → reward/end
              ↑        │                    │
              └─ back ─┘                    ├─ play again → play
              └──────────────────────── back ┘
```

### 1. Splash — “Meet the shakers”

- Full-bleed kawaii playroom plate.
- Generated `SOUND CYLINDER MATCH` lockup, visually spell-checked.
- Coral and aqua cylinder sprites gently lean toward one another on the felt
  mat; the star guide peeks beside them.
- One large raster-backed play control. The first press unlocks all audio and
  speaks the welcome before entering play.
- Home is the only catalog link.

### 2. Play — “Listen, then find its twin”

- Back button at upper left; sound/mute control at upper right.
- Four progress stars sit beneath the prompt plaque.
- A coral reference cylinder occupies the left/upper focus position and pulses
  while its sample plays. Tapping it replays the reference. A persistent
  authored speaker badge makes this affordance legible without text or motion.
- Three aqua candidate cylinders occupy equal large touch zones. They use the
  exact same raster asset, scale, lighting, and unmarked base. Their sound
  identities are shuffled from a seeded deck. Each repeats the same small
  raster speaker badge so the whole row reads as tappable sound objects.
- After the reference has played, each candidate can be tapped to shake and
  play its real sample. The game evaluates that choice immediately.
- Correct choice: both cylinders hop together, a luminous connector and raster
  star appear, the matched sample plays once more, and a recorded cheer leads
  into the next round.
- Different choice: the candidate makes a soft side-to-side wobble; the star
  models “Listen again,” the reference replays, and all choices remain.
- An idle nudge after 9 seconds replays the reference and makes the candidate
  row breathe. There is no timer, score, streak, red X, or failure state.

### 3. Reward/end — “You matched every sound”

- The coral/aqua pair shake together on a dedicated scalloped felt podium in
  front of an authored warm-cream sunburst and pastel rainbow arch.
- Four earned stars cluster in one legible tactile plaque above the pair.
- One large raster-backed “play again” control; Back returns to splash.
- Confetti is decorative DOM imagery and is disabled for reduced motion.

## Round construction and variation

Six sound identities form the reusable source pool:

| ID | Perceptual quality | Authored sample |
| --- | --- | --- |
| `seeds` | dry, soft double shake | seeds in a small shaker |
| `bell` | bright metallic ring | tiny bell |
| `wood` | short hollow knock | wooden beads/blocks |
| `sand` | sustained hush | fine sand shaker |
| `drum` | low rounded thump | soft hand drum |
| `chime` | high clear ping | small chime |

Each four-round session draws four targets without replacement. A round uses
the target plus two distractors. Candidate positions are independently
shuffled. `QLOBE_DEBUG.seed(n)` reconstructs both orders. The first round
starts with the most contrasting distractors; later rounds may include closer
qualities (seeds/sand or bell/chime).

## Spoken script (verbatim)

| Key | Line |
| --- | --- |
| `welcome` | “Welcome, sound detective! Listen to the coral shaker, then find its sound twin.” |
| `start` | “Listen!” |
| `find` | “Now tap an aqua shaker. Which one sounds the same?” |
| `different` | “Those sound different. Listen to the coral shaker again.” |
| `same` | “Great!” |
| `round-two` | “Wonderful listening. Here comes a new mystery sound.” |
| `round-three` | “Your listening ears are ready for another one.” |
| `round-four` | “Last mystery sound. Listen closely.” |
| `idle-reference` | “Tap the coral shaker to hear it again.” |
| `idle-candidate` | “Try an aqua shaker and listen for the same sound.” |
| `complete` | “You matched every sound! Your listening ears are amazing.” |
| `again` | “Play again!” |

Recorded, transcript-approved teacher clips from the existing Rhythm Copycat
production set are the primary channel for the three generic cues “Listen!”,
“Great!”, and “Play again!” The environment did not authorize uploading the
private teacher reference for new cloning, so every game-specific line remains
on the exact Web Speech fallback recorded in `lines.json`; no mismatched clip
is shipped. Shaker samples never use speech as a substitute; their deterministic
packaged WAV files are required for readiness.

## Art inventory

Every primary visible object is authored raster art. CSS and DOM provide only
layout, hit targets, focus rings, masks, and state transforms.

| Asset | Intended size | Visible renderer | Interaction substrate |
| --- | ---: | --- | --- |
| playroom plate | 1600×1200 WebP/JPEG | GPT Image 2 raster | screen background |
| title lockup | ≤1200×700 alpha WebP | GPT Image 2 + local matte | accessible `<img>` |
| aqua cylinder | ≤640×760 alpha WebP | GPT Image 2 + local matte | 3 buttons |
| coral cylinder | ≤640×760 alpha WebP | GPT Image 2 edit + local matte | reference button |
| star guide | ≤640×640 alpha WebP | GPT Image 2 + local matte | decorative/status image |
| sound badge | ≤720×720 alpha WebP | GPT Image 2 + local matte | persistent pre-reader affordance |
| reward stage | ≤720×720 alpha WebP | GPT Image 2 + local matte | distinct completion halo/platform |
| muted button | 256×256 alpha WebP | GPT Image 2 edit + circular export mask | explicit audio state |
| blank button plate | ≤720×260 alpha WebP | local Krea + local matte | HTML button and text |
| hub tile | 640×533 JPEG | local Krea `menu-game-tile` grammar | hub image |
| OG image | 1200×630 JPEG | capture of actual splash | metadata only |

Source generations remain under `assets/source/`; runtime encodes live under
`assets/art/` and `assets/bg/`. Alpha assets are reviewed on magenta before
acceptance. No SVG, emoji, CSS illustration, or model call appears at runtime.

## Interaction and accessibility rules

- Every actionable region is at least 96×96 CSS px in supported layouts.
- Pointer, keyboard, and assistive-technology activation use one press path.
- The first real gesture unlocks narration, samples, and synthesized tactile
  SFX; foregrounding an iPad reopens the unlock latch.
- Playable without reading: position, shake motion, sound, and narration carry
  the loop. HTML text is supplemental and remains selectable to assistive tech.
- Landscape and portrait use the same semantic order. No essential content may
  sit under safe-area insets.
- `prefers-reduced-motion` removes bobbing, hopping, connector sweeps, and
  confetti but preserves state changes and sound.
- Muting stops both narration and samples, releases any pending audio action,
  and swaps every sound button to a distinct authored slash/X raster state.
- Audio errors resolve safely and never strand input.

## Explicit departures

### From the concept mockups

- The play mockup colors every candidate differently. Production uses one
  coral **reference-bank** color and visually identical aqua **candidate-bank**
  cylinders. Color communicates role, never answer identity, so the learning
  goal remains auditory.
- The mockup’s separate play triangle under every cylinder becomes the whole
  cylinder touch target. This enlarges the meaningful object and removes an
  extra abstraction for ages 2–5.
- Stars are gentle session progress, not currency. Search, settings, and a
  grown-ups gate are omitted because they do not support this one-minute loop.
- Dragging cylinders into ports is replaced by one-tap shaking. It is more
  forgiving for the lower age range and keeps attention on comparing sounds.

### From the old prototype

- Custom DOM replaces the generic Pixi match-card grid because this fantasy is
  one reference versus three candidates, not hidden-card memory.
- Real shaker samples replace spoken onomatopoeia. Recorded teacher narration
  replaces Web Speech as the primary voice.
- Four focused matches replace three rounds containing three simultaneous
  pairs. The child holds only one sound target in memory at a time.

## Privacy, persistence, and fallback

The game requests no permission, records nothing, stores nothing, and performs
no network request beyond loading its committed static files. Authoring model
endpoints are never referenced by runtime code. When recorded narration cannot
play, device speech reads the same line. If a required shaker sample is
missing, readiness rejects and the play control stays disabled with an adult-
visible diagnostic rather than presenting a silent listening game.

## `QLOBE_DEBUG` v1 surface

- `ready`
- `listModes()` and `startMode('listen')`
- `getState()` including screen, round, target sound, candidate order,
  awaiting-input/busy/muted, last played sample, and matched count
- `getTargets()` with truthful roles (`reference`, `correct`, `different`)
- `tap(id)` through the same handlers as real presses
- `winRound()` and `complete()`
- `mute(force?)`, `seed(n)`, and `fastTimers(scale)`
- `getAudioLog()` for recorded-clip versus fallback evidence

## Release gates

1. All six samples decode and each pair is byte-identical at source.
2. Every shipped recorded narration clip is transcript-approved and every
   unrecorded line has an exact device-speech fallback.
3. No visual mark leaks candidate sound identity.
4. Static validator and registry drift check add zero errors.
5. Real Chrome QA covers splash, reference replay, different choice, correct
   choice, all four rounds, replay, Back routing, mute, seeded order, and
   recorded voice.
6. Landscape, portrait, and reduced-motion screenshots pass code-owner and
   adversarial art-director review at full size.
7. Production deploy succeeds; the same smoke suite passes against `qlo.be`
   with zero unexpected console errors, failed requests, or remote model calls.
8. Keep status `beta` until the target child completes it on a real iPad.
