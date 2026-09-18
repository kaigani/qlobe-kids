# Family Timeline — production game design

## Product promise

Family Timeline turns one handmade album into a short, repeatable story about
growth and belonging. A child first restores three mixed-up memories — Baby,
Toddler, Now — then follows glowing family-story stars around a tactile paper
globe. Every completed action becomes a page or stamp in a private storybook.

The experience is complete with the included illustrations. A grown-up may add
one local photo to the finished book, but personal media is never required,
uploaded, logged, placed in a URL, or exposed through `QLOBE_DEBUG`.

**Audience:** ages 4–7

**Canonical art direction:** **Papercraft** (`paper-garden` runtime treatment)

**Primary skills:** temporal sequencing; connecting family stories to places
**Session:** 3–6 minutes; each chapter loop is 45–90 seconds

## Modes and learning focus

### 1. My Story Path (`growing`)

**One skill:** order three stages from earlier to later.

Three illustrated memories of the same child are shuffled on a torn-paper
tray. The child drags a card to a large Baby, Toddler, or Now pocket, or taps a
card and then a pocket. Correct cards tuck into the pocket and speak the time
relationship. A mismatch gently rocks and returns; nothing is lost. Completing
all three transforms the work page into the finished rainbow story spread.

### 2. Family Map (`family-map`)

**One skill:** connect a family story prompt with a place on a world map.

A real spherical globe uses an authored papercraft world texture. The current
target is one oversized glowing paper star. The child can swipe the sphere or
tap a large assisted-spin control. When the target faces the child, it opens a
three-card prompt tray: food we share, a place we remember, or how we celebrate.
The chosen prompt becomes a stamp. Three found stars complete the map page.

The shipped pins are intentionally generic story stars rather than claims about
the player's ancestry. This avoids inventing family identity or reducing a
culture to a token fact. A future grown-up setup may assign a meaningful place,
but the launch game needs no personal location.

### Reward: My Family Book

The reward is not a separate quiz mode. It is the persistent album spread that
shows the ordered memories and earned story stamps. It can narrate the child’s
progress and offers replay buttons for both modes. A grown-up-facing camera
badge can replace the Now illustration with one locally stored photo. The
default illustration remains available at all times. A visible remove control
opens a two-choice confirmation before deleting the Blob from IndexedDB.

## Screen map

```text
catalog
  → splash / album cover
      → My Story Path → timeline play → timeline celebration → Family Map
      → Family Map → globe → prompt tray ×3 → book celebration
      → My Family Book → replay either chapter / add or remove local photo
  play/book Back → splash
  splash Home → catalog
```

### Splash / album cover

- Generated `Family Timeline` paper-letter lockup.
- Stitched rainbow road with Baby, Toddler, and Now medallions.
- One dominant blue paper-envelope start control for My Story Path.
- Secondary round globe control and a small closed-book progress control.
- Home is the only catalog navigation control.
- First real gesture unlocks voice, SFX, and recorded BGM.

### Timeline play

- Sky-blue construction-paper page and green layered-paper hills.
- Three authored stitched pocket sprites across the work area.
- Three authored memory-card sprites in a deckled paper tray.
- Drag uses pointer capture, preserves pointer-to-card offset, has one active
  drag, cancels safely, and drops by generous pocket overlap.
- Tap-tap is an equal first-class path. Selection is shown by a paper lift and
  pulsing stitched edge, not color alone.
- Functional labels and progress are HTML; all physical objects are raster.

### Timeline celebration

- The same three cards settle over the stitched rainbow.
- Paper stars/hearts/leaves burst from the actual raster sticker family.
- Narration reinforces `first → next → now`.
- A large globe badge continues directly to Family Map; replay/back remain
  available after the short celebration.

### Family Map

- Open album spread with paper clouds and a large spherical globe.
- The sphere uses an accurate equirectangular raster map authored from Natural
  Earth geography and restyled in this game’s paper palette.
- One active pin at a time. Pins are DOM buttons with raster paper-star art,
  at least 96 px even when the sphere is small.
- Assisted spin is always present so dexterity never blocks completion.
- Reduced motion removes inertia and extra turns while preserving alignment.

### Story prompt tray

- Three large authored raster cards: shared food, remembered place, family
  celebration. The child chooses one; reading is not required.
- The corresponding warm open question is spoken, then a matching paper stamp
  flies into the progress book.
- No recording, typing, location entry, or disclosure is requested.

### Family Book

