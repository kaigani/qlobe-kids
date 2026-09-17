# Secret Message Copy - production game design

## Product promise

A child joins Pip the Owl Courier in a warm watercolor post office, copies one
small secret at a time, and personally delivers it to the moonlit owl door.
The three envelopes offer distinct but related skills: careful visual copying,
uppercase letter formation, and short visual memory. The fantasy stays playful
and understandable without reading.

- **Audience:** early learners ages 3-7
- **Category:** `writing-fine-motor`
- **Canonical art direction:** Watercolor / Storybook
- **Route:** `games/secret-message-copy/`
- **Release status:** beta until an observed child tablet playtest
- **Session shape:** four messages per chosen envelope, with a delivery reward
  after every message and a larger final cheer

There is no score, countdown, loss state, lives system, or punishment for a
miss. Spoken prompts, picture-led controls, the glowing next place, and Pip's
reactions carry the experience.

## Concept synthesis and replacement scope

This production build deliberately combines the strongest promises from both
source artifacts:

- The brief's ruled handwriting paper, dotted uppercase guide, touch tracing,
  live ink, word reveal, spoken decoding, and celebration.
- The mockups' three sealed-envelope selection, star/moon/heart picture code,
  tactile stamp buttons, teal study backdrop, and authored owl-delivery scene.

It replaces the old generic `build-assemble` letter-card stub at the same id
and route. A custom DOM/Canvas runtime is warranted because the shipped game
needs three mechanics, a hide-and-recall phase, resumable multi-stroke
handwriting, and the courier reward arc. Shared QLOBE modules still own screen
routing, narration, recorded voice, audio unlock, taps, HUD controls, timers,
nudging, celebration, background music, sound effects, preload, seeded random,
and the debug contract.

## Screen map

```text
QLOBE catalog
     |
     v
sealed-envelope splash
  | star            | heart              | moon
  v                 v                    v
Picture Code     Secret Words        Moon Memory
  | copy taps       | trace letters      | watch -> hide -> copy
  +-----------------+--------------------+
                    |
                    v
        authored delivery tableau
          | next message
          | final: replay same envelope
          + back: envelope splash
```

1. **Envelope splash:** a raster title lockup, Pip at the desk, and three large
   sealed envelopes. The star, heart, and moon seals are the mode language.
   Home returns to the catalog; sound is the only other control.
2. **Play:** one ruled parchment sheet is the calm focal surface. Four wax seals
   at the top communicate session progress. Back returns to envelope choice.
3. **Delivery:** the desk gives way to a moonlit woodland post-office door.
   Pip arrives with the letter, confetti falls, and the next/replay plaque is a
   physical raster sign. The final delivery swaps to Pip's wings-up cheer.

Home appears only on the splash. Play and reward use in-game Back so a child
does not accidentally leave the experience. Sound remains available on every
screen.

## Modes and authored content

| Envelope | Mode | Rounds | Child action | Skill |
|---|---|---:|---|---|
| Gold star | Picture Code | 4 | Copy a visible 3-5 stamp sequence from left to right | visual discrimination and sequencing |
| Red heart | Secret Words | 4 | Trace each uppercase letter in SUN, CAT, MAP, or OWL | letter formation and fine-motor control |
| Blue moon | Moon Memory | 4 | Watch a 3-4 stamp sequence, wait for the vellum flap, then reproduce it | visual working memory |

The four authored rounds in a mode are seed-shuffled at session start. Seed 42
is the reproducible default for QA; the platform debug seed can choose another
deterministic order. No mode is locked.

### Picture Code

The target row remains visible. The child chooses from three oversized raster
stampers. Correct stamps land in the next outlined circle and make a soft pop.
A wrong stamp merely rocks, the expected target glows, and Pip repeats the
gentle clue. Progress never moves backward.

### Secret Words

The complete three-letter word is visible at the top of the page so this is
genuine copying rather than a guessing task. One letter at a time appears as a
dotted Canvas guide with a golden start dot. The child lays down deep blue ink.
Each letter is an authored normalized path; S, U, N, C, A, T, M, P, O, W, and L
are supported.

The tracer accepts one primary pointer, uses a forgiving 0.12 normalized
corridor, and requires 94 percent ordered path coverage plus arrival near the
endpoint. It searches only a short distance ahead, so a tap or diagonal jump
cannot complete a letter. Multi-stroke letters advance stroke by stroke.
Lifting preserves earned progress and moves the golden continuation cue to the
saved point. Resize and rotation redraw from normalized progress instead of
erasing the child's work.

