# Silly Sentence Builder — Production Game Design

## Product promise

Open a handmade felt puppet theater, choose a **who**, a **does what**, and a
**where**, then watch that exact silly sentence become a tiny stage show. The
game practices oral sentence structure; it never grades a child's creative
choice. Every combination is structurally valid and the silliness is the
reward.

- **Audience:** ages 4–7, tablet first
- **Category:** oral storytelling
- **Canonical art world:** **Puppet / Cozy felt fabric**
- **Status:** beta until a real iPad child playtest
- **Core loop:** 25–50 seconds
- **Session:** three completed shows, then a small story-quilt recap

## Modes and single skills

1. **Make a Silly Sentence** (`silly`) — order and hear subject + action +
   place. Three parts: WHO → DOES WHAT → WHERE.
2. **Even Sillier** (`sillier`) — expand a complete oral sentence with a
   manner phrase. Four parts: WHO → DOES WHAT → WHERE → HOW.

Both modes use the same interaction grammar. The second mode adds one concept,
not a second mechanic.

## Screen map

### Splash — the felt playhouse

The generated `SILLY SENTENCE BUILDER` felt lockup floats over the open theater.
Three puppets peek and bob around two large plum felt mode plaques. The mode
plaques contain picture previews (three story parts versus four) and live HTML
labels. Home is the only route to the catalog. The first mode gesture unlocks
voice, music, and effects and starts the selected session.

### Build — one inviting choice at a time

The full sentence rail stays visible, left to right. Only the active category's
felt pocket opens below it, holding six large picture cards. A pulsing empty
slot, the pocket color, a pictorial header, and recorded prompt all communicate
the next action without requiring reading.

A child may tap a card or drag it to the active slot. The same selection handler
serves both paths. The chosen card speaks immediately, flies into the rail, and
settles with a padded squash. Any filled slot can be tapped to reopen that
category and swap the choice. There are no wrong cards and no failure sound.

The category colors remain stable:

- WHO — deep green
- DOES WHAT — burnt orange
- WHERE — royal blue
- HOW — lavender

When the final slot fills, a large plum **SHOW IT!** plaque appears. This pause
preserves reversibility and lets the child admire/read the sentence before the
reveal.

### Reveal — the child's sentence performs

The theater fills with the selected place diorama, selected puppet, selected
action prop, and (in the second mode) a manner emblem. The action and manner
choose visible motion classes; the place and character remain semantic raster
layers. This compositional system makes every legal combination truthful and
supports 216 three-part or 1,296 four-part sentences without runtime generation.

The cloned teacher voice performs the assembled sentence from its recorded
phrase clips while music ducks. Felt stars and notes flutter briefly. The
sentence appears as live HTML on the authored cream felt strip, with the four
category colors. Reduced-motion mode keeps the complete tableau and narration
but removes loops and flutter.

The child can replay the sentence, return to edit it, or make another. After
three shows, the end screen displays three miniature semantic tableaux as a
story quilt and offers another session.

## Content system

`config.json` is canonical and Studio-readable. It contains two modes, four
categories, and six choices per category:

- **Who:** orange cat, purple dinosaur, teal robot, yellow duck, pink bunny,
  blue monster
- **Does what:** dances, plays a trumpet, juggles pancakes, bounces on a pogo
  stick, flies a tiny rocket, paints a rainbow
- **Where:** on the moon, in a bubbly bathtub, inside a rainbow castle, at a
  cupcake picnic, in a flower garden, on a pirate ship
- **How:** super slowly, backwards, like jelly, with tiny hops, in giant
  circles, in a tutu

Selection decks are shuffled from one seeded RNG. The next round avoids the
immediately previous complete combination. No model or authoring service is
called at runtime.

## Art list and renderers

Every primary visible object is authored raster art. CSS supplies layout,
focus outlines, hit areas, opacity, masks, and motion only.

| Object | Visible renderer | Interaction substrate |
|---|---|---|
| Theater | GPT Image 2 4:3 felt plate | full-screen `<img>` cover/contain |
| Title | verified GPT Image 2 alpha lockup | non-interactive `<img>` |
| Category pockets | four cut felt sprites | positioned `<img>` under choice grid |
| Choice cards | four cut felt card sprites + semantic cutout | 96px+ `<button>` |
| Sentence rail/slots | cream felt strip and four card sprites | DOM slot buttons |
| Characters | six alpha felt puppets | `<img>` translated/animated by semantic state |
| Actions | six alpha felt prop clusters | `<img>` with verb motion cue |
| Places | six alpha felt diorama plates | `<img>` stage backdrop |
| Manners | six alpha felt emblems | `<img>` plus motion modifier |
| CTA / labels / progress | authored plaques and star sprite | live HTML over raster bases |
| Celebration | repeated star/note raster sprites | transient DOM animation layer |

