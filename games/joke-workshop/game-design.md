# Joke Workshop — production game design

## Product promise

Build a tiny joke, step into the spotlight, and make a friendly paper audience
giggle. Joke Workshop is a touch-first comedy studio for ages 5–8: a child
chooses a setup, picks an illustrated punchline or records an original ending,
then automatically launches an audience-panel performance and saves picture
jokes in a personal on-device Joke Book.

The primary skill is understanding that a joke has a setup and a surprising
ending. Picture punchlines make the loop playable without reading; a microphone
path lets children invent and perform an ending aloud.

## Why this replaces the prototype

The former `choose-one` prototype was a useful listening quiz, but it rendered
every child-facing object as browser emoji, used Web Speech for every line, and
ended after finding one fixed correct answer. It did not deliver the brief's
workshop fantasy, audience payoff, Comedian Stars, or persistent Joke Book.

This production replacement keeps the existing `joke-workshop` route and
content concept, but uses a custom screen flow. It treats every chosen ending as
performable. Picture and recorded endings receive an audience response matched
to the kind of ending; humor creation is not a test.

## Modes

Joke Workshop has one coherent workshop loop with two age-scaled construction
paths instead of two disconnected quiz modes.

| Path | Skill | Interaction |
| --- | --- | --- |
| Picture Punchlines | hear a setup and anticipate a surprising ending | choose one of three illustrated paper cards |
| Record My Own | compose and share a short original ending aloud | tap the paper microphone, count down 3–2–1, then record until tapping again |

Both paths lead to the same stage, reward, and replay loop. Picture endings are
also saved in the on-device Joke Book; recorded endings stay in the active
performance session.

## Screen map and navigation

```text
hub → splash
splash Home → hub
splash big play ticket → joke deck
splash Joke Book → joke book
joke deck card → punchline builder
builder picture selection → stage performance
builder microphone → countdown → recorded stage performance
stage Next Joke → joke deck
stage Joke Book → joke book
joke book saved joke → stage replay
deck / builder / stage / book Back → splash
```

Home exists only on the splash. Every other screen uses Back and returns to the
game splash, matching the platform navigation contract.

## Core 30–90 second loop

1. Pick one of three large topic cards: Bear, Banana, or Ghost.
2. Hear the setup aloud while it appears on a cream paper panel.
3. Pick a picture ending, or tap the paper microphone and record an original ending after the 3–2–1 countdown.
4. See the chosen ending or “My punchline!” placed in the workshop marquee.
5. Watch the neutral audience panel transition to a laugh or confused reaction
   video after the setup and punchline, then see the Comedian Star reward and
   confetti.
6. Earn one Comedian Star after the audience responds. Picture endings are
   saved in the Joke Book; recorded endings can be replayed while that
   performance remains open. Then choose another joke or replay a saved one.

No answer blocks progress. Picture and recorded endings receive a distinct
audience response; the narrator only speaks the setup and the chosen punchline.

## Joke set

### Bear joke

- Setup: “What do you call a bear with no teeth?”
- Classic: “A gummy bear!”
- Alternates: “A sleepy bear!” and “A dancing bear!”
- Performer: a cheerful paper gummy bear.

### Banana joke

- Setup: “Why did the banana go to the doctor?”
- Classic: “Because it was not peeling well!”
- Alternates: “Because it wanted a banana split!” and “Because it called on
  the banana phone!”
- Performer: a lively paper banana with a tiny bandage.

### Ghost joke

- Setup: “What do ghosts eat for breakfast?”
- Classic: “Boo-berries!”
- Alternates: “Ghost toast!” and “Moon cereal!”
- Performer: a friendly paper ghost with a blueberry breakfast bowl.

All included and saved content is positive, non-offensive, and local to the
device. Recorded child audio plays only on the device; it is never uploaded,
moderated remotely, or shared by the game.

## Complete spoken script

Every fixed line ships as a recorded comedian-voice clip generated from the
project's authorized `voice-comedian.wav` reference. `voice-clips.js` falls back
to the exact authored text through Web Speech if a recording cannot play, while
the recording instruction uses local Web Speech because that line is new. The
reproducible Qwen voice-clone and Whisper transcript-QA
pipeline remains in `tools/gen-voice.py`; all 26 fixed authored clips passed its gate.

