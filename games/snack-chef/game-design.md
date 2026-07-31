# Snack Chef — production game design

**Category:** Practical Life · **Age:** 5–6 · **Status target:** live
**Concept:** `../01-game-concepts/snack-chef/`
**Art direction:** Watercolor / Storybook, using the platform Storybook world
**Guide:** Maya, the shared QLOBE cast character

## Product promise

Snack Chef turns the concept's cheerful kitchen into a tactile, screen-native
food-preparation toy. A child makes three playful snacks with broad finger
gestures: spread, peel, slice, and arrange. Every recipe is a short beginning,
middle, and end; every action has an immediate visual and sound response.

The platform capability this game makes robust is **continuous gesture
progress**: a reusable DOM/canvas pattern for scrub coverage, directional
path-following, repeated cuts, and strand-proof ingredient dragging.

## Modes and one skill

1. **Fruit Face** — spatial arrangement and simple facial symmetry. Slice kiwi
   with three broad strokes, then drag fruit onto large face guides.
2. **Toast Garden** — controlled circular spreading. Cover the toast with broad
   spiral strokes, then place berries and banana flowers.
3. **Banana Boat** — directional sequencing. Pull three peel strips down, make
   four safe guided cuts, then add toppings from left to right.

These are pretend-food interactions. The game never tells a child to use a real
knife or prepare food without an adult.

## Screen map

```text
catalog → splash / recipe cards → play step 1 → play step 2 → plated reveal
                                      ↑                         |
                                      └──── make another ───────┘

splash home → catalog
play/reveal back → splash
sound → replay current spoken prompt
```

### Splash

- Full-bleed storybook kitchen, generated title lockup, Maya in the lower-left.
- Three large illustrated recipe cards show the finished snack and its dominant
  gesture. No reading is required; the card speaks and starts on tap.
- Home is the only catalog link.

### Play

- Back button top-left, sound button top-right.
- A three-bead picture recipe rail shows where the child is in the sequence.
- The center is a large wooden work board with one obvious active object.
- Precise cut tracing uses Sand Tray Letters' playtested cue: one pulsing,
  white-ringed orange start dot with a short white arrow growing from it.
- Broad spreading and peeling are modeled by a small pointing finger at 50%
  opacity, animated only while Maya speaks the movement prompt.
- Completed steps visibly fill with color and a check; the next step flows in.

### Reveal

- Finished plate grows into the center; Maya appears beside it.
- Paper-confetti fruit shapes, warm praise, and a large replay/recipe-menu pair.
- Back returns to the game splash, never directly to the catalog.

## Core loop and feedback

1. Maya names the snack and the next action.
2. The visual cue matches the motor demand: origin-and-arrow for exact cuts,
   translucent finger demonstration for broad movements.
3. The child traces cuts from their dot, or begins broad movement anywhere on
   the relevant food surface.
4. The surface changes under the finger: spread fills, peel curls, cut line
   opens, or ingredient follows the finger.
5. Success gives a soft pop/sparkle and flows to the next action.
6. A misplaced ingredient floats home with a warm nudge. Nothing is lost.
7. Three steps finish the plate in about 45–75 seconds.

All targets are at least 96 px. Dragging uses one active pointer, window-level
move/up/cancel listeners, stored grab offset, blur cancel, and tap-to-place as
an alternative. Reduced motion removes wobble, parallax, and travel arcs.
Only the current cut is fully highlighted. A cut started elsewhere gives a
gentle wobble and “Start at the orange dot”; success advances the dot to the
next line. Spreading accepts circular coverage anywhere, and each peel accepts
a downward pull anywhere on its large strip. The finger demonstration
disappears as soon as the child begins interacting.

## Spoken script

The lines below are verbatim and are also the TTS source of truth.

### Shared

- `welcome`: “Welcome to Snack Chef! Tap a yummy picture and let’s make it.”
- `start-dot`: “Start at the orange dot.”
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

Web Speech is the offline fallback for every line. Recorded teacher-voice clips
are preferred when the local voice pipeline produces transcript-approved takes.

## Art list

| Asset | Runtime size / format | Production |
| --- | --- | --- |
| Storybook kitchen backdrop | 1600×1200 WebP, ≤300 KB | GPT Image 2; full-bleed, calm center and lower worktop |
| `SNACK CHEF` title lockup | alpha WebP, ≤150 KB | GPT Image 2, chroma-key removal; full-size spelling QC |
| Recipe / ingredient sheet | 3×4 fixed grid source; sliced alpha WebP sprites | GPT Image 2 storybook contact sheet, deterministic crop and chroma-key removal |
| Maya portrait | shared transparent PNG | `shared/characters/maya/portrait.png` |
| Hub tile | 640×533 JPEG | Studio `menu-game-tile`, Krea 2 seed 42; hand-curated |
| HUD icons | shared PNG | `shared/assets/ui/btn-*.png` |
| Voice | AAC/M4A + manifest | Qwen voice clone → Whisper transcript QA; Web Speech fallback |
| SFX | live WebAudio | shared `sfx.js` plus small game-local gesture tones |

The runtime never calls a model or network service.

## Visual system

- Warm cream paper, raspberry, kiwi green, blueberry indigo, honey yellow.
- Hand-painted gouache and colored-pencil texture with chunky charcoal edges.
- White enamel plates, honey-colored wood, stitched recipe cards.
- Functional labels use Fredoka HTML; child-facing instruction is audio and
  pictures first.
- The concept mockup's hierarchy is retained: title/recipe choice, centered
  work board, left progress rail, large ingredients along the bottom.

## Departures from the brief, mockups, and beta

- The beta's real-world adult-coaching checklist is replaced by safe pretend
  preparation. The visual concept promises direct manipulation, and unsupervised
  knife coaching is not an appropriate core screen loop.
- The mockup's persistent written instructions are replaced by spoken prompts,
  picture steps, and modeled hand paths for pre-readers.
- Stars and unlocks are removed. The reward is the finished snack and immediate
  replay, avoiding tokenized progression.
- Three compact recipes replace long kitchen-tool inventories. Fewer objects
  make the active gesture obvious within five seconds and keep production art
  coherent.
- Maya replaces the one-off generated chef so the QLOBE cast remains familiar.

## Shared modules and robustness

- `shared/js/tap.js`: one press path.
- `shared/js/sfx.js`, `shared/js/speech.js`, `shared/js/voice-clips.js`: audio.
- `shared/assets/ui/`: navigation and replay controls.
- `shared/characters/maya/portrait.png`: guide.
- Game-local `gesture-surface.js`: reusable continuous coverage, directional
  swipe, and safe pointer lifecycle. It is kept local until a second game proves
  the API.

## Privacy, persistence, and fallback

No accounts, microphone, camera, analytics, upload, or remote runtime calls.
No child data is stored. If recorded voice is unavailable, Web Speech carries
every line. If canvas or pointer capture is limited, tap targets advance the
same handlers. A round can always be left with Back.

## `QLOBE_DEBUG` v1

Provides `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`,
`gesture`, `winRound`, `mute`, `seed`, `fastTimers`, and `home`. Targets expose
truthful current roles, and debug input calls the exact handlers used by pointer
input.

## Release gate

- Every mode and wrong-target branch passes in real Chrome.
- Splash → play → back → splash and reveal → back → splash pass.
- No console errors, failed requests, or case-sensitive path failures.
- Landscape, portrait, reduced-motion, and peak-gesture screenshots are reviewed.
- Title is spelled exactly `SNACK CHEF`.
- Opaque art meets budgets; cutout corners are transparent and fringe-free.
- Production-mode direct and hub routes pass.