- Completed memory strip, three earned stamps, globe trail, replay controls.
- Empty states remain beautiful and playable.
- Photo insertion is optional, local-only, JPEG-downscaled to a 1280 px edge,
  capped to 15 MB input, and stored as a Blob in IndexedDB with session-memory
  fallback. Object URLs are revoked whenever replaced or on teardown.
- Debug state reports only `hasPhoto`, never bytes, name, URL, EXIF, or content.

## Exact spoken script

| Key | Line |
|---|---|
| `welcome` | “Welcome to your family storybook. Make your growing story, then follow family stars around the world.” |
| `choose` | “Choose a story page.” |
| `timeline-intro` | “The memories got mixed up. Put baby, toddler, and now in order.” |
| `timeline-help` | “Pick up a memory, then find where it belongs.” |
| `try-again` | “That memory belongs in a different time. Try another pocket.” |
| `baby-placed` | “Baby comes first.” |
| `toddler-placed` | “Toddler comes after baby.” |
| `now-placed` | “Now comes last. Look how you’ve grown!” |
| `timeline-complete` | “You made your growing story!” |
| `map-intro` | “Spin the paper globe to the glowing family star.” |
| `spin-help` | “Swipe the globe, or tap the big spin button.” |
| `landed` | “You found a family story place!” |
| `choose-stamp` | “Choose a family story to tuck into your book.” |
| `food-prompt` | “What food does your family love to share?” |
| `place-prompt` | “What place does your family remember?” |
| `celebration-prompt` | “How does your family celebrate together?” |
| `stamp-earned` | “That story belongs in your family book.” |
| `map-complete` | “Three family stars! Your story reaches around the world.” |
| `book-intro` | “Here is your family storybook. Every family story is special.” |
| `photo-privacy` | “A grown-up can choose a photo. It stays only on this device.” |
| `photo-added` | “Your photo is tucked safely into the book.” |
| `photo-failed` | “That photo did not fit. Your illustrated memory is still here.” |
| `remove-photo` | “Remove this photo from this device?” |
| `photo-removed` | “The photo is gone from this device.” |
| `timeline-nudge` | “Try baby first, then toddler, then now.” |
| `map-nudge` | “Turn the globe toward the glowing star.” |
| `replay` | “Let’s tell your story again.” |

Recorded Qwen voice-clone MP3 files are the primary channel. Every clip is
Whisper-transcribed and compared with this normalized script; Web Speech is the
fallback. BGM is the shared `gentle-country-morning.mp3`, quietly loop-faded
through `bgm.js` and ducked under narration.

## Art production list

All child-facing primary art is authored raster. HTML/CSS supplies responsive
layout, labels, hit areas, focus, transforms, masks, and motion only.

| Asset family | Source and visible renderer | Runtime role |
|---|---|---|
| Album environment master | GPT Image 2, 1448×1086 opaque Papercraft scene → optimized WebP | Full-bleed splash, timeline, map, and book page crops/variants |
| Title lockup | GPT Image 2 on uniform charcoal → cutter/matte → PNG | Decorative `Family Timeline` lettering |
| Timeline UI sheet | GPT Image 2 coordinated contact sheet → mandatory connected-component cutter → alpha finals | 3 stitched pockets, deckled tray, rainbow road, start/globe/book plates |
| Nia age-memory sheet | GPT Image 2 using canonical Nia portrait as identity reference → cutter → alpha finals | Same recognizable child as baby, toddler, and now in 3 memory cards |
| Family-story sheets | GPT Image 2 coordinated card sheet plus corrected control sheet → cutter → alpha finals | Food/place/celebration cards, matching stamps, star pin, spin plate, camera plate, confetti |
| Globe texture | Accurate Natural Earth-based raster from the proven paper-globe pipeline, recolored to this world | Three.js sphere material |
| Hub tile | Krea 2, seed 42 ladder, Papercraft album/globe still life, no text | 640×533 hub JPEG |
| Voice | Qwen3 voice clone, seed ladder 7/8/9, Whisper QA | 27 primary spoken clips |
| Celebration | Cut paper stickers from the Family-story sheet | Motion through transforms only |

Budget targets: background ≤300 KB when quality permits; cutouts typically
30–180 KB; globe texture ≤350 KB; total first screen under ~1.5 MB; no video
unless visual QA proves a still pose cannot communicate the intended action.

## Interaction and feedback rules