Pointer cancel, window blur, screen changes, and teardown always release
capture. Enter or Space on the focusable trace surface runs the same accepted
completion path as a switch-access alternative.

### Moon Memory

The code stays visible for 2.2 seconds, then a translucent parchment flap
covers it and the stampers unlock. A miss does not reset the sequence. The flap
briefly peeks open, then returns to copy mode at the same position. Reduced
motion keeps a useful observation interval and removes decorative travel
without shortening the learning task into a flash.

## Feedback and pacing

- The current destination is gold; future slots are quiet blue-gray.
- Correct actions use a soft shared pop and visible placement/ink.
- Misses use a small physical rock plus one spoken clue, never a red X,
  buzzer, score deduction, or restart.
- An idle nudge arrives only after time to explore. Word mode models the path;
  symbol modes glow the next clue.
- Completing a message briefly lets Pip cheer on the desk, then transitions to
  the authored woodland delivery tableau.
- Reward narration is sequenced rather than overlapped. Word deliveries spell
  and name the copied word before the delivery line.
- The final round uses the wings-up owl, a larger celebration, the final cheer,
  and a dedicated replay plaque.
- Quiet `quirky-forest-adventure.mp3` starts only after the first real
  gesture, loops through the shared BGM controller, ducks under narration, and
  follows the global sound toggle.

## Art inventory

All primary visible world art is raster. HTML and CSS provide responsive
placement, hit areas, text semantics, focus, and lightweight feedback only;
they do not draw substitute illustration.

| Purpose | Raster files |
|---|---|
| Worlds | `backdrop-desk.webp`, `backdrop-delivery.webp` |
| Identity | `title-lockup.webp` |
| Courier states | `owl-neutral.webp`, `owl-carry.webp`, `owl-cheer.webp`, `owl-guide.webp` |
| Mode invitations | `envelope-star.webp`, `envelope-heart.webp`, `envelope-moon.webp` |
| Play props | `paper-sheet.webp`, `stamp-star.webp`, `stamp-heart.webp`, `stamp-moon.webp` |
| Reward props | `seal-burst.webp`, `button-next.webp`, `button-replay.webp` |
| Navigation | `nav-home.webp`, `nav-back.webp`, `nav-sound.webp`, `nav-muted.webp` |
| Catalog | `assets/hub/tiles/secret-message-copy.jpg` |

The production art preserves the mockup's teal botanicals, golden lamplight,
aged parchment, navy-and-brass courier uniform, tactile sealing wax, and
woodland door. Generated transparent assets were prepared through the QLOBE
asset cutting/finalization process. Missing game art has a local raster
fallback; no emoji, SVG illustration, CSS-drawn physical prop, or runtime image
service is required.

## Spoken script

| Key | Exact child-facing line |
|---|---|
| `welcome` | A secret message is waiting. Choose an envelope! |
| `picture-intro` | Start on the left side. Copy each picture to the right. |
| `word-intro` | Trace each letter to copy the secret word. |
| `memory-intro` | Watch the moon code. When it hides, copy it from memory. |
| `nudge` | Almost! Follow the glowing clue. |
| `trace-nudge` | Start at the golden dot and follow the dotted letter. |
| `correct` | Perfect copy! |
| `delivered` | Message delivered! |
| `cheer` | You delivered every secret message! |
| `word-sun` | The letters are S, U, N. They spell sun, like sunshine. |
| `word-cat` | C. A. T. The word is cat, like a kitty cat. |
| `word-map` | The letters are M, A, P. They spell map, like treasure map. |
| `word-owl` | The letters are O, W, L. A night bird is an owl. Owl. |

Verified local clips are primary. The resumable production script first tries
the approved Qwen voice-clone route. Its explicit approved fallback uses
`en-US-AnaNeural`, records `fallbackFrom` and a host-free reason, normalizes
to mono AAC, and fails closed unless local faster-whisper/base plus codec,
duration, and volume checks pass. Spelling clips have stricter semantic checks
for all three letter tokens in order and the final word. The canonical
`intended` line never changes when a pronunciation-oriented synthesis prompt
is necessary. Device speech remains the runtime fallback for a missing clip.

## Responsive, accessibility, and interaction behavior

