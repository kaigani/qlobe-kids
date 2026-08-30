# Subtraction Picnic — production game design

**Game ID:** `subtraction-picnic`
**Audience:** ages 5–6
**Category:** math-number-sense
**Status target:** beta until an iPad child playtest
**Canonical art direction:** **Watercolor / Storybook** (`storybook` is the current production-template slug)

## Product promise

Subtraction is something a child can see happen. Food begins on a picnic
blanket, a forest friend receives some, and the child counts what is still
there. Every round makes the complete change visible before showing the
symbolic equation.

The fantasy is a living watercolor picture book: apples hop into Squirrel's
basket, Fox leans in for strawberries, Bear gives a delighted wiggle, and the
paper equation changes along with the real objects. A child should understand
the first action within five seconds without reading.

## Learning design

Each mode has one skill:

1. **Forest Friends** — model a narrated subtraction story as taking away.
2. **Apple Take-Away** — connect a visual take-away action to the number left.
3. **Picnic Party** — freely discover that every item given away changes both
   parts of a subtraction equation.

Quantities stay within six. This keeps every initial set subitizable or quickly
countable and lets the remaining set fit comfortably on a tablet in portrait.
Zero appears only after the child has already seen several nonzero results.

## Screen map and navigation

```text
hub → splash storybook
        ├─ Forest Friends ─┐
        ├─ Apple Take-Away ├→ play → round reveal → next round → mode finale
        └─ Picnic Party ───┘                              └→ splash
```

- Splash has the only Home control and a generated title lockup.
- Every deeper state has Back, which returns to the splash in-page.
- Sound repeats the current spoken prompt or equation.
- A mode finale offers Again and Choose Another; neither navigates to the hub.
- Leaving play cancels drags, timers, narration, and background music.

The splash is an open picture-book mode selector. Its three large page cards
use pictures first and short HTML labels second. Labels support grown-ups and
accessibility; narration and art carry the child experience.

## Core loop (about 35–65 seconds)

1. A watercolor scene opens with one animal, one basket, and an exact set of
   snacks on the checked blanket.
2. The teacher voice tells the short story: “Five apples are on the picnic
   blanket. Squirrel would like two. Give Squirrel two apples.”
3. The requested quantity is reinforced by two leaf pips and the top equation
   card. Functional copy is real HTML, never baked into scene art.
4. The child gives food in either of two equal paths:
   - tap one snack and it arcs to the friend's basket;
   - drag one snack anywhere onto the generous animal/basket target.
5. Each successful give has one clear beat: lift → arc → basket → quiet crunch
   → animal reaction → live equation update. The snack disappears from the
   blanket only after it reaches the target.
6. When the requested number has been given, the equation becomes
   `start − given = ?` and three large watercolor number cards rise from the
   grass.
7. A correct answer reveals the result, counts the remaining snacks with soft
   pulses, speaks the whole equation, then celebrates. A wrong answer never
   removes progress: the card gives a paper wiggle and the narrator says,
   “Let’s count what is still on the blanket,” while each remaining snack
   pulses once.
8. The play button advances. Forest Friends and Apple Take-Away end after five
   rounds. Picnic Party instead keeps the same tableau available for open
   exploration and can be refilled at any time.

Rapid input is gated during a food flight, count-modeling sequence, or reveal.
No input can create two feeds or advance two rounds.

## Mode content

### Forest Friends

Five narrated story rounds are shuffled deterministically while the first
round always remains the canonical `5 − 2 = 3` Squirrel/apple scene on a first
visit.

| Friend | Food | Start | Give | Left |
| --- | --- | ---: | ---: | ---: |
| Squirrel | apples | 5 | 2 | 3 |
| Fox | strawberries | 4 | 1 | 3 |
| Bear | crackers | 5 | 3 | 2 |
| Fox | grape bunches | 6 | 2 | 4 |
| Bear | sandwiches | 6 | 4 | 2 |

The art, food, color arrangement, prompt, and animal reaction vary; the
learning structure stays constant.

### Apple Take-Away

Five faster apple rounds remove the longer character story. The child sees an
initial set, hears “Six apples. Take away three,” gives the apples, then chooses
what is left. Rounds are `3−1`, `4−2`, `5−1`, `5−4`, and `6−3`, shuffled with a
seeded source. Squirrel remains on the page so the action is still sharing,
not deletion.

### Picnic Party

Free play begins with six items of one food and a chosen friend. Every snack
given updates a live equation from `6 − 0 = 6` through `6 − 6 = 0`; the sound
button speaks the current equation. Three large portrait buttons swap the
friend, and a raster refill button changes the food and restores all six.
There is no wrong answer and no round timer. Reaching zero triggers a small
celebration and a warm summary, then leaves the finished equation on screen
until the child refills or leaves.

## Gentle guidance and edge cases

