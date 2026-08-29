# Beat the Bugs — production game design

Status: new production game · 2026-08-29
Category: practical life · Ages 5–6 · Canonical art world: **Kawaii**

## Product promise

Beat the Bugs turns two everyday care routines into a bright superhero mission.
The child joins Maya in the Hygiene Hero Lab, uses a soap shield to help tiny
germs slip away, and pilots a sparkle brush that removes the food bits cavity
bugs like to eat. The villains are funny, expressive troublemakers rather than
frightening illness imagery. Every action teaches a real routine and ends with a
visible transformation: bubbly clean hands or a bright, well-brushed smile.

The first action must be obvious in five seconds. The splash presents two large
picture missions. Inside a mission, one enormous hand or mouth fills the play
field and one glowing tool waits directly below it. No child-facing path
requires reading.

The game has two complete modes:

1. **Suds Shield** — practice the hand-washing sequence and actively scrub all
   four hand areas for a cumulative twenty seconds.
2. **Smile Shield** — practice a pea-sized fluoride-toothpaste amount, gentle
   circles across four mouth areas, and grown-up-assisted flossing; hear the
   real-life two-minutes/two-times rule.

Completing both missions in one session opens a two-badge Hero Headquarters
finale. There is no score, timer pressure, failure state, streak, currency, or
locked economy.

## Why this is a custom game

The shared `coach-timer` engine is designed for a real-world checklist and one
central Done action. Beat the Bugs needs continuous coverage gestures, authored
foam and sparkle trails, staged villains, multiple hero tools, per-zone
progress, and responsive raster compositions. Forcing those interactions into
the checklist engine would preserve the data shape while losing the promised
fantasy.

This game therefore uses a custom static runtime with config-driven content. It
reuses the shared screen, input, audio, music, timer, nudge, celebration, RNG,
preload, and QA modules. The visible world remains authored raster art; DOM and
canvas logic provide only layout, masks, hit testing, semantic state, and
accessibility.

## Learning goals

### Suds Shield

- **One mode skill:** recall and physically rehearse the complete hand-washing
  sequence.
- Wet hands, add soap, scrub palms, backs, between fingers, and under nails,
  continue active scrubbing for twenty seconds total, then rinse.
- Understand that soap helps germs slip off and rinse down the drain.

### Smile Shield

- **One mode skill:** recall and physically rehearse complete brushing coverage.
- Use a pea-sized dot of fluoride toothpaste; brush fronts, chewing tops,
  insides, and tongue with gentle circles; let a grown-up help floss between
  teeth.
- Remember the real-world rule: brush for two full minutes, two times a day.

The digital Smile Shield is a short practice loop. It explicitly does not imply
that sixteen seconds in the game replaces a real two-minute brushing session.

## Screen map

```text
catalog
  → Hygiene Hero Lab splash / mission select
      ├─ Suds Shield intro
      │    → wet → soap → palms → backs → between fingers → nails
      │    → twenty bubbles filled → rinse → Bubble Bolt badge
      └─ Smile Shield intro
           → pea-sized paste → fronts → chewing tops → insides → tongue
           → three floss gaps → two-by-two recap → Smile Star badge
  → both badges earned this session
      → Hero Headquarters finale → mission select / replay
```

- Splash Home returns to the catalog.
- Play, reward, and finale Back return to the game splash in-page.
- Sound replays the current spoken direction.
- A mission card begins that mission directly; there is no redundant Start
  screen.
- A mission reward holds until the child chooses Again or returns to the
  mission menu.

## Suds Shield loop (45–75 seconds)

1. The hand-washing lab opens around a large authored hand board. Germ
   Tiny-Trouble and three colorful germ friends peek from the hand surface.
2. **Wet:** the child taps the large water-drop tool. A raster water-sheen
   overlay lands on the hands.
3. **Soap:** the child presses the soap pump twice. Each press stamps authored
   foam and makes the germ friends wobble—not disappear yet.
4. **Palms:** the board swaps to the palms pose. The child moves a soap-shield
   cursor over the glowing zone. Each second of active, in-zone movement fills
   one authored bubble token. Five bubbles complete the zone.
5. **Backs, between fingers, nails:** the same gesture continues on three
   distinct hand-pose boards. Each adds five bubbles. Coverage only advances
   while the pointer is moving inside the generous active region; pausing is
   safe and never drains progress.
