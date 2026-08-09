# Rhythm Copycat — production game design

**Concept:** `../01-game-concepts/rhythm-copycat/brief.md`
**Replaces:** `games/rhythm-copycat/` beta stub (pattern-continue engine, 👏 emoji art)
**Canonical art-direction label:** Claymation
**Category:** art-music · **Age:** 4–6 · **Status target:** live

## Product promise

*Rhythm Copycat is a body-percussion band for little hands.* A clay kitten
conductor (Kiki) plays CLAP, STOMP, TAP and SHAKE beats on a cozy clay stage;
the child listens, then copies the beat back in time by tapping big clay pads.
No reading, no losing — every beat ends in a song and a cheer.

This is the platform's first **timed** rhythm game: the pattern-continue stub
only asked "what comes next" as a sequence puzzle. Real beat timing (a
metronome cursor, beat windows, tempo ramp) is the new capability this game
makes real, on top of the shared pose-actor system (stage/pose-sprite-dom.js).

## Screen map

```
Splash ──▶ Pick a Beat ──▶ Play (demo → copy → song replay) ──▶ End
   ▲            ▲                    │                            │
   └────────────┴────────────────────┴────────────────────────────┘
        home = catalog      back = pick-a-beat        again = pick-a-beat
```

1. **Splash** — clay world stage: teal wall, wood table, clay props, Kiki
   peeking. Clay title lockup (generated art, spell-checked). Two mode cards.
   Home button (→ catalog) top-left, sound top-right. Theme: `--qk-accent`
   coral `#f25f5c`.
2. **Pick a Beat** — three clay beat cards, each previewing its pattern as
   colored dots (data-driven composition from real clay dot sprites). Tap a
   card to select (it pops), tap big START. Back → splash. Voice: "Pick a
   beat!"
3. **Play** — stage scene. Kiki stands center-table with the beat tray above
   her. Four clay action pads across the bottom (icon-only + small HTML
   caption). Two phases per round:
   - **Demo:** "Listen!" — Kiki performs each beat in time; sounds play; the
     tray slot lights and its pad glows as it sounds.
   - **Copy:** "Now you copy it!" — a walking cursor counts the slots; the
     child taps pads. Correct pad → sound, slot fills, Kiki does a mini-pose,
     cursor advances. Wrong pad → gentle wiggle + spoken nudge. Missed slot →
     replay + highlight, then auto-complete together (never a dead end).
   - **Song replay:** the finished pattern plays back once with Kiki dancing —
     "Listen to our song!" — then next round (longer/faster).
4. **End** — after 5 rounds: Kiki celebrate pose, confetti + tada, 1–3 stars
   filled by first-try accuracy, spoken star line, PLAY AGAIN / PICK A BEAT /
   HOME (back semantics: play/end back → splash).

## Modes (one skill each)

| id | title | skill | tempo | patterns | rounds |
|---|---|---|---|---|---|
| `clap-stomp` | Clap & Stomp | copy 2–3 beat percussion patterns | 66 BPM | 2→3 beats, pads clap/stomp/tap | 5 |
| `drum-circle` | Drum Circle | copy 3–4 beat patterns at speed | 78 BPM | 3→4 beats, all four pads | 5 |

Pattern generation is seeded per game (mulberry32) so `QLOBE_DEBUG.seed(42)`
reproduces exactly. Tempo ramp within a mode: +6% per round after round 2,
capped at the mode ceiling. Every round's pattern differs from the previous.

## Core loop (exact, 30–90 s per mode)

```
pick card → START → demo(pattern) → copy(pattern) → replay-song(pattern)
   → next pattern (longer) ×5 → end screen → again
```

Copy phase timing model (the heart of the game):

- `beat = 60000 / bpm` (66 → 909 ms, 78 → 769 ms).
- Slot `i` is *armed* from `t_i = roundStart + i·beat` until
  `t_i + beat + 400 ms` grace.
- Tap while armed: correct pad → advance; wrong pad → wiggle, hint line
  (throttled to one per 2.5 s), slot stays armed.
