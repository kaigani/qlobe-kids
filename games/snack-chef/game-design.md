# Snack Chef — production game design

**Category:** Practical Life · **Age:** 5–6 · **Status target:** live
**Concept:** `../01-game-concepts/snack-chef/`
**Art direction:** Watercolor / Storybook, using the platform Storybook world
**Guide:** Maya, the shared QLOBE cast character

## Product promise

Snack Chef turns the concept's cheerful kitchen into a tactile, screen-native
food-preparation toy. A child makes six playful snacks with broad finger
gestures: spread, peel, slice, pour, and arrange. Every recipe is a short
beginning, middle, and end; every action has an immediate visual and sound
response, and every ingredient the child touches is painted storybook art.

The platform capability this game makes robust is **continuous gesture
progress**: a reusable DOM pattern for scrub coverage, directional
path-following, repeated cuts, sustained hold-to-pour, and strand-proof
ingredient dragging.

## Modes and one skill

1. **Fruit Face** — spatial arrangement and simple facial symmetry. Slice kiwi
   with three broad strokes, then drag fruit onto large face guides.
2. **Toast Garden** — controlled circular spreading. Cover the toast with broad
   spiral strokes, then place berries and banana flowers.
3. **Banana Boat** — directional sequencing. Pull three peel strips down, make
   four safe guided cuts, then add toppings from left to right.
4. **Apple Sandwich** — layered assembly. Slice the apple into rounds, spread
   nut butter to the edges, add banana coins, and align the apple lid on top.
5. **Rainbow Plate** — color grouping. Slice strawberries, then arrange warm
   fruit in an arc before adding the cool green and purple row beneath.
6. **Yogurt Parfait** — controlled pouring and bottom-to-top layering. Hold the
   cup to pour a creamy layer, drop in berries and granola, pour again, and
   decorate the top.

These are pretend-food interactions. The game never tells a child to use a real
knife or prepare food without an adult.

## Gesture verbs

| Verb | Controller | Motor demand |
| --- | --- | --- |
| `cut` | `pathGestures` | trace from the pulsing orange start dot across a dotted line |
| `spread` | `coverageGesture` | broad circular scrubbing to cover a surface |
| `peel` | `pathGestures` (free) | downward pull on each large strip |
| `arrange` | `ingredientDrag` + tap | drag or tap-tap ingredients onto glowing slots |
| `pour` | `holdPour` (new) | **sustained hold** — touch and hold the cup; the fill rises while held; release pauses, never fails |

`holdPour` is the one new verb this pass. It mirrors `coverageGesture`'s
lifecycle: one active pointer, window-level listeners, `pointercancel`/`blur`
is a clean pause, fill progress persists across pauses. Wrong-start taps
outside the cup speak `hold-pour`.

## Screen map

```text
catalog → splash / recipe cards → play steps 1..n → plated reveal
                                      ↑                 |
                                      └── make another ─┘

splash home → catalog
play/reveal back → splash
sound → replay current spoken prompt (prompt pill also replays on tap)
```

### Splash

- Full-bleed storybook kitchen, generated title lockup, Maya in the lower-left.
- Six large illustrated recipe cards (3×2 landscape, 2×3 portrait) show the
  finished snack. Each card carries a thick recipe-color border and a painted
  ingredient badge. No reading is required; the card speaks and starts on tap.
- One-tap card start is deliberate — the mockup's select-then-Cook two-step is
  dropped in favor of the platform's one-press path for pre-readers.
- Home is the only catalog link.

### Play

- Back button top-left, sound button top-right.
- A picture recipe rail of step tiles shows where the child is: each tile is a
  painted verb pictogram; the active tile scales with the recipe accent ring;
  done tiles get a green check disc.
- The prompt pill is pictures-first: verb pictogram + target ingredient art. A
  small low-contrast text line remains for grown-ups. Tapping the pill replays
  the prompt.
- The center is a large wooden work board with one obvious active object, all
  painted art: real plate, toast, banana, apple, glass — no CSS-drawn food.
