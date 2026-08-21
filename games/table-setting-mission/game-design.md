# Game Design Document — Little Helper: Set the Table

## Product promise

In a warm kawaii kitchen, the child helps Pip the teacup prepare four places for a shared meal. Every item has a clear home: the plate in the middle, the fork on the left, the cup above, and the spoon or knife on the right. The same practical-life routine repeats with just enough variation to become familiar rather than rote.

- **Route / retained id:** `games/table-setting-mission/`
- **Title:** Little Helper: Set the Table
- **Category:** `practical-life`
- **Age target:** 2–5
- **Canonical art direction:** **Kawaii**
- **Session shape:** one 60–90 second meal, or 3–5 minutes across all meals
- **Primary input:** direct drag with an equal tap-to-place path
- **Core promise:** a child can understand the task from the pictures, spoken cue, and first pulsing silhouette without reading.

## Learning goals

1. Learn the stable spatial relationships in a place setting: center, left, right, and above.
2. Match a familiar household object to its silhouette or picture guide.
3. Rehearse a real household responsibility with an achievable four-place routine.
4. Practice large, controlled pointer movements without precision pressure.

## Modes

All three meals end with four completed place settings. A mode changes the kind of support, not the basic rule.

### Breakfast Basics

- **Skill:** object-to-silhouette matching.
- Four required objects: plate, cup, fork, spoon.
- Every empty slot shows a strong full-color ghost and the next useful slot softly pulses.
- The tray contains the four useful items plus one friendly food distractor.

### Picnic Picture

- **Skill:** copying a pictured place-setting pattern.
- Four required objects: plate, tumbler, fork, napkin.
- A side guide card stays visible. Slot ghosts are lighter than Breakfast.
- The tray contains the useful items plus two picnic-food distractors.

### Dinner for Four

- **Skill:** left/right/center spatial recall.
- Five required objects: dinner plate, cup, fork, knife, spoon.
- The side guide remains visible, but empty-slot ghosts are faint until an item is selected.
- The tray contains the useful items plus three food distractors.

## Screen map and navigation

```text
catalog
  ↕ splash / meal chooser
      → play: place 1 → place 2 → place 3 → place 4
      → table-ready celebration
          ↺ play the same meal again
          ← choose another meal
```

### Splash / meal chooser

- Full-bleed authored kitchen art, generated title lockup, Pip mascot, and three oversized picture cards.
- Shared raster Home button at top left returns to the catalog.
- Meal cards are useful without their HTML labels: breakfast tray, picnic cloth, and dinner place setting are visually distinct.
- First genuine gesture unlocks recorded clips when available, the exact-text Web Speech fallback, SFX, and quiet background music. Pip says the welcome line once.

### Play

- Shared raster Back button at top left returns to the splash in-page.
- Shared raster Sound button at bottom left repeats the current cue.
- A calm tabletop fills the screen. One large authored placemat occupies the focus area.
- A side picture-guide card shows the finished pattern for the selected meal.
- Four small seat badges show progress. Completed badges reveal a tiny finished setting; the active one bobs gently.
- The mixed inventory is a horizontally scrollable authored tray along the bottom. Items are authored raster sprites, never emoji or CSS drawings.
- Functional instruction text is optional real HTML on an authored scalloped banner; it is never required to play.

### Table ready

- The camera reveals a complete four-place table assembled from the same runtime dish sprites.
- Maya appears in her canonical design with a thumbs-up, while Pip hops beside her.
- Confetti, fanfare, and the final narration play (a recorded clip when available, otherwise the exact-text Web Speech fallback). Reduced-motion keeps the final tableau and fanfare but omits falling confetti and large movement.
- An authored meal-card Again button repeats the same meal. A shared raster Back button returns to the meal chooser.

## The 30–90 second play loop

1. The selected meal opens with seat one active and a spoken cue: “Let’s make four places. Start with this one.”
2. The next useful slot pulses once. The child may drag any useful item to its matching silhouette, or tap it and watch it travel there.
3. A correct item arcs into place, lands with a tactile pop, emits a small sparkle, and occasionally receives short praise.
4. A drop on another slot makes the item wobble and return to its tray home. The narrator gives a spatial clue such as “The fork sits on the left of the plate.” Nothing turns red and no progress is lost.
5. A food distractor gives Pip a playful nibble reaction and stays in the tray: “Yum! That is for eating. Find a table helper.”
6. When the active placemat is complete, it shrinks into its seat badge, the next badge wakes, and the next setting begins automatically after a short beat.
7. After the fourth place, the table-ready scene arrives with Maya, Pip, confetti, and a clear Again affordance.

## Input and feedback rules

### Drag

- Use Pointer Events through `shared/js/stage/drag-to-slot-dom.js`.
- One active pointer; second fingers are ignored.
- Preserve the pointer-to-object offset within a bounded range.
- Listen at window level; cancel on `pointercancel`, page hide, or blur; a cancel is never interpreted as a drop.
- Slot forgiveness is at least 32 CSS px beyond the visible silhouette.
- A ghost follows the finger; the source remains in the tray until the drop commits.

