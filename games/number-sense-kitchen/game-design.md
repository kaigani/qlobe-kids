# Number Sense Kitchen — production game design

**Game id:** `number-sense-kitchen`
**Status:** `beta` until a real iPad child playtest
**Audience:** ages 3–6
**Category:** Math & Number Sense
**Canonical art direction:** **Toy**
**Pipeline style id:** `toy-table`
**Guide:** Ravi, in a game-local chef pose derived from the shared character
**Replacement:** this game replaces the unshipped `number-rod-race` prototype

## Product promise

Number Sense Kitchen turns early quantity into a set of physical-feeling toy
recipes. A child recognizes a cookie group, fills a frame one space at a time,
and combines two fruit groups in a bowl. Every answer changes the kitchen:
cookies settle into a jar, fruit snaps into a frame, and groups pour into a
finished bowl. It should feel like cooking with a beautiful counting set, not
answering a worksheet.

The three modes deliberately teach one skill each:

1. **Cookie Jar** — instantly recognize quantities 1, 2, and 4.
2. **Frame Bakery** — build quantities with one-to-one correspondence and the
   anchors 5 and 10.
3. **Fruit Bowl** — compose a total from two visible groups.

One mode lasts about 30–90 seconds. Completing all three recipes in one page
session earns a kitchen finale. Nothing is stored after reload.

## Design authorities and departures

The concept brief and five 4:3 mockups define the fantasy, screen sequence,
palette, and object hierarchy. `docs/art-direction.md` defines the material
world. Platform interaction rules take precedence where the mockups conflict.

Intentional departures:

- The mockup's one-off child chef becomes canonical cast member Ravi so the
  platform has one recognizable friend rather than an inconsistent AI child.
- Tapping a recipe card starts that mode directly. The mockup's extra
  select-then-Start step is removed because one clear action is better for a
  pre-reader.
- Functional prompts, progress, and numerals remain live HTML and spoken
  audio. Only the decorative title is generated lettering.
- Cookie Jar is not a static multiple-choice screen: a correct choice sends
  the visible cookie group into the jar.
- Frame Bakery is real placement with drag and tap-tap parity rather than a
  picture of a completed frame.
- Fruit Bowl begins with two separate, fully countable groups and makes the
  combining action visible before revealing the total.
- Shared raster HUD controls replace bespoke mockup controls. Home appears
  only on the splash; deeper screens use Back and replay.
- The old Number Rod Race route and registry entry are removed. Number Sense
  Kitchen takes its catalog position under a clean id and route.

## Screen map

```text
catalog
  ↓
splash ──Home──→ catalog
  ↓ Start Kitchen (first real gesture unlocks all audio, starts quiet BGM)
recipe menu
  ├─ Cookie Jar ─→ 3 rounds ─→ recipe badge ─┐
  ├─ Frame Bakery → 3 rounds → recipe badge ├─→ recipe menu
  └─ Fruit Bowl ─→ 3 rounds ─→ recipe badge ┘
                         all three complete ─→ kitchen finale

Back from menu → splash
Back from play / completion / finale → recipe menu
Cook Again from finale → reset session badges → recipe menu
```

### Splash

- Full-bleed Toy kitchen plate.
- Generated `NUMBER SENSE KITCHEN` title lockup, checked letter by letter.
- Ravi chef pose and one large authored Start Kitchen control.
- Home at top-left; sound at the platform position.
- The first real child gesture unlocks voice, SFX, and BGM. Music begins only
  after the start action and stops when the child returns to the splash or the
  page tears down.
- Spoken welcome: “Welcome to Number Sense Kitchen! I’m Chef Ravi. Let’s make
  numbers with yummy food!”

### Recipe menu

- Three authored recipe cards: jar, frame, and bowl.
- Cards carry a live accessible name but no required baked text.
- An earned badge appears on a card for this page session only.
- One card tap starts its activity and speaks the first round prompt.
- Back returns to splash and stops the BGM; sound/replay remains available.

### Play shell

- Back returns to the recipe menu and tears down every drag, timer, selected
  object, prompt, and pending animation.
- A sound/replay control repeats the current round prompt.
- Three progress dots communicate the round rhythm decoratively.
- One hero learning object occupies the calm middle; prompt copy supports the
  spoken line but never carries the task alone.
- Any action arms the idle timer again. After about 8 seconds, the game repeats
  the current prompt; later nudges model the target without scolding.

### Mode completion

- The mode's authored badge lands beside a retained final-recipe tableau:
  four cookies and 4, a filled eight-frame and 8, or 5 + 3 fruit and 8.
- Ravi gives the mode-specific praise while live praise copy names the result.
- Seven small authored raster stars persist around the result and float gently;
  their motion is removed under reduced motion.