- Precise cut tracing uses Sand Tray Letters' playtested cue: one pulsing,
  white-ringed orange start dot with a short white arrow growing from it.
- Broad spreading, peeling, and pouring are modeled by a small pointing finger
  at 50% opacity, animated only while Maya speaks the movement prompt.
- Completed steps visibly fill with color and a check; the next step flows in.
- Spread coverage persists: the dabs a child paints in a spread step are the
  exact dabs shown under the fruit in the following arrange step.

### Reveal

- A distinct large hero painting of the finished plate grows into the center;
  Maya appears beside it.
- Celebration choreography: hero pops in → stitched ribbon banner drops →
  three gold stars pop one-two-three (pop, pop, tada) → fruit-colored paper
  confetti falls → Maya speaks the cheer → a small step-recap row of checked
  tiles appears. Stars are celebration only — never persisted, never shown on
  the splash, never withheld.
- Replay and recipe-menu buttons use the shared painted UI buttons.
- Back returns to the game splash, never directly to the catalog.

## Core loop and feedback

1. Maya names the snack and the next action.
2. The visual cue matches the motor demand: origin-and-arrow for exact cuts,
   translucent finger demonstration for broad movements and pouring.
3. The child traces cuts from their dot, begins broad movement anywhere on the
   food surface, or holds the cup to pour.
4. The surface changes under the finger: spread fills, peel curls, cut line
   opens, yogurt rises, or ingredient follows the finger.
5. Success gives a soft pop/sparkle and flows to the next action.
6. A misplaced ingredient floats home with a warm nudge. A released pour just
   pauses. Nothing is lost.
7. Two to four steps finish the plate in about 45–90 seconds.

All targets are at least 96 px. Dragging uses one active pointer, window-level
move/up/cancel listeners, stored grab offset, blur cancel, and tap-to-place as
an alternative. Reduced motion removes wobble, parallax, and travel arcs.
Only the current cut is fully highlighted. A cut started elsewhere gives a
gentle wobble and “Start at the orange dot”; success advances the dot to the
next line.

## Config schema (v2)

`config.json` is canonical and studio-editable. This pass moves all layout
data out of code:

- top-level `ingredients` map — `kind → { art, color }`; art paths point into
  `shared/assets/foods-storybook/`.
- every mode gains `reveal` (hero art path, distinct from the card `art`).
- `arrange` steps carry `base` (staged board art id) and
  `slots: [{ kind, x, y, shape? }]`; the tray and total derive from `slots`.
- `cut` steps carry `target` (which staged food art to cut and how many lines).
- `spread` steps carry `target` and `color` (dab tint).
- `pour` steps carry `count` (held ticks) and `fill: [from, to]` percent
  levels for the glass.
- the `theme` block is live: accent → CSS custom property, background → the
  screen backdrop.

## Spoken script

The lines below are verbatim and are also the TTS source of truth.

### Shared

- `welcome`: “Welcome to Snack Chef! Tap a yummy picture and let’s make it.”
- `start-dot`: “Start at the orange dot.”
- `hold-pour`: “Touch and hold the cup to pour.”
- `nudge`: “Almost! Put it on the glowing spot.”
- `again`: “What shall we make next?”
- `sound`: repeats the current prompt.

### Fruit Face

- `fruit-intro`: “Let’s make a silly fruit face!”
- `fruit-cut`: “Swipe across each dotted line to slice the kiwi.”
- `fruit-arrange`: “Give our snack two kiwi eyes, a berry nose, and a banana smile.”
- `fruit-cheer`: “Hello, fruit face! You made a delicious smile.”

### Toast Garden

- `toast-intro`: “Let’s paint a tiny toast garden!”
- `toast-spread`: “Move in big circles and spread to every corner.”
- `toast-arrange`: “Plant the banana flowers and add bright berry centers.”
- `toast-cheer`: “Your toast garden is blooming. Beautiful chef work!”

