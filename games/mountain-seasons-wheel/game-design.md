# Mountain Seasons Wheel — production game design

**Category:** culture-geography · **Ages:** 3–6 (primary 5–6) · **Status:** beta until a child playtest

**Art direction:** Papercraft (`paper-garden` runtime alias) — layered construction paper, visible fibres, cut and folded edges, stitched kraft cards, and soft physical shadows. This explicit concept assignment overrides the category default.

**Concept:** `../01-game-concepts/mountain-seasons-wheel/brief.md`, four UI mockups, and the 15-second Dreamina interaction video

**Replaces:** the emoji `choose-one` prototype at this same id and route

## Product promise

> Spin a real paper seasons wheel, watch one mountain transform, help Juni the bear dress for the weather, and discover how a plant and an animal change with every season.

The production game must make five promises true:

1. The wheel is a tactile object: a child can flick it directly or tap a large assisted-spin control, and both paths visibly rotate the same raster wheel beneath a fixed pointer.
2. The mountain changes in place. Snow, blossoms, summer meadow growth, and autumn leaves are authored states of one recognizable landscape rather than unrelated quiz cards.
3. Every season connects weather, clothing, one plant, and one animal through pictures, touch, and warm recorded narration; reading is never required.
4. Every primary object—wheel, character, clothes, cards, markers, stamps, and reward—belongs to one coherent papercraft material world.
5. A season loop completes in roughly 35–70 seconds, while four discoveries form a satisfying 3–6 minute session.

## Modes and one skill per mode

### 1. Season Adventure (`wheel`)

**Skill:** connect a season with visible changes in weather, plants, and animals.

The child spins, helps Juni choose one weather-appropriate garment, then taps one plant and one animal discovery in the transformed mountain. Completing both earns that season stamp. The next spin prefers an unvisited season; four stamps reveal the four-season pop-up mountain reward.

### 2. Dress for Weather (`dress`)

**Skill:** choose clothing that fits a concrete weather condition.

Four short rounds present the same four authored garment cards in a shuffled order. Juni changes into the selected correct outfit after each round. There is no score, timer, or failure state.

## Session and screen map

```text
SPLASH --Season Adventure--> WHEEL --land--> DRESS GATE --correct--> EXPLORE
   |                              ^                                  |
   |                              +------- next season <--- STAMP ---+
   |                                                    |
   |                                          after 4 -> REWARD
   |
   +------Dress for Weather--> DRESS ROUND x4 ----------> REWARD

SPLASH home -> catalog (the only page navigation)
WHEEL / DRESS / EXPLORE / REWARD back -> SPLASH in-page
```

### Splash (3–10 seconds)

- Full-bleed four-season mountain diorama, generated title lockup, and Juni peeking from the foreground.
- Two large picture-led mode cards: a wheel and a coat. Voice introduces both choices.
- The shared Home PNG is the only catalog link.

### Wheel (5–15 seconds)

- A four-segment raster wheel occupies the visual center beneath a fixed paper pointer.
- Each segment has one unambiguous authored symbol: spring blossom, summer sun, autumn leaf, winter snowflake.
- Direct wheel flick and the large `SPIN` button share one spin function. A slow or off-axis gesture still becomes a satisfying assisted spin.
- The wheel rotates at least two full turns, ticks at segment boundaries, and settles on a deterministic seeded target. The target is random among unvisited seasons in adventure mode.
- The same mountain behind the wheel crossfades to its season. Raster particles briefly reinforce the change; reduced-motion mode uses an immediate dissolve and no continuous particles.

### Dress gate / dress round (10–25 seconds)

- Juni stands on the left in landscape or above the choices in portrait.
- Four large stitched-paper garment cards use authored cutout art. The spoken prompt identifies the weather and asks what would help.
- Correct choice: the card hops to Juni, the character image swaps to the matching dressed pose, a short praise line plays, and the next state appears.
- First incorrect choice: soft paper wiggle, gentle rustle, a persistent papercraft try-again pointer, a truthful hint, and a quiet stitched glow on the helpful card. Further misses keep the glow and model the useful choice while all options remain tappable.
- Adventure mode advances to Explore after the correct choice. Dress mode advances to the next season and completes after all four.