6. The twentieth bubble completes a calm, cumulative twenty-second scrub.
   Germs become tiny, silly, and slippery.
7. **Rinse:** tapping the faucet sends the bubbles and germ friends down a
   sparkling drain path. The hand board changes to the clean pose.
8. The Bubble Bolt badge lands with recorded praise, SFX, and a short raster
   sparkle burst. The child can replay or choose Smile Shield.

The game pauses active scrub time while the page is hidden. `pointercancel`,
blur, rotation, and leaving the active zone end the current stroke without
losing completed bubbles.

## Smile Shield loop (55–85 seconds)

1. The tooth command center opens around a large smiling-mouth board. Four
   Sugar Bugs hold harmless snack crumbs and make playful faces.
2. **Paste:** the child taps the toothpaste tube. A single pea-sized authored
   paste dot lands on the brush; extra taps are acknowledged with a giggle but
   do not imply that more paste is better.
3. **Fronts:** the board shows the front teeth. The child moves the sparkle
   brush in gentle circles over the generous active zone. Four active seconds
   fill four star tokens and remove the visible crumbs.
4. **Chewing tops, insides, tongue:** the board changes to a clear picture for
   each location. Four active seconds per zone fill the remaining star tokens.
   Sugar Bugs shrink and lose their snack crumbs as coverage grows.
5. **Floss rescue:** three large glowing tooth gaps appear. The child taps each
   gap, or drags the floss wand through it, using one shared attempt handler.
   The narrator keeps the grown-up-help qualifier.
6. Maya states the real rule: two full minutes, two times a day. Two large
   authored clock/sun-moon symbols reinforce the audio without requiring text.
7. The mouth changes to a clean smile. The Smile Star badge lands with a bright
   sparkle payoff. The child can replay or choose Suds Shield.

The gesture evaluates sustained path travel and real active movement time, not drawing precision.
Any broad circular or back-and-forth brush motion succeeds. The active region is
larger than the visible teeth and never penalizes a child for leaving it.

## Interaction rules

- All mission cards, tools, boards, gaps, and HUD controls have at least a 96 px
  effective target.
- Pointer input uses one active pointer, window-level move/up/cancel handling,
  retained pointer-to-tool offset, blur/visibility cleanup, and no stranded
  cursor.
- Tap is an equal path for discrete actions: wet, soap, rinse, toothpaste, and
  each floss gap.
- Coverage progress is monotonic. An incomplete stroke never removes progress.
- Current-zone art pulses softly after an idle nudge; the first nudge repeats
  the prompt, the second models the gesture with a short authored trail.
- Incorrect or extra actions receive a warm wiggle and modeling line, never an
  X, buzzer, reset, or loss.
- During reduced motion, board swaps and state changes are immediate, villain
  exits become static before/after changes, and confetti is omitted. Audio and
  clear state feedback remain complete.
- Rotation and resize preserve semantic progress, current zone, active time,
  completed bubbles/stars, and floss gaps.

## Visual direction

Canonical label: **Kawaii**. The visual north stars are Rhythm Copycat's puffy
vinyl/sticker system and Cooking Craze's single central manipulation field.

The Hygiene Hero Lab is a premium original candy-color package:

- thick cocoa outer contours and warm-cream die-cut rims;
- softly modeled vinyl/clay surfaces with tiny handmade texture, not generic
  flat vector UI;
- aqua, coral, mint, sunny yellow, grape, lime, and warm cream;
- big faces, tiny expressive limbs, soft contact shadows, and star/bubble
  garnish kept to the edge of the play field;
- Germ Tiny-Trouble and Sugar Bugs are mischievous and cute, with no gore,
  rot, scary mouths, disease imagery, or sick children;
- backgrounds remain calm behind the central board and reserve all four HUD
  corners plus the lower tool rail;
- the same cream rim, cocoa contour, lighting direction, and material finish
  appear on backgrounds, cards, boards, tools, villains, badges, and rewards.

No primary child-facing art is SVG, emoji, CSS geometry, or procedurally drawn
canvas art. CSS may position and animate authored raster layers. The foam,
water, sparkle, trail, progress-token, glow-ring, and confetti visuals are
authored raster sprites. Functional runtime copy remains HTML and audio.

### Screen compositions

- **Splash (4:3 landscape):** title lockup upper center; Maya at one side of a
  bright hygiene-lab portal; two giant cream-rimmed mission cards dominate the
  lower half; playful villain silhouettes peek from card edges. The center is
  not buried under explanatory copy.
