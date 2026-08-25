# Post Office Letters — production game design

## Product promise

Open a tiny neighborhood post office where every mark has a purpose. A customer
arrives with a letter, the child writes the recipient's lowercase name, chooses
a picture stamp, sends the envelope through a delighted mail chute, and then
uses the same printed name to give the letter to the right pickup customer.

The game turns handwriting from an isolated worksheet into a complete social
action: **write it → send it → read it → help someone**.

- Audience: ages 5–6, tablet first.
- Canonical art direction: **Kawaii**.
- Visual modifier: hand-painted storybook gouache and colored-pencil paper
  texture with puffy cream sticker edges. This is not a separate art-world id.
- Category: `writing-fine-motor`.
- Session: three shuffled mail routes, about 3–6 minutes.
- Runtime: static/offline. No model, account, name entry, or network call.

## Learning design

The continuous `mail-shift` mode connects three observable steps:

1. **Lowercase formation:** follow ordered, tolerant manuscript paths. The
   current start glows; completed ink is never erased by a mistake.
2. **Name writing:** form a complete familiar 3–4 letter name from left to
   right. Only one letter is active at a time so the motor task stays calm.
3. **Functional print:** the completed lowercase name remains on the envelope
   and is the information needed to match that envelope at pickup.

The first release uses the adopted QLOBE cast and their short names: `maya`,
`leo`, `nia`, `sam`, and `ravi`. It intentionally does not collect or persist a
child's personal name. A grown-up-controlled local-name feature would require a
separate privacy, validation, deletion, speech, and formation-content design.

## Core loop

One route takes roughly 45–85 seconds:

```text
sender arrives
→ recipient is shown and named aloud
→ child traces recipient's lowercase name
→ child chooses one authored picture stamp
→ addressed envelope is tapped or slid into the smiling chute
→ recipient arrives for pickup
→ child finds the matching printed envelope among two gentle decoys
→ recipient celebrates and the next customer bell rings
```

Three routes make a complete shift. Routes begin at a seeded shuffled offset,
so replay changes the people, names, stamps, and decoy order without changing
the learning grammar.

## Screen map

### 1. Closed counter / splash

- Full-bleed post-office plate: garden window, parcel lift, smiling red chute,
  and colorful empty mail cubbies.
- Generated `Post Office Letters` title lockup, spell-checked at full size.
- A large authored blank envelope is the dominant start affordance; the shared
  raster Play button sits over it as a secondary universal cue.
- Maya, Leo, Nia, Sam, and Ravi peek from a small waiting queue made from their
  adopted transparent portraits.
- Home returns to the catalog; Sound repeats the welcome.
- Spoken: “Welcome to Post Office Letters! Tap the big envelope to open the
  mail window.”

### 2. Sender arrival

- The sender portrait rises into the left customer window.
- The recipient portrait glows in one right-side cubby.
- A blank envelope floats from the parcel lift onto the counter.
- Spoken route line names both people and the exact lowercase address to write.
- The child taps the envelope or the large Continue cue to begin.

### 3. Address writing

- The authored envelope enlarges over the existing raster counter.
- A row of equal name cells is laid across its empty central area.
- Each cell uses canvas only for the functional guide, start dot, and the
  child's ink. The envelope, postage, room, chute, and character art remain
  authored raster assets.
- The active guide is a broad manuscript polyline resampled into ordered
  checkpoints. Pointer input must begin near its first checkpoint and travel
  near successive checkpoints; jumping to an endpoint cannot complete it.
- Stroke order is required, but tolerance is intentionally broad. A stray path
  makes the current guide breathe and triggers a short model; earned strokes
  and completed letters remain.
- At each completed letter, the exact lowercase HTML glyph settles into the
  address line and the next cell opens. Functional text remains real text.

### 4. Stamp and send

- Three authored postage stamps rise in a large tray: smiling heart, moon, and
  rainbow. All are genuine raster cutouts and at least 112 px.
