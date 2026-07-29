# Blend Train — Game Design

Concept: `01-game-concepts/blend-train/` (brief, concept video, four 4:3 mockups).
Engine: `build-assemble` (Stage v2 / PixiJS). Status: `beta` until the iPad child playtest.
Written during the production pass on 2026-07-28.

---

## 1. The one skill

**Blending.** The child pushes sound cars together, hears each sound, and hears the
sounds run together into a word. Nothing else on screen competes with that.

Two modes give the same skill two grain sizes:

| mode | id | cars | the skill |
|---|---|---|---|
| Couple the Cars | `couple` | 2 | onset + rime chunking — `m` + `at` |
| Sound Cars | `sounds` | 3 | phoneme-by-phoneme — `m` + `a` + `t` |

### The word list is derived, not authored

Every three-letter object card in `shared/assets/objects/` that is a strict
consonant-vowel-consonant word **and** has the complete recorded audio the game needs — a
fragment clip for each of its three sounds, plus a celebration clip for the whole word.
That is currently **133 words**, and `tools/build-config.py` regenerates the config from
that rule.

Deriving it matters for two reasons. The list grows by itself as the shared library grows,
and it can never drift into naming a word whose sound is missing — the game would
otherwise happily ask a child to build a word it cannot say.

A sitting plays **8 words drawn from the 133** rather than the whole list, so the variety
lives across sessions instead of turning one session into a marathon. The generator also
self-limits to words whose car art exists, so an art batch landing half-finished narrows
the playable list instead of rendering a missing car.

## 2. Why this concept, and what it makes more robust

Chosen capability-first. `build-assemble` backs **15 games and had no produced
flagship**, and its drag controller was copy-pasted near-byte-identically into
`sequence-order` and `sort-into-bins` — 27 stub games resting on unproven code.

Blend Train was the cheapest possible probe of that engine because its *content* is
already free: every phoneme it needs is a recorded teacher-voice clip
(`shared/assets/audio/fragments/`, 63 files covering every letter and every rime) and
every celebration word exists (`shared/assets/audio/celebrate/`). So the whole budget
went into the engine and the train world.

Four capabilities landed in `shared/` as a result, and all 14 sibling games inherit them:

1. **Recorded voice inside an engine.** The engine contract previously forbade
   importing `voice-clips.js` / `content.js`, which is why all 89 engine stubs speak in
   Web Speech. Amended, with a clip-ref grammar (`letter:`, `word:`, `cheer:`, `clip:`).
2. **Real art inside an engine.** A `game:` ref scheme plus array/layered refs, so a
   letter tile can sit *inside* a train car. `splashGlyph()` — which hard-returned the
   puzzle-piece emoji for any non-emoji ref — is gone, so splash and end screens can
   show real art at last.
3. **A non-square build space.** `space: [w, h]` replaces the hardcoded 1000×1000 box.
   A horizontal train used to occupy ~27% of the landscape play field.
4. **`shared/js/stage/drag-to-slot.js`** — one drag controller instead of three, with
   capped offset-preserving drag, hover feedback and a stray-clone sweep.
5. **Picture-led mode buttons** (`mode.art`). The splash previously labelled modes with
   text only — unusable by a pre-reader, and a rule the platform states outright.

Two bugs were found by *looking at the running game* rather than by any assertion, which
is the case for the visual pass: the backdrop was fitted to the whole play area instead
of the board rect, so it rendered at a different scale from the board (0.66 vs 0.48 on a
portrait iPad) — the locomotive was cropped and every car floated above the rails it was
supposed to sit on. Both are fixed; the backdrop now maps 1:1 onto space coordinates.

Five vowel letter tiles (`a e i o u`) also landed in `shared/assets/letter-tiles/`.
The set had 19 consonants and 40 rimes but **no vowels at all**, so no letter-level CVC
game was previously buildable from shared art.

## 3. Screens and the loop between them

```
  Splash ──tap a mode──> Play ──all rounds done──> End
    ^                     │                         │
    │                     └── Back ─────────────────┘
    └───────────────── Play Again / Home ───────────
```

- **Splash** — the train plate, the title, and one button per mode. Each mode button
  shows **its own train as a picture** (2 cars vs 3 cars) rather than only a text label,
  so the choice is legible to a child who cannot read. This needed a new opt-in
  `mode.art` field on the engine; games that omit it render exactly as before. Home
  returns to the catalog. Nothing is spoken on load (see §6).
- **Play** — the railway fills the board; the locomotive waits at the left with empty
  coupling ghosts behind it; the cars for this word sit in the tray. HUD: Back, and a
  sound button that repeats the prompt.
- **End** — the train plate again, a spoken cheer, Play Again and Back.

