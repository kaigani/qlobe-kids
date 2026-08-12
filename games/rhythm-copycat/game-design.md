# Rhythm Copycat — production game design (rebuild 3)

Canonical art-direction label: **Kawaii** (sticker/vinyl citrus dialect — the
`tools/kawaii_gen.py` STYLE prefix). Ages 2–4, a deliberate departure from the
platform's 5–6 default: body-percussion echo play is a toddler skill, and the
whole game runs with zero reading and zero fine-motor demands. Recorded in
`game.json` (`age: {min: 2, max: 4}`).

## Why rebuild 3 exists

Attempts 1 (claymation) and 2 (kawaii restyle) shipped a strong asset library
inside a failed composition. The autopsy (2026-08-12) found:

- The splash abandoned the mockup's IA (three beat cards + START) for three
  cramped Play/Levels/Rewards circles colliding with a decor djembe, an HTML
  title overflowing its plaque, and a reading-required subtitle.
- The play screen shrank the four action pads — the game's whole interaction —
  into two small dark rings at the bottom, parked Kiki ON TOP of the sequence
  tray, floated an orphan "Stomp" chip over the board, and replaced the
  mockup's 1:1 icon mapping (beat chip icon == pad icon) with abstract colored
  pop-it wells a toddler cannot decode.
- The generated title lockup sat on an opaque plate (its own ASSETS.md reject
  criterion) and never shipped; pads drifted off-palette (pale cream + dark
  cocoa ring instead of the mockup's vivid bordered pads).

**Rebuild rule: the mockups are the composition.** Screens are rebuilt to the
mockup layouts; the salvaged asset library fills them; every screen must pass a
blind side-by-side against `01-game-concepts/rhythm-copycat/output/ui-mockups/`.

## Product promise

Kiki the kawaii kitten plays a tiny body-percussion beat. Listen, watch, then
copy it back on four big friendly pads — clap, stomp, tap, shake — and every
beat always ends in a song, stars, and a cheer. One skill: **hear a short
rhythm pattern and reproduce its sequence**.

## Modes (the three beat cards)

| id | title | card | actions | patterns |
| --- | --- | --- | --- | --- |
| `drum-beat` | Drum Beat | orange card + djembe badge | clap, stomp | 4 rounds, lengths 2,2,3,4 |
| `jingle-beat` | Jingle Beat | yellow card + tambourine badge | tap, shake | 4 rounds, lengths 2,2,3,4 |
| `parade-beat` | Parade Beat | teal card + woodblock badge | all four | 4 rounds, lengths 2,3,3,4 |

Patterns are seed-shuffled from curated pools (no two identical consecutive
rounds; a round never opens with the same action three times). Completing a
round fills one dot on the mode's card pill; dots persist per session (not
localStorage — a fresh visit is a fresh drum session).

## Screen map & navigation

1. **Splash — "Pick a beat"** (mockup 01). Title lockup art top-center, Kiki
   neutral→notice at left of the card row, three beat cards center, START pill
   bottom-center. Home button (top-left) → catalog. First gesture unlocks
   audio and speaks `intro` + `pick-beat`.
   - Tap a card: it pops (scale bounce), Kiki notices, the card's instrument
     one-shot plays, voice speaks the mode line, START pulses.
   - Tap START (or the selected card again): screens.start → play.
   - Idle nudger: 8s `pick-beat`, then highlight the first card.
2. **Play — "Copy the beat"** (mockup 02). Plaque header (authored art +
   HTML Fredoka line), four action pads mid-band, sequence tray under the
   pads, LISTEN pill bottom-center, Kiki in the left rail (landscape) / above
   the plaque row (portrait). Back button (top-left) → splash. Progress dots
   (round n of 4) top-center via `progressDots`.
   - **Demo phase**: plaque+voice "Listen!"; for each beat: tick, matching
     chip pops into the tray with the ACTION'S icon, the matching pad
     highlights, Kiki swaps to the action pose, percussion one-shot plays,
     voice speaks the action word. Pads are inert (visually calm, not
     greyed) during demo.
   - **Copy phase**: plaque+voice "Your turn!"; tray chips dim to outlines;
     child taps pads in order. Correct: pad bounce + percussion + chip fills
     + tick of praise every round end. Wrong pad: pad wiggles, `oops` +
     `nudge-<action>` voice, Kiki `notice`, no penalty; the second miss on
     the same step makes the correct pad pulse until tapped (modeling, never
     failure). LISTEN replays the demo anytime (child taps it; also the idle
     nudge at 9s replays it).
   - Round complete: `good-N` rotating praise, Kiki `celebrate`, chips
     sparkle; next round after a musical breath. After round 4 → end screen.