- The chosen stamp lands on the envelope with a tactile pop.
- The smiling chute pulses. A tap on the envelope or a forgiving short slide
  toward the chute uses the same send handler.
- The envelope visibly keeps the complete lowercase name while traveling.

### 5. Pickup counter

- The recipient appears at the left window and asks for mail.
- Three authored envelope instances appear; their address print is real HTML.
  One is the written name and two are other cast names.
- Tapping or dragging the correct envelope to the customer succeeds. A wrong
  envelope wiggles softly, speaks the matching hint, and returns unchanged.
- The successful envelope opens beside the recipient; a stamp sparkle and
  descriptive praise confirm that the print did a real job.

### 6. Shift celebration

- The three delivered envelopes appear as a small “today's mail” parade across
  the counter with the child's selected stamps and names intact.
- Cast portraits fill the cubbies; the chute beams; Kawaii postage sparkles and
  reduced-motion-safe confetti celebrate.
- “Another shift” replays with a new seeded route order. Back returns to splash.

## Interaction and feedback rules

- All active targets are at least 96 px; primary targets are 112–180 px.
- Pointer Events use capture plus window-level cancel/up/blur recovery.
- Every drag action has a tap equivalent.
- One press path per control through `onTap`; no duplicate pointer/click action.
- Wrong input never removes progress, changes score, locks content, or plays a
  harsh sound. There is no timer, streak, grade, “Game Over,” or loss state.
- Idle ladder: after about 11 seconds, repeat the relevant spoken cue; next,
  model the current stroke or pulse the intended envelope/chute/customer.
- Motion is tuned at tablet size. `prefers-reduced-motion` replaces travel,
  bounce, and confetti with short fades/pops while preserving state clarity.
- Functional copy is HTML and exposed through labels/`aria-live`, but core play
  remains picture- and audio-first.
- Safe areas protect HUD buttons and all lower interaction trays in portrait,
  landscape, and wide-short layouts.

## Spoken script

`assets/audio/lines.json` is canonical. It contains the welcome, all five route
arrivals, all five pickup prompts, action guidance, gentle retry lines,
celebration lines, and formation language for every used lowercase glyph:
`a e i l m n o r s v y`.

Primary narration is a rights-cleared teacher-voice clone generated at
authoring time. Every clip must be encoded as AAC/M4A and pass Whisper
transcription comparison before entering `manifest.json`. `voice-clips.js`
provides correct device speech when a recorded clip is absent. First child
gesture unlocks voice, SFX, and any shared BGM together.

## Art inventory and renderers

| Child-facing object | Target | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| UI visual-system anchor | 1448×1086 source | GPT Image 2 PNG, retained for reference | none |
| Post-office plate | 1448×1086 source; optimized WebP | GPT Image 2 precise edit, opaque storybook raster | full-bleed `<img>` |
| Title lockup | ≤900 px wide, ≤150 KB WebP alpha | GPT Image 2 title, Qwen Layered extraction | accessible `<img>` |
| Blank envelope | ≤800 px, transparent WebP | GPT Image 2 prop, Qwen Layered extraction | button/drag wrapper + live HTML address |
| Heart/moon/rainbow stamps | ≤420 px each, transparent WebP | three GPT Image 2 props, Qwen Layered extraction | three oversized buttons with Retina headroom |
| Smiling mail chute | baked into environment plate | GPT Image 2 raster | invisible forgiving drop/tap zone |
| Mail cubbies | baked into environment plate | GPT Image 2 raster | portrait/name slots layered in HTML |
| Maya/Leo/Nia/Sam/Ravi | existing transparent PNG portraits | adopted QLOBE cast raster art | animated `<img>` wrappers |
| Lowercase guide and child ink | live high-DPI canvas | functional formation/interaction rendering | same canvas pointer controller |
| Lowercase names | live Fredoka HTML | exact functional print | labels on envelope wrappers |
| HUD | shared raster button assets and HUD module | QLOBE shared UI | shared HUD handlers |
| Celebration sparkles/confetti | runtime particles over authored scene | shared celebration renderer | non-interactive |
| Hub tile | 640×533 JPEG | Krea 2 Toy menu grammar, no text | hub link |
| Open Graph image | 1200×630 JPEG | captured real splash | social metadata |