**Core loop, 40–70s per round:** hear the prompt → drag a car from the tray onto a
coupling → the car locks on and speaks its own sound → repeat until the train is built →
the whole word blends slowly and then lands (`mmm… aaa… t… MAT!`) → celebration → next word.

## 4. The interaction model

Cars are dragged from a tray onto coupling positions on the track. Both input paths work:
drag, and tap-tap (tap a car, then tap a coupling) — the engine supports both, and a
child who cannot yet drag reliably is never locked out.

- **Any order, but every car has its own coupling.** Builds are unordered: a child can
  grab whichever car they notice first. What is enforced is *where* it goes — a car only
  couples at its own position, so the word still comes out spelled correctly. Forcing
  left-to-right was tidier for the engine and worse for the child: a five-year-old who has
  spotted the `at` car should be able to act on that, not be told to wait.
- **Wrong coupling** → boing, the car wiggles, the coupling wiggles, the car glides home,
  and the nudge line plays. The round never resets and nothing is lost.
- **Drag feel** — the grab offset is preserved (capped at 0.35 of the card half-size), so
  the car does not squirt out from under a small finger. The snap test uses the *car's*
  projected centre, not the fingertip, because the finger is underneath the car and the
  child aims with the car's silhouette.
- **Every car speaks its own sound, and sound never blocks play.** On round start the
  cars introduce themselves in build order — each pops, bounces, and says its sound — so a
  child hears "m … at" before touching anything. Tapping a tray car or an already-coupled
  car replays that sound. All of it is fire-and-forget: children tap fast and repeatedly,
  so a tap must be able to interrupt the previous sound and must never delay a drag. The
  single clip channel means rapid taps chase each other rather than queueing, and the
  introduction stops the moment the child picks a car up.
- **Audio can never strand the game.** Anywhere the round loop waits on a spoken line it
  races a ceiling, so a clip that fails to decode or a speech synth that never reports back
  costs the line, not the game. See §12 for the bug that made this rule non-negotiable.
- **Touch targets** — a car renders at ~187px in landscape and ~151px in portrait, tray
  cards at 132px. All comfortably over the 96px floor.

### Coupling up

When the word is finished the cars **roll forward and close their couplings** while a
train rolls in and blows its horn. This replaced a board-wide pop, which pulled the eye to
the whole screen at the exact moment the interesting thing was the word: the pieces
sliding into one train is the word becoming one word.

The sprites are not precision-cut, so the engine closes each gap to a proportion of the
authored spacing (`coupleUp.close`, 0.86 here) and rolls the whole train a little further
toward the locomotive (`coupleUp.roll`, 46 space units) rather than pretending to compute
a perfect butt joint. Measured on a 1180x820 tablet: gaps close from 258px to 222px and
the train advances about 33px.

The two sounds play from their own audio elements, never the voice channel, so the roll
layers under the spoken blend line instead of cancelling it — and both are fire-and-forget,
because nothing in the round loop may wait on a sound effect.

Both play at **20% volume**. At full level they were mastered to be heard on their own
and simply buried the thing the child is actually listening for; the arriving train
should be felt under the word, not over it.

### The picture reward

When a build completes, the word's object card pops up above the train — a mat for `mat`,
a sun for `sun` — while the blend readout plays, so the child sees the thing at the moment
they hear the word. This is the payoff for a player who cannot read: without it, finishing
a word produces a row of letters and a sound, and nothing that says what was made.

It is an opt-in engine feature (`build.reveal`, an art ref, with optional `revealAt` and
`revealSize`) and it holds for a minimum time of its own rather than however long the
voice happens to take — with audio muted or a clip missing, the blend line returns
instantly and the reward would otherwise flash past unseen.

## 5. Art world

**The art is the mockup's art, lifted out of it** — not a from-scratch reinterpretation.
`qwen-image-edit` with `Isolate the <element> on a white background` returns a mockup
element cleanly extracted in its exact style; the 16-car family is then derived by editing
only the *letter* on an already-extracted car, so body, couplers, wheels and panel
geometry stay identical across the set. See `ASSETS.md` for the full recipe and for why
the first pass (generate-alongside, composite a tile in) was the wrong call.

**Colour carries the phonics role**, straight from the mockup's own scheme:

| role | colour | cars |
|---|---|---|
| onset consonant | blue | m c s d p |
| vowel | green | a u o i |
| coda consonant / rime chunk | red | t n g · at un og ig |

So `mat` in `sounds` mode is blue-green-red and the vowel is visibly a different kind of
sound — the thing a blending child needs to notice. In `couple` mode it is blue-red: one
sound, one ending.

The letter is **baked into the car**, as the mockup draws it. That is simpler than the
first pass's layered composite and it looks considerably better, at the cost of one image
per letter rather than one per car colour.