- **Splash portrait:** title and Maya compress into the upper third; mission
  cards stack vertically with complete silhouettes and no crop.
- **Suds play:** aqua lab plate; one 56–64% viewport hand board centered; four
  small step pictures across the top safe band; water/soap cursor and twenty
  bubble tokens in the lower rail.
- **Smile play:** coral-and-mint command plate; one 56–64% viewport mouth board;
  four small zone pictures across the top; brush cursor and sixteen star tokens
  in the lower rail.
- **Reward/finale:** each mission reward keeps its real cleaned board visible;
  the combined finale promotes both earned badges, Maya, and permanent authored
  raster stars/bubbles into one celebratory hero-emblem composition.

## Complete art inventory

All nondeterministic sources stay under `assets/source/`. Contact sheets are
cut with `tools/cut-asset-sheet.py` using an explicit expected count, then
background-extracted/alpha-finalized and reviewed on magenta.

| Asset | Runtime role | Primary production route | Final target |
| --- | --- | --- | --- |
| `assets/bg/splash.webp` | Hygiene Hero Lab splash plate | GPT Image 2 clean aqua plate | opaque 1600×1200, ≤300 KB |
| `assets/bg/splash-portrait.webp` | intentional portrait splash plate | deterministic portrait crop of accepted clean plate | opaque ~832×1216, ≤260 KB |
| `assets/bg/suds.webp` | aqua hand mission lab | accepted GPT Image 2 clean aqua plate | opaque 1600×1200, ≤300 KB |
| `assets/bg/smile.webp` | coral/mint tooth command center | GPT Image 2 coral clean-plate edit | opaque 1600×1200, ≤300 KB |
| `assets/bg/finale.webp` | combined Hero Headquarters payoff | accepted clean aqua headquarters plate | opaque 1600×1200, ≤300 KB |
| `assets/title.webp` | decorative “BEAT THE BUGS” lockup | GPT Image 2, visually spell-checked, chroma/Layered extraction | alpha WebP ~1000×360, ≤150 KB |
| `assets/ui/mission-suds.webp`, `mission-smile.webp` | picture-only mission cards | coordinated GPT Image 2 contact sheet, cutter | alpha WebP ~480×520, 45–100 KB |
| `assets/boards/hands/*.webp` | wet, soap, palms, backs, between, nails, clean boards | coordinated GPT Image 2 sheet(s), cutter, Qwen Layered/finalize | alpha WebP ~760×620, 70–160 KB |
| `assets/boards/teeth/*.webp` | paste, fronts, tops, insides, tongue, floss, clean boards | coordinated GPT Image 2 sheet(s), cutter, Qwen Layered/finalize | alpha WebP ~760×620, 70–160 KB |
| `assets/bugs/germ-*.webp` | four germ personalities | GPT Image 2 contact sheet, cutter, Qwen Layered | alpha WebP 220–360 px, 25–70 KB |
| `assets/bugs/sugar-*.webp` | four sugar-bug personalities | same coordinated villain sheet | alpha WebP 220–360 px, 25–70 KB |
| `assets/tools/*.webp` | water, soap pump, soap shield, brush, paste, floss, faucet | GPT Image 2 contact sheet, cutter, Qwen Layered | alpha WebP 180–420 px, 25–80 KB |
| `assets/ui/bubble.webp`, `star.webp`, `foam.webp`, `sparkle.webp`, `zone-ring.webp` | raster-only state and gesture feedback | GPT Image 2 coordinated UI sheet, cutter | alpha WebP 96–240 px, 10–45 KB |
| `assets/ui/badge-suds.webp`, `badge-smile.webp` | mission rewards | GPT Image 2 coordinated badge pair, cutter | alpha WebP 360–480 px, 45–90 KB |
| `assets/ui/two-by-two.webp` | sun/moon plus two-minute clock recap pictogram | GPT Image 2; no baked words/numerals required | alpha WebP ~700×300, ≤100 KB |
| `assets/hero-maya.webp` | Maya in Hygiene Hero presentation | deterministic production encode of canonical shared Maya portrait; identity locked | alpha WebP ~520×700, ≤130 KB |
| `assets/og-image.jpg` | social card | canonical splash screenshot pipeline after final visual gate | opaque 1200×630 |
| `assets/source/gpt-image-2/hub-tile.png` | recognizable hub moment | GPT Image 2 edit anchored to the accepted splash art; ART DIRECTOR accepted | source retained; 640×533 JPEG in shared hub |
| `assets/source/local-api/hub/*` | Krea 2 exploration evidence | approved LAN Krea 2 candidates; rejected for semantic/style reasons | raw candidates and rejected receipts retained; never overwrite production |
| `assets/audio/*.m4a` | warm teacher guide | Qwen3 voice clone seeds 7→8→9, Whisper QA, AAC | manifest + lines + clips |