- Minimum target: 96×96 CSS px; primary cards are substantially larger.
- One press path via `onTap`; drag cards suppress the tap action after movement.
- Wrong drop: gentle 8° paper wobble, quiet `unpop`, spoken retry at most once
  per mistake cluster, and animated return. No red X or loss state.
- Correct drop: pocket glow, soft `pop`, short sticker sparkle, one relationship
  line, and no automatic movement of another card.
- Globe alignment tolerance is generous. A released near-target sphere snaps;
  assisted spin completes the same semantic action.
- Idle guidance begins after 9 seconds, repeats more quietly, and resets on any
  touch. It points or pulses but never acts for the child.
- `prefers-reduced-motion` removes inertial spin, large parallax, confetti
  travel, and card arcs while retaining immediate state changes.
- Portrait rearranges three pockets vertically/compactly and keeps the tray
  reachable without precision scrolling. Short landscape compresses headers,
  never the 96 px controls.

## State, privacy, and failure behavior

- `localStorage` holds only small progress metadata: ordered completion,
  earned prompt IDs, and last chapter. Failure leaves current-session state.
- IndexedDB holds at most one downscaled optional photo Blob. Photo import is
  never sent to generation, analytics, speech, or a network endpoint.
- If WebGL fails, Family Map renders a 2D authored globe disk with large star
  buttons and the same semantic loop.
- If recorded audio fails, `voice-clips.js` uses the exact local speech text.
- If IndexedDB fails, the optional photo survives only in session memory and
  the UI says it will disappear when the page closes.
- If an art file fails, alt text and a neutral paper placeholder preserve the
  route, but release QA treats every 404 as a blocker.

## Shared systems and local modules

Shared: `tap.js`, `audio-unlock.js`, `voice-clips.js`, `sfx.js`, `bgm.js`,
`hud.js`, `idle-nudge.js`, `timers.js`, `rng.js`, `preload.js`,
`debug-harness.js`, and vendored three.js.

Game-local: orchestration/router, pointer-safe timeline drag controller,
adapted `paper-globe.js`, and bounded `family-media.js` photo store. The latter
follows the proven `family-story-interview` privacy invariants without sharing
that game’s private database.

## `QLOBE_DEBUG` v1

The debug surface provides `ready`, `listModes`, deterministic `startMode`,
serializable `getState`, truthful `getTargets`, `tap`, direct `placeMemory`,
`alignGlobe`, `chooseStory`, `openBook`, `winRound`, `mute`, `seed`, and
`fastTimers`. State includes current screen, mode, shuffled card IDs, placements,
active/visited star IDs, chosen prompt IDs, `hasPhoto`, reduced-motion state,
audio log, and BGM status. It never returns image data or object URLs.

## Explicit departures

- **From the old stub:** animal-growth and technology-history emoji rounds are
  removed. They were serviceable sequence exercises but did not deliver the
  named personal-family fantasy or the approved concept screens.
- **From the brief:** real ancestry is not inferred and no external sharing is
  offered. Generic story stars preserve the world/heritage invitation without
  collecting location or asserting identity.
- **From the mockup:** functional instructions and age labels are HTML/audio,
  not baked generated text. The layout reflows for safe areas and portrait.
- **From the concept video:** glossy pseudo-3D dashboard visuals are discarded;
  only the interaction ideas survive inside the canonical Papercraft album.
- **Photo scope:** one optional local photo appears in the reward book rather
  than making all puzzle cards uploads. This keeps first play instant and makes
  personal media a grown-up enhancement rather than a gate.

## Release gates

1. Every raster source, prompt, crop manifest, alpha/magenta QA view, voice
   recipe, transcript, and final is recorded in `ASSETS.md`.
2. Asset cutter reports the expected connected-component count before any
   contact-sheet asset is accepted.
3. `node --check`, registry sync/check, usage index, full validator, and game QA
   add zero errors.
4. Real Chrome completes both modes through real handlers with a wrong-drop
   probe, assisted and manual globe paths, photo success/failure/delete, mute,
   persistence reload, reduced motion, and no unexpected requests or errors.
5. Full-detail screenshots are reviewed at desktop landscape, compact
   landscape, tablet portrait, timeline drag, incorrect return, timeline win,
   globe aligned, prompt tray, and completed book.
6. An adversarial ART DIRECTOR compares the production captures to all three
   mockups and rejects vector-looking foregrounds, inconsistent paper material,
   weak hierarchy, mismatched character identity, or unclear actions.
7. Keep status `beta` until the target child completes it independently on the
   real iPad. Production deployment and production smoke checks must pass.