- Recipe Menu and Next Recipe are authored controls with live accessible text.
- Completing the third unique mode advances to the finale.

### Finale

- Ravi presents three finished recipe cards, each carrying its earned badge,
  beneath the complete title lockup and visible “three recipes” payoff.
- The spoken finale and large Cook Again action complete the tableau.
- Cook Again clears only the in-memory badge set and returns to the menu.

## Gameplay specification

### Mode 1 — Cookie Jar

**Skill:** subitizing small stable groups without counting one by one.

Each round displays one authored cookie cluster above an empty jar and three
large Toy number plaques. The numeral is live HTML over the authored plaque.
The cluster uses stable spatial structure and no overlapping cookies.

| Round | Stimulus | Choices | Prompt |
| --- | --- | --- | --- |
| 1 | one cookie | 1, 2, 3 | “Look at the cookies. Which number says one?” |
| 2 | pair of cookies | 1, 2, 4 | “Look at the cookie pair. Which number says two?” |
| 3 | compact 2×2 group of four | 2, 3, 4 | “Look at this cookie group. Which number says four?” |

Correct sequence:

1. Chosen plaque compresses and rebounds.
2. Cookies arc into the jar in a short readable beat (instant under reduced
   motion).
3. Jar gives one soft settle bounce; target numeral pops beside it.
4. Spoken confirmation plays under ducked BGM.
5. Next round begins after a short hold or advances immediately via debug.

Wrong sequence:

- The chosen plaque gives one soft sideways nudge, never a red state.
- Ravi models the visible quantity in speech.
- The same cluster and choices remain; no progress is lost.

### Mode 2 — Frame Bakery

**Skill:** one-to-one placement and seeing 5/10 as anchors.

The authored tray is a visual plate. One large transparent DOM destination lies
over the complete frame, while non-interactive cells position fruit precisely
inside its authored wells. The ingredient rack presents one large fruit at a
time, so eight tiny controls never crowd a phone-sized worktop. A child may drag
that fruit anywhere onto the frame or tap the fruit and then tap the frame.
Both paths call the same placement function, which fills the next open well in
reading order. Ordered filling keeps quantity structure legible.

| Round | Tray | Ingredients | Target |
| --- | --- | --- | --- |
| 1 | five-frame | 3 strawberries | fill 3 spaces |
| 2 | five-frame | 2 apples + 3 strawberries | fill all 5 |
| 3 | ten-frame | 5 oranges + 3 apples | fill 8 spaces |

Placement behavior:

- One 96px-or-larger ingredient is active at a time; the next appears only
  after the current fruit has settled into its well.
- Only one drag is active at a time.
- Window-level move/up/cancel handling prevents stranded pieces.
- `pointercancel`, blur, and visibility loss cancel rather than place.
- A near miss within a forgiving pad snaps to the full-frame destination and
  then to the next legal open well.
- Filled wells are visual state, not overlapping interactive controls, and
  cannot accept another fruit.
- Selection is visible through an authored/raster halo treatment plus a focus
  outline. Invalid ground cancels selection gently.
- Each placed piece stays visible and countable. Fruit never overlaps another
  well or covers the frame border.

Round payoff:

- Filled wells glow briefly; a live quantity token lands beside the frame.
- Spoken success names the total and its composition where applicable.

### Mode 3 — Fruit Bowl

**Skill:** compose one total from two distinct groups.

Each round begins with two authored group cups/plates, every fruit visible, and
an empty bowl. The child drags or tap-places each group into the bowl. A placed
group resolves into individually countable fruit in the bowl; it never becomes
an opaque pile. After both groups land, the total appears as a large live
numeral on an authored plaque and the equation is spoken.

| Round | Group A | Group B | Total |
| --- | --- | --- | --- |
| 1 | 1 berry | 2 berries | 3 |
| 2 | 2 apples | 3 oranges | 5 |
| 3 | 5 strawberries | 3 apples | 8 |

The two groups may be added in either order. A group already in the bowl is no
longer interactive. The total is revealed only when both groups have landed.

## Interaction and feedback rules

- Every visible interactive target has at least a 96×96 CSS-pixel hit area.
- Pointer Events are the gameplay input; buttons use the platform's one press
  path. No split pointerdown/click actions.
- Drag always has an equal tap-tap and keyboard path.
- `Enter` and `Space` activate the focused object through the same semantic
  action as touch.
- Focus and selection are not communicated by color alone.
- Wrong input is warm modeling and retry, never a buzzer, red X, reset, score
  loss, or Game Over.
- Animation carries meaning: lift, travel, snap, settle, and reveal. Decorative
  motion is restrained so quantities remain easy to see.