**Board geometry** — `space: [1600, 884]`, matching the track plate exactly so the
backdrop maps 1:1 onto space coordinates and a car positioned at the rail really sits on
the rail.

| | value |
|---|---|
| car size | 380 (`sounds`), 420 (`couple`) |
| car baseline `y` | 458 / 438 — wheels on the rail at space y=645 |
| `couple` x | 700, 1140 |
| `sounds` x | 620, 980, 1340 |

The locomotive is **baked into the track plate**. It is scenery, never interactive, and
baking guarantees it stays aligned to the rail at every scale.

### Filling the screen

Two engine additions, both opt-in, exist because the first pass shipped a letterboxed
strip floating in dead space:

- **`trayOverlay`** — the tray floats *on* the scene instead of taking a slice out of it.
  Reserving a strip left the board unable to use the height, so the scene rendered as a
  framed picture on a coloured mat. Overlaying lets the board fill the play area (1144×632
  of a 1180×820 tablet in landscape) with the tray cards sitting on the grass.
- **`trayReserve`** — how much height the tray strip takes. A wide build is height-starved
  and every pixel handed back makes the cars a child has to read meaningfully bigger.

Blend Train also ships `css/style.css`, a game-local sheet scoped under `#game` that
overrides the engine's shared chrome: full-bleed scene, hidden thumbnail plate, chunky
wordmark, fat cream/orange buttons. No other game loads it.

## 6. Voice script — this IS the recording manifest

**Recorded game lines** (`assets/audio/`, teacher voice cloned from
`shared/assets/refs/voice-teacher.wav`, seed 7):

| key | line |
|---|---|
| `greet` | All aboard the Blend Train! |
| `intro` | Push the sound cars together to make a word. |
| `prompt-couple` | First the sound, then the ending. Put them together! |
| `prompt-sounds` | Put the sound cars in order to build the word. |
| `nudge` | That car goes on another track. Try again. |
| `wait` | Listen for the first car. |
| `cheer` | The blend train is rolling! |

**Everything else is a shared-library clip and was not regenerated** — that is the point
of the clip-ref grammar:

- each car's own sound → `letter:m`, `letter:a`, `letter:t`, `letter:at`, …
  → `shared/assets/audio/fragments/`
- the blend readout on completion → a `seq` of those fragments, then `cheer:<word>`
  → `shared/assets/audio/celebrate/`

