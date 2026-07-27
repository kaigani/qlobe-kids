# Flashlight Cave — game design

**Category:** reading-phonics · **Ages:** 5–6 · **Status:** in-design → beta → live
**Art world:** Storybook Rooms, **night lighting** (argued in §5)
**Cast:** Ari the armadillo — new platform character, status `proposed`; character sheet at
`games/flashlight-cave/characters/ari/character-sheet.md`, promoted to `shared/characters/ari/`
and `adopted` at Stage 6 (§10)
**Engine:** custom, game-local (`js/game.js`) on `shared/js/stage/` + the new `shared/js/stage/spotlight.js`
**Concept:** `01-game-concepts/flashlight-cave/` (brief, Dreamina video, 4 reviewed mockups)
**Supersedes:** `games/letter-treasure-hunt/` (a 64-line `choose-one` stub; archived at ship, untouched until then)

This is the Stage-1 deliverable of `docs/polish-process.md`. It is written to answer every
"what happens when…" a builder would ask, and §7 doubles as the recording manifest.

---

## 1. The one skill

**Recognizing an uppercase letter and knowing what it is** — by its name, by the sound it
makes, and by the words that start with it. Three modes split that into three separate jobs.

What makes this game different from every other alphabet quiz is the *search*. The letters
are there the whole time, but the cave is dark: the child has to move a beam of light to
find them. That turns passive recognition into an active hunt, and — critically — it means
**a child cannot answer a letter they have not actually looked at**, because a tap on an
unlit letter is not an answer at all (§6.4). Guessing is structurally impossible.

Learning goals:

1. Recognize any of the 26 uppercase letters when it is named aloud.
2. Match a spoken phoneme to the letter that makes it (phoneme → grapheme).
3. Identify the letter a spoken/pictured word starts with (initial-sound identification).
4. Discriminate confusable letter shapes (B/D/P/R, M/N/W, O/Q/C/G, …) under time-free,
   no-pressure conditions.
5. Build vocabulary: 78 illustrated, spoken "A is for apple" pairings.

---

## 2. Modes

One game family, three modes. Each teaches one skill; each is three rounds and about two
minutes. The loop, the furniture and the controls are **identical** across all three — only
the prompt changes. A child who learns one mode can play all three.

| # | id | Title | The single skill | Prompt the child gets | Rounds |
|---|---|---|---|---|---|
| 1 | `find` | Find the Letter | uppercase recognition by **name** | `find-intro` → `letter-a` ("Find the letter… ay") | 3 |
| 2 | `sound` | Sound Cave | **phoneme → grapheme** | `says-intro` → shared `phonic-a` ("Find the letter that says… ah") | 3 |
| 3 | `picture` | Whose Letter? | **initial-sound** identification | `starts-intro` + a lit object sprite on the ledge (the child names it) | 3 |

All three run the *same* code path: pick a target letter, place N letters in the dark, wait
for a lit tap, reveal. The mode is one field in the round record.

### 2.0 Loop and session length (`philosophy.md` principle 5)

| beat | budget |
|---|---|
| prompt (voice) | 2–4 s |
| the search — drag, find, tap | 10–35 s, entirely the child's pace, no timer |
| reveal (tada → burst → flood → object → "A is for apple!" → cheer) | ~7 s, auto-advances at 6 s |
| **one round, end to end** | **≈ 25–45 s** — inside the 30–90 s band |
| one mode (3 rounds + end screen) | ≈ 2 minutes |
| a full session (all three modes) | ≈ 6 minutes — inside the 3–7 minute band |

Nothing in the game is timed, so these are expectations, not limits. The only clock anywhere
is the reveal auto-advance, and it exists so a child who wanders off is not stranded.

### 2.0.1 Understandable in five seconds

The five-second read is: **it's dark, there's a light, the light shows things.** No
instruction is needed to produce the first correct action, because *every* first touch is the
right one — a finger anywhere on the screen moves the beam and the cave visibly changes under
it. The child discovers "things are hidden in here" by doing the only thing there is to do.

Three supports, in order, and none of them is text:

1. The beam is **already on** when the round mounts, centred, showing a piece of lit cave. The
   child never faces a black screen and never has to find the control.
2. `ari-dark` — "Ooh… it's dark in here. Good thing we brought a flashlight!" — names the
   situation once, on the first play screen of a session.
3. At 4 s with no touch at all, `ari-hint-move` says the gesture out loud.

The *prompt* (which letter) is the second thing learned, not the first, and it repeats on the
sound button and on every idle timer.

### 2.1 Round ramp (identical in all three modes)

Art space is **1600 × 1200**. All geometry below is authored in art space and mapped to the
screen by one cover-fit transform (§4.2).

| Round | Letters on screen | Beam radius (art px) | Decoy composition |
|---|---|---|---|
| 1 | 3 | 230 | 2 decoys, both **non-confusable**, well separated |
| 2 | 4 | 195 | 3 decoys: **1 confusable** + 2 non-confusable |
| 3 | 5 | 165 | 4 decoys: **2 confusable** + 2 non-confusable |

The beam shrinks and the field crowds. Nothing else changes — same prompt shape, same
gesture, same reward. That is the Kumon micro-increment: the *job* is constant, the
*discrimination demand* rises.

Radius is set with `spotlight.setRadius(r, { ms: 420 })` at round start so the child sees
the light narrow — a legible signal that this round is a little harder.

### 2.2 How a round's letters are chosen

A session opens a **seedable bag**: `shuffle(eligibleLetters, seed)`. Rounds 1–3 draw
targets `bag[0..2]`, so no letter is the target twice in one session, and
`QLOBE_DEBUG.seed(n)` makes a run exactly reproducible for QA.

`eligibleLetters` per mode:

- `find` — all 26.
- `sound` — all 26.
- `picture` — **25 letters; X is excluded as a target** (§9.12). All three of X's objects
  are still reachable as *reveal* objects in `find` and `sound`; none of them can honestly
  serve an initial-sound prompt.

Decoy selection, for target `T` in round `R`:

```
conf    = config.confusables[T]                        // 3 letters, §8
banned  = { T } ∪ sameAnswerAs(T)                      // see below
nonConf = ALL26 − banned − conf
c       = (R === 1 ? 0 : R === 2 ? 1 : 2)              // confusable decoys
n       = 2                                            // non-confusable decoys, every round
letters = shuffle([ T,
                    ...pickDistinct(conf    − banned, c),
                    ...pickDistinct(nonConf,          n) ])
```

`c + n + 1` is 3 / 4 / 5 for rounds 1 / 2 / 3, matching the ramp table above. Should
`conf − banned` ever hold fewer than `c` letters, the shortfall is taken from `nonConf`, so
the round always has the right number of letters. With today's data that never happens — the
ban set is at most one letter and every `conf` row has three — but the fallback is written
down so a future confusables edit cannot silently produce a four-letter round 3.

**`sameAnswerAs(T)` — the exclusion that stops the game marking a correct answer wrong.**
A decoy must never be a letter that *also* answers the prompt the child just heard. What
counts as "also answers it" depends on the mode:

| mode | `sameAnswerAs(T)` | why |
|---|---|---|
| `find` | `{}` | the prompt is the letter's **name**, and no two letters share a name |
| `sound` | `{ L : phonic(L) === phonic(T) }` | the prompt is a phoneme |
| `picture` | `{ L : phonic(L) === phonic(promptWord's initial sound) }`, i.e. `phonic(L) === phonic(T)` | the prompt is a word, and the job is its **initial sound** |

`shared/data/letters.json` gives C and K the identical phonic `"kuh"`, and **that is the only
collision in the whole 26-letter table** (verified against the data). So today the rule fires
exactly on **C↔K**, in both `sound` and `picture`:

- `sound`: prompt "kuh", target C, K on screen → tapping K is genuinely correct.
- `picture`: prompt sprite `cat`, target C, K on screen → "cat" starts with the /k/ sound, so
  a child who has been taught sounds rather than letter names picks K and is *right*.

The rule is computed from `letters.json` at load, not hard-coded, so it survives a data edit
that introduces another collision.

**Phonic neighbours — a `sound`-mode round-1 softener.** The five short vowels
(`A "ah"`, `E "eh"`, `I "ih"`, `O "oh"`, `U "uh"`) are distinct phonemes but sit close
together for a five-year-old. `config.phonicNeighbours` groups them. In **round 1 only** —
the round whose job is "you can do this" — a decoy from the target's neighbour group is
excluded. Rounds 2 and 3 allow them, because discriminating /ah/ from /uh/ *is* the skill
this mode teaches; round 1 just isn't where it should be introduced. The group list lives in
`config.json` and is a tuning knob, not a rule.

### 2.3 The reveal object

Every letter has three illustrated, recorded objects in
`shared/data/letter-objects.json` (78 total, sprite + `isfor-*` clip for every one). The
object shown on success is drawn at random from the target letter's three, **independently
of the letter draw**. So a replayed `A` gives ant, then alligator, then apple — the letter
is the constant, the friend is the variation. This is principle 7 ("repeat with variation")
at the smallest possible grain.

All 78 words and all 78 sprites at `shared/assets/objects/<word>.png` were verified present at
design time — §7.6 lists them one by one and that list is the whole of `letter-objects.json`,
in order, with nothing added and nothing dropped. **X's three objects are reveal objects only**
in every mode; X is never a `picture` target (§9.12). In `picture` mode the *prompt* sprite and
the *reveal* sprite are the same object — the child sees it lit on the ledge, finds its letter,
and it springs into the alcove as the payoff.

---

## 3. Screens and the loop between them

```
        boot ──▶ SPLASH ──(tap a mode tile)──▶ PLAY ──(tap a lit correct letter)──▶ REVEAL
                   ▲                            │                                     │
                   │                            └──(back)──┐              (play btn / 6s)
                   │                                       │                           │
                   │                                       ▼               ┌───────────┘
                   └──────────(back / play btn)────────── SPLASH           │  rounds 1,2 → PLAY
                                                                            └─ round 3 → END
        END ──(play btn / back)──▶ SPLASH        SPLASH ──(home)──▶ ../../ (the catalog)
```

Navigation follows `docs/interaction-patterns.md` §8 exactly: **home only on the splash**
(→ the catalog), **back on every deeper screen** (→ the splash, in-page, no navigation).
The end screen's big button returns to the **splash**, not into the mode just played, so
the child re-chooses rather than being trapped in a loop.

### 3.0 Boot — and the audio-unlock rule

`index.html` mounts the splash immediately. Pixi is **not** loaded on this path
(`stage.js:loadPixi()` is lazy and is only called when a mode starts), so the splash paints
before the 798 KB vendor bundle is touched; the download then overlaps the child looking at
the tiles.

**No recorded line is ever spoken on page load.** `ari-welcome` is armed, not played. The
first `pointerdown` anywhere in the document runs `unlockAudio()` (`sfx.unlock()`,
`speech.unlock()`, `voice.unlock()`) and *then* plays `ari-welcome`. Speaking before the
unlock is what makes a recorded clip silently degrade to the system speech voice.

If the child's first gesture is a mode tile, `ari-welcome` is skipped entirely and the
mode intro plays instead — a welcome the child has already walked past is noise.

**Interruption is always allowed.** `voice-clips.js:say()` stops the current clip and cancels
Web Speech before it starts the next, so a tap during any line simply replaces it. Nothing in
this game ever waits for audio to finish before accepting input — not the welcome, not a mode
intro, not a prompt, not a cheer. The single exception is the reveal, which sets `busy` for
its own animation (§3.3), and even that is bounded by the 6 s auto-advance.

### 3.1 SPLASH

```
┌────────────────────────────────────────────────────────────┐
│ (home)                                                     │
│                                                            │
│                  F l a s h l i g h t                       │   ← DOM Fredoka text,
│                        C a v e                             │     not baked into the art
│                                                            │
│   ┌────────┐        ┌────────┐        ┌────────┐           │
│   │  ⌾ A   │        │ A))))  │        │  ⌾ 🍎  │           │   ← 3 mode tiles
│   └────────┘        └────────┘        └────────┘           │
│      find             sound            picture             │
│                                                            │
│  (Ari, left, pose: enter → neutral)                        │
└────────────────────────────────────────────────────────────┘
        background: assets/cave-splash.jpg, cover-fit
```

**What's on it.** Full-bleed `cave-splash.jpg` (cave mouth at dusk, crystals, warm tunnel
glow — mockup 01 with the wordmark, button and armadillo stripped out). The title renders
as two lines of DOM Fredoka 600, cream over gold with a navy stroke, so it stays editable
and localizable. Ari stands lower-left as a DOM pose-actor (`enter` on mount → `neutral`).