### Banana Boat

- `boat-intro`: “Let’s build a crunchy banana boat!”
- `boat-peel`: “Pull each peel strip down, down, down.”
- `boat-cut`: “Swipe across the four dotted lines to make banana coins.”
- `boat-arrange`: “Fill the boat from left to right, then sprinkle the berries.”
- `boat-cheer`: “All aboard the banana boat. Bon voyage, chef!”

### Apple Sandwich

- `apple-intro`: “Let’s build a crunchy apple sandwich!”
- `apple-cut`: “Swipe across the dotted lines to slice the apple.”
- `apple-spread`: “Spread the nutty butter all the way to the edges.”
- `apple-arrange`: “Add the banana coins, then put the apple lid on top.”
- `apple-cheer`: “Crunch, crunch! Your apple sandwich looks amazing.”

### Rainbow Plate

- `rainbow-intro`: “Let’s make a fruity rainbow plate!”
- `rainbow-cut`: “Swipe each dotted line to slice the strawberries.”
- `rainbow-warm`: “Place the red, orange, and yellow fruit in a rainbow.”
- `rainbow-cool`: “Now add the green and purple fruit underneath.”
- `rainbow-cheer`: “Wow! You made a rainbow you can eat!”

### Yogurt Parfait

- `parfait-intro`: “Let’s pour a creamy berry parfait!”
- `parfait-pour`: “Touch and hold the cup. Pour the yogurt to the line.”
- `parfait-sprinkle`: “Drop the berries and granola onto the yogurt.”
- `parfait-pour2`: “Pour one more creamy layer, nice and slow.”
- `parfait-top`: “Now decorate the top with sweet berries.”
- `parfait-cheer`: “What a beautiful parfait! Layer by layer, chef!”

Web Speech is the offline fallback for every line. Recorded teacher-voice clips
are preferred when the local voice pipeline produces transcript-approved takes.

## Step definitions

| Recipe | Steps | ~Loop |
| --- | --- | --- |
| Fruit Face | cut ×3 (kiwi) → arrange 4 slots | 50s |
| Toast Garden | spread ×18 → arrange 6 slots | 60s |
| Banana Boat | peel ×3 → cut ×4 → arrange 6 slots | 75s |
| Apple Sandwich | cut ×2 (apple) → spread ×12 → arrange 3 coins + lid | 60s |
| Rainbow Plate | cut ×3 (strawberry row) → arrange 6 warm → arrange 4 cool | 75s |
| Yogurt Parfait | pour ×12 → arrange 3 → pour ×10 → arrange 3 | 70s |

The apple lid uses a wide `lid` slot that stacks above the coins when placed.
The rainbow's two arrange steps keep the tray at six or fewer pieces and teach
warm/cool grouping. The parfait glass shows painted layer lines; each pour
fills to the next line.

## Art list

| Asset | Runtime size / format | Production |
| --- | --- | --- |
| Storybook kitchen backdrop | 1600×1200 WebP, ≤300 KB | GPT Image 2 (existing); full-bleed, calm center |
| `SNACK CHEF` title lockup | alpha WebP, ≤150 KB | GPT Image 2 (existing), chroma-key removal |
| Recipe cards ×6 | 520 px WebP, ~30–45 KB each | 3 existing GPT Image 2 crops + 3 new via qwen-image-edit on the same contact sheet |
| Reveal heroes ×6 | ~900 px alpha WebP, ≤120 KB | qwen-image-edit from each card, layered cutout |
| Shared food cutouts ×16 | 400 px alpha WebP, ≤80 KB | qwen-image-edit + layered cutout → `shared/assets/foods-storybook/` |
| Staged board art (plate, banana states, boat, glass, stream…) | 600–900 px alpha WebP, ≤100 KB | qwen-image-edit + layered cutout, game-local `assets/food/` |
| Verb pictograms ×5 | 160 px alpha WebP, ≤15 KB | qwen-image-edit, gesture-finger style ref, `assets/ui/` |
| Star + ribbon | alpha WebP | qwen-image-edit; ribbon carries **no text** |
| Maya portrait | shared transparent PNG | `shared/characters/maya/portrait.png` |
| Hub tile | 640×533 JPEG | existing, hand-curated |
| HUD + reveal buttons | shared PNG | `shared/assets/ui/btn-*.png` incl. `btn-play`/`btn-shuffle` |
| Voice | AAC/M4A + manifest | Qwen voice clone seed 7 → Whisper transcript QA; Web Speech fallback |
| SFX | live WebAudio | shared `sfx.js` |