### Explore (15–35 seconds)

- The seasonal mountain plate fills the screen. The characteristic plant and animal are visibly present in the authored scene.
- A large leaf seal and paw seal sit over the actual subjects; these are authored raster markers with invisible 112px interaction bounds.
- Tapping a seal opens a stitched field-note card with a close-up papercraft cutout and speaks one short fact. Re-tapping replays it.
- After both facts, the season stamp peels onto the progress ribbon and the next-spin button appears.

### Reward (8–25 seconds)

- Adventure: a four-panel pop-up mountain shows winter, spring, summer, and autumn together, echoing `03-season-discovery.png`; the four collected stamps settle around it.
- Dress: Juni appears with the four garment cards around a stitched weather badge.
- Confetti is a raster papercraft overlay plus the reduced-motion-aware shared celebration.
- `Play again` restarts the same mode with a new seeded order; Back returns to the splash.

## Seasonal content and exact spoken script

All quoted lines are source-of-truth copy for `data/lines.json`. Functional text is HTML; audio and imagery carry the child path.

### Global lines

- `welcome`: “Welcome to Mountain Seasons! Spin the wheel, help Juni get ready, and find what changes on the mountain.”
- `choose-mode`: “Choose a season adventure, or dress Juni for the weather.”
- `wheel-prompt`: “Give the seasons wheel a spin!”
- `wheel-help`: “Swipe the wheel, or tap the big spin button.”
- `wheel-turning`: “Round and round the seasons go!”
- `dress-intro`: “Let’s dress Juni for the weather.”
- `dress-nudge`: “Good thinking. Look at the weather and try another one.”
- `dress-model`: “This one will help Juni feel just right.”
- `explore-prompt`: “Now find the plant and the animal. Tap the leaf and paw prints.”
- `explore-nudge`: “There is still something to discover. Look for a gently bouncing seal.”
- `season-complete`: “You discovered a whole season! Add its stamp to the wheel.”
- `adventure-complete`: “Winter, spring, summer, and autumn! You discovered the whole mountain year.”
- `dress-complete`: “Juni is ready for every kind of weather!”
- `again`: “Let’s spin through the seasons again.”

### Spring

- `spring-land`: “The wheel found spring! Snow is melting, little flowers are opening, and cool rain helps the mountain grow.”
- `spring-dress`: “Spring rain is pattering down. Which coat helps Juni stay dry?”
- `spring-correct`: “A raincoat! Juni can splash through spring showers.”
- `spring-hint`: “Look for the shiny yellow coat that keeps rain out.”
- `spring-plant`: “Melting snow and spring rain give mountain wildflowers water to grow.”
- `spring-animal`: “Marmots wake from their long winter sleep when spring warms the mountain.”
- `spring-stamp`: “Spring stamp collected!”

### Summer

- `summer-land`: “The wheel found summer! The days are warm, the meadow is green, and bright flowers fill the sunshine.”
- `summer-dress`: “The summer sun is bright. What can shade Juni’s face?”
- `summer-correct`: “A sun hat! Its wide brim gives Juni cool shade.”
- `summer-hint`: “Look for the hat with a wide shady brim.”
- `summer-plant`: “Lupine flowers bloom in sunny mountain meadows, and bees carry pollen between them.”
- `summer-animal`: “Mule deer nibble tender leaves and rest in cool shade on hot summer days.”
- `summer-stamp`: “Summer stamp collected!”

### Autumn