- Slot expires armed: replay the slot's sound, flash its pad 600 ms, re-arm
  for one extra beat. Second expiry: auto-fill with "Let's do it together!"
- First-try accuracy = slots filled on the first arm ÷ total slots →
  stars at end (≥80% = 3, ≥55% = 2, else 1). Stars are always earned, never
  denied loudly.
- Vibration (where available): light 30 ms tick on pad activation.

## Spoken script (verbatim, pre-generation)

| key | line |
|---|---|
| `intro` | Rhythm Copycat! |
| `choose-mode` | Choose your mode! |
| `mode-clap-stomp` | Clap and stomp! |
| `mode-drum-circle` | Drum circle! |
| `pick-beat` | Pick a beat! |
| `start` | Let's go! |
| `listen` | Listen! |
| `your-turn` | Now you copy it! |
| `clap` | Clap! |
| `stomp` | Stomp! |
| `tap` | Tap! |
| `shake` | Shake! |
| `good-1` | Great! |
| `good-2` | Nice! |
| `good-3` | Awesome! |
| `oops` | Oops! |
| `nudge-clap` | Try the clap! |
| `nudge-stomp` | Try the stomp! |
| `nudge-tap` | Try the tap! |
| `nudge-shake` | Try the shake! |
| `together` | Let's do it together! |
| `song` | Listen to our song! |
| `round-end` | Yay! You did the beat! |
| `all-done` | You made a song! |
| `stars-1` | One star! Nice! |
| `stars-2` | Two stars! Great job! |
| `stars-3` | Three stars! Amazing! |
| `again` | Play again! |

Action words also double as the pad audio identity — the same recorded word
plays when Kiki demos a beat and when the child plays it.

All lines generated with `qwen3-tts-voiceclone` from the platform teacher
reference (`tools/state/local.json → teacherVoicePath`, seed 8, retry 9),
converted to AAC m4a (+faststart, 64k), Whisper-QA'd against this table.

## Art list

World: **Claymation** — matte modeling-clay forms, fingerprints, hand-pressed
seams, warm studio light, teal wall + warm wood table. One star character:
**Kiki, a ginger clay kitten** with cream muzzle/chest, big amber eyes, black
stubby tail. Sparse props only (maraca, xylophone) — the stage must stay calm
under the tray and pads.

| # | asset | size | renderer / notes |
|---|---|---|---|
| 1 | `splash-bg.webp` | 1600×1200 | opaque WebP, full stage scene w/ props; title zone calm at top-center |
| 2 | `play-bg.webp` | 1600×1200 | opaque WebP, same world, center calm for Kiki + tray |
| 3 | `title.webp` | ~1200×360 | clay letter lockup "Rhythm Copycat", alpha PNG→WebP, ≤150 KB, OCR-checked |
| 4 | `kiki/poses/{neutral,notice,clap,stomp,tap,shake,celebrate}.webp` | 1024×1024 canvas | pose actor pack (manifest `poses.json`), normalized via `pose_actor_assemble.py`, shared scale/baseline, anchor [0.5, 0.95] |
| 5 | `pads/{clap,stomp,tap,shake}.webp` | 512×512 | layered cutouts: clay drum-pads, embossed icon (hands / sneaker / hand-on-drum / maraca) |
| 6 | `tray.webp` | 1200×240 | clay beat tray, 4 recessed wells, transparent ends |
| 7 | `dots/{coral,mustard,teal,lilac}.webp` | 160×160 | clay dots (pad colors), transparent |
| 8 | `ui/card.webp` | 640×720 | clay beat-card panel (transparent rounded panel) |
| 9 | `ui/badge-clap.webp`, `ui/badge-drum.webp` | 256×256 | mode-card icons (two hands / drum circle) |
| 10 | `hub/tiles/rhythm-copycat.jpg` | 640×533 | krea2 menu-game-tile product shot, no text |
| 11 | `og-image.jpg` | 1200×630 | splash-derived capture |
| 12 | `assets/source/*` | — | every raw generation retained |