### Tap-to-place

- Tapping a required tray item uses the same `attemptPlace(itemId, slotId)` path as drag and QA.
- If that object has one open destination on the active placemat, it flies there automatically.
- Tapping a placed object returns it to the tray before the place is complete, so the action remains reversible.

### Gentle retry and hints

- Wrong target: warm boing, small wobble, return home, one concise spatial model.
- Missed table: quiet return home without a corrective line on every miss.
- Idle at 8 seconds: Pip points/bobs toward the next useful item and the narrator models one action.
- Further idle nudges are spaced at least 12 seconds apart and reset after any interaction.
- No score, timer, streak, lives, “wrong,” or “game over.”

## Voice script (verbatim)

The keys below are the source of truth for `assets/audio/lines.json` and generated clips.

| Key | Spoken line |
|---|---|
| `welcome` | “Hi, little helper! Choose a meal, and let’s set the table.” |
| `choose` | “Breakfast, picnic, or dinner. Which one should we make?” |
| `breakfast-intro` | “Breakfast time! Match each thing to its shape.” |
| `picnic-intro` | “Picnic time! Copy the little picture.” |
| `dinner-intro` | “Dinner time! Remember: plate in the middle, fork on the left.” |
| `start-place` | “Let’s make four places. Start with this one.” |
| `next-place` | “Lovely! Now set the next place.” |
| `last-place` | “One more place for our table!” |
| `plate-clue` | “The plate goes in the middle.” |
| `cup-clue` | “The cup sits above the plate.” |
| `fork-clue` | “The fork sits on the left of the plate.” |
| `spoon-clue` | “The spoon sits on the right of the plate.” |
| `knife-clue` | “The knife sits on the right, beside the spoon.” |
| `napkin-clue` | “The napkin rests beside the fork.” |
| `tap-help` | “Tap a table helper, or drag it to the matching shape.” |
| `distractor` | “Yum! That is for eating. Find a table helper.” |
| `gentle-retry` | “Almost. Look at the shape and try another spot.” |
| `praise-perfect` | “Perfect place!” |
| `praise-helper` | “You’re doing it, little helper!” |
| `place-ready` | “This place is ready!” |
| `table-ready` | “Table ready! Four places, all set. You did it!” |
| `again` | “Let’s set another table!” |

Voice is warm, unhurried, and never talks over itself. Music ducks under speech. A missing or rejected clip falls back to Web Speech with the exact same line.

## Art direction and complete art list

The world follows the concept mockups: rounded candy forms, cocoa-and-cream outlines, scalloped fabric/cardboard panels, printed gingham, woven fibers, blueberry blue, butter yellow, tomato red, mint, and warm cream. It is non-photorealistic and original. HTML/CSS supplies layout and invisible hit areas; every primary child-facing object is authored raster art.

| Asset | Intended size | Visible renderer | Use |
|---|---:|---|---|
| `backgrounds/kitchen.webp` | 1600×1200 | opaque WebP | splash kitchen world |
| `backgrounds/tabletop.webp` | 1600×1200 | opaque WebP | play and finale tabletop |
| `ui/title.webp` | ≤1100×420 | transparent WebP | generated graphic title lockup |
| `ui/placemat.webp` | ~1000×700 | alpha WebP/PNG | central woven placemat |
| `ui/guide-card.webp` | ~420×620 | alpha WebP/PNG | side reference-card backing |
| `ui/tray.webp` | ~1400×300 | alpha WebP/PNG | scrolling inventory backing |
| `ui/banner.webp` | ~1050×220 | alpha WebP/PNG | backing for optional HTML cue |
| `modes/{breakfast,picnic,dinner}.webp` | ~560×430 each | opaque WebP | meal chooser cards |
| `characters/pip.webp` | ~420×520 | transparent WebP | guide mascot |
| `characters/maya-thumbs-up.webp` | ~650×900 | transparent WebP | canonical Maya celebration pose |
| `items/<meal>/*.webp` | 256–384 px each | alpha WebP/PNG | required dishes and food distractors |
| `assets/hub/tiles/table-setting-mission.jpg` | 640×533 | opaque JPEG | existing curated toy-table hub tile; retain unless visual QC rejects it |
| `assets/og-image.jpg` | 1200×630 | JPEG | captured from the finished splash |

Source generations live under `assets/source/gpt-image-2/`. Deterministic crops, alpha extraction, optimization steps, prompts, and local-API recipes are recorded in `ASSETS.md` and sidecars. Alpha assets are reviewed on saturated magenta before use.

## Audio and music