- Landscape 1280x800 and portrait 768x1024 preserve the paper, all three
  stampers/envelopes, Pip, progress, and navigation without horizontal scroll.
- Primary controls meet the platform 96 CSS pixel touch floor; the trace
  surface is substantially larger.
- Safe-area variables protect controls around tablet notches and browser UI.
- Every interactive object is a semantic button or focusable Canvas with a
  visible focus treatment and an accessible name.
- Spoken feedback is mirrored through the shared narrator's polite announcer.
- The game prevents accidental image drag, text selection, scrolling, zoom
  gestures, and stranded pointer state while keeping keyboard operation.
- Reduced-motion removes bobbing, arrival travel, long transitions, and moving
  confetti while retaining every cue, state change, voice line, and mechanic.
- A raster load failure swaps to an existing local image; an audio failure
  cannot block input.

## Privacy and offline behavior

Gameplay asks for no permission, captures no microphone or camera input,
stores no child data, and calls no model or media service at runtime. All
production art, voice, and music ship locally. Asset generation, voice cloning,
and Whisper verification are build-time workflows only. Apart from the
platform's existing privacy-conscious analytics, the game produces no remote
request. No child trace is persisted after the page closes.

## QLOBE_DEBUG v1

The debug surface exposes:

- readiness, engine id, mode listing, deterministic seed, and fast timers;
- `getState()` with screen, phase, mode, round, exact target/selection,
  expected input, word/letter, memory phase, wrong attempts, delivered count,
  mute/reduced-motion state, live trace progress, and timer count;
- `startMode(id)`, `chooseInput(id)` / `stamp(id)`,
  `traceCurrent()` / `traceLetter(letter)`, `completeRound()`, and
  reward `next()`;
- real screen-space `tracePoints()`, target collection, memory cover control,
  back-to-splash, and mute;
- voice log, BGM statistics, and SFX statistics.

Debug helpers enter the same runtime handlers as child input. Automated QA
also uses genuine browser clicks and pointer paths so the hooks cannot conceal
a broken visible mechanic.

## Explicit departures from the brief and mockups

- The source brief proposes a broad dashboard of topics and avatars. The route
  instead opens directly on the mockup's three storybook envelopes, keeping the
  decision small and platform navigation consistent.
- The brief centers tracing alone. Picture Code preserves the mockup nearly
  literally, Secret Words restores the brief's handwriting promise, and Moon
  Memory gives the moon envelope a meaningful third skill rather than three
  cosmetic skins.
- The mockup's three envelopes show a single star, moon, and heart. Here the
  seals identify genuinely different activities, all joined by the same copy
  and delivery fantasy.
- The brief calls for solid black ink. Deep postal blue has better harmony and
  contrast in this watercolor world while remaining distinct from the dotted
  guide.
- Generic star counters become wax-seal delivery progress. The same progress
  is communicated, but as an object that belongs in the world.
- The mockup's settings gear is replaced by a direct sound toggle. Home exists
  only at entry; Back preserves in-game progress boundaries.
- The reward is not a generic badge overlay. It is a separate authored
  woodland tableau with carrying and cheering owl states, next/replay props,
  voice, SFX, and motion-reduced equivalents.
- Functional reward type remains HTML for exact spelling, localization,
  accessibility, and live-state changes; every illustrated component remains
  authored raster art.

## Release gates

- Canonical `config.json` loads through the thin `config.js` fetch shim.
- JSON parsing, JavaScript syntax checks, Python compilation, voice manifest
  verification, and `git diff --check` pass.
- Automated browser QA exercises a wrong picture stamp, correct real clicks,
  a hidden-memory miss/peek, real pointer tracing, pointer cancel, keyboard
  tracing, all four rounds of all three modes, next/replay, back, mute/BGM,
  deterministic debug hooks, landscape, portrait, and reduced motion.
- Browser QA reports no console/page errors, missing local response, asset 404,
  or unexpected remote request.
- Visual QA captures splash, miss feedback, settled delivery, hidden memory,
  live trace, final cheer, portrait play, and reduced-motion play. Reward
  captures wait for the courier arrival animation to settle.
- Production is smoke-tested at the final routed URL after registry integration
  and deployment.
- Remaining human gate: observe the intended child on the target tablet to
  confirm that trace tolerance, memory reveal time, and session length feel
  delightful rather than demanding. Status remains `beta` until that pass.