Style anchor for all new art: the game's own GPT Image 2 sources
(`assets/source/recipes-gpt-image-2-chroma.png`, `kitchen-gpt-image-2.png`)
with one fixed storybook gouache style suffix. The runtime never calls a model
or network service.

## Visual system

- Warm cream paper, raspberry, kiwi green, blueberry indigo, honey yellow.
- Hand-painted gouache and colored-pencil texture with chunky charcoal edges.
- White enamel plates, honey-colored wood, stitched recipe cards.
- Mockup-energy UI: chunky white ingredient tiles with per-kind colored
  borders, step tiles with painted pictograms, star celebration — all rendered
  in the storybook world, not the mockup's gloss.
- Functional labels use Fredoka HTML; child-facing instruction is audio and
  pictures first.
- The concept mockup's hierarchy is retained: title/recipe choice, centered
  work board, left progress rail, large ingredients along the bottom.

## Departures from the brief, mockups, and beta

- The beta's real-world adult-coaching checklist is replaced by safe pretend
  preparation.
- The mockup's persistent written instructions are replaced by spoken prompts,
  picture steps, and modeled hand paths for pre-readers.
- The mockup's select-then-Cook two-step start is replaced by one-tap cards
  (platform one-press path).
- The mockup's persistent star bar and unlocks are not adopted; three stars
  appear on the reveal as pure celebration and are never persisted, displayed
  on home, or withheld.
- Maya replaces the one-off generated chef so the QLOBE cast remains familiar.
- The tool bench (knife/peeler/grater cards) stays out: the active verb is
  communicated by the prompt pictogram, keeping one obvious touchable object.

## Shared modules and robustness

- `shared/js/tap.js`: one press path.
- `shared/js/sfx.js`, `shared/js/speech.js`, `shared/js/voice-clips.js`: audio.
- `shared/assets/ui/`: navigation and replay controls.
- `shared/assets/foods-storybook/`: painted food cutouts (new, reusable).
- `shared/characters/maya/portrait.png`: guide.
- Game-local `gesture-surface.js`: coverage, path, drag, and hold-pour
  controllers. Kept local until a second game proves the API.

## Privacy, persistence, and fallback

No accounts, microphone, camera, analytics, upload, or remote runtime calls.
No child data is stored (stars included). If recorded voice is unavailable,
Web Speech carries every line. If canvas or pointer capture is limited, tap
targets advance the same handlers. A round can always be left with Back.

## `QLOBE_DEBUG` v1

Provides `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`,
`gesture`, `winRound`, `mute`, `seed`, `fastTimers`, and `home`. Targets expose
truthful current roles, and debug input calls the exact handlers used by
pointer input. The pour surface exposes a `pour` target; `winRound` advances it
via the controller's `addProgress`.

## Release gate

- Every mode and wrong-target branch passes in real Chrome (all six recipes,
  including pour pause/resume and both nudge lines).
- Splash → play → back → splash and reveal → back → splash pass.
- No console errors, failed requests, or case-sensitive path failures.
- Landscape, portrait, reduced-motion, and peak-gesture screenshots are
  reviewed against the mockups' energy bar.
- Title is spelled exactly `SNACK CHEF`; the ribbon banner carries no text.
- Opaque art meets budgets; cutout corners are transparent and fringe-free.
- Production-mode direct and hub routes pass.
- Final sign-off: iPad playtest by the maintainer.