- `autumn-land`: “The wheel found autumn! The air turns cool and the aspen leaves glow gold and orange.”
- `autumn-dress`: “A cool autumn breeze is blowing. What keeps Juni’s middle cozy?”
- `autumn-correct`: “A warm vest! Juni is cozy and ready to explore.”
- `autumn-hint`: “Look for the soft orange vest.”
- `autumn-plant`: “Aspen leaves stop making green chlorophyll, so their sunny yellow colors show.”
- `autumn-animal`: “Red squirrels hide pinecones and seeds to eat when winter food is harder to find.”
- `autumn-stamp`: “Autumn stamp collected!”

### Winter

- `winter-land`: “The wheel found winter! Snow blankets the ground and evergreen trees hold their needles.”
- `winter-dress`: “Snow is falling and the air is freezing. Which coat keeps Juni warm?”
- `winter-correct`: “A warm parka! Juni is snug in the winter snow.”
- `winter-hint`: “Look for the thick blue coat with a fuzzy hood.”
- `winter-plant`: “Evergreen needles have a waxy coat that helps the tree hold water in freezing weather.”
- `winter-animal`: “A snowshoe hare grows white winter fur that helps it blend into the snow.”
- `winter-stamp`: “Winter stamp collected!”

## Interaction and feedback rules

- Use `shared/js/tap.js` for buttons and one Pointer Events controller for direct wheel rotation. `pointercancel`, `lostpointercapture`, `blur`, and screen exit always settle or cancel safely.
- Direct wheel drag tracks the touch angle around the wheel center. Release velocity becomes bounded inertia, then eases to the predetermined segment. Precision never gates progress.
- Assisted spin and direct flick call the same state transition and land-selection code.
- While the wheel or a screen transition is busy, repeated presses are ignored rather than queued.
- Garment choices are always at least 112×112px; HUD controls preserve the shared 96px floor and safe-area offsets.
- No red X, buzzer, score loss, countdown, game over, locked season, or reward currency.
- The sound control replays the current prompt or latest discovery fact.
- Idle help begins after 11 seconds, repeats at 11-second intervals, and escalates from replay → bounce marker → model correct choice.
- Reduced motion disables inertia, parallax, continuous particles, and large bounces while preserving immediate state clarity.
- Keyboard/assistive input can activate every control. Direct wheel alternatives include arrow keys and the assisted spin button.

## Visual system and complete art inventory

All final child-facing art is authored raster. CSS/DOM provides layout, hit areas, state, focus, masks, and transforms only; it does not draw mountains, wheels, cards, clothing, markers, or rewards.