All masters and prompts remain under `assets/source/gpt-image-2/`. Contact-sheet
families are cut with `tools/cut-asset-sheet.py --expected-count`; `boxes.json`
is retained. Alpha is inspected on magenta. Krea 2 produces the separate hub
tile in the platform's toy-object menu grammar.

## Motion grammar

- **dances:** broad alternating lean and foot bounce
- **trumpet:** trumpet settles near the puppet; body sways on a four-beat loop
- **pancakes:** prop cluster arcs above the puppet while the puppet tracks it
- **pogo:** puppet and pogo travel together in a readable high bounce
- **rocket:** rocket carries the puppet through a bounded diagonal loop
- **paints:** brush/rainbow cluster sweeps side to side
- **slowly:** multiplies duration
- **backwards:** reverses the principal travel direction
- **jelly:** adds bounded squash/skew
- **tiny hops:** short frequent vertical hops
- **giant circles:** broad circular stage path
- **tutu:** adds a gentle spin with the tutu emblem visibly near the puppet

Motion is deliberately large enough to read at tablet size and remains bounded
inside the stage. Peak states are part of visual QA.

## Audio script and policy

`assets/audio/lines.json` is the exact spoken source of truth. Qwen3 TTS voice
clone uses the approved synthetic project reference at
`shared/assets/refs/voice-teacher.wav`; final AAC/M4A clips are round-tripped
through Whisper. Web Speech is an error fallback only.

Core lines cover welcome, both mode intros, four category prompts, edit/show
nudges, three praise variants, session completion, and all 24 selectable
phrases. The reveal speaks selected phrase clips in grammatical order with a
small dramatic gap. BGM uses `shared/js/bgm.js`, starts only after a real child
gesture, ducks under voice, follows mute, and stops on teardown.

## Interaction and accessibility

- Picture + voice + motion carry every required instruction; text is literacy
  exposure, not a prerequisite.
- Targets are at least 96px, with tap as the easiest path and drag as a tactile
  alternative.
- Filled choices are reversible until the show begins.
- Pointer capture, window-level release, pointer cancel, blur, and orientation
  changes cannot strand a drag.
- Splash Home returns to the catalog. Build/reveal/end Back returns in-page to
  the splash.
- Focus order follows WHO → DOES WHAT → WHERE → HOW → SHOW IT.
- `prefers-reduced-motion` and `QLOBE_DEBUG.setReducedMotion()` preserve content
  and remove nonessential movement.
- No accounts, recording, persistence, camera, microphone, or child data.

## Shared modules

`audio-unlock.js`, `bgm.js`, `voice-clips.js`, `screens.js`, `hud.js`,
`idle-nudge.js`, `tap.js`, `timers.js`, `rng.js`, `preload.js`,
`debug-harness.js`, `stage/drag-to-slot-dom.js`, and synthesized `sfx.js`.

## QLOBE_DEBUG v1

The game exposes `ready`, modes, deterministic mode start, serializable state,
truthful visible targets, real-handler `tap`, `winRound`, `home`, mute, seed,
and fast timers. Extensions expose the selected sentence, current category,
round plan, audio log, layout, reduced-motion toggle, and a deterministic
`showReveal()` hook for peak-motion screenshots.

## Intentional departures from the concept mockups and stub

- The registered id and route remain unchanged, but the fixed
  `build-assemble` emoji prototype is replaced with a custom compositional game.
  That engine expects one pre-authored correct build and cannot express free
  category combinations.
- The mockup's three simultaneous two-card baskets become one active six-card
  pocket plus a persistent sentence rail. This keeps choices child-sized in
  portrait and makes the next step obvious; the same green/orange/blue grammar
  remains.
- A **SHOW IT!** confirmation replaces automatic completion so choices remain
  reversible.
- Star ratings are omitted because creative sentences are not scored. Stars
  mark completed shows only.
- The reveal is composed from authored semantic layers rather than one fixed
  cat-on-the-moon image, so the child's exact sentence is represented.
- MiniMax video is not used for the core payoff: a pre-rendered clip could not
  remain semantically faithful across hundreds of combinations. Runtime motion
  of authored raster layers is the stronger interaction choice.

## Release gate

- zero runtime network/model calls, console errors, failed requests, or 404s;
- every asset family and alpha edge reviewed at full size;
- recorded core voice resolves as clips in production Chrome and Whisper
  receipts match authored text;
- first sentence can be completed without reading;
- landscape 1024×768, portrait 768×1024, short 1180×520, and reduced-motion
  captures pass the adversarial art review;
- every action/place/manner combination remains inside the stage and truthful;
- production Pages deployment succeeds and the production smoke suite passes.
