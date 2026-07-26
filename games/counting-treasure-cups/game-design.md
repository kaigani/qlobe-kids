# Counting Treasure Cups — game design

**Category:** math-number-sense · **Ages:** 4–6 · **Status:** beta → live
**Art world:** Storybook Rooms over a live video backdrop (see *Art world* below)
**Cast:** Captain Goldie (pirate captain), Skipper (parrot) — both new to the platform
**Engine:** custom, game-local (`js/game.js`) · **Concept:** `01-game-concepts/counting-treasure-cups/`

---

## 1. The one skill

**Counting small quantities with meaning.** Not reciting "one two three" — actually
producing a set of a given size, and knowing that the last number you said is *how
many there are* (cardinality). Three modes split that into three separate jobs.

Learning goals:

1. Count 1–8 with one-to-one correspondence (one number word per object).
2. Produce a set of a requested size, and stop at the right place.
3. Sort by kind while counting (coins, not gems) — counting survives a distractor.
4. Cardinality: count a fixed set and name the total.

---

## 2. Modes

| # | id | Title | Stage | The single skill | Rounds |
|---|---|---|---|---|---|
| 1 | `cup` | Fill the Cup | ship at sea | produce a set of N | N = 2, 3, 1, 4, 5 |
| 2 | `chest` | Big Treasure | beach | count **and** sort — coins only | N = 4, 5, 6, 8 |
| 3 | `howmany` | How Many? | alternates | cardinality — count a set, name the total | N = 2, 4, 3, 6, 5 |

Round lists are authored in `config.json` so the studio can retune them without a
code change.

---

## 3. Screens and the loop between them

### Splash
Full-bleed splash art. Captain Goldie waves in from the right and speaks
`cap-welcome`. Three big mode buttons (picture + spoken title on press, no reading
required). **Home** (`shared/assets/ui/btn-home.png`) top-left → `../../` (the
catalog). This is the only screen with a catalog link.

### Play — modes 1 & 2

```
[ back ]   [ prompt banner: numeral N + N pips ]        [ sound ]
                    ~ looping video backdrop ~
                       stage plate (deck + cup / sand + chest)
                          treasure landing inside
              Captain / Skipper pop in at the edge to talk
[ ---------------- tile tray: 5–6 treasure tiles ---------------- ]
```