- `welcome`: “Welcome to Joke Workshop! Pick a joke, build a punchline, and make the crowd giggle.”
- `choose-joke`: “Pick a joke card.”
- `bear-label`: “Bear joke.”
- `banana-label`: “Banana joke.”
- `ghost-label`: “Ghost joke.”
- `bear-setup`: “What do you call a bear with no teeth?”
- `banana-setup`: “Why did the banana go to the doctor?”
- `ghost-setup`: “What do ghosts eat for breakfast?”
- `record-ending`: “Pick a picture punchline, or tap the microphone to record your own.” (Web Speech fallback; no fixed clip yet)
- `bear-gummy`: “A gummy bear!”
- `bear-sleepy`: “A sleepy bear!”
- `bear-dancing`: “A dancing bear!”
- `banana-peeling`: “Because it was not peeling well!”
- `banana-split`: “Because it wanted a banana split!”
- `banana-phone`: “Because it called on the banana phone!”
- `ghost-berries`: “Boo-berries!”
- `ghost-toast`: “Ghost toast!”
- `ghost-moon`: “Moon cereal!”
- `next-joke`: “Pick another joke.”
- `book-intro`: “This is your Joke Book. Tap a joke to perform it again.”
- `book-empty`: “Your Joke Book is waiting for its first joke.”
- `deck-nudge`: “Which joke should take the stage?”
- `builder-nudge`: “Choose a silly ending, or make your own.” (legacy clip retained for compatibility)

## Art direction

Canonical world: **Papercraft**. Current Studio style id: `paper-garden`.

The visual north star is the concept's saturated cut-paper comedy club: deep
navy cardstock, ruby curtains, amber spotlights, a warm wood-paper stage, jewel
colored ticket cards, visible paper fibers, scissor-cut edges, stacked layers,
and soft tactile shadows. The child-facing foreground must use the same material
language as the backdrop; no emoji, SVG illustration, CSS-drawn cards, or
generic gradient-button artwork ships in the production pass.

Functional text remains HTML over authored blank paper furniture so spelling,
accessibility, scaling, and localization stay reliable. CSS supplies layout,
hit areas, focus, transforms, responsive cropping, and animation only.

## Production art list

| Asset | Final target | Visible renderer | Interaction substrate |
| --- | ---: | --- | --- |
| Comedy-stage plate | 4:3, about 1600×1200, ≤300 KB WebP/JPEG | opaque GPT Image 2 papercraft scene | full-screen background layer |
| Audience reaction panel | 16:9 WebP neutral poster plus local MP4 laugh/confused videos | supplied papercraft audience stills and reaction animations | stage performance panel |
| Joke Workshop title lockup | transparent WebP/PNG, ≤150 KB | generated cut-paper lettering, spelling checked | accessible image on splash |
| Topic/answer character sheet | 12 transparent paper cutouts, 30–80 KB each | GPT Image 2 coordinated contact sheet, deterministic crops | topic and punchline card `<img>` elements |
| Paper UI furniture sheet | topic cards, choice cards, question panel, speech plaque, and three CTA backings | GPT Image 2 coordinated blank-object sheet, deterministic crops | HTML buttons/panels with real text overlay |
| Recording microphone | transparent paper-craft vintage chrome microphone | built-in image generation with magenta chroma-key removal | direct-record button |
| Comedian Star | transparent PNG/WebP, 30–80 KB | Studio `prop-cutout` Krea → Qwen Layered chain | persistent counter/reward animation |
| Hub tile | 640×533 JPEG | Studio `menu-game-tile` Krea source, hand-curated | root catalog tile |
| Voice set | 26 local mono 24 kHz M4A clips; Web Speech for the recording prompt and resilient fallback | reproducible Qwen comedian-reference clone + Whisper QA script | `voice-clips.js` |
| Rimshot/applause | zero-file WebAudio percussion/noise design | sound only | timed stage payoff |
| Confetti | shared celebration particles | DOM effect | reduced-motion-aware ambience |

