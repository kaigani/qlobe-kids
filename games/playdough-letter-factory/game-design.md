# Playdough Letter Factory — production game design

## Product promise

A child picks a favorite color, rolls a convincing lump of digital dough with broad finger swipes, then follows a giant dotted letter path until the handmade letter comes alive. The same factory also turns finished letters into three-letter picture words and offers a pressure-free drawing tray.

**Audience:** ages 4–6.

**Art world:** a game-specific **Claymation** world: one coherent hand-sculpted stop-motion set, UI, mascot, dough, and lighting system. The platform HUD and Fredoka interaction grammar remain unchanged.

**Release status:** beta until a real iPad child playtest confirms path tolerance, audio timing, and repeat appeal.

## Modes and one skill each

1. **Make a Letter** — uppercase stroke direction and motor sequencing. Five replayable letters: A, L, T, C, O.
2. **Build a Word** — ordered assembly of CAT, DOG, or SUN from three large dough letters with a concrete picture clue.
3. **Free Dough** — open-ended fine-motor mark making with thick dough drawing, color changes, and A/O/S/star stamps.

## Screen and navigation map

```text
hub → splash
       ├─ Make a Letter → color → roll (3 swipes) → trace → phonics reveal
       ├─ Build a Word → picture + 3 slots → word reveal
       └─ Free Dough → open tray

splash Home → hub
play/reveal Back → splash
reveal replay → same target
reveal next → next letter/word
```

The splash makes all three choices understandable without reading: a giant dough A, three letter tiles, and a free squiggle. Every child-facing screen has a recorded spoken prompt plus a real HTML label for accessibility and grown-up support.

## Core loops

### Make a Letter (roughly 35–70 seconds)

1. Pick one of five large color tubs.
2. Swipe horizontally three times. The roller follows the finger, the rope grows longer and flatter, and one progress bead fills per accepted sweep.
3. Start at the glowing dot and trace one stroke at a time. The accepted dough follows the finger while a generously spaced dotted guide remains visible.
4. See the finished clay letter with a face, a shared picture object, confetti, and “A is for APPLE”-style phonics payoff.

Trace input uses real SVG path geometry rather than a fake timer. The pointer must begin within an 88-unit forgiving radius and stay within an 82-unit corridor. Progress cannot jump more than a local forward window, while an 82% stroke completion threshold forgives small end misses.

### Build a Word (roughly 20–45 seconds)

1. Hear the word and its three letters.
2. See the matching shared object card and three ghosted letter slots.
3. Tap a letter or drag it onto the highlighted next slot.
4. A correct letter pops into clay; a wrong letter only wiggles and stays available.
5. The completed word receives confetti and a cheerful guide line.

### Free Dough

Draw anywhere on the cream tray with a 56-unit round dough rope. Change among five colors, stamp A/O/S/star, or clear the tray. There is no score, timer, end gate, saving, or destructive confirmation.

## Spoken script

The authoritative lines are in `assets/audio/lines.json`. All 12 guide clips use the approved teacher voice through QLOBE Studio's `qwen3-tts-voiceclone` workflow and were transcript-checked with Whisper. The CAT line was rejected after the first transcript heard “it” instead of “cat”, then regenerated with seed 8 and accepted at a 1.0 normalized match. Web Speech is the offline fallback if a clip cannot decode.

Letter rewards add the shared “A is for apple” recordings through `content.js`, preserving the platform's canonical phonics library.

## Art and media list

| Asset | Final size/use | Renderer |
|---|---|---|
| Clay factory environment | 1280×960 WebP, 114 KB, full-bleed | GPT Image 2 source, deterministic WebP |
| Graphic title lockup | transparent WebP, 77 KB | GPT Image 2 magenta source + local chroma removal |
| Factory guide | transparent WebP, 62 KB | GPT Image 2 magenta source + local chroma removal |
| Hub tile | 640×533 JPEG, 90 KB | Studio `menu-game-tile`, Krea 2 seed 42 |
| Dough letters/tools | runtime SVG/HTML/CSS | deterministic code-native clay components |
| Picture clues | shared object library | `content.js` / shared WebP |
| Guide voice | 12 AAC/M4A clips, ~360 KB total | Qwen voice clone + Whisper QA |
| Phonics reward | shared recorded audio | `content.js` |

The generated background deliberately leaves the upper center and workbench calm. Interface elements remain runtime objects, so controls stay legible, responsive, and localized independently of the art.

## Interaction and feedback rules

- Every button/token is at least 96 px in tested layouts.
- Pointer capture prevents rolling, tracing, drawing, and drag gestures from stranding off-element.
- First real pointer gesture unlocks recorded audio, Web Speech, and synthesized SFX.
- No harsh failure, score, countdown, or game-over state.
- Wrong trace starts replay the glowing-dot guidance at most once per 1.2 seconds.
- Word tokens support both direct tap and drag-to-slot; a child does not need precision dragging.
- Reduced motion collapses entrance/celebration animation without changing state timing or access.
- Landscape 1180×820, compact landscape 1180×620, and portrait 820×1180 are automated release layouts.

## Brief/mockup departures

- The mockup's inactive READY/DONE buttons are replaced by automatic progression after a meaningful gesture. This removes reading and an unnecessary extra tap.
- The astronaut-like guide was rebuilt as an original clay space-mechanic and stays smaller than the work.
- The exact three-step promise is retained, but tool buttons shown in the mockup were removed because one visible tool at a time is clearer for pre-readers.
- Word Maker uses the shared picture-object canon and ghost slots rather than a baked AI UI image.
- Free Dough is implemented as the brief's sandbox mode, even though it was not one of the five mockup screens.
- Numbers from the old stub were removed. The chosen concept and name promise early literacy, and each mode now teaches one related literacy/fine-motor skill.

## Shared systems and offline behavior

The game uses `voice-clips.js`, `content.js`, `speech.js`, `sfx.js`, and `tap.js`. Config lives in Studio-editable `config.json` and loads through the standard `config.js` shim. All model calls are authoring-time only; production makes no remote requests.

No account, analytics, microphone, persistence, video, or permission is used. A missing voice manifest or clip falls back to speech. A missing shared phonics clip falls back to the same spoken line.

## QLOBE_DEBUG

Format version 1 exposes mode listing/start, serializable state, truthful current targets, semantic taps, whole-round completion, mute, seed control, fast timers, and return-to-splash. Domain state includes phase, selected color, roll count, active stroke/progress, placed word letters, and free marks.

## Release gate

- `node --input-type=module --check < js/main.js`
- repository validator adds no new error
- automated real-Chrome suite passes landscape, portrait, reduced motion, wrong-input, real swipe, real trace, recorded voice, navigation, offline-request, and all-mode checks
- every meaningful state is captured and visually reviewed at full resolution
- production deployment and the same suite against `https://qlo.be`
- real iPad child playtest before changing beta to live