| Asset | Target size / format | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| `backgrounds/splash.webp` | 1448×1086 opaque WebP, target ≤350KB | four-season papercraft mountain diorama with quiet center | full-bleed `<img>` |
| `backgrounds/wheel.webp` | 1448×1086 opaque WebP, target ≤350KB | four-season mountain plate behind wheel | crossfading `<img>` |
| `backgrounds/{spring,summer,autumn,winter}.webp` | 1448×1086 opaque WebP, target ≤350KB each | same camera and mountain geometry transformed by season | state-swapped `<img>` elements |
| `title.webp` | alpha WebP, 900×506, target ≤150KB | exact “Mountain Seasons” cut-paper title lockup | accessible splash `<img>` |
| `ui/wheel.webp` | alpha WebP, ≤900×900 | four equal paper segments with blossom, sun, leaf, snowflake | rotatable `<img>` with large circular pointer target |
| `ui/pointer.webp` | alpha WebP, 310×224 source crop | fixed red folded-paper pointer | non-interactive `<img>` |
| `ui/button.webp` | alpha WebP, ≤680×240 | blank stitched kraft/green action-button carrier | HTML button text and hit area |
| `ui/mode-wheel.webp`, `ui/mode-dress.webp` | alpha WebP, ≤520×440 | illustrated wheel and coat on stitched cards | splash mode buttons |
| `ui/prompt-banner.webp` | alpha WebP, ≤980×240 | blank curled kraft-paper banner | adult caption + ARIA status |
| `ui/garment-card.webp` | alpha WebP, ≤420×520 | blank stitched cream paper card | garment button carrier |
| `ui/leaf-seal.webp`, `ui/paw-seal.webp` | alpha WebP, ≤240×240 | layered leaf and paw medallions | 112–144px hotspot buttons |
| `ui/fact-card.webp` | alpha WebP, ≤760×820 | blank field-note card with stitched border | modal fact panel and close control |
| `ui/stamps/{spring,summer,autumn,winter}.webp` | alpha WebP, ≤220×220 each | distinct seasonal paper patch | progress and reward state |
| `ui/particles/{rain,petal-qwen,sun,leaf,snow}.webp` | alpha WebP, ≤96×96 each | tiny paper weather pieces | JS-positioned decorative particles |
| `character/juni-base.webp` | alpha WebP, ≤560×760 | neutral papercraft brown bear cub | character `<img>` |
| `character/juni-{spring,summer,autumn,winter}.webp` | alpha WebP, ≤560×760 each | same bear and pose in season outfit | state-swapped character `<img>` |
| `clothes/{raincoat,sun-hat,warm-vest,parka}.webp` | alpha WebP, ≤380×380 each | isolated papercraft garments | garment card art |
| `discoveries/{spring-wildflowers,spring-marmot,summer-lupine,summer-deer,autumn-aspen,autumn-squirrel,winter-evergreen,winter-hare}.webp` | opaque square WebP, ≤460×460 each | close-up paper plant/animal crops | fact-card image |
| `reward/four-seasons.webp` | 1448×1086 opaque WebP, target ≤400KB | four-panel folded-paper mountain reward | reward plate |
| Dress reward composition | splash plate + Juni and four alpha garment WebPs | Juni with all four weather outfits | live DOM composition of authored raster art |
| Celebration pieces | the five alpha particle WebPs above | sparse cut-paper weather pieces | brief reduced-motion-aware raster burst |
| Recorded narration | AAC/M4A, 96kbps | text-only Qwen-designed warm preschool-teacher voice, one blind-QA file per line | `voice-clips.js` + Web Speech fallback |

Sources and contact sheets remain under `assets/source/`. GPT Image 2 establishes the coordinated visual system, major plates, character sheet, garment sheet, and UI sheets. Qwen Image Edit season drafts were reviewed but rejected for identity drift; the accepted Qwen Image Layered contribution is `petal-qwen.webp`. Every alpha asset is inspected on a contrasting matte before final encoding.

## Responsive and accessibility contract

- Authored art space is the model-native 1448×1086 (4:3). Landscape uses cover-fit with the wheel/character in the protected central 68%; portrait exploration fits the authored plate over a subdued, full-bleed copy of the same season raster and stacks controls around the focal subject.
- At 1024×768, wheel diameter is approximately 54–62vh; in portrait it is min(82vw, 52vh).
- No essential subject may sit under the top 104px HUD band or bottom safe-area/action band.
- Every image has meaningful alt text; every control has an accessible name and visible keyboard focus.
- Text is supplemental. Instructions, answers, and facts are always spoken and visually demonstrated.
- The game requests no camera, microphone, location, account, network runtime, or personal data.

## Audio and motion

- Recorded narration is the primary channel. Web Speech is a truthful per-line fallback when a clip is missing or rejected.
- Shared synthesized SFX provide paper ticks, pop, sparkle, boing, whoosh, and tada.
- A game-local adapter selects recorded background music from the shared library for each season. It starts only after the first gesture and fades out on mute or screen exit.
- Wheel clicks align with segment crossings. The chosen season gets one short transition flourish; continuous ambience is optional and muted by the shared sound control.
- No generated video ships in v1: the promised transformations and discoveries remain interactive, and a passive clip would add size without communicating an action that the raster states cannot.

## Architecture

