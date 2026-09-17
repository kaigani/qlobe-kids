# Snack Addition Stories — production game design

**Status:** beta pending a real-child iPad playtest
**Audience:** ages 4–6
**Category:** Math & Number Sense
**Canonical art direction:** Kawaii
**Replaces:** the registered `tap-count` emoji prototype at this same id and
route

## Product promise

Snack Addition Stories makes “addition means putting together” visible. A
child hears a tiny picnic story, sees one group already waiting, personally
brings a second group to the same tray, and chooses the total. The solved
equation appears only after the physical story is complete. There is no timer,
score, loss state, or penalty.

The production game contributes a reusable interaction pattern to the platform:
two visibly separated addends become one countable set while a stable debug
surface can drive the same child-facing handlers.

## Why this is custom

The retired prototype used `tap-count` to collect a target quantity. That loop
could narrate an addition sentence, but it could not preserve two addends,
stage an arriving group, model a completed equation, offer three totals, or
support two-sided free composition. This build remains a small vanilla DOM game
and reuses platform audio, timing, input, navigation, preload, celebration, RNG,
and debug modules rather than changing the generic engine contract.

## Learning goals

Each mode has one primary job:

- **Berry Stories:** understand an addition story as two groups joining.
- **Snack Counter:** coordinate one-to-one adding with a spoken total.
- **My Picnic:** explore how changing either addend changes the total.

All authored problems stay within six so individual objects remain visually
separable at tablet scale. The spoken story precedes symbolic notation.

## Screen and navigation map

```text
catalog
  → splash / mode choice
      → Berry Stories
          → story select: Berry Friends | Fruit Picnic | Cracker Stack
              → guided round × 5 → mode finale → again | choose another
      → Snack Counter
          → practice round × 5 → mode finale → again | choose another
      → My Picnic
          → open composition → optional celebration → continue
```

Home appears only on the splash and returns to the catalog. Back appears on
every deeper screen and returns one meaningful level: play to the relevant
chooser, story select to splash, and finale to splash. Sound always repeats the
current spoken instruction or equation.

## Core state model

### Guided story

```text
stage
  first addend visible on the left side of the tray
  second addend visible as one large staging target
    → child taps staging group
arrive
  complete second group arcs/bounces onto right side
    → three answer cookies appear
answer
  wrong → cookie wobble → “Let’s count together” → snacks pulse 1…total
  correct → solved equation on same tableau → sun cheers → Next
```

The addends never overlap. Color and a plus marker reinforce grouping without
requiring the child to read. The answer rail contains exactly three large
choices, always including the total and two plausible nearby quantities.

### Snack Counter

Counter uses the same tray and answer model, but each member of the second
addend is its own staging target. A tap moves one snack; the answer rail opens
only when every waiting snack has joined the tray. This makes one-to-one
correspondence the motor task without turning a missed target into failure.

### My Picnic

Two forgiving tray halves sit around a live plus sign. A six-item picture
palette selects the current snack. Tapping a tray half adds one; tapping a
placed snack removes it. The equation updates immediately and a quiet limit of
six protects count readability. “Celebrate” is available for any non-empty
composition and returns to the same editable tableau after its payoff.

## Authored content

Every guided theme contains the same conceptual ramp, expressed with different
food silhouettes:

| Round | Equation | Total |
| --- | --- | ---: |
| 1 | 1 + 1 | 2 |
| 2 | 1 + 2 or 2 + 1 | 3 |
| 3 | 2 + 2 | 4 |
| 4 | 3 + 2 | 5 |
| 5 | 3 + 3 | 6 |

`config.json` is canonical for all three theme recipes, five counter recipes,
food grammar, UI copy, and the complete verbatim spoken script. Audio
`lines.json` must exactly mirror `config.voice`; this avoids maintaining a
second script that can silently drift.

## Visual world

The game lives in an original Kawaii picnic-bakery world: soft-vinyl snack
characters, frosted-cardboard surfaces, cream piping, cocoa outlines, and a
strawberry-pink/lavender/mint/butter-yellow palette. A quiet sky-and-gingham
backdrop frames a single mint tray. The mockups set the surface-quality bar;
the game keeps their prompt → tray → answer hierarchy while making every
quantity and label live.

Primary visible art is authored raster media. CSS supplies responsive layout,
transparent hit geometry, focus rings, live type, transforms, and particles;
it does not draw food, tray, title, cards, plaques, guide, or scenery.