**Beat order is always hear it → see it → do it** (interaction-pattern #5):

1. Captain speaks the prompt (`cap-cup-N` / `cap-chest-N`). The banner shows the
   numeral and N empty pips.
2. Child **taps** a tile (or **drags** it — both paths run the same `attempt`).
3. On a correct pick: accepted **instantly**, the pip fills on the tap, `sfx.pop` →
   `sfx.whoosh` → the treasure arcs into the container → it lands visibly *inside*
   → **Skipper squawks the count** (`par-1`…`par-8`).

   A four-year-old jabs at the screen, so nothing about this blocks the next tap.
   Several treasures may be in the air at once. Over-counting is prevented by a
   reservation counter (`claimed`), taken the instant a pick is accepted, not by a
   lock held across the animation — an earlier build held one for the flight plus
   the count word, up to a second per treasure, and silently dropped every tap in
   between. Count words follow newest-wins: a child tapping faster than speech
   won't hear every number, but always hears the one they just reached.
4. On a wrong-kind pick: tile wobbles in place, `sfx.silly`, Skipper squawks
   (`par-squawk-*`), Captain models the rule (`cap-nudge-coin` / `cap-nudge-gem`).
   Nothing is removed, nothing is scored, the round continues — and this does not
   block input either, so a child who reaches straight for the right treasure is
   not made to wait out the nudge.
5. At N: the container glows, confetti, `sfx.tada`, Skipper calls `par-full`,
   Captain cheers (`cap-cheer-1..4`, random). A big round **play** button appears
   and the round also auto-advances after 6s.
6. After the last round → the end screen.

Idle: if nothing is touched for 12s, Captain says an idle line once
(`cap-idle-1`/`cap-idle-2`); after another 15s the prompt replays.

### Play — mode 3 (How Many?)

Same furniture, different job. The container **starts full** with N treasures
already scattered inside; there is no tile tray. Captain asks
`cap-howmany-gems` / `cap-howmany-coins`.

- Below the stage: **three numeral cards** (the cream tile with a big Fredoka
  numeral). Options are N plus two neighbours drawn from N±1, N±2, clamped to 1–8,
  shuffled.
- Tapping a treasure inside the container is free practice: it bounces and Skipper
  says its ordinal number. This is touch-counting, and it is optional.
- **Correct card** → the count-along payoff: each treasure lights up in turn while
  Skipper counts `par-1`…`par-N`, then the card grows, confetti, Captain cheers.
  The child hears the last number said *and sees it on the card they chose* —
  that is the cardinality beat.
- **Wrong card** → no penalty and no loss. Captain says `cap-nudge-count`, the same
  count-along runs as *modelling*, then the question repeats with the cards still
  on screen. This is interaction-pattern #6: the hint is always modelling.

### End screen
Confetti and the chest heaped with treasure on the beach, `cap-end`. The big
central button returns to the **splash**, so after finishing a stage the child
gets the choice of all three modes rather than being dropped back into the one
they just completed. `btn-back.png` top-left does the same, and is on every screen
below the splash — the child is never more than two taps from the catalog.

---

## 4. Art world

`docs/art-direction.md` gives math-number-sense the **Toy Table** world by default.
This game departs to **Storybook Rooms** (full-bleed illustrated scene, cut-out
sprites that visibly belong to it) layered over **Story Screen** video backdrops.

*Reason:* the concept art is already finished and is unambiguously Storybook Rooms
in style — a rendered pirate ship deck and a beach, with premium toy-like 3D props.
Regenerating it as flat Toy Table objects would throw away the best art the project
has and make a worse game. The HUD, splash idioms, navigation, and interaction
grammar are world-independent and stay exactly as canon requires.

---

## 5. The layer stack

```
<video muted loop playsinline>   background loop; poster <img> always beneath
 └ stage plate                   alpha PNG: deck + railings (ship) or nothing (beach)
   └ container back              cup / chest, drawn whole
     └ treasure layer            landed gems and coins
       └ container front         front wall of the cup / chest — SAME PIXELS as
                                 the back plate, masked below the rim line
         └ flying treasure       the one in flight
           └ pose actor          Captain / Skipper, slide in from the edge
             └ HUD               banner, back, sound, tile tray
```

The front plate is derived from the container art with PIL, not redrawn, so an
empty container composites pixel-identical to the source and a treasure drawn
between the two layers is unmistakably *inside*.

The front plate only occludes the **bottom** edge. The other three come from the
stage's `aperture` in `config.json` — the cup's inner mouth ellipse, the chest's
box-opening polygon — which `Stage.applyAperture()` turns into a `clip-path` on
the treasure layer, extended straight upward. So a heap grows up out of the
opening as it fills, but is never able to spill sideways over a rim.

Each character carries its own `scale` in `config.json` (Captain Goldie 2×,
Skipper 1.5×) over one responsive base width, because a cast is not one size.

The cast stands on the scene's ground plane, not a fixed distance off the bottom
of the screen: each stage declares a `footY` in plate space (ship deck 600, beach
sand 690) which `Stage.publishFootLine()` maps to a `--actor-foot` offset. It is
clamped to the tile row's measured top edge, because on a portrait tablet the
beach ground plane maps almost to the bottom of the screen and would otherwise
stand the cast on top of the tiles.

Video handling follows `games/red-green-light/js/game.js`: one reused `<video>`
blessed inside the first gesture, poster underneath, `canplay`/`error` race with a
2.6s `readyState` timeout, `prefers-reduced-motion` → poster only, teardown with
`pause(); removeAttribute('src'); load()`. A failed video never blocks a round.

---

## 6. Voice script — verbatim (this IS the recording manifest)

Two voices. Captain Goldie carries every instruction and every piece of praise;
Skipper the parrot does all the counting. A parrot counting is not a gag — parrots
repeat, and repetition is the point of the exercise.

### Captain Goldie — `cap-*` (warm, playful, unhurried; theatrical but never loud)

| key | line |
|---|---|
| `cap-welcome` | Ahoy there, matey! I'm Captain Goldie. Shall we count some treasure? |
| `cap-mode-cup` | Let's fill my golden treasure cup! |
| `cap-mode-chest` | Big treasure time! Let's load up the chest! |
| `cap-mode-howmany` | Let's find out how many treasures we've got! |
| `cap-cup-1` | Can you put one gem in the treasure cup? |
| `cap-cup-2` | Can you put two gems in the treasure cup? |
| `cap-cup-3` | Can you put three gems in the treasure cup? |
| `cap-cup-4` | Can you put four gems in the treasure cup? |
| `cap-cup-5` | Can you put five gems in the treasure cup? |
| `cap-chest-4` | Big treasure! Put four gold coins in the chest. |
| `cap-chest-5` | Big treasure! Put five gold coins in the chest. |
| `cap-chest-6` | Big treasure! Put six gold coins in the chest. |
| `cap-chest-8` | Big treasure! Put eight gold coins in the chest. |
| `cap-howmany-gems` | How many gems are in the treasure cup? |
| `cap-howmany-coins` | How many coins are in the treasure chest? |
| `cap-nudge-coin` | Ooh, that's a shiny coin. We're hunting gems! |
| `cap-nudge-gem` | That's a sparkly gem. We need gold coins! |
| `cap-nudge-count` | Let's count them together. |
| `cap-nudge-again` | Have another try, matey. |
| `cap-idle-1` | Tap a treasure to pop it in. |
| `cap-idle-2` | Your turn, matey! |
| `cap-cheer-1` | Yo ho ho! You did it! |
| `cap-cheer-2` | Shiver me timbers, that's perfect! |
| `cap-cheer-3` | Wonderful counting, matey! |
| `cap-cheer-4` | That's exactly right! Well done! |
| `cap-end` | What a haul! You're a real treasure counter. |
| `cap-again` | Shall we count some more? |

### Skipper the parrot — `par-*` (bright, quick, chirpy — **clarity over squawk**)

| key | line |
|---|---|
| `par-1` | One! |
| `par-2` | Two! |
| `par-3` | Three! |
| `par-4` | Four! |
| `par-5` | Five! |
| `par-6` | Six! |
| `par-7` | Seven! |
| `par-8` | Eight! |
| `par-ready` | Squawk! Count 'em up! |
| `par-full` | That's the lot! Squawk! |
| `par-squawk-1` | Squawk! Not that one! |
| `par-squawk-2` | Awk! Try again! |
| `par-yay-1` | Squawk! Treasure! |
| `par-yay-2` | Yo ho ho! |

**41 clips.** Every one is played through `shared/js/voice-clips.js` with the line
text as `fallbackText`, so a missing clip degrades to Web Speech rather than
silence. The count words 1–8 must be intelligible above all else — they are the
lesson.

---

## 7. Art list

### Reused from the concept folder (already produced, no generation needed)
| asset | source | treatment |
|---|---|---|
| `assets/gem-{red,blue,green,purple}.png` | `ui-diamond-*-alpha.png` | alpha-floor, trim, 300px, PNG-8 |
| `assets/coin.png` | `ui-gold-coin-alpha.png` | same |
| `assets/tile.png` | `ui-tile-alpha.png` | same, 320px — also the numeral-card backing |
| `assets/video/sea.mp4` | `motion-background.mp4` | 960w h264, audio stripped, seamless loop |
| `assets/video/beach.mp4` | `motion-background-2.mp4` | same |
| `assets/{sea,beach}-poster.jpg` | frame 0 of each clip | video poster + reduced-motion still |
| `assets/chest-back.png` | `chest-foreground-open-alpha.png` | the beach stage container |

### Derived deterministically (PIL, no model)
| asset | from | how |
|---|---|---|
| `assets/ship-front.png` | `ship-back.png` | masked below the bowl-rim ellipse |
| `assets/beach-front.png` | `beach-back.png` | masked below the chest's near-rim line |
| `assets/chest-full.png` | both beach plates + the treasure sprites | the end-screen reward, composited through the same sandwich and the same slot geometry as play |

### Generated locally
| asset | workflow | notes |
|---|---|---|
| `assets/cup-back.png` | `qwen-image-layered` from `cup-foreground.png` | the trophy cup alone, on alpha |
| `assets/deck.png` | `qwen-image-layered` from `cup-foreground.png` | deck + railings + rope ladder, on alpha |
| `assets/pose-actors/captain-goldie/poses/*.webp` | `krea2-turbo-t2i` → `qwen-image-layered` → `pose_actor_assemble.py` | 6 poses |
| `assets/pose-actors/skipper/poses/*.webp` | same | 6 poses |
| `assets/splash.jpg` | `krea2-turbo-t2i` | title screen |
| `assets/og-image.jpg` | `tools/pipeline/capture_og_images.mjs` | 1200×630 |
| `assets/audio/*.m4a` | `qwen3-tts-voicedesign` → `qwen3-tts-voiceclone` | 41 clips, whisper-QA'd |

### Characters

**Captain Goldie** — a warm, round-faced woman pirate captain. Big plum tricorn hat
with a gold feather, dark curly hair, gold hoop earrings, deep red coat with gold
trim, wide friendly grin. Never menacing: no weapons, no scars, no eyepatch, no
skulls. Poses: `neutral, enter, notice, interact, react, celebrate`.

**Skipper** — a small bright macaw, scarlet body with blue and yellow wing flashes,
pale beak, big round friendly eye. Perches, hops, flaps. Same six poses.

Both are cast as new platform characters and committed as `qlobe-pose-actor` packs,
so a future pirate game can reuse them.

---

## 8. Explicit departures

**From the brief** (`01-game-concepts/counting-treasure-cups/brief.md`):

1. *Counting range lowered.* The brief asks for 3 gems and 7 coins with rounds up
   to 10. Cup runs 1–5 and chest 4–8. Ten taps is a long sit for the 4-year-old
   this build is aimed at, and the registry age moves to 4–6 to match.
2. *A third mode was added.* The brief has two. `philosophy.md` asks for 3–4 modes
   per family, each teaching one skill, and producing a set (modes 1–2) is a
   different skill from counting a set that already exists (mode 3).
3. *No background music.* The brief asks for "pirate accordion instrumental".
   Dropped: two speaking characters plus counting is already a busy audio channel,
   and music competing with the count words would damage the one thing the game
   teaches. `shared/js/sfx.js` carries the tactile layer instead.

**From the UI mockups** (`output/ui-mockups/`):

4. *No text buttons.* The mockups show `NEXT` and `PLAY AGAIN` pills. Replaced with
   the shared round `btn-play.png` — the audience cannot read.
5. *No sentence in the banner.* The mockup banner reads "Put 3 gems in the treasure
   cup!". The banner instead shows the target **numeral plus N pips**; the sentence
   is spoken. Numerals are the subject matter here, not text to be read.
6. *Progress badge* ("2 of 3") becomes filled/empty pips for the same reason. The
   numeral stays.
7. *Chest art.* Play uses the fully-open chest (deep visible interior, so coins
   are seen landing inside) rather than the barely-open `peek` variant, which is
   not used at all. The splash and hub tile are new art generated for this build
   rather than a crop of a gameplay asset, so the title screen can show the cup
   AND the chest together.
8. *Mode buttons use game art, not emoji.* The scaffold's emoji icons included a
   toolbox for "Big Treasure", which misleads a child who cannot read the label.
   Each button now shows the treasure it is about: a gem, a coin, and a numeral
   card.

**From platform convention:**

9. *Not the shared teacher voice.* Every other QLOBE game clones one warm teacher
   voice. This game uses two in-world characters instead, at the user's direction.
   Both reference voices are committed so a future pirate game matches. Web Speech
   remains the fallback, as everywhere.
10. *Art world.* Storybook Rooms rather than the math-number-sense default of Toy
    Table — reasoned in §4.

---

## 9. Shared modules used

`shared/js/sfx.js` (pop, whoosh, sparkle, tada, silly, boing, tick) ·
`shared/js/tap.js` (`onTap` — the one press path) ·
`shared/js/voice-clips.js` (recorded-clip player with the `onClip` hook) ·
`shared/js/speech.js` (fallback) · `shared/assets/ui/{btn-home,btn-back,btn-sound,btn-play}.png` ·
`shared/fonts/fredoka-latin-600-normal.woff2`.

## 10. Accessibility and tuning

≥96px touch targets everywhere · `prefers-reduced-motion` kills the video, the arc
tween, and the confetti (the round still plays and still speaks) · portrait and
landscape both laid out · `devicePixelRatio` capped at 2 · no failure state, no
timer pressure, no score · `window.QLOBE_DEBUG` v1 with `fastTimers()` so automated
QA can drive every branch.
