# Story Repair Shop — Production Game Design

## Product promise

Story Repair Shop is a picture-first listening game for ages 5–6. A child opens a broken watercolor story, listens for the clue, opens a tray of painted paper repairs, and physically fits the missing ending into the book. The reward is not a score: the torn paper peels away and the whole story illustration becomes complete.

The game has two deliberately distinct skills:

- **Mend the Story:** predict the result that logically follows from cause and effect.
- **Wild Endings:** identify the intentionally impossible result and enjoy breaking reality on purpose.

Each mode contains three authored stories. One mode is a complete session of about four minutes. Wrong choices never remove a life, show a red X, or shame an imaginative answer.

## Source concept and production departures

The source brief and three reference screens live in `01-game-concepts/story-repair-shop/`. They establish the non-negotiable open book, torn scene, three-card repair view, resolved illustration, warm desk, and watercolor/storybook world.

The old route was only a text/placeholder interaction. This production replaces it in place with a custom DOM game, six paired scene resolutions, eighteen authored repair cards, recorded narration, drag-and-snap placement, tap parity, a page-turn transition, deterministic QA controls, and an authored title/end experience.

The reference showed one fox story. Production expands that grammar to six stories and adds a mode chooser. The book never becomes a generic quiz panel: every choice still returns to the central repair ritual.

## Core loop

1. **Hear the broken story (0–7 s).** The finished illustration is present beneath an irregular painted paper patch. Narration states the setup and question.
2. **Open the shop.** The missing patch breathes with a soft gold edge. Tap it to unfold the three painted repair cards.
3. **Choose and place.** Drag one large card to the torn spot, or tap the card and then tap the spot. Both paths call the same placement logic.
4. **Try safely.** A non-fitting choice wobbles, returns to its tray, and prompts a replay. The scene remains safe and intact.
5. **Reveal (about 3 s).** The fitting card settles, the paper patch peels away, the full authored scene appears, connected gold sparkles bloom, and the ending is narrated.
6. **Turn the page.** The child can use the large green Next Page control; an eight-second safety advance prevents a stalled session. After three stories, the finished book opens to an end spread.

The repair tray is gated behind the torn patch so the first interaction is noticing the narrative problem, not guessing from three visible answers before listening.

## Screen map and navigation

```text
Catalog ──> Splash / choose book
              ├── Mend the Story ──> broken page ──> repair tray ──> reveal ──┐
              └── Wild Endings  ──> broken page ──> repair tray ──> reveal ──┤
                                                                                ├── next story ×3 ──> End spread
Play/End Back ───────────────────────────────> Splash                         ┘                    ├── replay mode
Splash Home ─────────────────────────────────> Catalog                                             └── other book
```

Platform navigation rules are explicit: Home appears only on the splash and leaves for the catalog. Deeper screens use Back and return to the in-game splash. Hear It replays the current instruction or story without changing state.

## Authored stories

| Mode | Story | Spoken setup | Fitting repair | Other repairs | Revealed ending |
|---|---|---|---|---|---|
| Mend | Fia Fox | “Fia Fox wants to visit her friend across the stream. The path stops at the water. What could help Fia cross?” | stone bridge | striped kite; yellow rain boot | “A bridge joins the path. Now Fia can visit her friend!” |
| Mend | Nia’s seed | “Nia planted a tiny seed. She gave it water and sunshine every day. What grew next?” | sunflower | blue teapot; red toy train | “A bright sunflower grew from Nia’s tiny seed!” |
| Mend | Leo’s rain | “Leo was walking home when raindrops began to fall. What could help Leo stay dry?” | umbrella | birthday cake; paper crown | “Leo opened the umbrella and stayed cozy and dry!” |
| Wild | Finn Fish | “Finn Fish swam around his bowl. Which wild ending makes this story giggle?” | fish on a bicycle | bubbles; water plant | “Finn zoomed away on a tiny bicycle. What a wonderfully wild story!” |
| Wild | Dara Dragon | “Dara Dragon put on pajamas and yawned. Which wild ending makes this story giggle?” | trumpet on roller skates | pillow; cocoa | “Dara played a trumpet while roller-skating to bed. So silly!” |
| Wild | Milo Bear | “Milo Bear set the table for supper. Which wild ending makes this story giggle?” | moon sharing soup | family dinner; soup bowl | “The moon came down for soup with Milo. A deliciously wild ending!” |

