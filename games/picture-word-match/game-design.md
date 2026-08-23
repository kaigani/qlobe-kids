# Reading Buddies — Production Game Design

**Route / id:** `games/picture-word-match/` / `picture-word-match`
**Category:** `reading-phonics`
**Ages:** 3–6
**Status through child playtest:** `beta`
**Canonical art direction:** **Watercolor / Storybook**
**Implementation:** custom DOM game using the shared QLOBE interaction kit

## Product promise

Open a painted picture book, choose a familiar little world, and help every
picture, spoken word, and printed word belong together. Reading Buddies should
feel like a tiny storybook garden—not a reskinned flash-card worksheet.

The child can participate before they can read. Pictures, recorded guidance,
large touch targets, and direct manipulation carry every required action. Print
is always present and meaningful, but never becomes an entry barrier.

## Why this replaces the existing prototype

The registered route currently mounts the generic `match-pairs` engine with
shared Toy object cards, rendered word cards, device speech, and two nearly
identical tap modes. It proves picture-to-print matching, but it does not deliver
the selected Reading Buddies brief or mockups.

This production replacement keeps the id and registry slot while superseding:

- the `match-pairs` engine with a custom three-mode storybook game;
- two tap-only matching modes with Picture Pairs, Buddy Says, and Word Garden;
- Toy art with a complete game-local Watercolor / Storybook raster system;
- Web Speech as the only coach with recorded teacher narration plus fallback;
- a generic splash with an open-book chapter and activity selection flow;
- one-step match feedback with a full picture + print + sound-out reveal beat.

The custom path is required because the shared engine has no category-book
flow, spoken-word choice board, ordered letter-building board, or authentic
drag-to-target input. No shared engine is changed by this game.

## Source material and departures

Concept authority:

- `../../01-game-concepts/picture-word-match/brief.md`
- `../../01-game-concepts/picture-word-match/output/ui-mockups/`
- the 15-second concept video in that folder, used for interaction reference
  only

Preserved from the mockups:

- the generated **Reading Buddies** title identity;
- an open picture-book chapter chooser;
- Animals, Food, and Things as the three visible content worlds;
- a calm painted-meadow play field;
- three picture cards and three large targets at a time;
- a full-page “Great match” moment with picture, word, check, progress, and
  sound-out row;
- blue, orange, leaf-green, and lavender accents on warm cotton paper.

Intentional departures:

1. The brief's older “bright 2D vector” sentence is discarded in favor of its
   explicit canonical **Watercolor / Storybook** label and the approved mockups.
2. The ambiguous category-card + separate PLAY button is replaced by direct
   chapter-card selection. One large tap has one clear result.
3. Category labels reconcile the brief and mockups as Animals, Food, and Things.
   Each contains six concrete, short words, and every launch session draws three.
4. The concept's promised Sound First and Word Builder are implemented as real,
   complementary modes rather than postponing them behind a “coming soon” card.
5. Letter names and phonemes are not treated as interchangeable. Word Garden
   uses the platform's recorded letter-sound fragments; functional letters stay
   live HTML over painted raster tiles.
6. There is no passive intro video. A responsive painted page reaches play more
   quickly and keeps the child in control.
7. No profile/lock control is reproduced from the mockup. The game has no
   accounts, parental gate, or persistent progress.

## Learning model

One skill per mode:

| Mode | Skill | Hear / see / do loop |
|---|---|---|
| **Picture Pairs** | connect a familiar picture with its printed CVC word | hear a picture or word, see both forms, drag or tap them together |
| **Buddy Says** | map a spoken word to its pictured meaning | hear one word, inspect three pictures, choose or drag the matching picture into the listening book |
| **Word Garden** | sequence three letter sounds into a short printed word | hear the picture word and sounds, place three letter tiles from left to right, hear the blended word |

Each session contains exactly three target words and should take 30–90 seconds.
A full visit through several activities feels complete in 3–7 minutes.

## Content

Every word is concrete, pictured, three letters long, and present in the shared
phonics data so its letter sounds and whole-word recording remain available.
Game-local generated art restyles the subject without copying Toy art into the
storybook world.

| Chapter | Words | Visual promise |
|---|---|---|
| **Animals** | cat, dog, pig, hen, fox, bug | friendly meadow and farm companions |
| **Food** | bun, jam, ham, fig, yam, nut | a cheerful storybook picnic |
| **Things** | bus, hat, box, cup, jet, van | useful things and little journeys |

The session bag is seeded and shuffled. It draws three of six words without
replacement. Replay reshuffles both the draw and board positions.

## Screen and navigation map