- Under `prefers-reduced-motion`, travel, bounce, wobble, and star floating are
  removed; the destination state and spoken feedback remain.
- Functional text is selectable only to assistive technology; the child path
  remains image/audio/touch first.
- No runtime call reaches a model, LAN service, or authoring server. The only
  permitted off-origin request is the platform's standard page-view analytics
  tag; the game emits no interaction or child-data events.

## Audio design

### Voice

The preferred future channel is a complete recorded `qwen3-tts-voiceclone`
set, with every output transcribed by Whisper against the exact line. The
current beta truth is **0/32 approved recorded clips**: one bounded isolated
retry exhausted seeds 7, 8, and 9 while the service stalled. The all-or-none
audio manifest is therefore empty, no runtime M4A is shipped, and local Web
Speech uses the same exact `lines.json` text. Source-only unverified clips are
never runtime assets.

Core lines:

| Key | Exact spoken text |
| --- | --- |
| `welcome` | Welcome to Number Sense Kitchen! I’m Chef Ravi. Let’s make numbers with yummy food! |
| `start` | Tap a recipe to begin. |
| `menu-cookie` | Cookie Jar! Look fast and choose how many. |
| `menu-frame` | Frame Bakery! Fill the little spaces. |
| `menu-bowl` | Fruit Bowl! Put two groups together. |
| `idle` | Chef Ravi is ready when you are. |
| `wrong` | Let’s look together. Try again. |
| `mode-cookie-complete` | Cookie counting chef! You spotted every group! |
| `mode-frame-complete` | Frame filling chef! You made every space count! |
| `mode-bowl-complete` | Fruit mixing chef! You put groups together! |
| `finale` | You finished every Number Sense Kitchen recipe. Fantastic cooking! |

Round lines:

| Key | Exact spoken text |
| --- | --- |
| `cookie-r1-prompt` | Look at the cookies. Which number says one? |
| `cookie-r1-success` | One cookie! You saw it right away! |
| `cookie-r1-retry` | There is one cookie. Find the number one. |
| `cookie-r2-prompt` | Look at the cookie pair. Which number says two? |
| `cookie-r2-success` | Two cookies! Pop-pop! |
| `cookie-r2-retry` | Two cookies together. Find the number two. |
| `cookie-r3-prompt` | Look at this cookie group. Which number says four? |
| `cookie-r3-success` | Four cookies! You used your quick-look eyes! |
| `cookie-r3-retry` | Let’s see: one, two, three, four. Find four. |
| `frame-r1-prompt` | Put three strawberries in the little baking frame. |
| `frame-r1-success` | Three spaces are full! |
| `frame-r2-prompt` | Fill all five spaces. Two apples and three strawberries make five. |
| `frame-r2-success` | Five! The whole frame is full. |
| `frame-r3-prompt` | Fill eight spaces in the big frame. Five oranges and three apples make eight. |
| `frame-r3-success` | Eight! You built a big number. |
| `bowl-r1-prompt` | Put one berry and two berries in the bowl. Together they make three. |
| `bowl-r1-success` | One and two make three! |
| `bowl-r2-prompt` | Put two apples and three oranges together. How many are in the bowl? |
| `bowl-r2-success` | Two and three make five! |
| `bowl-r3-prompt` | Put five strawberries and three apples together. Let’s make eight. |
| `bowl-r3-success` | Five and three make eight! Delicious number work! |

### Music and sound effects

- Shared recorded track: `shared/assets/music/whimsical-toy-workshop.mp3` via
  `shared/js/bgm.js`.
- Preload before the first gesture; include its unlock in the platform fan-out.
- Begin after Start Kitchen, play quietly, and duck during every narration.
- Stop on return to splash and page teardown; mute follows the game sound state.
- Shared synthesized SFX provide press, pop, whoosh, sparkle, and tada. They
  layer under voice and never replace spoken learning feedback.

## Art direction and production inventory

The full child-facing field belongs to one Toy world. The accepted material
language is mint tile, honey painted wood, peach cabinetry, teal silicone,
matte cream ceramic, glossy fruit/cookie accents, restrained contact shadows,
and warm upper-left studio light. Background, props, cards, rewards, and Ravi
must share scale, saturation, edge treatment, and lighting.