- Production requested teacher voice through QLOBE Studio / `qwen3-tts-voiceclone`, with seeds 7, 8, and 9 as the retry ladder. The configured LAN service returned HTTP 500 for all 22 seed-7 jobs and was subsequently unreachable, so this beta deliberately ships the exact-text Web Speech path rather than unreviewed clips. `ASSETS.md` records the attempt without exposing local configuration.
- Runtime playback uses `shared/js/voice-clips.js`; its manifest is intentionally empty until recorded clips pass transcript QA, and `data/lines.json` supplies the exact fallback copy.
- `shared/js/sfx.js` supplies pop, sparkle, whoosh, boing, tick, and tada.
- A quiet four-bar original pattern uses the shared `music.js` instrument sampler (piano, vibraphone, soft flute). It begins only after a gesture, loops softly, ducks under voice, revives after iPad interruptions, and respects mute.

## Responsive, accessibility, and safety

- Target: tablet 4:3 first; also support wide landscape and portrait without clipping.
- Every control and object interaction target is at least 96 CSS px, even when the visible art scales smaller.
- Safe-area variables protect HUD and tray. The tray remains scrollable without a drag stealing the scroll until after the platform drag slop.
- Real HTML carries accessible names and optional functional text. Images have useful alt text or are explicitly decorative.
- Color never carries correctness alone; silhouette, position, motion, and speech agree.
- `prefers-reduced-motion` disables confetti, bobbing, and travel arcs while preserving immediate state changes and audio feedback.
- No network, model call, account, microphone, analytics beyond the shared pageview tag, or persistence is required at runtime.

## Shared modules and architecture

- `shared/css/base.css`, `hud.css`, and `screens.css`
- `shared/js/screens.js` for splash/play/end lifecycle
- `shared/js/hud.js` and `tap.js` for the standard one-press control path
- `shared/js/audio-unlock.js`, `voice-clips.js`, `sfx.js`, and `music.js`
- `shared/js/stage/drag-to-slot-dom.js` for strand-proof direct manipulation
- `shared/js/celebrate.js`, `idle-nudge.js`, `timers.js`, `rng.js`, and `preload.js`
- `shared/js/debug-harness.js` for the required `window.QLOBE_DEBUG` v1 surface

Game-specific orchestration stays in `js/main.js`; meal and asset data live in editable `config.json`, loaded through the thin `config.js` fetch shim.

## `QLOBE_DEBUG` v1 contract

Required keys: `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`, `winRound`, `mute`, `seed`, `fastTimers`, and `home`.

Game extensions:

- `place(itemId, slotId)` — uses the real placement path.
- `wrong(itemId, slotId)` — probes a mismatched drop.
- `finishPlace()` — completes only the active setting.
- `getLayout()` — returns active seat, open slots, tray order, viewport/orientation, reduced-motion state, and rendered target sizes.
- `getAudioLog()` — records whether each exact line used a clip or the Web Speech fallback.

The debug surface is semantic and serializable; it never mutates DOM behind the game’s own handlers.

## Explicit departures and reconciliations

- **Old beta:** the generic three-bin emoji sorter is replaced. It taught category sorting, not the promised left/right/center table-setting routine.
- **Brief versus mockup:** the written brief and video require four places and a mixed bottom tray; the active mockup shows one place with a left tray. Production uses one large active placemat at a time for preschool legibility, then reveals all four together. The inventory remains horizontal and mixed as specified.
- **Brief visual wording:** the brief says “vector-illustrated,” but the canonical label and final mockups clearly establish textured kawaii food-toy/cardboard art. Production follows the canonical **Kawaii** world and the explicit user direction not to use vector/CSS artwork.
- **Generated mockup text:** active play does not depend on “Put each thing in place,” “Next,” or other baked labels. Spoken instructions, pictures, and the pulsing silhouette carry the task; any exact visible copy is HTML.
- **Character:** the one-off video avatar is replaced by canonical shared-cast Maya, plus the object mascot Pip, keeping the platform cast coherent.
- **No video:** the concept video explains interaction but adds no beat that a responsive runtime pose and direct manipulation cannot communicate; shipping a passive clip would add weight without improving learning.

## Release gates

- Every required raster asset exists, is visually reviewed at full size, optimized deliberately, and provenance-logged.
- Every recorded line passes transcript QA or is deliberately omitted in favor of the correct fallback. This beta takes the documented fallback branch because the local generation service failed.
- All three modes and all four places are playable by drag and tap-to-place.
- Wrong target, distractor, pointer cancel, blur, back navigation, mute, portrait, landscape, safe areas, and reduced motion are tested.
- No emoji or CSS-drawn primary object remains; no console error, failed request, or 404 occurs.
- `QLOBE_DEBUG` drives every path, the scoped registry sync is clean, and the full validator adds zero errors.
- Real-Chrome screenshots cover splash, every meal, wrong feedback, seat transition, celebration, portrait, landscape, and reduced motion; an independent adversarial art director signs off after at least one revision pass.
- Status remains `beta` until the real target child succeeds on an iPad.