**Three mode tiles**, centered, in a row on landscape and a column on portrait. Each is a
rounded navy panel (radius 32, cream 4px border, warm inner glow) at least 300 × 300 CSS px:

| tile | face | built from |
|---|---|---|
| `find` | a glowing uppercase **A** sitting in a soft circle of light | DOM text + CSS radial gradient — no asset |
| `sound` | the same glowing **A** with three sound-wave arcs radiating right | DOM text + inline SVG arcs — no asset |
| `picture` | `shared/assets/objects/apple.png` in the same circle of light | shared asset |

No tile carries a word. The circle-of-light motif is shared by all three so the tile row
reads as "three ways to play the same game".

**What the child can touch.**

- A mode tile → `sfx.tick()` on press-down; on release over the tile, the mode's intro line
  plays (`ari-mode-find` / `-sound` / `-picture`) and the play screen mounts underneath it,
  so the download of Pixi + the plate happens while Ari is still talking. If the plate is
  not decoded when the intro ends, a warm "lantern" spinner holds for up to 2.5 s; after
  that the game starts anyway with a flat fill and swaps the plate in when it lands.
- **Home** (top-left, `shared/assets/ui/btn-home.png`, 112 px) → `../../`. This is the only
  catalog link in the game.

**If the child does nothing.** At 15 s Ari raises a paw (`notice`) and speaks
`ari-idle-1`; at 35 s, `ari-idle-2`. Nothing else happens, ever. No timeout, no attract
loop that steals the screen, no sound that repeats forever.

### 3.2 PLAY

```
┌────────────────────────────────────────────────────────────┐
│ (back)              [ picture-mode ledge ]        ● ● ●    │   ← pips, top-right
│                                                            │
│                                                            │
│                  ·  the dark cave  ·                       │
│                                                            │
│              ( ◉ warm beam )  ← follows the finger         │
│                    🔦                                       │
│                                                            │
│ (sound)                                                    │
└────────────────────────────────────────────────────────────┘
```

**What's on it.**

- `assets/cave-play.jpg`, cover-fit, **evenly lit, with no light pool baked in** — the
  darkness is entirely a runtime layer (§5).