```text
BOOT
  └─ CHAPTER BOOK (splash; Home → catalog)
       └─ ACTIVITY PAGE (Back → chapter book)
            └─ PLAY BOARD (Back → chapter book)
                 ├─ correct word → GREAT MATCH → next / auto-return
                 ├─ final word → GREAT MATCH → BOOK COMPLETE
                 └─ Back → chapter book
BOOK COMPLETE
  ├─ Again → same chapter + activity with a new seeded draw
  └─ Choose → chapter book
```

The splash is the only screen with Home. Every deeper screen uses Back and
returns in-page to the chapter book. Leaving a screen stops narration, music
ducks/fades correctly, drag state cancels, timers clear, and no ghost can remain.

### 1. Chapter Book

- Full-bleed painted reading-garden background with a large blank open-book
  plate and a spell-checked generated title lockup.
- Three raster chapter cards: Animals, Food, Things. The picture emblem carries
  the choice; an HTML label supports print and accessibility.
- First real gesture unlocks all audio and starts quiet recorded background
  music. The selected chapter name is spoken immediately.
- Home sits top-left. Sound sits top-right and repeats the welcome prompt.

### 2. Activity Page

- The book turns to three large painted activity cards.
- Icon-only visual cues: picture + word ribbon, ear + picture pocket, and three
  letter seeds in slots. HTML titles are secondary.
- Selecting a card starts play immediately and speaks that mode's model line.
- Back returns to Chapter Book; Sound replays the selected chapter prompt.

### 3. Picture Pairs board

- Three painted picture cards in the upper/primary band.
- Three shuffled painted word ribbons in the lower/target band.
- Prompt: “Match each picture to its word.”
- Drag picture → word or word → picture. Tap-tap works in either order.
- Tapping any card selects/lifts it and speaks its word. Tapping a second source
  simply changes selection; tapping open space cancels harmlessly.
- A correct pair locks into a painted ribbon, triggers a short tactile beat, and
  moves to Great Match. Returning removes that pair while preserving the other
  two. After three reveals the session completes.

### 4. Buddy Says board

- The coach asks for one target word; its printed form is not required to act.
- Three picture cards remain visible and equally salient.
- Tap the correct picture or drag it into the large listening-book pocket.
- A correct picture reveals its printed word and goes to Great Match.
- The next prompt uses one of the two remaining pictures. After three, complete.

### 5. Word Garden board

- One large target picture stays in a painted “read with me” frame.
- Three left-to-right empty letter spots sit below it.
- Five painted letter tiles appear in a bank: the three target letters plus two
  non-duplicating distractors chosen from the current chapter.
- Tap a letter to place it in the next correct spot, or drag it to a specific
  spot. Each correct tile speaks the platform's recorded letter sound.
- A mismatched tile returns gently. When all three are placed, the game plays
  the three letter sounds followed by the whole word and opens Great Match.
- The next word receives a fresh bank. Three completed words finish the session.

### 6. Great Match

- Full-page warm-paper reveal based on the supplied `03-great-match.png`.
- Large object card, painted check stamp, printed word ribbon, three live HTML
  letter/sound tokens, and session progress (1/3, 2/3, 3/3).
- Audio order: whole word → three short recorded letter sounds → whole word →
  one brief teacher cheer.
- A large raster-backed Next button is always available. If untouched, the beat
  auto-continues after about 3 seconds so the child is never stranded.
- Under reduced motion, elements appear in place and the static page supplies
  the reward; there is no confetti motion.

### 7. Book Complete

- A painted closed-book reward displays the three collected word pictures and
  three watercolor stamps.
- The teacher says, “Your picture book is full of words!”
- Again replays the same chapter/activity with a new shuffle. Choose returns to
  Chapter Book. Back also returns to Chapter Book.

## Interaction and feedback rules

### One attempt path

Real drag release, tap-tap, keyboard activation, debug driving, and automated
completion all call the same semantic `attempt(sourceId, destinationId)` path.
No test-only success shortcut mutates state behind the gameplay handler.

Use `shared/js/stage/drag-to-slot-dom.js` with:

- one controller for the live board;
- window-level pointer lifecycle and a single active drag;
- a fixed, pointer-transparent ghost host;
- generous padded slot hit testing;
- `pointercancel`, blur, resize, screen exit, and destroy treated as cancel;
- `touch-action: none` only on draggable sources;
- tap as an equal path, never a degraded fallback.

### Correct

- Immediate paper lift + soft `pop`.
- Target glows through a raster highlight state; source settles into place.
- `sparkle`, painted star/leaves, then Great Match.
- Voice models picture, sounds, and print. Praise describes the action, not the
  child's fixed ability.