3. **End — "Beat complete!"** (mockup 03). End backdrop (podium), Kiki
   `celebrate` center on the podium, three star stickers pop in one-by-one,
   looping gentle confetti (`celebrate.js` ambience), voice `round-end` +
   `stars-3` + `song`. PLAY AGAIN pill → replay same mode; Back (top-left) →
   splash. 8s idle auto-returns to splash (never strands a toddler).

Navigation loop: splash Home→catalog is the only page exit; play/end Back →
splash in-page; end PLAY AGAIN → play (same mode). All via `createScreens`.

## Interaction rules

- Every control ≥96px hit area (pads ~200px, cards ~240px). `onTap` from
  `shared/js/tap.js` everywhere; single `busy` lock during demo playback so
  taps can't corrupt the sequence; pads stay tappable during copy only.
- `installUnlockOnGesture` + `installKioskGuards` once at module scope;
  greeting deferred to `onFirst`. `createNarrator` wraps `voice-clips.js`;
  narrator handed to `createScreens({voice})`.
- Reduced motion: pose swaps instant (pose-sprite-dom handles it), confetti
  no-ops, pad bounce becomes a highlight-only state.
- Portrait and landscape both first-class; layout is a CSS grid that reflows
  (see Layout). Safe areas via `--qk-safe-*` / `.qk-hud-*`.
- No timing windows anywhere: the copy phase is untimed echo. Rhythm feel
  comes from the demo's steady 92 BPM spacing and the child's natural
  imitation, not from a judged tempo.

## Spoken script (verbatim — the recording manifest)

Salvaged clips (already produced + hash-manifested, reused as-is):
`intro` "Rhythm Copycat!", `pick-beat` "Pick a beat!", `choose-mode` "Choose
your mode!" (unused, kept), `start` "Let's go!", `listen` "Listen!",
`your-turn` "Now you copy it!", `together` "Let's do it together!",
`clap` "Clap!", `stomp` "Stomp!", `tap` "Tap!", `shake` "Shake!",
`nudge-clap` "Try the clap!", `nudge-stomp` "Try the stomp!",
`nudge-tap` "Try the tap!", `nudge-shake` "Try the shake!",
`oops` "Oops!", `good-1` "Great!", `good-2` "Nice!", `good-3` "Awesome!",
`round-end` "Yay! You did the beat!", `all-done` "You made a song!",
`stars-3` "Three stars! Amazing!", `song` "Listen to our song!",
`again` "Play again!", `mode-clap-stomp` "Clap and stomp!".

New lines to produce (voice-clone batch, seed 7 → 8 → 9):
- `mode-drum-beat` "Drum beat!"
- `mode-jingle-beat` "Jingle beat!"
- `mode-parade-beat` "Parade beat!"
- `watch-kiki` "Watch Kiki!"

Retired: `mode-drum-circle`, `stars-1`, `stars-2` (no partial stars — a
finished beat is always three stars; files kept on disk, dropped from
lines.json). Fallback text for every key ships in `defaultLines` so Web
Speech covers a missing clip.

## Art list (renderer / substrate split)