Original generations, reproducible prompts, model/workflow identifiers, and
accepted local recipes stay in `assets/source/` and `PROMPTS.md`. Runtime makes
no model, generation, upload, or content-service call; the standard platform
analytics tag remains shared with the rest of the catalog.

## Interaction and feedback rules

- Every primary child control is at least 96 CSS pixels in its touch layout.
- `onTap` owns the single pointer/keyboard activation path.
- First real gesture unlocks voice, speech, SFX, and the custom stage-audio
  context; visibility restoration reopens audio on iPadOS.
- Topic and punchline cards announce themselves when selected. Selection is
  visually obvious through a paper halo/raised transform and `aria-pressed`.
- Picture punchline cards perform immediately when tapped.
- The microphone requests local access, shows a 3–2–1 countdown, records until
  tapped again or the 15-second safety limit, and performs the captured audio
  locally.
- Stage beats are cancelable when navigation changes. The neutral audience is
  shown first; a classic ending or child recording plays the local
  audience-laugh video, while an alternate ending plays audience-confused.
  Reduced motion keeps the neutral audience panel static and suppresses
  confetti.
- An idle nudge speaks once after six seconds, then at a relaxed repeat interval;
  there is no countdown or nagging.
- Mute gates recorded voice, fallback speech, audience-video audio, and
  interaction SFX together.

## Joke Book, privacy, and resilience

The game stores picture entries as `{ setupId, punchlineId, createdAt }` and an
integer star count in `localStorage`. Recorded original punchlines stay in the
active browser session only; microphone audio is never uploaded or added to the
Joke Book. Storage exceptions fall back to an in-memory session without
interrupting play. There is no account, camera, external content, or runtime
content API call.

## Responsive behavior

The art plate crops from center while keeping the stage focal area visible.
Landscape uses three cards across, matching the 4:3 mockups. Portrait uses a
single horizontal card rail or stacked two-column choices, keeps the centered
microphone below the three picture choices, and leaves controls above safe-area
insets. Large text may wrap inside the authored paper panels without scaling the
hit area.

## Shared systems

- `shared/js/audio-unlock.js`
- `shared/js/celebrate.js`
- `shared/js/debug-harness.js`
- `shared/js/idle-nudge.js`
- `shared/js/preload.js`
- `shared/js/rng.js`
- `shared/js/screens.js`
- `shared/js/sfx.js`
- `shared/js/speech.js`
- `shared/js/tap.js`
- `shared/js/timers.js`
- `shared/js/voice-clips.js`
- shared HUD sprites and Fredoka

No new shared capability is required; the custom orchestration remains local to
the game.

## `QLOBE_DEBUG` v1

The debug surface exposes `ready`, `gameId`, screen/mode state, target
collection, deterministic seed, mute, fast timers, navigation helpers, joke
selection, picture/record selection, punchline launch, stage completion, book
state, and storage reset. QA must be able to traverse every screen and all three
topic paths without synthetic DOM clicks that bypass production handlers.

## Explicit departures

- **From the old beta:** the two quiz modes become one workshop loop with two
  construction paths. This matches the concept's product promise and avoids a
  separate knock-knock quiz that the final mockups do not show.
- **From the brief:** picture selection auto-performs. Direct selection keeps the
  anticipation beat short and makes the choice legible for young children.
- **From the mockups:** functional labels are HTML over blank authored paper,
  not baked into images. This preserves exact copy and responsive access.
- **From fixed-answer quiz logic:** all endings perform and receive equal warmth;
  invented humor is not treated as a wrong answer.
- **From the concept age range 3–8:** catalog metadata targets 5–8, matching the
  platform's core audience and the optional oral-storytelling path. The picture
  path remains usable by younger children with a grown-up.

## Risks and release gate

- Generated title lettering and each contact-sheet cell must be inspected at
  full size; malformed text, merged props, or material drift is a reroll, not a
  cleanup excuse.
- Microphone permission, countdown, and recorded-clip failure recovery must leave
  the child with a clear retry path; every prompt also remains visible as HTML.
- The game may be promoted to `beta` only after automated landscape, portrait,
  reduced-motion, persistence-reload, replay, navigation, microphone-request,
  console, recorded-clip, and recording countdown checks pass in
  production Chrome.
- `live` still requires a real iPad child playtest and maintainer sign-off.