### Incorrect

- Source and attempted target perform one small paper wiggle and return.
- Soft `boing`; no red X, buzzer, score loss, timer loss, or “wrong.”
- First miss is mostly non-verbal. A second miss says, “Let's listen once more.”
- Buddy Says may name the chosen picture before repeating the target.
- Word Garden speaks the chosen letter sound before modeling the next needed
  sound. Nothing is removed and progress never rolls back.

### Idle support

- Any pointer action resets the idle ladder.
- Around 10 seconds: replay the current prompt.
- Around 20 seconds: softly bob the relevant picture or next letter.
- Around 30 seconds: show the authored dotted watercolor trail or next-slot
  highlight. Never auto-solve and never count down.

### Touch and accessibility

- Every interactive target has at least a 96×96 CSS-pixel hit area.
- Visible source artwork may be smaller, but the button/hit substrate is not.
- All buttons have accessible names; object images have concise alt text.
- The narrator keeps an `aria-live` mirror even when game audio is muted.
- Keyboard activation follows the same tap path.
- Focus rings are thick, high contrast, and outside the watercolor silhouette.
- Color never carries identity alone. Pictures, labels, position, and speech
  provide redundant meaning.

## Responsive design

The authored art coordinate space is 1600×1200 (4:3), matching the mockups.
The live DOM adapts without baking controls into the background.

Landscape/tablet:

- title/chapter/activity area uses the open-book center;
- play cards form a three-column upper band and targets a three-column lower
  band;
- prompt stays centered between safe-area HUD controls.

Portrait/tablet:

- prompt occupies a compact top band;
- cards become a 2+1 grid or three-row bank depending on mode;
- target ribbons/letter slots remain in the bottom interaction band above the
  home indicator;
- Great Match stacks picture, word, and sound tokens vertically.

Wide-short diagnostic (1180×520):

- background may crop with `cover`, but all painted carriers and functional
  objects remain inside a clamped safe band;
- no target intersects the HUD reserves or overflows the viewport.

Reduced motion:

- no flying cards, trail animation, bobbing, or confetti;
- state changes use instant replacement plus a subtle opacity settle;
- success remains fully legible through the static artwork, voice, and SFX.

## Audio design and verbatim script

Primary narrator: approved platform teacher voice cloned through
`qwen3-tts-voiceclone`, AAC/M4A packaged with `+faststart`, then checked by
Whisper. `assets/audio/lines.json` is the verbatim source of truth.

Whole words and A–Z sounds use the existing rights-cleared recordings exposed
by `shared/js/content.js`. Game-local clips cover the unique Reading Buddies
guidance, category/mode prompts, listening questions, nudges, and rewards.
Every `voice.say()` call includes the exact fallback text.

Background music: `shared/assets/music/gentle-country-morning.mp3` through
`shared/js/bgm.js`, preloaded before the first gesture, started only by a real
gesture, held deliberately quiet, ducked under every spoken line, muted with the
game, and stopped on teardown.

Sound effects: shared synthesized `tick`, `pop`, `boing`, `sparkle`, and `tada`.

## Raster art inventory

No child-facing illustration is an SVG, emoji, CSS drawing, canvas drawing, or
generic rounded rectangle. CSS provides layout, hit areas, masks, focus, state,
and responsive transforms; authored raster assets provide the visible world.
Functional word and letter glyphs remain live HTML over painted carriers.