Choice order is shuffled with the platform RNG. Story order stays authored so visual and verbal difficulty rise gently. `QLOBE_DEBUG.seed(n)` makes choice order deterministic.

## Visual and material design

Canonical art direction is **Watercolor / Storybook**. The world is a small bookbinder’s repair atelier: honey-walnut table, cream cotton paper, deckled edges, linen ribbon, painted paper medallions, a dark indigo book cover, olive stitching, pencil texture, and warm lamplight. Scenes use loose watercolor washes plus gentle dark-brown pencil definition. No visible object is represented by emoji, CSS geometry, SVG, or a stock icon.

The central background uses two authored raster plates: a 4:3 atelier for landscape and a full-height 2:3 atelier for portrait. The six story scenes share their near-top-down camera and multiply into the cream page field. Repair cards are authored paper objects with their own painted frames and alpha-cut outer edges. Live HTML text is kept over raster parchment/button plates for readability, accessibility, and localization.

| Visible object | Visible renderer | Interaction substrate |
|---|---|---|
| Atelier, book and desk | GPT Image 2 opaque WebP plate | non-interactive image |
| Story illustration | GPT Image 2 opaque WebP scene | non-interactive image |
| Torn repair | GPT Image 2 sheet → semantic asset cutter/matte → alpha WebP | transparent HTML button, ≥96 px |
| Repair cards | GPT Image 2 sheets → semantic asset cutter/matte → alpha WebP | semantic buttons + shared DOM drag controller |
| Prompt banner | GPT Image 2 sheet → semantic asset cutter/matte → alpha WebP | live HTML prompt text |
| Mode books | GPT Image 2 sheet → semantic asset cutter/matte → alpha WebP medallions | semantic buttons + live labels |
| Next Page | GPT Image 2 sheet → semantic asset cutter/matte → alpha WebP plate | semantic button + live label |
| Reward sparkle | GPT Image 2 sheet → semantic asset cutter/matte → alpha WebP | non-interactive image |
| Home / Back / Hear It | shared raster HUD buttons | links/buttons with accessible names |

CSS is limited to layout, transitions, focus rings, drop shadows, and state feedback. It must not synthesize primary artwork.

## Layout and responsive behavior

The authored composition has dedicated landscape and portrait plates rather than stretching one image between shapes. Landscape scales as a contained 4:3 `stage`, with a dark walnut ambient crop behind it. Portrait fills the viewport with the authored 2:3 atelier and uses its open book, prompt paper, progress label, and corner medallions as layout anchors. The principal scene lives inside the open pages; HUD controls occupy safe corners outside the reading focus.

- **1180×820:** full 4:3 stage, three cards in a horizontal repair tray across the lower book.
- **820×1180 portrait:** the dedicated full-height atelier plate fills the viewport; the open book carries the problem and repair tray, while a selected-card shelf drops below the book to reveal the torn spot. All visible controls preserve at least 96 px targets.
- **1180×520 short landscape:** HUD art steps down while press regions remain 96 px; prompt and tray contract vertically without covering the torn spot.
- **Small phone:** mode books stack; card labels remain accessibility-only; artwork stays readable without text.
- Safe-area insets protect all navigation controls. No required control sits under a crop-only decorative margin.

## Interaction states

### Broken page

The patch uses a low-amplitude breathing transform and connected sparkle glint. Its accessible label is “Open the Repair Shop.” After nine seconds, narration repeats the story. On the next idle beat, a gold focus treatment models the torn location.

### Tray open

Cards fan into place with a short stagger. Pressing a card raises it. Passing the drag slop creates a faithful raster ghost in the top drag layer. The receiving patch glows when the pointer enters its padded hit area. Releasing elsewhere returns the card. For tap input, the first tap selects and the second tap on the patch attempts placement; tapping a different card changes selection.

### Retry

The chosen card makes one paper wobble and returns. The narrator says the mode-specific retry and then replays the setup. There is no score change. Input unlocks after the short motion.

### Success