- Custom static game: `index.html`, `config.json` + thin `config.js`, `css/style.css`, `js/main.js`, `js/wheel.js`, and `js/soundscape.js`.
- `config.json` owns season order, art refs, target coordinates, outfit answers, labels, and tuning; `data/lines.json` owns exact narration and fact copy. Studio can inspect and extend content without editing orchestration code.
- `main.js` owns the screen router, mode/session state, dress/explore transitions, narration, progress, and `QLOBE_DEBUG`.
- `wheel.js` is the reusable local capability: angle tracking, bounded inertia, assisted deterministic settling, segment ticks, reduced motion, resize-safe center measurement, and teardown; `main.js` selects seeded unvisited targets.
- Shared modules remain authoritative: `tap.js`, `voice-clips.js`, `audio-unlock.js`, `sfx.js`, `screens.js`, `hud.js`, `idle-nudge.js`, `timers.js`, `rng.js`, `preload.js`, `celebrate.js`, and `debug-harness.js`.
- No model, LAN host, remote asset, or authoring service is called at runtime.

## QLOBE_DEBUG v1

The hook exposes the standard contract plus:

- `getState()` → screen, mode, season, wheel angle, spinning/busy state, dress attempts, discoveries, visited seasons, dress-round order, reduced-motion state.
- `getTargets()` → only visible non-zero tappable rectangles.
- `startMode('wheel'|'dress')`, `tap(id)`, `home()`, `mute(on)`, `seed(n)`, and `fastTimers(scale)`.
- `spin(season?)`, `settleWheel(season)`, `chooseGarment(id)`, `discover(kind)`, `completeSeason()`, and `completeMode()` for deterministic QA.
- `getAudioLog()` proves each requested line used a recorded clip or truthful speech fallback.

## Explicit departures and decisions

- **Papercraft wins over the brief’s older vector-style sentence and the video’s outlined cartoon look.** The brief’s canonical art-world field and all mockups specify Papercraft; the video contributes interaction timing only.
- **The brown bear mascot wins over the mockup’s one-off human child.** The brief and video both propose a friendly brown bear, and one consistent animal avoids inventing an unapproved human cast identity. Juni is rendered entirely in the game’s paper material language.
- **The wheel has four equal season segments, not the video’s inconsistent six slices.** Four segments teach the intended four-category concept and match the production mockup.
- **Dress-up is tap-to-choose, not precision drag.** The concept screens show taps and the learning goal is weather reasoning; a visible hop-to-character animation preserves the dress-up fantasy without motor difficulty.
- **Flora and wildlife are built into the main adventure instead of separate splash modes.** This makes each spin cause a coherent sequence—weather, clothing, plant, animal—and keeps the session understandable in five seconds.
- **The wheel prefers unvisited seasons rather than being physically random.** The animation still feels surprising, while a full session reliably reaches the four-season reward.
- **Generated text is limited to the spell-checked title lockup.** Buttons, labels, facts, and accessibility copy remain HTML/audio for accuracy.
- **The concept video does not ship as gameplay.** Its smooth-vector frames conflict with Papercraft and duplicate interaction rather than adding a communicative story beat.

## Release gate

- Both modes and every season complete end to end with no console error, 404, remote runtime request, or stuck busy state.
- Direct flick, assisted spin, segment ticks, predetermined landing, repeated taps, cancel/blur, resize, teardown, and reduced motion pass automated probes.
- Correct and incorrect garment branches work for all four seasons; both discovery orders work; four stamps reach the correct reward.
- Recorded narration plays after a real gesture in Chrome; every final file has hash-locked, no-prompt Whisper-medium evidence and fallback behavior is tested.
- Home/back routing, safe areas, ≥96px targets, landscape 1024×768 and 1366×768, portrait 768×1024, keyboard input, and reduced motion pass.
- Static checks verify registry parity, config schema, lowercase asset paths, no emoji/vector/CSS placeholder art, no LAN endpoint in committed files, and art budgets.
- Visual review separately approves composition, title spelling, foreground papercraft fidelity, alpha edges, season continuity, outfit readability, fact-card hierarchy, portrait crops, wrong-answer state, and reward state.
- The route and catalog entry move from `in-design` to `beta` for production review. `live` waits for the target child’s real iPad playtest and explicit sign-off.