- 3–5 letters in the alcoves, drawn in Fredoka via `PIXI.Text` with a neon-outline style
  (mockup 02's look). Base alpha **0.06** — present but not readable — rising with the
  light (§6.3).
- The five-quad veil + the additive warm glow (`spotlight.js`, §4.1).
- The flashlight sprite riding the beam at `(+0.78R, +0.62R)`, `eventMode: 'none'`.
- **HUD (DOM, above the canvas):** back top-left (112 px, → splash); sound bottom-left
  (112 px, replays the current prompt, debounced 600 ms); three progress pips top-right
  (filled = solved). Every HUD `pointerdown` calls `stopPropagation()` so a corner tap is
  never also a beam move.
- **`picture` mode only:** the prompt object sprite on a warm lit ledge at art `(800, 190)`,
  ~280 art px tall, drawn into `spotlight.above` so the veil never dims it. It is the one
  thing in the cave that is always visible.
- Ari is **off-screen** during the search. He slides in only to nudge, hint or cheer, and
  slides out again — he must never sit in front of the cave the child is searching.

**What the child can touch.** The whole canvas. There are exactly two outcomes, and §6
specifies them precisely: a tap on a **lit** letter is an answer; **anything else moves the
light** — including a tap on an unlit letter.

**The round beat.**

1. Round mounts. Letters are placed (§4.3), all dark. Beam starts at art `(800, 640)`,
   dead centre, already on — the child never faces a black screen.
2. **Hear it:** the prompt plays. `find` → `find-intro` + `letter-X`. `sound` → `ari-listen`
   + `says-intro` + `phonic-x`. `picture` → `ari-look`, the ledge sprite springs in, then
   `starts-intro`. In `picture` mode `ari-look` is **skipped on round 1**, because
   `ari-mode-picture` ("I found something! Let's see which letter it starts with.") has just
   said the same thing on the splash; rounds 2 and 3 use it as the "here comes a new one" cue.
3. **Do it:** the child drags. Letters brighten and fade as the beam passes.
4. **See it:** on a lit correct tap → the reveal (§3.3). On a lit wrong tap → the gentle
   path (§6.5). On an unlit tap → the beam simply moves there; no judgement, no sound.
5. Rounds 1 and 2 return here with a smaller beam; round 3 goes to the end screen.

**If the child does nothing.**

| trigger | what happens |
|---|---|
| 4 s after the first play screen of the session, no `pointerdown` yet | `ari-hint-move` — "Move your finger to move the light." Once per session. |
| a **correct** target holds `litness ≥ 0.6` for 600 ms with no tap | `ari-hint-tap` — "You found one! Tap it." Once per round. |
| 12 s with no pointer event | `ari-idle-1`, then `ari-idle-2` alternating |
| +15 s (27 s) | the prompt is re-spoken in full |
| +20 s (47 s) | `ari-hint-dark`, and the beam **glides toward the correct letter and stops 1.2 R short of it** — pointing, never solving. The child still has to close the distance and tap. Reduced motion: snap to the same point. |

All idle timers are cleared by any pointer event and scale with `QLOBE_DEBUG.fastTimers()`.

**First time only.** The very first play screen of a session, before the prompt, Ari says
`ari-dark` — "Ooh… it's dark in here. Good thing we brought a flashlight!" This is the one
line that explains the premise, and it is spoken once, not every round.

### 3.3 REVEAL

Not a new page — an overlay state of the play screen, exactly as mockup 03 shows (same
cave, same alcove, now flooded with light).

Beat order, and this order is load-bearing:

1. Input locks (`busy = true`).
2. `sfx.tada()`.
3. The letter scales 1.0 → 1.25 and its glow goes to full white-gold.
4. `burst(PIXI, spotlight.above, x, y, { count: 34 })` from
   `shared/js/stage/particles.js`. **The colours are the shared module's fixed six-colour
   `PALETTE`, used as-is.** `particles.js` today exposes only `count`, `power`, `gravity` and
   `life` — there is no colour or shape option, and forking a shared module to get one is
   forbidden (`CLAUDE.md`; `philosophy.md` principle 9). The mockup's gold/violet/cyan star
   confetti is therefore a **Stage-6 promotion**: add optional `colors` and `shape: 'star'`
   parameters *to* `particles.js`, behind their own yes, and every other game inherits them.
   Until then the shared confetti is correct, on-brand and one less thing to build.
5. The beam widens to `1.9 × R` over 380 ms: the alcove floods. This is the payoff read —
   "you found it, and now you can see."
6. The object sprite (`shared/assets/objects/<word>.png`) pops from behind the letter with
   a spring scale 0 → 1, `tint = 0xfff0d0` so it sits inside the warm light rather than on
   top of it.
7. Voice: **`isfor-<word>`** — "A is for apple!"
8. Ari slides in (`celebrate`) and says `ari-found` on the session's first success, or a
   random `ari-cheer-1..4` after that.
9. The round pip fills.
10. A big round `shared/assets/ui/btn-play.png` appears centre-bottom (≥ 128 px art, ≥ 96 px
    target). The screen **also auto-advances after 6 s**, so a child who wanders off is
    never stranded.

**What the child can touch.** The play button → `ari-next` + the next round (or the end
screen). Back top-left → the splash. Everything else is inert; the beam does not move on
this screen.

**If the child does nothing.** Auto-advance at 6 s. No idle chatter here — the reveal is
already talking.

### 3.4 END

The payoff for the whole mode: **the cave lights up.** `veilAlpha` animates 0.9 → 0.12 over
900 ms and the beam radius opens to 1400, so the whole plate is finally visible — the place
the child has been feeling around in the dark for two minutes.

- All three revealed objects sit in the alcoves where they were found.
- Ari centre, `celebrate`, confetti from `particles.js`.
- Voice: `ari-end`, then after a 400 ms gap `ari-replay-tip`.
- Big central `btn-play.png` → **the splash** (the mode menu), speaking `ari-again`.
- `btn-back.png` top-left → also the splash.

**If the child does nothing:** nothing. The end screen is a resting place and holds
indefinitely, with Ari looping a slow idle bob (suppressed under reduced motion).

Reduced motion: the veil is set directly rather than animated, and the confetti is replaced
by a single `sparkle()` flash.

### 3.5 The no-WebGL / context-lost screen

If `createStage()` cannot get a WebGL context, or `webglcontextlost` fires mid-play,
`main.js` mounts a ~40-line static DOM screen instead of showing a black canvas:

- `cave-play.jpg` as a CSS background at 55 % darkness (a flat `filter: brightness(.55)`).
- All the round's letters visible at once as absolutely-positioned Fredoka DOM text at their
  art positions, mapped through the same cover-fit transform.
- Each letter is wired with `shared/js/tap.js` `onTap()` — the same one press path as every
  other control in the game (feedback on `pointerdown`, action on `pointerup` over the
  element) — and calls **the same `game.attempt(id)`**. The prompt, the reveal, the voice, the
  HUD and `QLOBE_DEBUG` are all identical. The child loses the search; they do not lose the
  game.
- There is no beam here, so the unlit-tap rule (§6.4) has nothing to apply to: every letter is
  visible, so every tap on one is a real answer, and a wrong one takes the same gentle path
  (§6.6).
- `QLOBE_DEBUG.getTargets()` reports every target as `lit: true` here, which is honest: in
  this mode they are.

### 3.6 Rules that hold on every screen

These are the "what happens when…" answers that are not specific to one screen.

**The HUD, screen by screen** (`interaction-patterns.md` §8: home top-left on the splash
only; back top-left everywhere deeper; sound bottom-left):

| screen | home | back | sound (bottom-left) | pips | play button |
|---|---|---|---|---|---|
| splash | ✅ → `../../` | — | — | — | — |
| play | — | ✅ → splash | ✅ re-speaks the full prompt sequence | ✅ | — |
| reveal | — | ✅ → splash | ✅ re-speaks `isfor-<word>` | ✅ | ✅ centre-bottom |
| end | — | ✅ → splash | — (there is no prompt left to hear) | ✅ all filled | ✅ centre-bottom → splash |
| no-WebGL fallback | — | ✅ → splash | ✅ same as play | ✅ | ✅ same as reveal |

The sound button is **debounced 600 ms** and is the same DOM element throughout — it changes
what it says, never where it is. Every HUD control is wired through `shared/js/tap.js`
`onTap()` (feedback on `pointerdown`, action on `pointerup` over the element, `click` reserved
for keyboard/AT), and every one calls `stopPropagation()` on `pointerdown` so a corner tap is
never also a beam move.

**Back, from anywhere.** One handler, always the same: stop all audio (`voice.stop()`,
`speech.stop()`), clear every idle/hint/auto-advance timer, cancel any in-flight tween, end any
drag in progress, dispose the round's `onTap` handlers and the `spotlight.onChange`
subscriber, `clearTargets()`, and mount the splash. It is safe mid-drag, mid-reveal and
mid-animation, and it never navigates — the splash is a state of the same page. Session state
(the seeded bag, which welcome lines have been spoken) survives; round state does not.

**Resize and orientation change.** Every authored number is in art space (§4.2), so a resize
recomputes exactly one thing: the cover-fit transform. Letter positions, the beam centre, the
beam radius and every hit circle are unchanged — the picture reflows, the game does not. A
resize **mid-drag** is fine: the drag is tracked in art space, so the beam stays under the
finger. The DOM HUD reflows by CSS; splash tiles swap row → column. `stage.js` already
forwards `app.renderer.on('resize')`; the game re-derives the transform there and requests one
render.

**Backgrounding the tab.** `createStage()` installs its own `visibilitychange` handler that
stops the ticker when hidden and **starts it again when visible** — see §4.1, which is why
this game installs its own handler afterwards. On becoming visible again the game also
re-requests one render and re-arms the idle timers from zero, so a child returning after a
phone call is not greeted by three queued hints.

**Total page weight.** The splash costs ~300 KB (one plate; Pixi is not loaded yet). Starting
a mode adds Pixi (798 KB, vendored, cached across games) + the play plate (≤300 KB) +
the flashlight (≤60 KB) + Ari's pose pack (≤500 KB) ≈ 1.7 MB. Voice clips are **never
preloaded** — `voice-clips.js` streams each one through its single unlocked audio element on
demand, so the 2.2 MB voice set is spread across the session at ~14 KB a line. Reveal object
sprites load one per round. That keeps the game under `art-direction.md`'s ~4 MB page target
without a preload stall.

---

## 4. The play scene

### 4.1 Layer stack

```
z0  plate        cave-play.jpg, cover-fit, evenly lit
z1  scene        spotlight.scene — letters, alcove props            ← darkened by the veil
z2  veil ×5      veilTop / veilLeft / hole sprite / veilRight / veilBottom
z3  glow         one additive warm quad centred on the beam
z4  above        spotlight.above — flashlight, particles, revealed object,
                 picture-mode ledge sprite                          ← never darkened
--- DOM ---
    HUD          back · sound · pips · play button · Ari pose-actor
```

The veil is a translucent sheet (`veilColor 0x0a1436`, `veilAlpha 0.9`) with a soft hole
punched through it by geometry — four strips plus one baked alpha-ramp sprite, all sharing
the same colour and alpha so they read as one continuous sheet. **No mask, no filter, no
blend-mode shader.** Moving the beam is four `x/y/width/height` writes.

Because the veil is translucent, **the dark cave and the lit cave are the same image**: the
veil cools what is outside the beam, the additive quad warms what is inside. That is exactly
what mockup 02 shows, and it collapses two 300 KB background plates into one.

**Rendering: an explicit pump, not the Pixi ticker.** The GPU should be at zero on an idle
reveal screen, so the ticker is stopped and frames are requested. Two things in the shared kit
make this non-obvious, and both must be handled or the screen simply freezes:

1. **`shared/js/stage/tween.js` and `shared/js/stage/particles.js` run their own
   `requestAnimationFrame` loops and never call `app.render()`.** They mutate display-object
   properties and assume something else is drawing. With the ticker stopped, a tween runs to
   completion invisibly.
2. **`shared/js/stage/stage.js:createStage()` installs a `visibilitychange` handler that calls
   `app.ticker.start()` whenever the tab becomes visible** — silently undoing
   `app.ticker.stop()` the first time the child switches apps and comes back.

So `cave.js` owns a tiny pump:

```
requestRender()      → sets needsRender = true; starts the RAF pump if it is not running
pump(now)            → if (needsRender) { needsRender = false; app.render(); }
                       keep looping while (needsRender || activeAnimations > 0)
```

`activeAnimations` is incremented around every `tween.to()` / `popIn()` / `burst()` /
`sparkle()` promise and decremented in a `finally`, so the pump keeps drawing for exactly as
long as something is moving and then stops. `requestRender()` is also called from the beam
handler, from `spotlight.onChange`, from the resize handler, and once on becoming visible.

`main.js` calls `app.ticker.stop()` **after** `createStage()` resolves and installs its own
`visibilitychange` listener that stops it again on every return to visible. The QA gate
asserts `app.ticker.started === false` after a mode has been running for a second.

### 4.2 The art↔screen transform (one, shared)

```
scale   = max(viewW / 1600, viewH / 1200)          // cover-fit
offsetX = (viewW - 1600 * scale) / 2
offsetY = (viewH - 1200 * scale) / 2
screen  = art * scale + offset
art     = (screen - offset) / scale
```

**Every** authored number in this document — letter positions, beam radii, hit radii,
clamps, the ledge — is in **art space**. `cave.js` owns the transform; `beam.js` and
`game.js` consume it. `QLOBE_DEBUG.getBeam()` and `moveBeam()` speak art space too, so a QA
script is resolution-independent. This is why the plan forbids splitting Stage 4 across
agents: two coordinate systems is the failure mode.

### 4.3 Letter placement

Playable band (art space): `x ∈ [220, 1380]`, `y ∈ [300, 980]`. This clears the HUD bands
(top 0–260, bottom 1000–1200) with room for the letter's own height.

Placement is a **jittered lattice**, not free random — free random produces overlapping
letters about one round in six:

- 4 columns × 2 rows = 8 cells. Column centres `365, 655, 945, 1235`; row centres `470, 810`.
- Pick N distinct cells at random from the 8.
- Jitter each pick by `±45` in x and `±55` in y.
- Reject and re-roll (max 12 attempts) if any pair is closer than **235 art px**; on the
  13th, fall back to un-jittered cell centres, which are always ≥ 290 apart.

Letter cap height 170 art px. Hit radius `hitR = 110` art px — from
`max(96 css, 0.55 × letterHeight)` promoted to a round number. At the worst supported
viewport (1024 × 768, scale 0.64) that is a 70 px screen radius, i.e. a **140 px** target,
comfortably over the 96 px floor. Targets are registered with `spotlight.register(id, {x, y,
r: 110})` in flat art coords, so a target is hit-testable before its sprite exists — which
is also how QA registers synthetic ones.

### 4.4 Letter rendering

No letter art files. Each letter is a `PIXI.Text` in Fredoka 600 with a neon-outline
`TextStyle` (cream fill `#fff3d0`, gold stroke `#ffc04a` 9 px), plus a second copy at
`scale 1.08` and low alpha as a cheap bloom, plus the shared soft-glow texture tinted
`0xffb347` behind it. No `BlurFilter` — a filter is exactly what the compositing decision
avoids.

> **Trap:** Pixi bakes a `Text` to a texture at construction. `cave.js` must
> `await document.fonts.load('600 120px Fredoka')` **before** building any `Text`, or the
> letters are permanently Arial. The QA gate asserts
> `document.fonts.check('600 120px Fredoka')` before the first `Text`.

Drive, per frame, from `spotlight.onChange` (never from the ticker):

```
L          = litness(id)                       // 0..1, from spotlight
alpha      = 0.06 + 0.94 * smoothstep(0.05, 0.85, L)
bloomAlpha = 0.8 * L * L
scale      = 1.00 + 0.06 * L
```

At `L = 0` the letter is at 6 % alpha under a 90 %-opaque veil: genuinely invisible on a
calibrated screen, which *is* the game. This number is the single biggest open risk in the
build and is settled on the iPad in Stage 3.5, not from a desktop screenshot.

---

## 5. Art world — Storybook Rooms, night lighting

`docs/art-direction.md` gives **reading-phonics** the **Toy Table** default. This game
overrides it to **Storybook Rooms**, and the same document explicitly permits that: *"the
category default applies unless the game's design doc argues otherwise."* Here is the
argument.

1. **Toy Table has no darkness to hide in.** Its canon is cut-out objects on an airy
   sky-blue field with soft dots. The entire mechanic of this game is *concealment* — a
   pale open field cannot conceal anything. Toy Table is the wrong world by mechanic, not
   by taste.
2. **Mockup 02 is already Storybook Rooms.** Violet and cyan crystals, navy rock with ochre
   highlights, rounded geometry, crisp navy outlines, glossy depth. It is the Laundry-Sorter
   look at night. Nothing about the plate needs restyling — it needs *un*-lighting.
3. **The only departure is illumination, and illumination is a runtime layer.** The plate
   ships *evenly and warmly lit* — no beam, no pool, no vignette. Darkness arrives from
   `spotlight.js` at runtime. This is not a stylistic choice, it is a correctness one: a
   baked light pool double-darkens under the veil and reads as mud, and it would move with
   nothing while the beam moves with the finger. It is the highest-probability failure in
   the whole build, so it is a stated rule here, checked at art sign-off, and both
   generation recipes exist to hit it.
4. **The Toy Table object sprites composite legally.** All 78 reveal objects come from
   `shared/assets/objects/` and are Toy Table cut-outs. Storybook Rooms already specifies
   cut-out sprites over a full-bleed room, so mixing is not a world violation. They are
   tinted `0xfff0d0` on reveal so they sit *inside* the warm light rather than floating in
   front of it.
5. **Not Story Screen.** The concept is a video, but Story Screen is a different world with
   a different job (a story beat you then respond to). Skipping video saves ~2.5 MB, a whole
   production sub-stage, and a `<video>`-lifecycle class of bugs, and loses nothing: the
   cave *is* the drama.

If this ships well, `art-direction.md` gets a short "lighting variant" paragraph at Stage 6
so the next night game inherits the rule instead of re-deriving it.

**Palette (from mockup 02, sampled):** navy rock `#151d3b` · deep shadow `#0a1436` (the veil
colour) · warm beam `#ffc46b` · lit rock ochre `#c9913f` · crystal violet `#8b5cf6` ·
crystal cyan `#38d6d0` · letter cream `#fff3d0` · letter gold `#ffc04a` · accent (registry)
`#f0a53c`.

---

## 6. The beam — the interaction model

This is the first live QLOBE game with continuous drag. The rules below are the design, not
an implementation note; a builder who changes one of them changes the game.

### 6.1 Direct finger-follow, no handle

**The beam centre is the finger.** There is no puck, no dock, no draggable flashlight body
to grab. Mockup 02 draws a "flashlight control tray" at the bottom — that is rejected (§9.6):
a handle is a small precision target *in a dark scene*, an anti-affordance for a five-year-old,
and it puts the child's hand somewhere other than where they are looking.

The flashlight sprite rides *with* the beam at `(+0.78R, +0.62R)`, rotates up to ±18° toward
the drag vector, mirrors to the other side near the right edge of the plate, and is
`eventMode: 'none'` — decoration that explains the light, never a control.

Because nothing is ever cloned or reparented, the entire stranded-clone failure class of
`docs/interaction-patterns.md` §11 is **structurally absent** rather than defended against.

### 6.2 The beam persists on release

Letting go does **not** turn off the light. The child must be able to find something, take
their finger off to look at it, and then tap it. A beam that dies on `pointerup` makes the
core loop impossible.

### 6.3 What "lit" means

`illumination(x, y)` in JS mirrors the baked alpha ramp exactly — an inverted smoothstep
between `(INNER/EDGE) · radius` and `radius`, with `INNER = 0.55`, `EDGE = 0.94`. So the
inner ~58 % of the beam is full brightness and the outer edge falls off smoothly, and
**hit-testing agrees with what the child's eye sees**. Thresholds:

| use | threshold |
|---|---|
| `isLit()` default (the letter is drawn as "found") | `0.35` |
| a tap counts as an **answer** | `0.50` |
| `ari-hint-tap` arms | `0.60` held 600 ms |

**Litness is evaluated at the target's registered centre, never at the tap point.** A target
is `register(id, { x, y, r: 110 })` — a point plus a hit radius — and `litness(id)` is
`illumination(x, y)` for that point. The hit radius decides *whether the child touched the
letter*; the registered centre decides *whether the letter is visible*. Keeping them separate
is what makes the rule legible to the child: the letter you can see is the letter you can
tap, anywhere on it. It also means a beam sitting ~130 art px off the letter's centre still
lights it enough to answer (at R = 165, `illumination` crosses 0.50 at ≈ 130 px), which is the
slack that keeps §17.3 — tap ambiguity — manageable.

### 6.4 One press path — the whole decision tree

```
pointerdown   → record (x0, y0) + pointerId; unlockAudio(); NO sound
                (a beam move is not a button — it must not tick)

pointermove   → past DRAG_SLOP = 10 px ⇒ this is a DRAG
                beam follows with a critically-damped lerp, k = 0.45
                (raw finger jitter strobes the whole scene; the lerp kills it)
                reduced motion ⇒ instant snap, no smoothing

pointerup     → moved past slop?  ⇒ drag ends. Beam stays where it is. Done.
                under slop        ⇒ this is a TAP:
                    a registered letter with isLit(id, 0.50) whose hit circle
                    contains the point            ⇒ attempt(id)
                    otherwise                     ⇒ moveTo(pt, { ms: 220 })
```

**A tap on an UNLIT letter is a move, not an answer.** The child cannot see it, so they
cannot have meant it — and this is the single rule that makes "find it with the light" real
instead of decorative. Without it a child can sweep-and-jab and score by luck, and the
lesson evaporates. The QA gate asserts it directly: click a `role:'correct'` target while
`lit:false` → the round is unchanged **and** the beam moved.

**Tap-to-move is the equal easier path** (`interaction-patterns.md` §11 rule 7). A child who
cannot or will not drag can play the entire game by tapping around the cave, one tap at a
time, and every tap does something visible.

### 6.5 Robustness rules

Checked one by one against `docs/interaction-patterns.md` §11, which is written for
drag-and-drop but whose seven rules are the platform's whole continuous-pointer contract:

| §11 rule | how this game satisfies it |
|---|---|
| 1. listeners on `window`, filtered by `pointerId` | yes — below |
| 2. one drag at a time; ignore `isPrimary === false` | yes — below |
| 3. handle `pointercancel` **and** window `blur` | yes — below |
| 4. wrap the drop action in try/catch | `attempt()` is wrapped in `try/finally` |
| 5. sweep stray clones | **structurally N/A** — nothing is ever cloned or reparented (§6.1); there is no floating piece that can strand, because the thing being moved is a light, and a light that ends up in the wrong place is just a light in the wrong place |
| 6. `touch-action: none` on the draggable, `manipulation` elsewhere | `none` on the canvas, `manipulation` on the HUD |
| 7. offer tap-tap as an equal path | **tap-to-move + tap-to-answer** (§6.4) — a child who cannot or will not drag plays the whole game one tap at a time, through the identical `moveTo()` / `attempt()` calls a drag uses |

- Window-level `pointermove` / `pointerup` / `pointercancel`, **filtered by `pointerId`**.
  Pointer capture is an optimization only, never the correctness mechanism.
- **One drag at a time.** A `dragging` flag holds the active `pointerId`; while it is set,
  every new `pointerdown` is ignored outright (rule 2). The flag is cleared on `pointerup`,
  `pointercancel` and `blur`, in a `finally`, so it can never latch.
- `e.isPrimary === false` is ignored — a second finger never fights the first.
- `pointercancel` **and** window `blur` both end the drag and **leave the beam where it is**
  (iOS fires cancel on gesture takeover; app switches eat `pointerup` entirely). The next
  drag works normally.
- `attempt()` is wrapped in `try/finally` so an exception mid-reveal still releases `busy`.
- The beam centre is clamped to art `x ∈ [120, 1480]`, `y ∈ [200, 1080]`. Every letter lives
  inside that rect, so every letter is reachable at full brightness.
- `touch-action: none` on the canvas; `manipulation` on the HUD.

### 6.6 The gentle path — a lit tap on the wrong letter

No loss, no score, no streak, nothing removed (`philosophy.md` principle 6):

1. `sfx.boing()` — soft, never a buzzer.
2. The tapped letter wobbles ±6° twice over 320 ms and settles.
3. Ari slides in (`notice`) and says `ari-nudge-1`, then `-2`, then `-3`, then repeats `-3`.
   The nudges escalate in helpfulness, not in sternness.
4. `awaitingInput` returns true **within 1.5 s** — the child is never locked out.
5. After the third wrong attempt in a round, the `ari-hint-dark` beam-glide hint (§3.2)
   fires immediately rather than waiting for the idle timer.
6. The prompt is re-spoken. The round continues with the same letters in the same places —
   nothing is reshuffled, because re-hiding what the child just searched is a punishment.

---

## 7. Voice script — verbatim (this IS the recording manifest)

One voice: **Ari**, cloned from `shared/assets/refs/voice-teacher.wav` via
`qwen3-tts-voicedesign` — the platform teacher voice, warm and unhurried, a shade brighter
and younger. The reference is committed at `assets/audio/ref/ari.flac`; every clip clones
from it so the whole set matches.

Every clip is played through `shared/js/voice-clips.js` with its line text as
`fallbackText`. `config.json.voice` is the single authoring source; `assets/audio/lines.json`
is **derived** from it by `gen-voice.py`, so a clip and its Web Speech fallback can never
drift. A clip that fails QA five seeds ships unrecorded and is spoken instead. It degrades;
it never breaks.

**131 new clips. 26 reused, 0 new files.**

### 7.1 Reused verbatim — the 26 letter phonics

The phonic clips already exist at `shared/assets/audio/fragments/<a–z>.m4a` (all 26,
confirmed). They are **not re-recorded and not copied**. They are registered in the game's
manifest with a `../`-prefixed, document-relative path, which `voice-clips.js:clipUrl()`
passes straight through:

```json
"phonic-a": { "file": "../../shared/assets/audio/fragments/a.m4a" },
"phonic-b": { "file": "../../shared/assets/audio/fragments/b.m4a" },
…
"phonic-z": { "file": "../../shared/assets/audio/fragments/z.m4a" }
```

There is exactly one canonical copy on disk. Precedent: `games/sand-tray-letters/` does this
for its 19 consonant phonics.

### 7.2 Runtime composition

The clip count stays **linear, not multiplicative**, because prompts are assembled from a
stem plus a token rather than recorded as 78 whole sentences:

| moment | sequence |
|---|---|
| `find` prompt | `find-intro` → `letter-a` |
| `sound` prompt | `ari-listen` → `says-intro` → **shared** `phonic-a` |
| `picture` prompt | `ari-look` → (ledge sprite springs in) → `starts-intro` |
| success | `sfx.tada` → `burst` → `isfor-apple` → `ari-found` (first) or `ari-cheer-N` |
| wrong (lit) | `sfx.boing` → wobble → `ari-nudge-N` |

Two-clip sequencing with a **~120 ms gap** has direct precedent in `sand-tray-letters`. The
gap is short enough to read as one sentence and long enough that the clips do not clip
each other.

### 7.3 Ari — guide chrome · 24 lines · `ari-*`

Direction: warm, unhurried, close-mic, a little conspiratorial (we are in a cave together).
Never loud, never urgent, never disappointed. Short sentences. Pause between sentences.

| key | line |
|---|---|
| `ari-welcome` | Hello! I'm Ari. Come and explore my cave with me. |
| `ari-mode-find` | Let's find some letters in the dark! |
| `ari-mode-sound` | Listen carefully. We're hunting for letter sounds. |
| `ari-mode-picture` | I found something! Let's see which letter it starts with. |
| `ari-dark` | Ooh… it's dark in here. Good thing we brought a flashlight! |
| `ari-hint-move` | Move your finger to move the light. |
| `ari-hint-dark` | It's hiding in the dark. Let's look over this way. |
| `ari-hint-tap` | You found one! Give it a tap. |
| `ari-listen` | Listen. |
| `ari-look` | Look what I found! |
| `ari-nudge-1` | Ooh, not that one. Keep looking! |
| `ari-nudge-2` | That's a different letter. Let's hear it again. |
| `ari-nudge-3` | Let me help. I'll shine the light closer. |
| `ari-found` | You found it! |
| `ari-cheer-1` | Yes! That's the one! |
| `ari-cheer-2` | Wonderful looking! |
| `ari-cheer-3` | You've got sharp eyes! |
| `ari-cheer-4` | That's exactly right. Well done! |
| `ari-idle-1` | Shine the light around and see what you can find. |
| `ari-idle-2` | Take your time. It's in here somewhere. |
| `ari-next` | Let's find another one. |
| `ari-end` | We lit up the whole cave! Look at all our friends. |
| `ari-replay-tip` | Play again — the letters bring different friends every time. |
| `ari-again` | Shall we explore some more? |

### 7.4 Prompt stems · 3 lines

Recorded with a **trailing rise and a held breath**, so the letter or sound that follows
lands as the end of the same sentence.

| key | line |
|---|---|
| `find-intro` | Find the letter… |
| `says-intro` | Find the letter that says… |
| `starts-intro` | Which letter does this start with? |

### 7.5 Letter names · 26 lines · `letter-a` … `letter-z`

The spoken **name** of the letter, not its sound. **This closes the platform's tracked
`nameClip: null` gap** for all 26 letters (`docs/shared-assets.md`), and at Stage 6 this set
is promoted to `shared/assets/audio/letters/<a–z>.m4a` with `letters.json.nameClip` filled in.

Each is one word, said clearly, slightly slowly, with a tiny lift at the end.

| key | spoken | key | spoken |
|---|---|---|---|
| `letter-a` | ay | `letter-n` | enn |
| `letter-b` | bee | `letter-o` | oh |
| `letter-c` | see | `letter-p` | pee |
| `letter-d` | dee | `letter-q` | cue |
| `letter-e` | ee | `letter-r` | arr |
| `letter-f` | eff | `letter-s` | ess |
| `letter-g` | gee | `letter-t` | tee |
| `letter-h` | aitch | `letter-u` | you |
| `letter-i` | eye | `letter-v` | vee |
| `letter-j` | jay | `letter-w` | double-you |
| `letter-k` | kay | `letter-x` | ex |
| `letter-l` | ell | `letter-y` | why |
| `letter-m` | emm | `letter-z` | zee |

**Production notes that will otherwise sink this batch** (single-word clips are the worst
case for Whisper QA):

- Whisper `initial_prompt` **must** be biased to letter names, or every one of these 26 is
  rejected: `"…ay bee see dee ee eff gee aitch eye jay kay ell emm enn oh pee cue arr ess
  tee you vee double-you ex why zee. A cave, a flashlight, apple ant alligator…"`
- Pre-seed the `ALLOWED` homophone map: `ay/a/eh`, `bee/b/be`, `see/c/sea`, `eye/i`,
  `oh/o`, `cue/q/queue`, `arr/r/are`, `you/u`, `why/y`, `zee/z/zed`, `double-you/w`.
- `bounds()` rejects one-word clips as too short — floor `lo` at **0.20 s** for `^letter-`.

### 7.6 "Is for" lines · 78 lines · `isfor-<word>`

One per entry in `shared/data/letter-objects.json` — 3 per letter × 26. All 78 sprites exist
at `shared/assets/objects/<word>.png` (verified). Said brightly, as a discovery, with the
letter name a touch stressed.

> Note: the existing `shared/assets/audio/prizes/<word>.m4a` clips are **not** reusable here
> — they open with prize-ceremony wording ("You won a turtle. T is for turtle."), which is
> wrong in a cave with no prizes. Hence this new set.

| # | key | letter | line |
|---|---|---|---|
| 1 | `isfor-apple` | A | A is for apple! |
| 2 | `isfor-ant` | A | A is for ant! |
| 3 | `isfor-alligator` | A | A is for alligator! |
| 4 | `isfor-bear` | B | B is for bear! |
| 5 | `isfor-butterfly` | B | B is for butterfly! |
| 6 | `isfor-banana` | B | B is for banana! |
| 7 | `isfor-cat` | C | C is for cat! |
| 8 | `isfor-car` | C | C is for car! |
| 9 | `isfor-cake` | C | C is for cake! |
| 10 | `isfor-dog` | D | D is for dog! |
| 11 | `isfor-duck` | D | D is for duck! |
| 12 | `isfor-dinosaur` | D | D is for dinosaur! |
| 13 | `isfor-elephant` | E | E is for elephant! |
| 14 | `isfor-egg` | E | E is for egg! |
| 15 | `isfor-eagle` | E | E is for eagle! |
| 16 | `isfor-frog` | F | F is for frog! |
| 17 | `isfor-fish` | F | F is for fish! |
| 18 | `isfor-flower` | F | F is for flower! |
| 19 | `isfor-goat` | G | G is for goat! |
| 20 | `isfor-guitar` | G | G is for guitar! |
| 21 | `isfor-grapes` | G | G is for grapes! |
| 22 | `isfor-horse` | H | H is for horse! |
| 23 | `isfor-hat` | H | H is for hat! |
| 24 | `isfor-house` | H | H is for house! |
| 25 | `isfor-igloo` | I | I is for igloo! |
| 26 | `isfor-iguana` | I | I is for iguana! |
| 27 | `isfor-icecream` | I | I is for ice cream! |
| 28 | `isfor-jellyfish` | J | J is for jellyfish! |
| 29 | `isfor-jam` | J | J is for jam! |
| 30 | `isfor-jet` | J | J is for jet! |
| 31 | `isfor-kite` | K | K is for kite! |
| 32 | `isfor-kangaroo` | K | K is for kangaroo! |
| 33 | `isfor-key` | K | K is for key! |
| 34 | `isfor-lion` | L | L is for lion! |
| 35 | `isfor-leaf` | L | L is for leaf! |
| 36 | `isfor-lemon` | L | L is for lemon! |
| 37 | `isfor-monkey` | M | M is for monkey! |
| 38 | `isfor-moon` | M | M is for moon! |
| 39 | `isfor-mushroom` | M | M is for mushroom! |
| 40 | `isfor-nest` | N | N is for nest! |
| 41 | `isfor-nut` | N | N is for nut! |
| 42 | `isfor-narwhal` | N | N is for narwhal! |
| 43 | `isfor-octopus` | O | O is for octopus! |
| 44 | `isfor-owl` | O | O is for owl! |
| 45 | `isfor-orange` | O | O is for orange! |
| 46 | `isfor-pig` | P | P is for pig! |
| 47 | `isfor-penguin` | P | P is for penguin! |
| 48 | `isfor-pumpkin` | P | P is for pumpkin! |
| 49 | `isfor-queen` | Q | Q is for queen! |
| 50 | `isfor-quilt` | Q | Q is for quilt! |
| 51 | `isfor-quail` | Q | Q is for quail! |
| 52 | `isfor-rabbit` | R | R is for rabbit! |
| 53 | `isfor-robot` | R | R is for robot! |
| 54 | `isfor-rainbow` | R | R is for rainbow! |
| 55 | `isfor-snake` | S | S is for snake! |
| 56 | `isfor-star` | S | S is for star! |
| 57 | `isfor-strawberry` | S | S is for strawberry! |
| 58 | `isfor-turtle` | T | T is for turtle! |
| 59 | `isfor-tiger` | T | T is for tiger! |
| 60 | `isfor-train` | T | T is for train! |
| 61 | `isfor-umbrella` | U | U is for umbrella! |
| 62 | `isfor-unicorn` | U | U is for unicorn! |
| 63 | `isfor-ukulele` | U | U is for ukulele! |
| 64 | `isfor-violin` | V | V is for violin! |
| 65 | `isfor-volcano` | V | V is for volcano! |
| 66 | `isfor-van` | V | V is for van! |
| 67 | `isfor-whale` | W | W is for whale! |
| 68 | `isfor-watermelon` | W | W is for watermelon! |
| 69 | `isfor-wagon` | W | W is for wagon! |
| 70 | `isfor-xylophone` | X | X is for xylophone! |
| 71 | `isfor-xray-fish` | X | X is for x-ray fish! |
| 72 | `isfor-treasure-x` | X | X marks the spot on the treasure map! |
| 73 | `isfor-yak` | Y | Y is for yak! |
| 74 | `isfor-yoyo` | Y | Y is for yo-yo! |
| 75 | `isfor-yarn` | Y | Y is for yarn! |
| 76 | `isfor-zebra` | Z | Z is for zebra! |
| 77 | `isfor-zipper` | Z | Z is for zipper! |
| 78 | `isfor-zeppelin` | Z | Z is for zeppelin! |

Line 72 is the one entry that cannot take the "X is for ___" form — `treasure-x`'s word is
*treasure*, which does not start with X. Rather than drop the entry (and break the
"one line per object" invariant) it takes the idiom the object was drawn for. It keeps the
`isfor-` key because the key names the *slot* — "the line said when this object is revealed" —
one per `letter-objects.json` entry, no exceptions; the wording of that slot is free.

All 78 lines are **reveal** lines, spoken in `find` and `sound` as well as `picture`. X is not
a `picture`-mode target at all (§9.12), so none of X's three lines is ever used as a prompt —
only as a payoff.

### 7.7 Count

| set | count |
|---|---|
| `ari-*` guide chrome | 24 |
| prompt stems | 3 |
| `letter-a` … `letter-z` | 26 |
| `isfor-<word>` | 78 |
| **new clips to record** | **131** |
| shared phonics, registered not recorded | 26 |

At Stage 6, 104 of the 131 (the 26 letter names + the 78 "is for" lines) are platform-grade
and get promoted into `shared/` — each promotion behind its own explicit yes.

---

## 8. The confusable-letter table

Ships in `config.json` as `confusables`. Three shape-neighbours per uppercase letter, chosen
for the errors five-year-olds actually make: mirror pairs, rotation pairs, and
same-stroke-family pairs. Round 2 draws one; round 3 draws two.

| letter | confusables | why |
|---|---|---|
| A | V, R, H | inversion (A/V); the diagonal-plus-bowl family |
| B | D, P, R | the classic bowl-on-a-stem family |
| C | G, O, Q | open vs closed circle |
| D | B, O, P | bowl-on-a-stem; D/O closure |
| E | F, B, L | comb strokes; E/F differ by one bar |
| F | E, T, P | one-bar / crossbar family |
| G | C, O, Q | circle family with a tail |
| H | N, M, A | two verticals + a joining stroke |
| I | L, T, J | single-vertical family |
| J | I, U, L | single vertical with a hook |
| K | X, R, Y | diagonal-pair family |
| L | I, J, E | single vertical with a foot |
| M | N, W, H | zig-zag / vertical-pair family |
| N | M, W, Z | zig-zag family; N/Z is a rotation |
| O | Q, C, G | circle family |
| P | B, R, D | bowl-on-a-stem family |
| Q | O, G, C | circle family with a tail |
| R | B, P, K | bowl-plus-leg family |
| S | Z, G, C | curve reversal (S/Z), open curves |
| T | I, F, L | single vertical with a crossbar |
| U | V, J, O | open-bottom curve family |
| V | U, W, Y | the V family |
| W | M, V, N | zig-zag family; W/M is an inversion |
| X | K, Y, Z | crossing-diagonal family |
| Y | V, X, T | forked-diagonal family |
| Z | S, N, X | reversal (S/Z), rotation (N/Z) |

The table is symmetric enough to be fair in both directions but is not required to be —
it is a difficulty knob, not a mathematical relation, and it lives in `config.json` so it
can be retuned from the studio without a code change.

---

## 9. Explicit departures — with reasons

### From the brief (`01-game-concepts/flashlight-cave/brief.md`)

**9.1 "A is for aardvark / armadillo" → "A is for apple / ant / alligator."**
The brief and mockup 03 both make the armadillo the *prize* for finding A. That collides
head-on with the guide role: Ari is the child's companion, on their side of the screen,
present in every mode and every letter. A character who is also a collectible answer is
sometimes the helper and sometimes the loot, which is confusing at five and impossible to
stage (Ari cannot congratulate the child on finding Ari). So Ari guides, and **A reveals
apple, ant or alligator** from the shared 78-object set — which is already illustrated,
already recorded, already consistent with every other alphabet game on the platform, and
gives three different rewards for A instead of one. This is the single biggest departure in
the document and it is the plan's locked decision.

**9.2 Age 3–6 → 5–6.** The brief targets 3–6. The platform targets 5–6, and this game's
skill (letter *name* and *sound* recall, plus confusable discrimination) is squarely a
5–6 job. A three-year-old can enjoy waving the light, which is fine, but the design is not
tuned for them.

**9.3 The brief's beat order is reordered.** The brief says the phonics prompt fires *after*
the child spots a letter ("Spotting a glowing letter prompts a phonics prompt"). That is
backwards for a search game — the child must know what they are looking for *before* they
start looking, or the search is aimless and the "answer" is whatever they happen to find.
The prompt therefore comes first, at round start, and the sound is heard again inside the
reveal. **Hear it → see it → do it** (`philosophy.md` principle 4).

**9.4 The brief's "letter name AND phoneme on tap" is trimmed.** Speaking the letter name,
the phoneme, the word and the praise on every success is four voice events in a row — too
long for a five-year-old's attention and it buries the payoff. The name (or the sound) has
*already* been heard as the prompt seconds earlier. Success speaks `isfor-<word>` then one
cheer, and that's all.

**9.5 "Rescue friendly animals trapped in the shadows" is dropped.** Nothing in this cave is
trapped or in danger. The framing is discovery, not rescue: a cave full of friends waiting
to be found. `philosophy.md` guardrails — no jeopardy, no menace, and nothing that reads as
a loss if the child stops playing.

### From the mockups (`output/ui-mockups/`)

**9.6 The flashlight control tray is removed; the beam has no handle.**
Mockup 02 shows a docked flashlight in a tray at the bottom. Rejected: a handle is a small
precision target in a dark scene, and it separates where the hand is from where the eye is.
The beam follows the finger directly, anywhere on the screen. The flashlight becomes
decoration that rides the beam and explains where the light comes from.

**9.7 One "EXPLORE" button → three mode tiles.**
Mockup 01 has a single EXPLORE button. The family has three modes, and the platform splash
idiom is the mode menu (`counting-treasure-cups`, `sound-sprouts`, every engine game). One
button would bury two thirds of the game.

**9.8 The "NEXT" text pill → the round `shared/assets/ui/btn-play.png`.**
Mockups 01 and 03 use word buttons (EXPLORE, NEXT). The audience cannot read. Every
advance/again control in this game is the shared round play button, in the shared position
(centre-bottom), because a child who learned it in another QLOBE game already knows it.

**9.9 The prompt banner is removed entirely.**
Mockup 02 shows "Find the letter A" in a cream banner. Two problems, and the second is the
serious one: (a) it is text, which the audience cannot read; (b) **rendering the target
letter in the banner converts the task from recall to visual matching.** The child would
scan for the shape in the banner rather than remember what "ay" looks like — a strictly
easier and different skill. The prompt is **spoken only**. In `picture` mode the prompt is a
*picture*, so it is shown, on the lit ledge, where it cannot be missed.

**9.10 "1 of 3" → three progress pips.**
Same no-reading rule; same solution as `counting-treasure-cups`. The green tick in mockup 03
becomes the pip filling.

**9.11 No baked wordmark in `cave-splash.jpg`, and no baked light pool in `cave-play.jpg`.**
The title renders as DOM Fredoka text over the plate so it stays editable, sharp at any
density, and localizable. The play plate ships **evenly lit** — see §5.3. Both mockups bake
a light pool; if the plate carries one, the veil double-darkens it and the effect reads as
mud.

### From the repo canon and the shared data

**9.12 X is not a `picture`-mode target. `picture` mode covers 25 letters.**
`picture` mode's one skill is **initial-sound identification** — the child names the pictured
thing and works out the sound it starts with. Checked object by object,
`shared/data/letter-objects.json` gives X nothing that can honestly do that job:

| X's object | why it fails an *initial-sound* prompt |
|---|---|
| `treasure-x` (a treasure map with a big red X) | the word is **treasure** — it starts with /t/ |
| `xray-fish` | "**ex**-ray" — the child is hearing the letter's **name**, not an initial sound; that is `find` mode's skill, not this one |
| `xylophone` | phonetically **/z/**. And Z is in X's own confusable row (§8), so a round-2 or round-3 X target can legally put Z on screen — at which point a child who has been taught sounds picks Z and is *right*, and the game tells them they are wrong |

That last row is the same class of bug as the C/K phonic collision (§2.2), and the same
answer applies: never build a round whose prompt has two correct answers. Rather than special-
case a decoy ban for one letter, X is simply not drawn as a `picture` target. `find` (letter
name) and `sound` (the /ks/ phonic, which `letters.json` records as `"kss"`) both handle X
correctly and both keep it.

**All three X objects stay in the game as *reveal* objects** — "X is for xylophone!",
"X is for x-ray fish!", "X marks the spot on the treasure map!" all still happen, after the
child has found X in `find` or `sound`. Xylophone and x-ray are retained deliberately despite
the phonetics: they are what every alphabet chart a five-year-old will meet says, and
contradicting the chart would confuse more than it corrects. Saying "X is for xylophone" as a
*celebration* is alphabet convention; asking "what does xylophone start with?" and demanding
X is a false teaching. The distinction is the whole of this decision.

**9.13 The game reads `letter-objects.json`, not `letters.json.objects`.**
The two shared datasets disagree: `letters.json` reports `objectCount: 0` for A, E, I, O, U,
Q and X (it counts CVC words from `words.json`), while `letter-objects.json` gives all 26
letters three objects each. The second is the correct source for this game, and
`content.js`'s `letterObjects(letter)` accessor is the way in (verified present, alongside
`objectImage(word)` and `letterInfo(letter)`). `letters.json` is used only for `phonic` — the
sound-mode prompt and the `sameAnswerAs` decoy rule. Neither file is edited by this game;
`letters.json`'s stale `objectCount` is a platform-data wart worth fixing separately, and is
noted for Stage 6 alongside the `nameClip` fill.

**9.14 Art world: Storybook Rooms, not the reading-phonics default of Toy Table.**
Reasoned at length in §5, under the escape clause `art-direction.md` provides.

**9.15 No video, though the concept is a video.**
Story Screen is a different world with a different job. Skipping it saves ~2.5 MB, a whole
production sub-stage, and the `<video>` lifecycle bug class. The cave carries the drama.

**9.16 No background music.**
The audio channel is already carrying a spoken prompt, a spoken word, a cheer and the SFX
layer. Music competing with a single-phoneme prompt would damage the one thing the game
teaches. `shared/js/sfx.js` carries the tactile layer.

### From the beta being replaced (`games/letter-treasure-hunt/`)

**9.17 The `choose-one` engine is abandoned entirely.**
The stub is a 3-card picture quiz driven by 64 lines of config: hear a sound, tap one of
three pictures. It proves nothing this game needs and it cannot express a search. Per
`docs/polish-process.md` §4, custom code is the default for a polished game, and a polished
game may abandon its engine.

**9.18 Scope goes from 6 letters to 26.**
The stub covers b, s, m, c, p, t. There is no reason to cap at six: the phonics, the
objects and the sprites exist for all 26.

**9.19 New id, not an in-place upgrade.**
Ships as `flashlight-cave`; `letter-treasure-hunt` flips to `status: archived` with the
summary "Superseded by flashlight-cave, the live spotlight rebuild." Precedent:
`problem-solving-puppets` → `puppet-problem-solvers`. **The stub is not touched until
Stage 6.**

---

## 10. Casting — Ari the armadillo

**New platform character.** The 14th cast member. `docs/characters.md`: *"First character gets
designed when a game needs it — not before."* This game needs a guide who lives underground,
and the concept video and all four mockups already have one.

### 10.1 Why not an existing cast member

`docs/polish-process.md` §2 makes this a review gate: *"Confirm the platform cast is used
where characters appear — recognizable friends across games beat one-off characters."* The
existing cast was checked against this game before proposing a new face:

| existing | why not |
|---|---|
| **Maya**, **Leo** (`lunchbox-pack`) | human lunch **kids** — peers the child packs food *for*. They ask and receive; they do not guide. A peer holding the flashlight makes the child the assistant. |
| **Nia**, **Sam**, **Ravi** | the same peer register, and none is established enough to carry a whole game's voice yet |
| **Captain Goldie**, **Skipper** (`counting-treasure-cups`) | the closest fit — a guide plus a sidekick, in a pose-actor pack this game copies the format of. But they are *pirates*, with a whole world (ship, beach, treasure) and a broad theatrical voice. Dropping a pirate captain into a quiet cave either drags the pirate world in with him or hollows him out. `art-direction.md`: *"Never mix worlds inside one game."* |
| the plush rigs — **bear**, **fox**, **frog**, **rabbit**, **unicorn**, **doggy**, the princesses | puppet-theatre rigs for `shared/js/stage/theater.js`. They are bone-rigged performers for story games, not pose-actor guides, and none of them belongs underground. |

So: no existing cast member is a *guide who lives in this place*, and this game's whole
premise is being led somewhere by someone who knows the way. `characters.md`'s rule is not
"never add" — it is "add when a game needs it, grounded in the real use". This is that case,
and the character is designed to be reusable: an armadillo guide works for any burrow, night,
digging, or hidden-object game the platform makes next.

### 10.2 The character-sheet deliverable

`docs/characters.md` requires a filled copy of
`shared/characters/character-sheet-template.md` at status `proposed`, and the game's
`game.json` to name the character id. Both are in scope for this build:

- **`games/flashlight-cave/characters/ari/character-sheet.md`** — the filled template
  (Name · Role · Personality · Visual design · Voice · Movement/animation · Appears in ·
  Art-direction prompts · Status `proposed`). It is authored **in the game folder**, not in
  `shared/`, because `CLAUDE.md` forbids writing into `shared/` without an explicit yes. §10's
  visual description, §7.3's voice direction and §10.3's pose table are its source content.
- **`game.json`** gets `"characters": ["ari"]` (precedent: `counting-treasure-cups` names
  `captain-goldie` / `skipper` the same way).
- **Stage 6**, behind its own yes: the sheet, `portrait.png` (a 1024² bust cut from the
  `neutral` pose) and the pose pack move to `shared/characters/ari/`, status flips to
  `adopted`, and `Appears in:` lists `flashlight-cave`.

The 128 px silhouette test (`characters.md` principle 1) is a **Stage 3 art gate**: the
`neutral` pose is rendered as a flat black silhouette at 128 px and must still read as
*round body, long snout, big ears, banded tail*. If it does not, the design changes before
the other five poses are derived from it.

**Design, read off mockups 01 and 03.** A small, round, friendly nine-banded armadillo,
roughly toddler-proportioned — big head, short limbs, standing upright on his hind feet.
Warm taupe-and-cream banded shell with soft rounded plates (never spiky, never armoured —
this is a blanket, not a weapon). Cream-tan belly and face. Long tapering snout ending in a
**pink button nose**. Large pink-lined ears, upright and expressive. Big black eyes with a
single white highlight and a visible upper lash line — the platform's eye idiom. Open,
smiling mouth with a small pink tongue. Short pink-toed paws. A banded, tapering tail. He
reads unmistakably at 128 px from silhouette alone: **round body, long snout, big ears,
banded tail** (`docs/characters.md` rule 1).

**Voice.** The platform teacher voice, a shade brighter and younger. Warm, unhurried,
close-mic, slightly conspiratorial — the friend who brought the flashlight. He never
expresses disappointment (`ari-nudge-*` are all curiosity, never correction) and never
hurries the child.

**Role, precisely.**
- Ari **guides**: welcome, mode intro, hints, nudges, cheers, the end.
- Ari is **never a collectible answer**, never appears as one of the letters' objects, never
  appears in `shared/assets/objects/`, and is never the thing revealed in an alcove.
- Ari is **off-screen during the search**. He slides in from the edge to speak and slides
  out again. A guide standing in front of the cave the child is searching is an obstacle.

### 10.3 Pose pack — and why the DOM renderer, not the shared Pixi one

`assets/pose-actors/ari/` in the `qlobe-pose-actor` format:
`poses.json` (`format`, `formatVersion: 1`, `id`, `label`, `canvas: [1024,1024]`,
`anchor: [0.5, ~0.95]`, `transition: {kind:'paper-pop', durationMs:220}`, six `poses` entries
each `{art, alt}`) plus `poses/<name>.webp`. Byte-for-byte the shape
`counting-treasure-cups/assets/pose-actors/captain-goldie/poses.json` uses, so the packs stay
studio- and library-compatible.

**The renderer is `counting-treasure-cups/js/actor.js`, copied verbatim — not the shared
`shared/js/stage/pose-sprite.js`.** That looks like a shared-first violation
(`philosophy.md` principle 9), so here is the reason it is not:

1. **Ari appears on the splash, and the splash must stay Pixi-free.** `pose-sprite.js`'s
   signature is `loadPoseActor(PIXI, manifestUrl)` — using it on the splash forces
   `loadPixi()` on the boot path, which is the one thing §3.0 is built to avoid (798 KB before
   first paint, on the screen a child looks at for two seconds).
2. **Ari lives in HUD space, not play-field space.** He is positioned against the viewport
   edge in CSS, must not be darkened by the veil, must not scale with the cover-fit transform,
   and must survive the no-WebGL fallback screen (§3.5) where there is no Pixi scene at all.
   A DOM `<img>` gets all four for free; a Pixi sprite needs the transform, a z-layer
   exception, and a second code path.
3. The two renderers implement the **same pack contract** — same manifest, same pose names,
   same anchor semantics, same paper-pop swap — which is exactly why `actor.js` says so in its
   own header comment. The reusable artefact here is the *pack format*, and it is shared.

The format's second renderer is a documented platform fact, not a fork of one. Six poses:

| pose | used for |
|---|---|
| `neutral` | splash idle, resting |
| `enter` | sliding in from the edge |
| `notice` | a nudge or a hint — paw raised, head tilted, curious |
| `interact` | holding the flashlight up, shining it |
| `react` | the "ooh!" beat as the letter is found |
| `celebrate` | reveal and end screen — both paws up, waving |

> **Production trap:** the neutral reference must be **arms down and calm**. A cheerful,
> raised-arm reference bleeds into every derived pose and you end up with six variants of
> "waving".

---

## 11. Art list

Budgets from `docs/art-direction.md`: one background per game ≤ 300 KB at 1600 × 1200;
sprites 30–80 KB.

Two budgets below sit just outside those numbers, deliberately and with precedent:

- **Two backgrounds, not one** (`cave-play.jpg` + `cave-splash.jpg`). They are never on screen
  together and only one is fetched per screen; art-direction's "one per game" is a
  per-play-field rule and every splash-plus-play-field game on the platform ships two.
- **Ari's poses at ≤ 85 KB each**, 5 KB over the sprite ceiling. Pose art is a 1024² full-body
  figure, not a play-field object; `counting-treasure-cups` ships its captain at 74–90 KB per
  pose and ~483 KB per pack. ≤ 85 KB / ≤ 500 KB is that precedent written down.

### New, produced for this game

| asset | description | size | budget |
|---|---|---|---|
| `assets/cave-play.jpg` | The play field. A cosy magical cave interior, **evenly and warmly lit throughout** — rounded stalactites, navy rock with ochre highlights, violet and cyan crystals, alcoves in the back wall, glossy depth, crisp navy outlines. No spotlight, no light pool, no beam, no vignette. No letters, no text, no characters, no UI. | 1600 × 1200 | **≤ 300 KB** |
| `assets/cave-splash.jpg` | The title backdrop. Cave mouth at dusk from mockup 01 — crystals, warm tunnel glow, star-flecked sky — with the wordmark, the EXPLORE button, the armadillo and the flashlight all removed. | 1600 × 1200 | **≤ 300 KB** |
| `assets/flashlight.png` | The yellow flashlight from mockup 01/02, alpha cut-out, three-quarter view, pointing up-left, ready to be mirrored. Rides the beam; decoration only. | ~420 × 420 | **≤ 60 KB** |
| `assets/pose-actors/ari/poses/neutral.webp` | Ari standing calm, **arms down**, gentle smile. The reference all other poses derive from. | 1024 × 1024 | ≤ 85 KB |
| `assets/pose-actors/ari/poses/enter.webp` | Ari mid-step, leaning in from the edge. | 1024 × 1024 | ≤ 85 KB |
| `assets/pose-actors/ari/poses/notice.webp` | Head tilted, one paw raised, curious. | 1024 × 1024 | ≤ 85 KB |
| `assets/pose-actors/ari/poses/interact.webp` | Holding the flashlight up and shining it. | 1024 × 1024 | ≤ 85 KB |
| `assets/pose-actors/ari/poses/react.webp` | Eyes wide, both paws to cheeks — "ooh!". | 1024 × 1024 | ≤ 85 KB |
| `assets/pose-actors/ari/poses/celebrate.webp` | Both paws up, waving, big grin (mockup 03's pose). | 1024 × 1024 | ≤ 85 KB |
| `assets/pose-actors/ari/poses.json` | `qlobe-pose-actor` manifest: canvas, anchor, transition, 6 pose entries. | — | ≤ 2 KB |
| **Ari pack total** | | | **≤ 500 KB** |
| `assets/audio/<131>.m4a` | The voice set of §7. AAC 64 kbps mono. | — | ~14 KB avg, **≤ 2.2 MB total** |
| `assets/audio/ref/ari.flac` | Ari's committed reference voice, so a future game matches. | — | ≤ 1.5 MB |
| `assets/audio/{manifest,lines,qa}.json` | clip index · derived fallback text · whisper QA report | — | ≤ 60 KB |
| `assets/og-image.jpg` | Social card, produced by `tools/pipeline/capture_og_images.mjs`. | 1200 × 630 | ≤ 200 KB |
| `assets/source/` | Every generation intermediate, committed (`docs/asset-provenance.md`). | — | not shipped to the page |

### Reused from `shared/` — nothing new produced

| asset | use |
|---|---|
| `shared/assets/objects/<word>.png` × 78 | the reveal objects; loaded on demand, one per round |
| `shared/assets/objects/apple.png` | also the `picture` mode splash tile face |
| `shared/assets/audio/fragments/<a–z>.m4a` × 26 | the `sound` mode phonics, registered by `../`-path |
| `shared/assets/ui/btn-home.png` | splash only |
| `shared/assets/ui/btn-back.png` | play · reveal · end |
| `shared/assets/ui/btn-sound.png` | play — replay the prompt |
| `shared/assets/ui/btn-play.png` | reveal — next · end — again |
| `shared/fonts/fredoka-latin-600-normal.woff2` | title, letters, pips |

All eight verified present on disk at these exact paths, at design time: 78 object sprites,
26 phonic clips, 5 UI button PNGs, the font. Nothing in this list is regenerated
(`docs/shared-assets.md`, "Reuse rule").

**Deliberately *not* reused:** `shared/assets/audio/prizes/<word>.m4a` (78 clips, all present)
— they open with prize-ceremony wording, "You won a turtle. T is for turtle.", which is wrong
in a cave with no prizes. This is the one place the game re-records rather than reuses, and
§7.6 is the justification. The new `isfor-*` set is promoted back to `shared/` at Stage 6 so
the next alphabet game does not face the same choice.

### Hands-off

| asset | note |
|---|---|
| `assets/hub/tiles/flashlight-cave.jpg` | **User-curated. The build never writes it.** `js/hub.js:tileArt()` has no `onerror`, so a missing tile renders as a broken image on the catalog. This blocks ship. |

### Not produced, deliberately

- **No letter art.** 26 letters × states as PNGs would be heavier and worse than
  `PIXI.Text` (§4.4).
- **No mode-tile art.** The three splash tiles are composed from DOM text, CSS and one
  shared object sprite (§3.1). If they want bespoke art later, that is an upgrade, not a
  dependency.
- **No second *play-field* plate.** The translucent veil means the dark cave and the lit cave
  are the same image (§4.1) — so the play field is one plate, not the two a baked-lighting
  design would need. (`cave-splash.jpg` is a different screen, not a second play field.)
- **No video** (§9.15).

---

## 12. Shared modules used

| module | use |
|---|---|
| `shared/js/stage/spotlight.js` | **NEW, built by this game, reusable** — the veil/hole compositing, `illumination()`, target registry, litness, quality ladder |
| `shared/js/stage/stage.js` | lazy Pixi load, app + canvas lifecycle |
| `shared/js/stage/particles.js` | `burst(PIXI, container, x, y, {count})` on reveal; `particles.sparkle(PIXI, container, x, y, color)` under reduced motion — **not** `sfx.sparkle()`, which is the audio chime of the same name |
| `shared/js/stage/tween.js` | `to()` for beam glides and the veil fade, `popIn()` for the object spring, `ease.outBack` / `ease.inOutSine`. `to()` already resolves instantly under `prefers-reduced-motion`, so §15's reduced-motion behaviour is partly free |
| `shared/js/voice-clips.js` | the recorded-clip channel, via a thin game-local `js/voice.js` |
| `shared/js/speech.js` | the fallback voice for any unrecorded clip |
| `shared/js/sfx.js` | `tada`, `boing`, `tick`, `sparkle`, `unlock` |
| `shared/js/tap.js` | `onTap` — the one press path for every HUD button and mode tile |
| `shared/js/content.js` | `letterObjects` / `letterInfo` — the letters, phonics and objects |
| `shared/assets/…` | as listed in §11 |
| `shared/vendor/pixi.min.js` | v8.19.0, UMD → `window.PIXI`, vendored, lazy |

**Promotions back into `shared/` at Stage 6** (each behind its own explicit yes): the 26
letter-name clips → `shared/assets/audio/letters/` + `letters.json.nameClip` filled (closes
a tracked platform gap) · the 78 `isfor-*` clips → `shared/assets/audio/isfor/` +
`isforAudio(word)` in `content.js` · `shared/characters/ari/` → `adopted` · a "lighting
variant" paragraph in `art-direction.md` · optional `colors` + `shape: 'star'` options added
**to** `particles.js` (never a fork).

### 12.1 Path resolution — three different depths, one rule each

`docs/interaction-patterns.md` §10. Getting this wrong 404s only in production (GitHub Pages
is case-sensitive and serves from `/games/flashlight-cave/`, so a path that resolves locally
can still break live). The three cases in this game:

| where the path is written | resolves against | correct form |
|---|---|---|
| **inside `shared/js/stage/spotlight.js`** (shared module) | the **module URL** | `new URL('../../assets/…', import.meta.url).href` |
| **`games/flashlight-cave/js/*.js`** — `import` statements | the importing file | `../../../shared/js/…` (the `js/` folder is one level below the game root) |
| **`games/flashlight-cave/js/*.js`** — Pixi `Assets.load()`, `new Image()`, `<audio>.src` | the **document** (`/games/flashlight-cave/index.html`) | `../../shared/assets/objects/apple.png` |
| **`games/flashlight-cave/css/style.css`** — `url(...)` | the **stylesheet** | `../../../shared/assets/ui/btn-home.png` |
| **`assets/audio/manifest.json`** — a `file` pointing at a shared clip | the document, via `voice-clips.js:clipUrl()` which passes any `../`-prefixed or absolute path straight through | `../../shared/assets/audio/fragments/a.m4a` |

**`spotlight.js` loads no assets at all** — both its textures are baked at module scope from a
2-D canvas `createRadialGradient` — so the shared-module case never actually arises. That is a
property worth preserving: a shared stage module with zero asset dependencies is one that
drops into any game without a path audit. If a future variant needs a texture file, it uses
`new URL(…, import.meta.url)`, not a document-relative path.

Every path in the game is lowercase, relative, and contains no domain.

---

## 13. Feedback model

- **Success:** `sfx.tada` → letter blooms → star burst → the beam widens and floods the
  alcove → the object springs out → "A is for apple!" → Ari cheers → a pip fills.
- **Retry:** `sfx.boing`, a small wobble on the letter the child chose, one of three
  escalating-in-helpfulness Ari lines, the prompt again. Nothing is removed, nothing
  reshuffles, nothing is scored, input returns within 1.5 s.
- **Hint (three tiers, always modelling, never solving):**
  1. `ari-hint-move` — how the control works (once per session).
  2. `ari-hint-tap` — you are looking right at it (once per round).
  3. `ari-hint-dark` + the beam glides to 1.2 R short of the answer — where to look. The
     child still finds it and still taps it.
- **Celebration:** the reveal, and then the end screen lighting the entire cave with all
  three friends standing in their alcoves.
- **Never:** a score, a streak, a timer, a "Game Over", a red X, a buzzer, a locked-out
  state, or an Ari line that expresses disappointment.

---

## 14. Difficulty progression and replay variation

**Within a mode** (§2.1): 3 → 4 → 5 letters; beam 230 → 195 → 165 art px; 0 → 1 → 2
confusable decoys. The prompt shape, the gesture, the reward and the furniture are
identical across all three rounds, so what the child feels getting harder is *the search*,
not the game.

**Across the three modes:** `find` (a name you were just told) → `sound` (a phoneme you must
map to a shape) → `picture` (a word you must name yourself, then segment). Increasingly
indirect, same loop. The splash presents them in that order but does not lock them —
a child may play any mode at any time.

**Replay variation.** All 26 letters are targets in `find` and `sound`, 25 in `picture`
(§9.12), so two sessions rarely share a target set — the chance of the same three targets in
the same order is 1 in 15,600. Within a letter, the object is drawn independently of the letter, so a replayed A gives
ant, then alligator, then apple. Letter positions are re-jittered every round. Decoys are
re-drawn every round. Cheers are random from four. `ari-replay-tip` tells the child this
outright on the end screen. `QLOBE_DEBUG.seed(n)` pins all of it for QA.

---

## 15. Accessibility and tuning

- **Touch targets ≥ 96 px.** HUD buttons 112 px. Splash mode tiles ≥ 300 px. Letters carry a
  110 art-px hit radius, which is ≥ 140 css px diameter at the smallest supported viewport
  (§4.3). The QA gate measures every `getTargets()` rect and every `.hud-button` in **both**
  orientations.
- **`prefers-reduced-motion`:**
  - the beam **snaps** instead of lerping (no `k = 0.45` smoothing) and tap-to-move is
    instant instead of a 220 ms glide;
  - no particle burst — one `sparkle()` flash instead;
  - no spring scales; the object appears at full size;
  - the end-screen veil is set directly, not animated;
  - Ari's pose swaps skip the paper-pop transition;
  - **every mode still completes, still speaks and still celebrates.** Reduced motion is not
    a reduced game. `getState().reducedMotion === true` is asserted in the gate.
- **Keyboard / assistive tech.** The canvas is focusable with `role="application"` and an
  `aria-label`. **Arrow keys nudge the beam by `0.4 R`** (snap under reduced motion, 120 ms
  ease otherwise). **Enter / Space attempts the brightest lit target** (`litTargets(0.5)[0]`)
  — and if nothing is lit, does nothing except speak `ari-hint-move`, so the keyboard path
  obeys the same "you cannot answer what you cannot see" rule as touch. This routes through
  `onTap`'s `click`-with-`detail === 0` convention, so there is still exactly one press path.
  Tab order: back → sound → canvas → (on reveal) the play button.
  The current prompt is mirrored into an `aria-live="polite"` region for screen readers.
  That text is never rendered, so it does not breach the no-reading rule.
- **Orientation.** Portrait 834 × 1194 and landscape 1180 × 820 are both first-class. The
  plate is cover-fit, so portrait crops the sides of the cave; the playable band and the
  letter lattice are chosen to survive that crop. Splash tiles reflow row → column.
- **iPad tuning** (`interaction-patterns.md` §9), all of it, all screens:
  - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover,
    user-scalable=no">` and `<meta name="apple-mobile-web-app-capable" content="yes">`.
  - `html, body { overflow:hidden; -webkit-user-select:none; user-select:none;
    -webkit-touch-callout:none; overscroll-behavior:none; touch-action:none; }`.
  - `contextmenu` and `gesturestart` both `preventDefault()`ed at the window — a five-year-old
    resting two fingers on a dark screen must not summon a zoom or a copy menu.
  - Pointer Events only for gameplay; `click` exists solely for keyboard/AT, via `onTap`.
  - **Safe-area insets.** Every corner HUD button is positioned with
    `max(12px, env(safe-area-inset-<side>))`, exactly as `counting-treasure-cups` does, so
    back, sound and the pips clear the notch and the home indicator in both orientations. The
    playable band of §4.3 already keeps every letter out of the top and bottom 260/200 art px,
    so no letter can hide under a system affordance either.
- **`devicePixelRatio` capped at 2** — already handled by
  `shared/js/stage/stage.js:createStage()` (`resolution: Math.min(2, devicePixelRatio)`,
  `autoDensity: true`). The game does not set it a second time.
- **Degradation ladder.** Mean frame `> 22 ms` over 2 s → `quality: 'low'` (drop the additive
  glow, halve the hole texture). `> 30 ms` → `'flat'` (veilAlpha 0.45, fixed large radius, no
  glow — ugly, fully playable). Never promotes back inside a mode, so the picture cannot
  oscillate. No WebGL at all, or `webglcontextlost` → the static screen of §3.5.
- **No ads, no accounts, no analytics, no network call at runtime.** Every asset is local
  and relative; every path is lowercase.

---

## 16. `window.QLOBE_DEBUG` — the QA surface

v1 per `shared/js/engines/README.md`, plus four beam extensions. Everything routes through
the real handlers — there is no test-only code path.

```js
window.QLOBE_DEBUG = {
  version: 1, gameId: 'flashlight-cave', engine: config.engine, ready: booted,
  listModes(), startMode(id), getState(), getTargets(), tap(id), winRound(),
  mute(), seed(n), fastTimers(scale = 0.05), home(),

  getBeam:     () => ({ x, y, radius, quality }),   // ART space
  moveBeam:    (x, y) => spotlight.moveTo(x, y),    // ART space, no animation
  lightTarget: (id) => {/* move the beam onto a target; resolves once it is lit */},
  getLedge:    () => null | { dom, art, rect, hasObject, objectAlpha, objectBounds,
                              objectTex, groupScale, word },   // rect/bounds in SCREEN px
  getTorch:    () => null | { x, y, facesRight, beamX, beamY }, // ART space
  perf:        () => spotlight.metrics(),
  setQuality:  (q) => spotlight.setQuality(q),      // 'high' | 'low' | 'flat'
  toScreen:    (x, y) => ({ x, y }),                // ART -> screen px
  tickerStarted: () => false,                       // the pump owns drawing (§4.1)
};
```

**The v1 contract, exactly** (`shared/js/engines/README.md`), plus this game's extensions:

| member | shape | note |
|---|---|---|
| `getState()` | `{ screen, mode, round, roundsTotal, awaitingInput, reducedMotion, quality }` | **`screen` adds `'reveal'` to v1's `'splash' \| 'play' \| 'end'`** — a declared extension, because the reveal is a real state with its own input rules (§3.3). `reducedMotion` and `quality` are extensions too. |
| `getTargets()` | `[{ id, role: 'correct' \| 'wrong', rect: {x,y,w,h}, lit, litness }]` | `rect` is v1 and is in **screen** px so the gate can click it; `lit` / `litness` are extensions and are the point of the whole surface — they are what let the gate assert that a tap on an unlit correct target is *not* an attempt, the load-bearing rule of §6.4. Roles are truthful for the current prompt. |
| `tap(id)` | `Promise<{ accepted: boolean }>` | goes through the **exact** handler a real `pointerup` reaches — there is no test-only path. `accepted:false` for a lit wrong tap **and** for any tap on an unlit target. |
| `startMode(id)` | `Promise` | resolves when round 1 awaits input |
| `winRound()` | `Promise` | completes the round through correct inputs |
| `listModes()` · `mute()` · `seed(n)` | v1 | `seed(n)` pins the letter bag, the decoys, the lattice cells and the object draw |
| `fastTimers(scale = 0.05)` | extension, **required** by `polish-process.md` §4 | scales every idle/hint/auto-advance timer |
| `home()` | extension | returns to the splash from any screen, through the same teardown as the back button (§3.6) |
| `getBeam()` · `moveBeam(x,y)` · `lightTarget(id)` · `perf()` | extensions | **art space** (§4.2), so QA is resolution-independent |
| `setQuality(q)` | extension | forces a rung of the quality ladder. The runtime only ever *demotes*, and only on a slow device, so `'flat'` is otherwise unreachable from a desktop gate — this is how `tools/qa.mjs` proves the game still completes there. Nothing in the game reads it. |
| `toScreen(x,y)` · `tickerStarted()` | extensions | the art→screen transform and "is the Pixi ticker still stopped?", so the gate can click an art-space point and assert §4.1's on-demand pump survives a hide/show cycle |
| `getLedge()` | extension | `null`, or the picture-mode prompt object: its `art` spot, its **screen** `rect` (the slot `ledgeSpot()` clamps to), `hasObject` / `objectAlpha` / `objectTex` (is there a *picture*, or only the halo?), `objectBounds` (the sprite's **real painted box**, screen px), `groupScale` (the 380 ms pop-in, so a gate can tell "born" from "settled") and `word`. `rect` is derived from `ledgeSpot()` and `objectBounds` from the sprite, and that difference is load-bearing: the rect stays healthy even if `reflow()` forgets to move the sprite, so a gate must assert both (§20.3). |
| `getTorch()` | extension | `null`, or the flashlight decoration in **art space** with the beam it is riding. `facesRight` is which way the lamp points *after* mirroring, so the invariant a gate can assert is the relationship — right of the beam means facing left — never a hard-coded sign (§20.1). |

`getTargets().rect` being in screen px while `getBeam()`/`moveBeam()` are in art space is
deliberate and is the one place the two spaces meet: rects exist to be clicked by Playwright,
beams exist to be positioned by the game's own logic. Both are documented on the object.

---

## 17. Open risks this design knowingly carries

1. **The clean lit plate.** If `cave-play.jpg` bakes a light pool, the veil double-darkens it
   and the whole effect reads as mud. Two independent generation recipes exist; pick by eye
   and settle it *before* Stage 4. Highest-probability failure in the build.
2. **Letter legibility at `veilAlpha 0.9`.** An unlit letter must be genuinely invisible —
   that is the game — but a bright-room iPad at 50 % brightness may show nothing at all,
   cave included. Base alpha 0.06 plus the illumination curve is the starting point; the
   real numbers are settled on the device in Stage 3.5, not from a desktop screenshot.
3. **Tap ambiguity.** "Tap a lit letter = answer, tap anything else = move the light" is
   clean on paper. A child who taps *near* a lit letter and gets a beam move will read it as
   broken. Mitigated by the generous 110 art-px hit radius and by `ari-hint-tap`. **Watch
   this specifically in the iPad playtest** — it is the one rule that playtest could
   overturn.
4. **131 clips, 26 of them single letters** — the worst case for transcription QA. §7.5's
   biased `initial_prompt`, homophone map and duration floor are not optional.
5. **The hub tile.** `hub.js` has no broken-image fallback. The easiest thing in this plan to
   forget, and it is visible on the front page of the site.
6. **The vowel phonics are close together.** `letters.json` gives A/E/I/O/U the phonics
   `ah / eh / ih / oh / uh`. They are distinct phonemes and a real skill, but the recorded
   clips are ~300 ms apart in a way an adult hears and a five-year-old may not.
   `config.phonicNeighbours` (§2.2) keeps them out of round 1; rounds 2–3 allow them on
   purpose. **This is a playtest question, not a design certainty** — if the iPad session shows
   children guessing on vowel rounds, widen the exclusion to all three rounds, which is a
   one-line config change.
7. **The reveal is the longest uninterruptible-looking beat in the game** (~7 s of tada →
   burst → flood → object → line → cheer). Input is not actually locked out of *back*, and the
   6 s auto-advance bounds it, but a child who taps repeatedly during it gets nothing back.
   Watch whether the beat wants shortening on the iPad.

---

## 18. Movement prompts (`philosophy.md` principle 8)

Digital-only but body-aware. Two, both optional, both spoken and never required to advance:

| when | line | what the child does |
|---|---|---|
| `ari-hint-move`, the first play screen of a session | already written as *"Move your finger to move the light."* — Ari's `interact` pose holds an imaginary flashlight up as he says it | the child mirrors the gesture; the pose *is* the instruction, which is why it is a pose and not a caption |
| `ari-replay-tip`, the end screen | *"Play again — the letters bring different friends every time."* | — |

The game deliberately does **not** ask the child to get up, hop or clap. It is a quiet,
close-focus, dark-room activity; a bounce prompt would break the one atmosphere the whole
design is built on. The body-awareness here is the hand: a real sweeping arm gesture across a
tablet, which is a genuinely different motor pattern from the tap-tap of every other phonics
game on the platform, and is the reason this game exists as a drag game at all.

---

## 19. Registry manifest — `game.json`

Canonical for title, status, category, age, accent, modes and characters; `games.json` mirrors
those and owns only `path`, `icon`, `uses[]`, `summary` and ordering (`CLAUDE.md`). Never
hand-edit a mirrored field; run
`node tools/pipeline/sync-games-registry.mjs --write --only flashlight-cave`.

```json
{
  "id": "flashlight-cave",
  "title": "Flashlight Cave",
  "category": "reading-phonics",
  "path": "games/flashlight-cave/",
  "icon": "🔦",
  "entry": "index.html",
  "age": { "min": 5, "max": 6 },
  "status": "beta",
  "accent": "#f0a53c",
  "engine": "flashlight-cave (game-local js/game.js)",
  "characters": ["ari"],
  "modes": [
    { "id": "find",    "title": "Find the Letter", "skill": "recognizing an uppercase letter by name" },
    { "id": "sound",   "title": "Sound Cave",      "skill": "matching a spoken sound to its letter" },
    { "id": "picture", "title": "Whose Letter?",   "skill": "identifying the letter a word starts with" }
  ],
  "license": { "code": "MIT", "assets": "CC-BY-4.0" },
  "conceptVideo": "01-game-concepts/flashlight-cave/"
}
```

`status` ships as **`beta`** and only flips to `live` after the iPad sign-off
(`polish-process.md` §5 → §6). `learningGoals`, `interactionModel`, `feedbackModel`,
`description`, `shareTitle`, `uses[]` and `credits` are filled from §1, §6, §13 and §11 at
Stage 5 — the same field set `counting-treasure-cups/game.json` carries.

At the same time `games/letter-treasure-hunt/game.json` flips to
`"status": "archived"` with the summary *"Superseded by flashlight-cave, the live spotlight
rebuild."* — **at Stage 6, not before** (§9.19).

---

## 20. Post-sign-off fixes — the four the gate missed

Four bugs were found by a child-and-parent iPad session **after** `tools/qa.mjs` had reported
**95/95, exit 0**. Nothing about them was subtle to look at; all four were invisible to the gate.
That is the finding worth recording: a check that asserts state rarely notices a *look*, an
*order*, or a *pixel*. Each fix below therefore ships with the check that would have caught it,
and every one of those checks was verified by re-introducing the bug in a scratch copy and
confirming the check goes red (`CAUGHT IT` for all four, four for four).

No asset was implicated — this was all code, so `ASSETS.md` is unchanged.

### 20.1 The flashlight pointed away from its own beam

**What shipped.** `cave.js placeTorch()` rides the torch at `beam + (0.78 R, 0.62 R)` — right of
and below the light — while the source art points up-**right**. The default case therefore has to
be the *mirrored* one, and the scale/rotation sign pairing was inverted: the lamp faced away from
the light it was casting for every beam position left of `0.72 × space.w`, which is most of the
screen.

**Rule broken.** §6.1 — the torch is decoration whose only job is to *explain where the light
comes from*. Pointing the wrong way makes it explain the opposite.

**Fix.** `leftOfBeam` / `facing`, with `torch.scale.set(facing * k, k)` and
`torch.rotation = facing * torchAngle` — the mirror and the tilt now share one sign.

**How the gate catches it now.** `getTorch()` (§16) plus, in `tools/qa.mjs` §M:
`the flashlight always points back INTO its own beam (7 beam positions)` — the beam is swept
across the **viewport** (art coords derived by inverting `toScreen()`, so it is aspect-independent)
and each sample asserts the *relationship*: torch right of the beam ⇒ faces left, and vice versa.
A hard-coded sign would have to be rewritten — possibly wrong — the day the art is redrawn.
`the torch sweep exercises BOTH facings` keeps the mirrored branch from going vacuous.

### 20.2 The prompt named a picture that was not there yet

**What shipped.** `game.js openRound()` called `this.showLedge()` fire-and-forget, so
*"Which letter does this start with?"* was spoken over an empty ledge.

**Rule broken.** §3.2 / §7.2 — hear it → **see it** → do it. The word *this* has no referent
until the object is on screen, and a pre-literate child cannot recover the sentence later.

**Fix.** `await this.showLedge()` (which now also awaits the pop-in) before the prompt, with a
staleness guard after it — input stays live throughout, so the round can still move on underneath.

**How the gate catches it now.** `the object is on the ledge BEFORE the prompt names it (§3.2)`:
the voice `onClip` hook is timestamped (`__qa.clipLog`), the probe polls for the first frame where
`getLedge()` is non-null, and asserts that moment is **at or before** `starts-intro`.
`picture round 1 really plays the recorded prompt clip` keeps it from passing on a missing clip.
Note for anyone writing a probe like this: the audio-unlock gesture must **not** be a click at
screen centre — in portrait the mode tiles sit at y≈449 and a centre click starts `find` before the
probe ever asks for `picture`. `boot()` clicks near the top centre, and
`portrait: the audio-unlock gesture did not start a mode` asserts that it worked.

### 20.3 The ledge object was cropped off the top of the screen

**What shipped.** The object is authored at art y 190 — *above* `playableBand` and inside §4.3's
top HUD reserve. Letters go through `safeBand()`; the ledge went through nothing, so cover-fit on a
wide, short window (an iPad in landscape with the browser chrome taking the height) pushed it clean
off the top. A 4:3-ish viewport does **not** reproduce it.

**Rule broken.** §4.2/§4.3 — art space is authored for 4:3 and cover-fit crops; every element that
must be seen is clamped to what the viewport actually shows, not to where it was drawn.

**Fix.** New `ledgeSpot(config, transform)` export in `cave.js`, clamping the spot into
`transform.visibleArt()` clear of the HUD reserve, exposed as `cave.ledgeSpot()`, applied in
`showLedge()` and re-applied from `reflow()` on every resize.

**How the gate catches it now.** `the ledge object is fully on screen` in **three** shapes —
landscape 1180×820 (§M), portrait 834×1194 (folded into the portrait sweep, §H) and the
wide-short **1180×520** that actually reproduced the crop — plus
`the ledge survives a resize to … mid-round` across 1180×520 → 834×1194 → 1180×820, which is the
`reflow()` path. Every one of those asserts **both** `rect` and `objectBounds`: `rect` comes from
`ledgeSpot()` and would look healthy even with a stale sprite, `objectBounds` is where the picture
is really painted. Re-introducing the bug reports `painted y = −145` — off the top — while the slot
still reads as on-screen, which is exactly why both are asserted.

### 20.4 The object did not render at all until the child moved the light

**What shipped.** The pop-in was registered with the *game's* tween tracker (for cancellation) but
never with `cave.track()`, so nothing drove the on-demand render pump (§4.1 — `app.ticker` is
stopped; frames happen only when something asks). The single frame that drew the sprite performed
the texture's GPU upload and drew *before* the pixels were resident, and no frame followed. In
picture mode nothing else moves, so the object stayed invisible until the child touched the screen
and incidentally caused a repaint — after the prompt had already asked about it.

**Rule broken.** §4.1 — every animation must be registered with `track()`, because the pump is the
only thing that draws. And the sharper form: *an on-demand renderer must be **driven**, not poked
once.*

**Fix.** `await this.cave.track(done)` in `showLedge()`, `img.decode()` before texture creation in
`loadObjectImage()`, and a short settle-render loop in `loadObjectTexture()` as the safety net for
any caller that draws an object into an otherwise-still scene.

**How the gate catches it now.** Nothing in the debug surface could ever see this — the sprite
exists, its texture is valid, its alpha is 1 — so the check is **pixels**:
`the object is genuinely PAINTED with no interaction at all`. The object image is held back with a
Playwright route delay to open a reliable window, the ledge's screen rect is screenshotted
repeatedly *while `getLedge()` is still null* (re-reading after each shot so a frame that straddles
the ledge's birth is discarded, not mistaken for a baseline), and the same clip is captured once
the pop-in has settled. `the ledge region is STATIC before the object arrives` proves the baseline
is a baseline; `nothing was touched: the beam never moved between baseline and paint` proves no
interaction happened. With the bug re-introduced the two captures are byte-identical.

Two traps worth carrying to other games: `page.screenshot({ clip })` composites the real canvas
correctly, whereas reading the WebGL canvas back with `drawImage`/`getImageData` returns **all
zeroes** (`preserveDrawingBuffer` is false); and `objectAlpha` alone never proves a pop-in has
landed, because the picture sprite is opaque from birth and it is the *group* that scales up from
0.01 — hence `groupScale` on `getLedge()`.