| Asset family | Runtime target | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| Kitchen plate | 1600×1200 WebP/JPEG | authored opaque raster | cover-fit background layer |
| Title lockup | about 1100×360 WebP | generated/extracted raster lettering | accessible named image |
| Ravi chef | about 640×760 WebP | identity-preserved raster pose | decorative/narration anchor |
| Recipe cards ×3 | about 640×420 WebP | authored card + object illustration | semantic buttons |
| Cookie jar | about 660×620 WebP | clear toy jar with teal lid | stage image |
| Cookie clusters 1/2/4 | up to 400×300 WebP | authored/repeated cookie raster | non-interactive stimulus |
| Number plaques 1–4 | about 260×260 WebP | authored blank Toy plaque | semantic buttons + HTML numeral |
| Five-frame tray | about 980×400 WebP | molded tray raster | one full-frame target + positioned cells |
| Ten-frame tray | about 960×560 WebP | molded tray raster | one full-frame target + positioned cells |
| Strawberry/apple/orange | about 220×220 WebP | authored alpha-clean sprites | drag/tap buttons |
| Group cups/plates | about 300×300 WebP | authored countable group sprites | drag/tap buttons |
| Empty/full bowl | about 760×520 WebP | authored ceramic bowl | bowl drop zone/reveal |
| Badges ×3 | about 300×300 WebP | authored recipe badges | session state decoration |
| Finale tableau | about 1200×700 WebP/composition | authored objects composed by DOM | finale layout |
| Blank action slabs | about 360×180 WebP | authored Toy button | semantic buttons + HTML label |
| Hub tile | 640×533 JPEG | separate Krea Toy-object scene | hub image |
| OG image | 1200×630 JPEG | captured final splash | link preview |

Primary objects are never emoji, SVG, CSS gradients/shapes, canvas drawings, or
procedural stand-ins. CSS may position art, enlarge hit areas, provide focus
states, mask overflow, and animate transforms. Exact functional numerals and
labels may be live HTML placed on authored blank raster objects.

Production lifecycle:

```text
GPT Image 2 cohesive source plate/contact sheet
→ Qwen Image Edit for identity/style variants
→ Qwen Image Layered layer_2 extraction
→ alpha trim/pad/resize/WebP
→ saturated-magenta composite inspection
→ runtime asset + recipe/provenance log
```

The hub tile uses the Studio `menu-game-tile` / Krea Toy grammar and is not a
crop of the splash.

## Responsive layout

- Primary design space is 4:3 landscape.
- At portrait, the hero object moves above a vertically arranged ingredient or
  choice tray; nothing is a uniformly shrunken landscape.
- At 1180×520 and 568×320, prompt height compresses, the foreground counter
  crops deliberately, and all active objects plus deeper-screen Back/replay
  remain within painted bounds.
- HUD placement uses shared safe-area custom properties.
- Fruit/frame scale is determined from actual rendered bounds and recomputed on
  resize/orientation change.

## Privacy, persistence, and fallback

- No account, game-specific analytics event, microphone, camera, upload, or
  child-authored data. The standard platform page-view tag remains present.
- Completion badges are in-memory only and reset on reload.
- This beta intentionally uses local Web Speech for every line because its
  recorded-set manifest is empty; a future complete Whisper-validated set may
  replace it. A missing BGM never blocks play.
- A missing image produces an observable load failure for QA and a stable empty
  layout—not an emoji/vector replacement.
- Generation services are authoring-time only.

## `QLOBE_DEBUG` v1 surface

The installed hook exposes a ready promise; mode listing/start; serializable
state; truthful current targets; semantic input through the same handlers as
touch; deterministic round completion; mute; seed; fast timers; back/reset;
and voice audio-log inspection.

Minimum state:

```js
{
  screen, mode, roundIndex, roundId, awaitingInput,
  selectedId, placedIds, target, completedModes,
  muted, reducedMotion
}
```

Minimum actions:

```js
startKitchen()
openMode(id)
choose(id)
select(id)
place(slotOrDestinationId)
retryPrompt()
completeRound()
back()
resetSession()
```

`getTargets()` reports visible nonzero rectangles and truthful
`correct`/`wrong`/`neutral` roles for the current prompt. Debug actions call the
same semantic functions as real pointer and keyboard input.

## Release gate

The beta handoff requires:

- all three modes complete through real touch and the debug surface;
- wrong-input, drag cancel, tap-tap, keyboard, Back/Home, mute, and reload paths;
- narration uses the exact `lines.json` text through either a complete
  Whisper-validated recorded set or the current all-Web-Speech beta fallback;
- no runtime model/LAN calls, console errors, failed requests, or case errors;
- every visible target at least 96px;
- landscape, portrait, reduced-motion, and wide-short screenshots;
- exact quantities visible in every screenshot;
- full-size title spelling and magenta-alpha inspection;
- no CSS/vector/emoji primary artwork;
- adversarial ART DIRECTOR review resolved;
- production deployment and production smoke test;
- status remains `beta` until the target child succeeds on a real iPad.