The art budget is deliberately concentrated on the visible foreground. A
background-only pass does not satisfy this GDD.

## Spoken script (verbatim)

`assets/audio/lines.json` is the runtime source of truth. Recorded clips are
primary; these exact lines are also Web Speech fallback text and Whisper QA
targets.

| Key | Line |
| --- | --- |
| `welcome` | “Welcome, Hygiene Hero! Pick a mission to beat the tiny troublemakers.” |
| `suds-intro` | “Germ Tiny-Trouble is hiding on these hands. Let's use our soap shield!” |
| `wet` | “First, get the hands wet. Tap the water drop.” |
| `soap` | “Now add soap. Pump, pump!” |
| `palms` | “Rub the palms together in bubbly circles.” |
| `backs` | “Flip over. Scrub the backs of both hands.” |
| `between` | “Slide the bubbles between every finger.” |
| `nails` | “Scratch the fingertips on the palm to clean under the nails.” |
| `twenty` | “Twenty seconds! Bubble Power complete!” |
| `rinse` | “Rinse the bubbles away. Bye-bye, tiny troublemakers!” |
| `suds-cheer` | “Suds Shield complete! Clean hands help keep you ready for fun.” |
| `smile-intro` | “Cavity Monsters love leftover food bits. Let's make this smile sparkle!” |
| `paste` | “Use a pea-sized dot of fluoride toothpaste.” |
| `fronts` | “Make gentle little circles on the fronts of the teeth.” |
| `tops` | “Brush the chewing tops where snacks like to hide.” |
| `insides` | “Sweep gently around the insides of the teeth.” |
| `tongue` | “Give the tongue a gentle brush, too.” |
| `floss` | “A grown-up can help floss the tiny spaces between teeth.” |
| `two-by-two` | “In real life, brush for two full minutes, two times a day.” |
| `smile-cheer` | “Smile Shield complete! The bright smile sent the Cavity Monsters packing!” |
| `nudge` | “Follow the glowing spot. Your hero tool knows the way.” |
| `keep-scrubbing` | “Super bubbles! Keep moving until all the bubble lights shine.” |
| `keep-brushing` | “Sparkle power! Keep the brush moving in gentle circles.” |
| `again` | “Ready for another hygiene mission?” |
| `finale` | “Double hero power! Clean hands and a sparkling smile make a mighty team.” |

Short tactile praise uses recorded variants: “Bubble power!”, “Sparkle power!”,
and “Tiny troublemaker defeated!” No line promises perfect disease or cavity
prevention; language uses “helps” where a health outcome is mentioned.

## Audio and music

- Recorded teacher voice uses `voice-clips.js` through one interrupt-safe
  narrator. Every clip is generated from the approved local voice reference,
  encoded AAC/M4A with `+faststart`, transcribed after final encoding, and
  rejected on a material mismatch.
- Web Speech is the complete fallback. Silent play remains legible from the
  picture sequence, active zone, gesture trail, monotonic tokens, and state
  changes.
- `shared/assets/music/upbeat-playground-pop.mp3` provides quiet hero-lab energy
  through `bgm.js`. It is preloaded before the first gesture, unlocked in the
  gesture fan-out, starts only after a real child gesture, ducks around every
  spoken line, follows mute state, and stops on screen exit/teardown.
- Shared synthesized SFX provide taps, bubbles, whooshes, sparkles, and fanfare.
  They support but never replace the visual state.

## Difficulty and replay variation

- The first play keeps the instructional sequence fixed.
- Replay changes villain palette/position, safe trail-stamp rotation, praise
  order, and small edge garnish through one seeded RNG.
- Hygiene order never shuffles. Difficulty never comes from time pressure or a
  smaller hit region.
- A child may repeat a finished zone for extra foam or sparkles without being
  told it is wrong.
- Both badges are session-only. Reloading simply returns to the two equally
  available missions.

## Privacy, permissions, persistence, and fallbacks