- Idle nudge 1 repeats the prompt; nudge 2 pulses one snack and the basket;
  nudge 3 demonstrates the dotted flight path without consuming an item.
- A snack released outside the target returns to its authored spot with a soft
  bounce. Pointer cancel and window blur always cancel, never feed.
- A tap during a drag does not also feed. Only one pointer and one active food
  flight are accepted.
- Back during a flight immediately tears the round down. Returning starts a
  fresh round; no half-fed state leaks across screens.
- If recorded audio is unavailable, every line has a Web Speech fallback.
- If background music fails, the game remains fully playable and silent apart
  from available voice/SFX.
- Reduced motion replaces arcs, wiggles, pulses, and confetti with short fades
  and immediate state changes while retaining spoken and visual results.
- No persistence, microphone, camera, account, or network access is used at
  runtime.

## Interaction geometry and responsive behavior

- Pointer Events only; the shared DOM drag controller owns move/up/cancel/blur.
- Every interactive target has at least a 96 px hit area, including visually
  smaller HUD art.
- The scene uses a 4:3 authored coordinate system with cover-fit background art
  and responsive DOM layers. Food locations and flight targets are normalized
  so orientation changes rebuild the tableau rather than preserving stale
  pixels.
- Landscape: equation banner at top, animal/basket at right, blanket and food
  across the lower center, answer cards along the bottom.
- Portrait: equation banner below the HUD, animal in the upper-right third,
  blanket centered lower, answer cards in a compact three-column row.
- Wide-short: the prompt compacts, the animal scales down, and the answer row
  moves beside the blanket so neither HUD nor targets crop.
- Safe-area values reserve all four edges. The tested viewports are 1024×768,
  768×1024, 1180×520, and 844×390.

## Audio direction and verbatim script

Voice is a warm, unhurried preschool teacher cloned from the approved local
reference. Recorded AAC clips are primary; Web Speech uses the same text as a
fallback. Spoken quantities are words, not digits.

### Shared lines

| Key | Spoken line |
| --- | --- |
| `intro` | “Welcome to our subtraction picnic. Pick a picnic game.” |
| `forest-intro` | “Our forest friends are hungry. Give them a snack, then count what is left.” |
| `practice-intro` | “Let’s take away apples. Give some to Squirrel, then count what is left.” |
| `party-intro` | “Picnic party! Give away as many snacks as you like. Watch the numbers change.” |
| `how-many-left` | “How many are left on the blanket?” |
| `count-hint` | “Let’s count what is still on the blanket.” |
| `drag-hint` | “Tap a snack, or slide it over to our friend.” |
| `mode-complete` | “What a lovely picnic! You showed how taking away changes the number left.” |
| `all-gone` | “All shared! Zero snacks are left.” |

### Forest story prompts

| Key | Spoken line |
| --- | --- |
| `forest-5-2` | “Five apples are on the picnic blanket. Squirrel would like two. Give Squirrel two apples.” |
| `forest-4-1` | “Four strawberries are ready to share. Fox would like one. Give Fox one strawberry.” |
| `forest-5-3` | “Five crunchy crackers are on the blanket. Bear would like three. Give Bear three crackers.” |
| `forest-6-2` | “Six grape bunches are at the picnic. Fox would like two. Give Fox two grape bunches.” |
| `forest-6-4` | “Six little sandwiches are ready. Bear would like four. Give Bear four sandwiches.” |

### Practice prompts

| Key | Spoken line |
| --- | --- |
| `practice-3-1` | “Three apples. Take away one.” |
| `practice-4-2` | “Four apples. Take away two.” |
| `practice-5-1` | “Five apples. Take away one.” |
| `practice-5-4` | “Five apples. Take away four.” |
| `practice-6-3` | “Six apples. Take away three.” |

### Equation payoffs

| Key | Spoken line |
| --- | --- |
| `equation-3-1-2` | “Three take away one equals two. Two are left.” |
| `equation-4-1-3` | “Four take away one equals three. Three are left.” |
| `equation-4-2-2` | “Four take away two equals two. Two are left.” |
| `equation-5-1-4` | “Five take away one equals four. Four are left.” |
| `equation-5-2-3` | “Five take away two equals three. Three are left.” |
| `equation-5-3-2` | “Five take away three equals two. Two are left.” |
| `equation-5-4-1` | “Five take away four equals one. One is left.” |
| `equation-6-2-4` | “Six take away two equals four. Four are left.” |
| `equation-6-3-3` | “Six take away three equals three. Three are left.” |
| `equation-6-4-2` | “Six take away four equals two. Two are left.” |

Dynamic Picnic Party equations use the device voice only after the child asks
to hear the current equation; all fixed instructions and the zero payoff remain
recorded.

## Music and sound

