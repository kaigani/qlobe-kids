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

`couple` is the gentler entry: two chunks, and the rime is a unit the child already
hears as one thing. `sounds` breaks the rime apart. Both use the same five words —
**mat, cat, sun, dog, pig** — so the second mode re-decodes words the child already
built, which is the point rather than a shortcut.

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

- **Ordered builds.** Every build sets `ordered: true`; the train couples left to right,
  which is the same direction the word is read. Grabbing a car that comes later gets a
  gentle wiggle and *"Listen for the first car."* — never a failure state.
- **Wrong coupling** → boing, the car wiggles, the coupling wiggles, the car glides home,
  and the nudge line plays. The round never resets and nothing is lost.
- **Drag feel** — the grab offset is preserved (capped at 0.35 of the card half-size), so
  the car does not squirt out from under a small finger. The snap test uses the *car's*
  projected centre, not the fingertip, because the finger is underneath the car and the
  child aims with the car's silhouette.
- **Touch targets** — a car renders at ~187px in landscape and ~151px in portrait, tray
  cards at 132px. All comfortably over the 96px floor.

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
3. Snap radii for adjacent couplings overlap slightly. The engine resolves to the *nearest*
   coupling, so this is forgiving rather than ambiguous — but a drop roughly between two
   couplings will pick one rather than refusing.
4. The locomotive is baked into the plate, so it cannot react to a completed train. A puff
   of steam on completion would need it promoted to a sprite.
5. The five shared vowel tiles this game added are no longer used by it — the cars carry
   their letters now. They stay as a contribution to the shared set, not a dependency.

## 13. Release gate

Stays `beta` until the target child plays it on the real iPad and succeeds without adult
narration. Automated QA cannot tell whether a five-year-old understands the coupling
affordance — only whether the code works.