The blend readout is sequenced on **real clip durations** (`voice-clips.js` resolves on
the audio element's `ended` event); only the 240ms gap between sounds is authored. A
hardcoded timeout would clip the ends off the phonemes.

Example, `sounds` mode, `mat`:
`{ seq: ['letter:m','letter:a','letter:t','cheer:mat'], gap: 240,
   text: 'mmm... aaa... t... mat!' }`

Every line carries `text` as its Web Speech fallback, so a missing or undecodable clip
degrades to device speech rather than silence.

**Nothing is spoken at page load.** The splash is silent; `greet` is delivered on the
first real gesture. A recorded line fired before the audio channel is unlocked plays as
system TTS, which forks the voice for the whole session.

## 7. Departures from the brief and mockups — and why

1. **All baked mockup text is gone.** "Blend the sounds!", "1 of 3", "BLEND", "NEXT",
   "Great blending!" are rendered text in the mockups. The audience is 5–6 and
   pre-literate, so the prompt is spoken, progress is round dots, and advancing is
   automatic. Keeping them would have been decoration a child cannot use.
2. **The mockup's third car is red; ours is blue.** Red carried no meaning. Colour now
   encodes consonant/vowel/rime, which is information the child can actually use.
3. **The brief's "tap a letter to hear its sound" is kept, but on placement.** A car
   speaks its sound when it couples. Free-tapping placed cars is a natural follow-up but
   is not in this pass.
4. **The brief's "reorder cars along the track" is not a free 1-D slide.** Cars couple
   into discrete positions. Free sliding invites a child to park a car between couplings
   with nothing to show for it.
5. **No locomotive animation or whistle video this pass.** The LTX splash loop was
   considered and deliberately deferred; it adds a codec/QuickTime verification matrix
   for charm that a still plate already delivers.
6. **`three` mode renamed `sounds`.** The old stub's third car was a whole-word caboose,
   which taught recognition rather than blending. Three letter cars is what the mockups
   show and what the brief promises.

## 8. Difficulty and replay variation

`couple` runs 5 rounds over all five words; `sounds` runs 5. Round order is shuffled from
`QLOBE_DEBUG.seed(n)`'s stream, so repeat plays differ but a QA run is deterministic.
Words are fixed rather than sampled from `words.json` because all five must have a
recorded celebration clip and a picture card, and the vowel spread (a, u, o, i) is chosen
deliberately to exercise four of the five new tiles.

## 9. Shared modules used or strengthened

| module | how |
|---|---|
| `shared/js/engines/build-assemble.js` | strengthened: space/backdrop/panel, layered + `game:` art, recorded voice, drag module adoption, `fastTimers` |
| `shared/js/stage/drag-to-slot.js` | **new** — extracted here, adopted by build-assemble |
| `shared/js/stage/art-pixi.js`, `shared/js/engines/art.js` | `game:` scheme + array layering |
| `shared/js/voice-clips.js` | reused unchanged (`sayFile` already existed) |
| `shared/js/content.js` | reused unchanged — resolves the fragment/celebrate URLs |
| `shared/assets/letter-tiles/` | **+5 vowel tiles** |
| `shared/assets/audio/{fragments,celebrate}/` | reused, not duplicated |

## 10. `window.QLOBE_DEBUG` — the QA surface

v1 contract plus the extensions the Playwright suite needs:

- `fastTimers(scale)` — compress every authored duration so QA does not sit through
  celebrations in real time.
- `getState()` — the required five, plus `build, space, slotsTotal, placed, selected,
  dragging, hovered, muted, clips`.
- `getAudioLog()` — ordered `{t, kind:'clip'|'speech', ref, url}`. This is the **only**
  way to prove a recorded clip played rather than the Web Speech fallback; the two are
  indistinguishable in a screenshot. The suite asserts the blend readout fires
  `letter:m → letter:a → letter:t → cheer:mat` with `kind === 'clip'` throughout.
- `mute()` — also mutes every `<audio>`/`<video>` and cancels in-flight speech.
- `home()`, `seed(n)`, `tap(id)`, `winRound()`.

## 11. Accessibility and tuning

- Landscape and portrait, safe areas respected; the tray moves to the bottom in portrait
  and stays in the thumb zone.
- `prefers-reduced-motion` removes the drag tilt and the follow lerp becomes a hard set.
- Every car has an `alt`; the composed car+tile art exposes one label, not three.
- No reading is required anywhere on the child-facing path.
- Audio unlocks on the first real gesture; `clips.unlock()` runs on *every* gesture until
  the channel has actually played, because a first gesture that fails to unlock would
  otherwise strand the whole session in Web Speech.

## 12. Known risks carried into beta

1. **Portrait is the weak orientation.** A 1.81 scene cannot fill a 0.83 viewport, so the
   board renders as a wide band with sky above and grass below. The page gradient is
   sampled from the plate's own sky and grass so it continues rather than clashes, and
   every touch target still clears 96px — but it is not the composition the mockup shows.
   A portrait-specific taller plate is the fix if the child actually plays it that way.
2. `couple` and `sounds` share all five words. If the repetition reads as dull rather than
   reinforcing, `sounds` should get its own word list.
3. `voice.wait` ("Listen for the first car.") is now unused — it existed for the
   out-of-order nudge that unordered builds removed. Left in the config and recorded here
   rather than deleted, in case a future mode wants ordered builds back.
4. Snap radii for adjacent couplings overlap slightly. The engine resolves to the *nearest*
   coupling, so this is forgiving rather than ambiguous — but a drop roughly between two
   couplings will pick one rather than refusing.
5. The locomotive is baked into the plate, so it cannot react to a completed train. A puff
   of steam on completion would need it promoted to a sprite.
6. The five shared vowel tiles this game added are no longer used by it — the cars carry
   their letters now. They stay as a contribution to the shared set, not a dependency.

### The round-advance bug, and what it changed

Completing a round changed the round while the last car's drag was still settling. The
layout pass then called `drag.reproject()`, which wrote to a Pixi display object the round
change had already destroyed — a destroyed object is still a truthy reference but nulls
its `position` and `scale`. The throw propagated into the drop handler and was swallowed
by the `try/catch` that exists to stop a drag stranding a piece, so there was no console
error and no rejection: the next round dealt its cars and never armed input. A
finished-looking board a child could not play.

Three things came out of it:

1. `reproject()` now bails on a destroyed view (`shared/js/stage/drag-to-slot.js`).
2. `voice-clips.playClip` could never settle when its error path awaited a blocked speech
   fallback — a separate latent hang in shared code used by nine games, fixed with
   separate `settled`/`handled` flags so the safety timeout always resolves.
3. The QA suite gained the check that would have caught it: **every round assertion drove
   `winRound()`**, a debug shortcut that bypasses the real placement path entirely. There
   is now a check that finishes a round with real pointer drags and asserts the next one
   deals with fresh cars.

## 13. Release gate

Stays `beta` until the target child plays it on the real iPad and succeeds without adult
narration. Automated QA cannot tell whether a five-year-old understands the coupling
affordance — only whether the code works.