- A quiet recorded shared-library track plays only after the first gesture,
  loops through `shared/js/bgm.js`, follows mute, and ducks beneath narration.
- Snack lift: soft `pop`; flight: light `whoosh`; basket landing: gentle custom
  crunch chosen by food family; answer reveal: `sparkle`; finale: `tada`.
- No buzzer, red-X sound, countdown, or startling animal noise.

## Art production inventory

All child-facing primary art is authored raster. CSS supplies layout, hit
areas, clipping, transforms, focus, and animation only.

| Asset | Intended final | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| Meadow picnic backdrop | 1600×1200 WebP/JPEG, ≤400 KB | full-bleed watercolor plate | fixed DOM scene layer |
| `Subtraction Picnic` title | transparent WebP/PNG, ≤150 KB | painted lettering lockup | accessible `<img>` |
| Squirrel, Fox, Bear | transparent WebP/PNG, ≤100 KB each | cut watercolor character | generous DOM feed target |
| apple, strawberry, cracker, grape bunch, sandwich | transparent WebP/PNG, ≤60 KB each | repeated food sprites | one pointer-enabled button per exact item |
| picnic blanket and woven basket | transparent WebP/PNG | authored scene props | noninteractive layer / basket target |
| open-book mode page, prompt banner, equation parchment | transparent WebP/PNG | authored paper surfaces | DOM cards with live HTML copy |
| three answer tiles | transparent WebP/PNG | yellow/green/blue painted cards | ≥120 px number buttons |
| refill, next, and replay surfaces | raster UI library or authored watercolor plaques | picture-first controls | semantic buttons |
| hub tile | curated 640×533 JPEG in the hub Toy grammar | one recognizable picnic moment | hub link |
| social preview | 1200×630 JPEG captured from the final splash | final runtime composition | metadata only |

GPT Image 2 provides the cohesive master plates and contact sheets. The shared
bounding-box cutter locates each separated component. Opaque dark-ground crops
go through Qwen Image Layered (`layer_2`) and deterministic alpha finalization;
every transparent final is inspected on saturated magenta. Krea 2 supplies the
separate hub tile in the platform's Toy menu grammar. Source masters and prompts
remain under `assets/source/`; finals are optimized without destroying sources.

## Departures from source material

- The concept brief's campaign, practice, and free-play modes are all kept, but
  presented as one open storybook rather than a character-only first screen.
  This makes the three kinds of play visible without requiring a second menu.
- The mockup's answer buttons appear only after the requested food is actually
  given. This preserves the concrete action before symbolic recall and prevents
  guessing the equation without manipulating the set.
- The mockup's large baked instructional sentences remain runtime HTML and
  recorded narration. Only the decorative game title is baked into art.
- Three consistent forest friends replace the prototype's four platform emoji.
  Bunny and Bird are dropped so the generated cast can receive enough visual
  and motion polish while still providing variation.
- Counts remain within six rather than expanding difficulty. Visual subtraction
  clarity and fluent interaction matter more here than larger arithmetic.
- Short character video is intentionally omitted: the food-flight, basket,
  reaction, and count choreography communicates the action directly, avoids a
  passive interruption every round, and keeps the page comfortably offline.

## Runtime/module contract

The bespoke game reuses:

- `shared/js/screens.js`, `hud.js`, `tap.js`, and `idle-nudge.js`;
- `shared/js/stage/drag-to-slot-dom.js` for strand-proof drags;
- `shared/js/voice-clips.js`, `narrator.js`, `audio-unlock.js`, `sfx.js`, and
  `bgm.js`;
- `shared/js/timers.js`, `rng.js`, `preload.js`, `celebrate.js`, and
  `debug-harness.js`.

`window.QLOBE_DEBUG` format version 1 exposes `ready`, all three modes,
deterministic mode start, serializable state, truthful targets, the real input
path, round completion, home, mute, seed, audio log, and fast timers.

## QA and release gate

- Syntax and diff checks; full repository validator with baseline comparison.
- Real Chrome drive through all modes, every fixed round, a wrong answer,
  tap feed, drag feed, cancelled drag, sound replay, mode finale, Back routing,
  and splash Home invariant.
- Assert recorded clips (`kind: clip`) rather than silent Web Speech fallback.
- Assert no console errors, unexpected warnings, failed requests, remote model
  calls, target smaller than 96 px, page overflow, or hidden home link in play.
- Capture and inspect splash, feed phase, answer phase, wrong-answer modeling,
  result reveal, finale, and free play at landscape, portrait, wide-short, and
  reduced-motion viewports.
- Review foreground material fidelity separately: background, blanket, food,
  basket, animal, paper UI, and answer cards must all read as one watercolor
  picture book.
- Promote to `beta`, not `live`, until the real iPad child playtest confirms
  comprehension and delight. Production Pages is re-tested after deployment.