Deterministic post: alpha floor + trim + normalize canvas + downscale +
WebP encode (`tools/pipeline/cutout_finalize.py` / `pose_actor_assemble.py`),
magenta-composite alpha QA, full-size OCR QA on the title, vision-model QA on
every pose and pad.

## Interaction & feedback rules

- Touch targets ≥ 148×148 px visual; tap via `shared/js/tap.js` (press
  feedback on pointerdown, action on pointerup-over).
- Audio unlock on first gesture (`audio-unlock.js`), kiosk guards installed.
- Wrong tap: pad wiggle (CSS keyframe, `prefers-reduced-motion` no-op),
  quiet "Oops!" + action nudge, never a penalty, never a "Game Over".
- Idle re-prompt once per long pause (`idle-nudge.js`), voice-driven.
- Celebration: `celebrate.js` tada + burstConfetti on round and end screens.
- Portrait + landscape layouts; safe-area insets; `prefers-reduced-motion`
  disables wiggle/pop/confetti motion (poses still swap).
- Progress: 5 dots top-center (hud.js `progressDots`).

## Shared modules used / made stronger

`sfx.js` (UI pops + tada), `voice-clips.js` (recorded teacher voice w/ Web
Speech fallback), `tap.js`, `audio-unlock.js`, `hud.js`, `celebrate.js`,
`idle-nudge.js`, `debug-harness.js` (`installDebug({onSeed, timers})`),
`timers.js`, `rng.js` (mulberry32), `preload.js`,
`stage/pose-sprite-dom.js` (Kiki pose actor — proof of a 8-pose custom
vocabulary pack driving timed gameplay; `stage/pose-pack.js` untouched).

Body-percussion samples are synthesized deterministically in
`js/percussion.js` (WebAudio: clap = noise burst + bandpass + double echo;
stomp = low sine thump + click; tap = short wood knock; shake = modulated
shaker noise). Zero bytes, no 404s, identical cross-platform.

## QLOBE_DEBUG surface

- `seed(n)` — reseeds rounds.
- `fastTimers()` — scales beat/tempo (timers group) for smoke tests.
- `skipTo(key)` — `demo|copy|replay|end` phase jumps.
- `bpm(n)` — override tempo; `pads()` — flash each pad once for layout QA.

## Privacy / permissions / persistence

No network at runtime (GA4 platform tag only), no mic, no storage, no
accounts. Static site, offline-capable after first load.

## Departures from brief/mockups (with reasons)

1. **Mockups have no character; brief asks for an animal guide.** Kiki the
   clay kitten is added as the performer — the brief's "expressive animated
   animal character acting out the actions on a stage" wins over the
   handprint-only mockup screens. Claymation label follows the brief (the
   `kawaii-redesign/` set is recorded but not used).
2. **Pad captions (CLAP/STOMP/TAP/SHAKE) are real HTML text**, not baked
   art — functional text stays HTML; icons carry pre-reader meaning.
3. **Beat cards are data-driven compositions** (card sprite + real clay dots
   + pad icons), not three generated screenshots — patterns are generated at
   runtime from the same seeded RNG that plays them, so what you preview is
   exactly what you copy.
4. **No countdown/score pressure.** Stars derive from first-try accuracy but
   every run reaches the full 5-round song; losing states do not exist.
5. **Timed copy replaces "tap the next card".** The stub's sequence-only
   pattern-continue cannot express rhythm; the metronome cursor makes the
   beat audible and copyable for a pre-reader.

## Known risks & release gates

- **Pose identity drift across 7 generations** → reference-image edits from
  one accepted neutral; vision QA every pose against the neutral; reroll on
  face/marking mismatch (ladder 42 → 1337 → 9001 → 7).
- **Timing feel** → beat width tuned in real-device playtest; grace (400 ms)
  and one extra re-arm keep it forgiving; smoke QA asserts no stuck states.
- **Voice line mismatch** → Whisper QA all clips; omit + fall back to
  device speech on rejection.
- **Title letters malformed** (AI typography) → OCR + vision full-size check,
  reroll until every letter is clean.
- Release gate: hub tile curated, 0 console errors, 0 404s, portrait +
  landscape visual pass, reduced-motion pass, adversarial art-director sign-off.