Generated sources, prompts, layered outputs, and magenta QA evidence remain in
`assets/source/` and `assets/production/`. The environment's baked chute and
cubbies are deliberate: they preserve world fidelity while invisible DOM zones
provide interaction. Canvas is deliberately restricted to dynamic handwriting.

## Shared systems

- `audio-unlock.js`, `voice-clips.js`, `narrator.js`, `sfx.js`
- `screens.js`, `hud.js`, `tap.js`
- `timers.js`, `idle-nudge.js`, `rng.js`, `preload.js`
- `celebrate.js`, `debug-harness.js`
- adopted cast portraits under `shared/characters/`

Ordered trace geometry follows the normalized nested-stroke data convention
proven by `trace-path`, but orchestration stays game-local because the shared
engine owns its own splash/play/end lifecycle. `js/letter-writing.js` remains
local until a second consumer justifies a stable shared API.

## `QLOBE_DEBUG` v1 contract

The production game exposes:

- `ready`, `listModes`, `startMode('mail-shift')`, `getState`, `getTargets`
- `tap(id)` through the same handlers as real touch
- `traceCurrent()` through the same ordered point-consumption logic
- `chooseStamp(id)`, `sendLetter()`, `choosePickup(name)`
- `winRound()` and `completeShift()` for deterministic QA
- `seed(number)`, `fastTimers(on)`, `mute(on)`, `getAudioLog()`

State is serializable and truthful: screen, phase, route queue, round index,
sender, recipient, current letter/stroke/progress, addressed name, stamp,
pickup choices, delivered mail, muted/reduced-motion state, and input lock.

## Privacy and persistence

- No microphone, camera, account, analytics beyond the platform page view, or
  runtime authoring/model request.
- No child-entered name or free text.
- No local storage is needed; refresh begins a fresh, seeded shift.
- The exact cast names are committed learning content.

## Departures and rationale

- There is no source concept folder for this user-supplied concept. The game
  therefore uses a newly authored GPT Image 2 4:3 mockup as its visual north
  star, while Name Puzzle, Letter Road Driving, Playdough Letter Factory, and
  Kindness Delivery provide interaction benchmarks.
- The final experience is one continuous mixed post-office shift rather than
  three disconnected mode cards. The real envelope carrying the written name
  from formation into pickup is the concept's strongest learning evidence.
- Arbitrary personal-name entry is deferred. It would expand privacy, speech,
  formation data, persistence, and grown-up controls beyond this release.
- Full freehand handwriting grading is intentionally absent. The game evaluates
  ordered, broad guide traversal, not penmanship quality.

## Release gates

- Three complete shuffled routes work by real pointer input; no auto-win is
  required for ordinary play.
- A distant tap or endpoint jump cannot complete a letter.
- Every used lowercase glyph has a legible manuscript path and every complete
  name remains visible from writing through pickup.
- Tap and drag equivalents both send and hand over mail; cancel/blur/resize
  cannot strand an envelope or active trace.
- Recorded narration plays as `kind: clip` after first gesture; every clip has
  Whisper QA and correct fallback text.
- No child-facing emoji, SVG, CSS-drawn mailbox/envelope/stamp/character, or
  generic gradient prop remains.
- Local validator adds no errors; registry/manifest mirrors pass.
- Real Chrome QA passes landscape 1180×820, portrait 820×1180, wide-short
  1180×520, and reduced motion with zero unexpected page errors/failed requests.
- Full-size screenshots cover splash, arrival, partial trace, completed name,
  stamp, send peak, wrong pickup, correct pickup, finale, and responsive states.
- An independent adversarial ART DIRECTOR reviews assets and screenshots; all
  BLOCKER and MAJOR findings are resolved before handoff.
- Status remains `beta` until the target child succeeds on a real iPad.