Input locks. The chosen repair snaps to the page, patch and tray peel/fade, the finished scene is revealed, authored sparkles appear, and a subtle shared celebration burst sits behind the book. Narration is timed with background-music ducking. The Next Page control enters only after the reveal is legible.

### Reduced motion

All breathing, fanning, wobble, peel, sparkle travel, confetti, and page-turn transforms become immediate crossfades. State order, audio, and controls remain identical.

## Spoken line inventory

Every line is keyed in `data/lines.json`; the same file is the fallback script and the source for local Qwen voice cloning.

| Key | Purpose |
|---|---|
| `welcome` | invite the child to choose a storybook |
| `mode-repair`, `mode-silly` | explain the one skill for each mode |
| `open-repair` | prompt the torn-paper action |
| `drag-piece`, `tap-piece` | explain drag and tap parity |
| `retry-repair`, `retry-silly` | warm, mode-specific retry |
| `idle-repeat`, `idle-model` | idle ladder |
| `success-generic`, `next-page` | shared repair payoff and page advance |
| `mode-complete`, `all-complete` | end-spread outcomes |
| `<case>-setup`, `<case>-success` | six setup/result pairs listed above |

The teacher-style voice is cloned only from the project’s approved local reference. Clips are verified by local Whisper transcription before inclusion. Browser Web Speech remains a non-blocking fallback. The first genuine gesture unlocks the reusable audio channel. Background music uses `quirky-forest-adventure.mp3` at 0.13 volume and ducks to 25% under narration.

## Runtime architecture

- `config.js` fetches the declarative `config.json`; no generated endpoint or secret exists at runtime.
- `js/main.js` owns the story state machine and DOM composition.
- Shared modules own audio unlock, BGM, recorded clips, narration cancellation, screens, timers, idle nudges, seeded shuffle, tap semantics, drag lifecycle, SFX, celebration, preload, and the debug contract.
- All gameplay media is local and preloaded. There are no runtime model calls, remote requests, cookies, accounts, ads, or child data collection.
- The full scene is rendered beneath the torn patch. This is an intentional performance and continuity choice: removing the patch reveals an exact authored resolution rather than assembling visibly mismatched fragments.

MiniMax video is not used in the core loop. A passive clip would interrupt the direct paper-repair gesture; the authored page-turn/reveal supplies the needed motion while preserving instant replay and offline performance.

## Debug and QA contract

`window.QLOBE_DEBUG` implements v1 and exposes:

- `ready`, `listModes()`, `startMode(id)`, `getState()`, `getTargets()`, `tap(id)`, `winRound()`, `home()`, `mute(on)`, `seed(n)`, and `fastTimers(scale)`;
- `getAudioLog()` / `clearAudioLog()` to prove recorded clips are used;
- `getLayout()` for viewport/target inspection;
- `chooseCase(id)`, `openRepair()`, and `setReducedMotion(on)` for visual scenario capture.

Release checks cover both modes and all six authored cases, one wrong answer per mode, real drag and tap parity, back/home/replay navigation, first-gesture audio, recorded clip evidence, offline loading, zero runtime network errors, deterministic ordering, reduced motion, and 1180×820 / 820×1180 / 1180×520 screenshots. Final screenshots must be reviewed full-size against the source mockups by a separate adversarial art director.

## Release risks and gates

- **Watercolor contrast:** ink edges and the dark book cover must keep cream cards legible without whitening the entire composition.
- **Alpha fringes:** every accepted alpha master is checked full-size on magenta before runtime conversion; failed Qwen Layered trials remain recorded but are excluded from delivery.
- **Drag discoverability:** the torn-patch gate, spoken direction, hover glow, tap parity, and idle model work together.
- **Narration timing:** all flows use cancellation tokens and BGM ducking; page advance never depends on audio resolving.
- **Crop safety:** the contained 4:3 landscape stage, full-bleed portrait plate, and explicit short-landscape rules are production screenshot gates.
- **Semantic ambiguity:** logical distractors are chosen to be clearly non-causal; wild-mode alternatives are deliberately plausible so the impossible answer is unique.

The game is releasable only after validation, local system-Chrome smoke tests, full-size visual review, adversarial art-direction review, production deployment, and the same smoke suite against `https://qlo.be`.
