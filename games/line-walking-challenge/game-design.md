# Line Walking Challenge - production design

## Product promise

Line Walking Challenge is a 45-75 second finger-balance adventure for ages
4-7. The child helps Fia, a small watercolor fox, walk heel-to-toe along one
glowing trail. Careful movement makes five flowers bloom. Leaving the trail is
never a loss: Fia pauses, the closest earned stretch stays illuminated, and the
trail waits.

The single practiced skill is sustained, controlled line tracking. Forest,
River, and Rainbow are visual and path-shape variations of that same skill, not
three unrelated lessons. A complete three-trail visit lasts about four minutes.

## Screen map and navigation

```text
catalog -> select -> play(forest|river|rainbow) -> complete
             ^          | back                     |
             |          +--------------------------+
             +-------------- back / choose trail --+
```

- **Select:** generated title lockup, three scenic raster cards, one large
  painted Start plaque, Home at top left, Sound at top right. A card tap
  previews that trail and changes selection; Start begins it. Completed cards
  gain a painted flower badge.
- **Play:** Back at top left, Sound at top right, five flower buds along the
  top, an orientation-authored full-bleed storybook scene, Fia, and a glowing dashed route. The live
  start point pulses. No functional reading is required.
- **Complete:** dedicated sunrise garden plate, celebrating Fia, five blooms,
  a painted badge and finish pennant, Back at top left, and a large Next Trail
  plaque. Next Trail chooses the next unwalked route; after all three are
  complete it cycles without erasing the child's locally saved badges.

Home appears only on Select. Back on Play and Complete always returns to Select
inside the game.

## Core loop

1. Tap a scenic card; hear its name and see its golden selection glow.
2. Tap Start. Fia appears at the large glowing paw marker.
3. Put a finger on the marker and follow the wide luminous route at any pace.
4. Every earned fifth alternates Fia's left/right stepping pose, blooms one
   authored flower, and plays a soft success sound.
5. A finger outside the forgiving corridor cannot add progress. Fia switches
   to a calm pause pose; earned progress stays intact and the earned line stays
   illuminated so the return point is obvious.
6. Reach the flag. Fia blooms the final flower, celebrates, and the Complete
   screen offers the next unwalked trail.

Progress follows the route forward, with a small search-ahead window, so a
child cannot jump to the finish but can wobble or lift a finger freely. Pointer
cancel, window blur, rotation, and leaving the canvas end the current stroke
without changing earned progress.

## Trail modes

| Mode | Visual fantasy | Route character | Variation |
|---|---|---|---|
| Forest | sun-dappled wildflower clearing | broad soft S curve | easiest, widest tolerance |
| River | stepping stones beside a sparkling stream | gentle zigzag | medium turns, slightly tighter |
| Rainbow | high meadow under a watercolor rainbow | long looping curve | longest trail, same gentle pacing |

All modes have exactly five checkpoints. Route geometry, tolerance, scene art,
card art, copy, and accent live in `config.json`; the runtime is mode-agnostic.

## Spoken script (verbatim source of truth)

| Key | Line |
|---|---|
| `intro` | "Tap a trail and help Fia follow the glowing line." |
| `choose` | "Which trail should we walk?" |
| `forest-name` | "Forest Trail." |
| `river-name` | "River Trail." |
| `rainbow-name` | "Rainbow Trail." |
| `start` | "Put your finger on the glowing paw. Follow the line, slow and steady." |
| `return` | "Almost! Bring your finger back to Fia's glowing trail." |
| `steady` | "Beautiful focus. Keep going, heel to toe." |
| `bloom` | "Look! Your careful steps made a flower bloom." |
| `complete` | "You did it! Beautiful balance!" |
| `all-complete` | "Every trail is blooming. I'm so proud of you!" |
| `walk-together` | "Later, make a line with tape and walk it with a grown-up." |

The committed spoken script is the source of truth. The approved local teacher-
voice backend was exercised but unavailable during production, so the shipped
empty manifest intentionally activates `voice-clips.js` device speech. Any
future recorded clip must pass Whisper transcript QA before admission.
Narration ducks the quiet shared recorded music track.

## Art direction and inventory

Canonical label: **Watercolor / Storybook**. Treatment: luminous watercolor and
gouache on warm paper, gentle ink edges, leaf green and sky blue washes, earth
browns, and one golden light language for every interactive cue. Fia is an
original fox mascot for this game, kept on-model across one coordinated pose
sheet. No emoji, SVG, CSS illustration, or unreviewed procedural primary art is
shipped.