| Runtime asset | Final target | Visible purpose |
|---|---:|---|
| `assets/art/reading-garden.webp` | 1600×1200, ≤300 KB | full-bleed calm watercolor meadow/reading nook, no baked UI/text/targets |
| `assets/art/title.webp` | ~1400×420 alpha, ≤150 KB | exact painted “Reading Buddies” lockup, full-size spelling QC |
| `assets/art/open-book.webp` | ~1400×900 alpha, ≤100 KB | blank warm-paper chapter/activity carrier |
| `assets/categories/{animals,food,things}.webp` | 3 × 640 square alpha | category emblems/book-cover subjects, no text |
| `assets/modes/{picture,listen,build}.webp` | 3 × 640 square alpha | wordless mode explanations |
| `assets/words/<word>.webp` | 18 × 640 square alpha, ~30–60 KB | coordinated watercolor cutouts, consistent scale/light/paper edge |
| `assets/ui/picture-card-{blue,orange,green,purple}.webp` | 4 painted blank frames | primary object carriers |
| `assets/ui/word-ribbon-{blue,orange,green,purple}.webp` | 4 painted blank frames | live HTML word carriers |
| `assets/ui/letter-seed-{blue,orange,green,purple,yellow}.webp` | 5 painted blank tiles | live HTML letter carriers |
| `assets/ui/listening-book.webp` | 1 alpha | Buddy Says destination pocket |
| `assets/ui/letter-slot.webp` | 1 alpha | empty Word Garden destination |
| `assets/ui/success-ribbon.webp` | 1 alpha | Great Match heading carrier |
| `assets/ui/check.webp` | 1 alpha | correct stamp |
| `assets/ui/stamp-{star,leaf,acorn}.webp` | 3 alpha | session progress/reward stamps |
| `assets/ui/hint-trail.webp` | 1 alpha | third-step idle modeling path |
| `assets/ui/book-complete.webp` | 1 alpha | completed-session reward carrier |
| `assets/ui/button-{teal,blue}.webp` | 2 alpha | live HTML action carriers |
| `assets/ui/hud-{home,back,sound}.webp` | 3 × 192 square alpha | watercolor skins for standard HUD semantics |
| `assets/og-image.jpg` | 1200×630 | captured from the finished splash |
| `assets/hub/tiles/picture-word-match.jpg` | 640×533 | separate Toy-grammar hub tile, generated/reviewed through Studio/Krea |

Source masters and recipes stay under `assets/source/`. GPT Image 2 establishes
the cohesive visual family; Qwen Image Edit carries the accepted style into
additional sheets or repairs; Qwen Image Layered supplies `layer_2` cutouts;
deterministic scripts split, alpha-trim, pad, resize, encode, and generate
saturated-magenta QC composites. Malformed anatomy, text, grids, or subjects are
rerolled rather than cleaned into acceptance.

## Runtime module contract

Game-local code imports, rather than copies:

- `audio-unlock.js`, `bgm.js`, `voice-clips.js`, `content.js`, `sfx.js`;
- `screens.js`, `hud.js`, `tap.js`, `idle-nudge.js`, `celebrate.js`;
- `stage/drag-to-slot-dom.js`;
- `timers.js`, `rng.js`, `preload.js`, `debug-harness.js`.

`config.json` is canonical editable content. `config.js` is the standard fetch +
top-level-await shim so QLOBE Studio can inspect and edit content.

## `QLOBE_DEBUG` v1

Required methods:

- `ready`
- `listModes()`
- `startMode(id)`
- `getState()`
- `getTargets()`
- `tap(targetId)`
- `winRound()`
- `mute(on)`
- `seed(n)`
- `fastTimers(scale)`
- `home()`

State floor plus game data:

```js
{
  screen: 'chapters' | 'activities' | 'play' | 'reveal' | 'end',
  chapterId,
  modeId,
  phase,
  round,
  roundsTotal: 3,
  targetWord,
  selectedId,
  completedWords,
  attempts,
  dragging,
  muted,
  reducedMotion
}
```

Extensions for QA and Studio review:

- `selectChapter(id)`
- `getBoard()`
- `attempt(sourceId, destinationId)`
- `getAudioLog()` / `clearAudioLog()`
- `getMusicStats()`
- `triggerNudge(index)`

Seed controls the word draw, position shuffle, builder distractors, and cheer
rotation. Timers include reveal, idle, wiggle, and celebration delays.

## Privacy and persistence

- No account, child name, microphone, camera, upload, analytics event, or model
  call is introduced.
- No child content is stored. Session progress lives in memory and clears on
  reload.
- All model calls happen only during authoring. The shipped route runs from
  committed static files and shared local assets.

## Production acceptance gates

1. A child can complete all three modes with pictures, audio, and touch alone.
2. Every source/target interaction has a real drag path and an equal tap path.
3. Wrong input is gentle, reversible, and never removes progress.
4. Chapter, activity, play, reveal, end, and navigation loops are complete.
5. Every final play-field object visibly belongs to Watercolor / Storybook; no
   placeholder emoji/vector/CSS art remains.
6. Recorded game-local narration plays after a real gesture and falls back
   correctly; every generated clip has transcript and media QA.
7. All raster assets decode, meet alpha/budget checks, and have provenance.
8. `QLOBE_DEBUG` drives real handlers through correct and wrong paths.
9. Local Chrome QA covers landscape, portrait, wide-short, reduced motion,
   active-drag cancellation, audio, target size, overflow, and navigation.
10. Full-size screenshots of every meaningful state pass visual review and an
    independent adversarial ART DIRECTOR pass.
11. Registry/manifests validate with no new errors and production serves zero
    game errors or 404s.
12. The game remains `beta` until the target child succeeds on the real iPad.