Salvaged (visual QA'd against mockups 2026-08-12):

| asset | use | substrate |
| --- | --- | --- |
| `assets/bg/splash.webp` | splash backdrop (music room) | `<img>` full-bleed cover |
| `assets/bg/play.webp` | play backdrop (aqua board field) | same |
| `assets/bg/end.webp` | end backdrop (podium stage) | same |
| `assets/cards/{orange,yellow,teal}.webp` | beat cards | button > card img + badge img + dot overlays |
| `assets/ui/{djembe,tambourine,woodblock}.webp` | card instrument badges | img inside card |
| `assets/ui/plaque.webp` | play prompt plaque | img + HTML Fredoka text overlay |
| `assets/ui/tray.webp` | sequence tray | img + chip overlays |
| `assets/ui/star.webp` | end-screen stars | img ×3 |
| `assets/kiki/poses/*.webp` (7) | Kiki pose actor | `pose-sprite-dom` |
| `assets/dots/*.webp` | card progress dot fills | img in pill seats |

To produce (LAN API, krea2/qwen-edit/ideogram, seeds 42→1337→9001):

| asset | spec |
| --- | --- |
| `assets/ui/title.webp` | REROLL: "Rhythm Copycat" bubble-letter lockup, alpha-trimmed, ≤150 KB, spell-checked at full size |
| `assets/pads/{clap,stomp,tap,shake}.webp` | REROLL to mockup-02 language: vivid squircle pads, thick per-action colored border (cocoa/green/orange/red), cream inner panel, big icon, baked label word, ~700px source → ≤80 KB |
| `assets/chips/{clap,stomp,tap,shake}.webp` | NEW: round beat chips, colored disc + white mini icon matching pad icon 1:1, 160px |
| `assets/ui/pill-start.webp`, `pill-listen.webp`, `pill-again.webp` | coral stadium pills with baked START / LISTEN / PLAY AGAIN (ideogram), spell-checked; a11y names on the buttons |

Everything the child sees is authored raster; DOM supplies layout, hit areas,
highlight states (brightness/scale transforms on the authored art), and the
HTML plaque line. No CSS-illustrated primary objects.

## Audio design

- Percussion voices: `js/percussion.js` (salvaged) — WebAudio clap/stomp/
  tap/shake one-shots, zero bytes. Same voice for demo and child taps so the
  echo "sounds like me".
- Metronome: `sfx.tick` at demo beat spacing (650ms ≈ 92 BPM).
- Praise/celebration: `sfx.sparkle`, `sfx.tada`, voice clips above.
- End-screen song: `song` clip + a short percussion flourish replaying the
  final round's pattern (the child hears "their" beat inside the song).

## QLOBE_DEBUG (v1 + extras)

`installDebug` with: `ready`, `listModes`, `startMode`, `getState()` →
`{screen, mode, round, roundsTotal, phase: 'demo'|'copy'|'between',
stepIndex, pattern, awaitingInput}`, `getTargets()` (pads truthful
correct/wrong per current step; cards+pills on their screens), `tap(id)`
through the real handler, `winRound()`, `mute()`, `seed(n)` (wired to
`onSeed` before pattern draw), `fastTimers()` (wired to the game's one
`createTimers` group — demo playback, pauses, auto-advance all scale),
`getAudioLog()`, `home()`.

## Critic gauntlet record (2026-08-12)

Five blind side-by-side rounds against the ui-mockups by an independent
harsh-art-director agent. Round 5 final: splash 8.5 PASS, play-demo 8.0 PASS,
play-copy 8.5 PASS ("exceeds its mockup in state communication"), end 8.5
PASS, portrait 8.0 PASS — "the game as a set meets the equal-or-exceed bar."
Non-blocking backlog: (1) splash card runtime dot fills register ~3px off the
painted seat centroids (visible only at 3× zoom); (2) portrait end wall
confetti sparser than landscape. Key craft lessons: never dim a card with
opacity over a busy backdrop (the room ghosts through it); layered extraction
leaves faint full-canvas alpha specks, so finalize trims at alpha>24; simple
high-contrast shapes on flat charcoal key better locally (threshold+erode)
than through generative extraction.

## Critic round 1 decisions (2026-08-12)

The blind side-by-side critic pass rejected all five screen groups; fixes
applied: per-card accent progress dots + selection preview fill, visible
selected-card state with sibling dimming, sticker-extruded typography on every
pill word and the end headline (two-tone), pad word-pills in per-action colors,
socket chips previewing the pattern length, cream housing for the round dots,
stronger hit/demo feedback, splash bg djembe removed (edit), play bg corner
props removed (edit), gold kawaii-faced stars (edit), pad icons enlarged ~1.3×
(edit), portrait rebalance (Kiki anchored large bottom-left, compressed play
bands). **Declined:** restyling the shared HUD home/back/sound buttons — HUD
chrome is deliberately world-independent platform furniture
(`docs/art-direction.md`), consistent across every QLOBE game.

## Risks & release gate

- Kiki pose identity drift (neutral's plain eyes vs celebrate's catchlights)
  — judged tolerable at runtime size by the critic pass, or the pose chain is
  regenerated from neutral with the locked identity string.
- LAN GenAI host offline at build start: build+smoke proceeds with salvaged
  art and interim pads; the four REROLL/NEW asset groups are the release gate
  for `beta`. **`live` requires the critic pass on every screen plus the
  real-iPad child playtest.**