The game asks for no permission, records nothing, stores no child data, and
makes no model or LAN call at runtime. Model calls are authoring-time only and
all shipped media is committed. Missing recorded audio falls back to device
speech; missing BGM falls back to SFX/silence; missing decorative art never
blocks the semantic target. Progress exists only in memory for the current
session.

## Explicit departures

- There is no existing Beat the Bugs concept brief or mockup. The production
  pass creates three GPT Image 2 4:3 screen mockups before final assets; those
  become the visual storyboard and are retained under `assets/source/`.
- The reference suggests singing “Happy Birthday” or the ABC Song as a timer.
  This game uses twenty original bubble beats and spoken counting instead, so
  no copyrighted performance or lyric is needed and the visual timer works
  silently.
- The tooth mission does not run for two real minutes. It is explicitly framed
  as a short coverage practice and separately teaches the real two-minute rule.
- Flossing is included with a grown-up-help qualifier rather than presented as
  an unsupervised precision task.
- “Beat” means the villains lose their food/foothold and retreat in a funny
  sparkle/drain exit. There is no violence, sickness scare, drilling imagery,
  or damaged-tooth close-up.
- Maya keeps her canonical face, proportions, hair, and identity. Kawaii props
  and a removable hero badge establish the world without redesigning her.

## Shared modules

- `shared/js/audio-unlock.js`
- `shared/js/bgm.js` and `shared/assets/music/upbeat-playground-pop.mp3`
- `shared/js/celebrate.js`
- `shared/js/debug-harness.js`
- `shared/js/hud.js` and `shared/css/hud.css`
- `shared/js/idle-nudge.js`
- `shared/js/narrator.js` and `shared/js/voice-clips.js`
- `shared/js/preload.js`, `rng.js`, `screens.js`, `tap.js`, and `timers.js`
- `shared/js/stage/constrained-gesture-dom.js`

The coverage accounting stays game-local unless implementation proves a second
compatible consumer and a shared extraction can be tested without changing an
existing game.

## `QLOBE_DEBUG` v1

The game exposes:

- `ready`, `listModes()`, deterministic `startMode(id)`, `getState()`,
  `getTargets()`, `tap(id)`, `winRound()`, `mute()`, `seed(n)`,
  `fastTimers(scale)`, and `home()`;
- `stroke(zone, amount)` to drive the same coverage acceptance handler as real
  pointer movement;
- `completeStep()` to complete only the current step through its real handler;
- `getAudioLog()` / `clearAudioLog()` and `musicStats()`;
- serializable state: screen, mode, phase, zone, activeSeconds, coverage,
  bubble/star count, soap pumps, floss gaps, mission badges, seed, muted, and
  reduced-motion status.

Debug input uses the same handlers as child input. `winRound()` advances every
remaining step through those accepted-action paths rather than assigning a
finished state directly.

## Acceptance and release gate

- A child can pick either mode and begin the first clear action within five
  seconds without reading.
- Suds Shield visibly and audibly teaches wet → soap → palms → backs → between
  fingers → nails → twenty seconds → rinse.
- Smile Shield visibly and audibly teaches pea-sized fluoride paste → gentle
  circles across fronts/tops/insides/tongue → grown-up-assisted floss → two
  minutes/two times daily.
- Both modes complete in 30–90 seconds for a typical child and contain no loss
  or punitive state.
- Every primary visible object is authored raster art in one coherent Kawaii
  material world; full-size foreground fidelity is reviewed separately from
  layout.
- All image sources, prompts, seeds/workflows, cuts, alpha QA, transformations,
  voice transcripts, creator, and license are recorded in `ASSETS.md`.
- The general asset cutter runs with exact expected counts and produces
  `boxes.json`; all extracted alpha assets pass magenta-composite review.
- Recorded audio decodes in real Chrome and key lines log `kind: "clip"`.
- Local validation adds zero errors; QA covers both missions, discrete actions,
  real stroke input, navigation, recorded voice, BGM ducking, wrong/extra
  actions, portrait, landscape, short landscape, reduced motion, and zero
  unexpected page errors/failed requests.
- Full-resolution screenshots of splash, every meaningful phase, both rewards,
  and finale pass an independent adversarial ART DIRECTOR review.
- The deployed production route and hub launch pass the same smoke suite and
  production screenshots are visually reviewed.
- Status remains `beta` until the real iPad child playtest succeeds.