| Child-facing object | Visible renderer | Interaction substrate |
| --- | --- | --- |
| Picnic world | 4:3 GPT Image 2 WebP plate | full-screen background layer |
| Title | transparent GPT Image 2 WebP lockup | semantic splash heading/alt |
| Eight snacks | masked GPT Image 2 WebP sprites | buttons inside group zones |
| Tray | transparent GPT Image 2 WebP | two responsive group regions |
| Story/answer/action surfaces | transparent GPT Image 2 WebPs | buttons with live HTML text |
| Sun guide | idle/cheer GPT Image 2 WebPs | non-blocking feedback layer |
| Hub tile | Krea 2 Toy Table JPEG | catalog link |

The repository cutter is mandatory for all contact sheets. Crop receipts,
masks, source masters, prompts, magenta plates, and final hashes are kept under
`assets/source/` and documented in `ASSETS.md`.

## Motion and feedback

- Pressed targets compress a few percent and release with a soft pop.
- The second group moves in one readable 350–500 ms beat; reduced motion swaps
  this for a near-instant fade.
- Wrong choices never flash red or remove options. The chosen cookie gently
  wobbles while the stable tray becomes the explanation.
- Correct choices lift, the equation resolves, the same snacks pulse once in
  counting order, the sun changes pose, and restrained confetti stays clear of
  the equation.
- Idle nudges first replay the relevant spoken cue, then pulse only the next
  meaningful target.

## Audio

The approved teacher reference is cloned offline with
`qwen3-tts-voiceclone`, encoded as AAC/M4A with `+faststart`, and checked in a
separate `whisper-stt` batch. Seeds 7, 8, and 9 form the retry ladder. A clip
that fails transcript QA is omitted so correct device speech can take over.

`mug-and-sunbeam.mp3` plays quietly through the shared BGM controller after the
first real gesture. Narration ducks music. The shared audio-unlock fan-out opens
voice, speech, effects, and BGM together. Mute affects every channel.

## Child interaction and accessibility

- All meaningful targets are at least 96 CSS pixels at supported tablet sizes.
- Core play is understandable from pictures, motion, and narration; live text
  supports grown-ups and emerging readers but is never the only cue.
- Buttons have specific accessible names; the current prompt/result uses a
  polite live region; keyboard activation follows the same handler as touch.
- Pointer/tap handlers tolerate a small move and do not strand an interaction.
- Focus is high contrast but does not add a competing illustration.
- Portrait, ordinary 4:3 landscape, 1180×520, 844×390, safe areas, and reduced
  motion are explicit QA states.

## Shared platform systems

The game consumes the shared screen router, voice clips and speech fallback,
narrator, BGM, SFX, audio unlock, timers, idle nudger, tap helper, deterministic
RNG, image preload, celebration, and debug harness. Runtime is static and makes
no LAN, model, analytics-media, or authoring call.

## `QLOBE_DEBUG` v1

The semantic QA surface exposes:

- `ready`, `listModes`, deterministic `startMode`, `home`, and `mute`;
- serializable state including screen, theme/mode, phase, addends, total,
  round, placed count, and free-play groups;
- truthful current targets collected from the live DOM;
- `tap` through the same handler used by child input;
- `winRound` through real add/answer/celebration paths;
- deterministic `seed`/`onSeed`, grouped fast timers, audio log controls, and a
  serializable viewport/target layout report.

## Deliberate departures

- **From the old prototype:** remove the generic basket, emoji placeholder,
  collect-total interpretation, single mode, and speech-only media path.
- **From the concept mockups:** live HTML supplies prompts, equations, numerals,
  and changing labels; the illustrated surfaces remain raster. This preserves
  responsiveness and exact math rather than baking one example into a screen.
- **From the concept video:** discard generated fake OS chrome, illegible menu
  text, scores, and five simultaneous number buttons. Use the platform HUD and
  three discriminable answers.
- **From the brief:** “Berry Stories” opens a three-theme chooser, while
  Counter and My Picnic are peer modes on the splash. This makes all promised
  loops visible without turning story topics into unrelated games.

## Privacy and resilience

No microphone, camera, account, network, or persistent child data is required.
Failure of recorded audio falls back to device speech. Failure of BGM or an
optional effect cannot block play. Asset preload resolves the debug-ready gate,
but a missing decorative image never changes arithmetic state.

## Release gate

The game remains beta until all of the following hold:

1. every round and all three modes complete through child-facing handlers;
2. voice manifest entries that ship pass Whisper QA and a real clip plays after
   a gesture;
3. zero new repository-validator errors, console errors, failed requests, or
   case/path mismatches;
4. local and production Chrome smoke suites pass landscape, portrait,
   wide-short, reduced-motion, wrong-answer, and fallback states;
5. the adversarial art review scores at least 9/10 with no blocking failure;
6. a real child completes the first guided round on an iPad without coaching.