| Child-facing object | Visible renderer | Interaction substrate |
|---|---|---|
| Select world | `select-backdrop.webp` | full-bleed `<img>` / cover crop |
| Forest, River, Rainbow | three authored stage WebPs | responsive scene box |
| Finish garden | `complete-stage.webp` | full-bleed `<img>` / cover crop |
| Title | transparent `title-lockup.webp` | accessible `<img>` |
| Fia | six transparent raster poses | positioned DOM sprite on sampled route |
| Trail cards | scenic crops from the authored stage plates | 96px-min buttons with real HTML labels |
| Start/Next | painted transparent plaque | button and HTML text/icon overlay |
| Buds/blooms/flag/badge | authored transparent sprites | DOM state and reward slots |
| Trail | faint path authored into each scene plus a live golden canvas glow | high-DPI canvas hit corridor and progress rendering |
| Confetti | shared finish-only celebration layer | seeded, reduced-motion-aware feedback |
| HUD | shared PNG controls | `hud.js` and safe-area classes |

Source masters stay under `assets/source/`. The fox and UI contact sheets are
located with `tools/cut-asset-sheet.py` using `--expected-count`; alpha output
is finalized and inspected on saturated magenta. Opaque scenes are WebP; sprites
retain alpha. The hub tile is a separate 6:5 Toy-menu composition, not a splash
crop. Its committed source is the GPT Image 2 fallback because the approved
Krea 2 job failed upstream; the retry record remains with the sources.

## Interaction and feedback rules

- Pointer Events are the primary play model: one captured active pointer with
  move/up/cancel handling and `touch-action: none` on the playfield. The canvas
  is also focusable; Right Arrow, Enter, or Space advances one careful step so
  keyboard and switch users can complete the same five-flower trail.
- The first real gesture unlocks voice, SFX, and BGM. Nothing speaks on load.
- The path start has a 112px effective target; route tolerance never falls below
  64 screen pixels at the canonical tablet size.
- Earned progress never goes backward. Lifting a finger is allowed. Off-path
  movement increments a diagnostic miss count, moves Fia into a gentle pause,
  and waits; it never draws a red X or subtracts a flower.
- An idle ladder first repeats the spoken prompt, then pulses the paw, then
  briefly brightens the next safe stretch. There is no countdown.
- Success layers are: bloom pop -> fox step -> sparkle -> brief praise.
  Final success is flag -> Fia celebrate -> confetti -> voice -> Next Trail.
- Reduced motion removes pulsing, leaf drift, sprite bobbing, and confetti while
  keeping state changes, route glow, sound, and controls intact.
- Every button retains a 96px hit target, safe-area offsets, keyboard focus, and
  an accessible name. Orientation changes remeasure the canvas and repaint the
  same semantic progress.

## Replay, persistence, privacy, and fallback

Completed trail ids are stored locally under a versioned game-only key. No
child identity, motion sensor, microphone, camera, or network call is used at
runtime. A parent-facing movement suggestion after completion preserves the
Montessori real-world extension without making the digital game depend on room
setup or risky walking while holding a tablet.

If recorded voice is unavailable, device speech says the same lines. If BGM
fails, play continues with voice/SFX. If canvas acceleration is unavailable,
the 2D canvas still renders. All authored media is committed and the shipped
game runs offline.

## Deliberate departures

- The old registered prototype's adult-led timer, carry-a-cup challenges, and
  emoji cards are replaced. They require room preparation and do not deliver
  the supplied fox-tracing concept or mockups.
- The brief's "hold the tablet while walking" option becomes an optional
  grown-up-supported real-world invitation. Core play remains digital-only and
  body-aware, matching platform safety and the interaction philosophy.
- Mockup headings such as "3 of 5" remain optional HTML/accessible status, but
  five visual blooms and spoken guidance carry progress for pre-readers.
- Generated screenshots are not used as monolithic UI. They inform the art
  world; production uses responsive stage plates, real controls, and separated
  sprites.

## Shared platform modules

The game uses `audio-unlock.js`, `bgm.js`, `celebrate.js`, `debug-harness.js`,
`hud.js`, `idle-nudge.js`, `narrator.js`, `preload.js`, `rng.js`, `screens.js`,
`sfx.js`, `tap.js`, `timers.js`, and `voice-clips.js`. No game-specific shared
module is warranted; route sampling stays local until a second custom consumer
needs the exact checkpoint/bloom contract.

## Review and release contract

`window.QLOBE_DEBUG` format version 1 exposes the standard ready/list/start/
state/targets/tap/win/mute/seed/fast-timer surface plus `traceFraction(f)`,
`probeOffPath()`, `resetProgress()`, `getAudioLog()`, and `clearAudioLog()`.
State reports screen, mode, normalized progress, checkpoint, misses, active
pointer, completed trails, muted state, and media readiness.

Release requires:

- all three modes completed through the real tracing handler;
- an off-path probe that cannot advance progress;
- recorded-clip proof when LAN voice generation passes transcript QA;
- no console errors, request failures, or unexpected remote runtime requests;
- landscape, portrait, narrow-landscape, and reduced-motion captures;
- full-size visual inspection of select, every trail, off-path guidance,
  checkpoint bloom, completion, and hub tile;
- registry/manifest validation and a production `https://qlo.be` smoke pass.

The game remains **beta** until a child completes a trail on the real iPad and
can find the next trail without adult explanation.
