# Puzzle Explorer — production game design

**Category:** culture-geography · **Ages:** 3–6 · **Status:** beta until a child playtest

**Art direction:** Papercraft — layered construction paper and felt, deckled edges, visible fibres, cream stitching, and soft tabletop shadows

**Concept:** `../01-game-concepts/puzzle-explorer/brief.md`, video, and papercraft mockups

**Replaces:** the emoji `sort-into-bins` prototype at the existing `puzzle-map-match` id and route

## Product promise

> A handmade world map is waiting under your finger. Pick up a beautiful discovery card, carry it to its continent, and watch the map turn that match into a tiny travel story.

The production build must make four promises true:

1. Geography is the play surface, not decoration. Six recognizable continent shapes are rendered from public-domain Natural Earth data and the same raster mask resolves every real drop.
2. Every child-facing object is authored papercraft art. CSS owns layout, state, accessibility, and motion only; it does not draw the map, cards, tray, ribbon, title, or celebration art.
3. Dragging and tap-to-place are equal paths. Broad targets, dynamic hand guidance, target pulsing, cancellation hardening, and gentle retry keep motor precision from gating learning.
4. A pre-reader can finish from pictures, motion, and spoken guidance. Live text supports adults without becoming a dependency.

There is one repeated skill—**associate a familiar discovery with one of the six inhabited continents**—expressed through three themed expeditions.

## Session and screen map

```text
SPLASH / MODE SELECT --choose--> MAP --correct--> DISCOVERY
       ^                          ^                |
       |                          +----next--------+
       |                          |
       +--back--------------------+--after 6--> PASSPORT END

Splash Home --> catalog
Map / Passport Back --> splash
```

- **Splash / mode select (3–15 s):** authored title and background; three large picture-led mode cards; the first real gesture unlocks every audio channel and speaks the exact concept welcome line.
- **Map (10–30 s per card):** one current card sits in the tray. Drag it anywhere over the map or select it and tap a continent. A placed miniature remains on its continent so the board grows into a travel collage.
- **Guidance:** after nine idle seconds a paper hand models card-to-map movement. During a drag the correct target receives a warm stitched pulse. The sound control repeats the current prompt.
- **Correct match / discovery (2–6 s):** a paper-star burst surrounds the region; a bold live continent banner appears on the blank ribbon; the card snaps to a configured point; the guide says “It’s puzzle-tastic!” and one short fact.
- **Retry:** an off-map or wrong-region drop glides home. The guide says “Not that spot. Let’s look around the map.” There is no red X, score loss, buzzer, or “Game Over.”
- **Passport end (10–30 s):** six placed cards orbit the completed expedition stamp. Completing a mode persists one local stamp. All three stamps produce a larger celebration but never lock content.

One expedition is roughly 90 seconds to four minutes. A child may leave after any correct match with no penalty.

## Three expeditions

### Animal Trek

| Continent | Card | Association |
|---|---|---|
| Asia | Giant panda | Native bamboo-forest range in China |
| Africa | African elephant | Native African range |
| Australia | Kangaroo | Native Australian range |
| North America | American bison | Native North American grasslands |
| South America | Llama | Domesticated in the Andes |
| Europe | Alpine ibex | Native European Alps |

### Tasty Travels

This mode names either a documented place of origin/domestication or a strong regional food tradition; it does not imply that a food is eaten only there.

| Continent | Card | Association |
|---|---|---|
| Asia | Bananas | Early cultivation in Southeast Asia |
| Africa | Watermelon | Wild ancestors in Africa |
| Australia | Lamington | Australian cake tradition |
| North America | Corn | Domesticated in present-day Mexico |
| South America | Cacao | Native and early cultivation in tropical South America |
| Europe | Pretzel | Long European baking tradition |

### World Wonders

| Continent | Card | Landmark |
|---|---|---|
| Asia | Great Wall | China |
| Africa | Great Pyramid of Giza | Egypt |
| Australia | Sydney Opera House | Australia |
| North America | Statue of Liberty | United States |
| South America | Machu Picchu | Peru |
| Europe | Eiffel Tower | France |

## Interaction and feedback rules

- One primary pointer at a time. Window-level move/up/cancel, pointer capture, blur, page-hide, visibility, resize, and orientation cancellation all return the card safely.
- A 10 px movement gate separates taps from drags. A drag uses the shared DOM drag controller; a tap selects the card, after which any generous continent target can place it.
- Map drops sample `continent-mask.png` at the actual pointer coordinate. The same source dimensions and generated metadata drive the visible raster and the hit result.
- Transparent 96 px continent buttons provide keyboard/assistive access without redrawing the map. Physical map taps resolve through the authoritative raster mask plus a nearest-center ocean-edge fallback, so overlapping semantic rectangles on the narrowest phones cannot steal one another’s pointer events. Europe and Africa use small opposite label/focus offsets; mask geometry and placed-card coordinates remain geographically anchored.
- The target pulse begins only after card lift or idle modeling; it never gives away the answer before the child begins.
- Correct drops lock input during the short fact beat. Wrong drops never advance, never reorder the deck, and never speak over an active fact.
- Reduced motion removes travel arcs, bobbing, shake, confetti drift, and repeated pulses. State changes, success color, narration, and the continent banner remain immediate.

## Art inventory

| Asset | Production / role |
|---|---|
| Splash and play-screen style anchor | GPT Image 2, 4:3, source retained |
| Title lockup | GPT Image 2, chroma-keyed alpha, exact spelling reviewed |
| Eighteen discovery cards | Three GPT Image 2 contact sheets → visually accepted private-LAN Qwen layer separation (imagegen-skill chroma matte retained as fallback) → deterministic six-cell crop |
| Blank map board / ribbon / tray | Built-in GPT Image 2 edit from the accepted play-screen anchor → deterministic crops |
| Continent overlay and hit mask | Natural Earth public-domain SHP/DBF → deterministic raster renderer; no generated geography |
| Confetti | Reused QLOBE papercraft raster celebration asset |
| HUD | Shared QLOBE PNG home/back/sound controls |
| Voice | 58 teacher-voice clips are recorded through the approved LAN Studio `character-voice-line → qwen3-tts-voiceclone` workflow, with committed teacher reference, seed ladder 7/8/9, and Whisper base/en strict normalized transcript ratio ≥0.98. Accepted records, runtime M4As, manifest, recipe, and QA copies are present; Web Speech is a graceful fallback only. |
| SFX | Shared synthesized pop, sparkle, boing, tick, and tada effects |

Exact prompts, seeds, source paths, processing, QA, and licenses are recorded in `ASSETS.md` and game-local production reports.

## Responsive and accessibility contract

- Landscape uses a map-first two-row composition: ribbon and progress above, map board center, tray in front. Portrait stacks the ribbon, contained map, and tray; the current card remains at least 132 px wide.
- Every explicit control and semantic continent target is at least 96×96 CSS px. Small visual continents receive larger invisible semantic targets.
- All card and landmark images have meaningful alt text; all buttons have accessible names; keyboard focus is visible; Enter/Space follows the same tap placement path.
- No essential instruction is baked into art. Live captions use short Fredoka labels with high contrast, while voice and modeled motion carry the child path.
- Safe-area insets protect the HUD. Runtime makes no remote request and requests no account, location, camera, microphone, motion sensor, or personal data.

## Persistence and privacy

Only `localStorage['qk-puzzle-explorer-v1']` is written. It contains schema version 1 and completed mode ids. No name, age, voice, location, dates, identifiers, or analytics payload is stored. Storage failure falls back to memory and never blocks play. A future adult reset may clear only this key; reset is not required for the core loop because stamps do not lock content.

## Architecture

- `config.json` owns all continents, modes, card copy, facts, asset paths, and tuning.
- `js/main.js` owns screen state, shuffled deck, drag/tap parity, raster-mask drop resolution, modeled hand prompt, narration, persistence, and `QLOBE_DEBUG`.
- `shared/js/stage/drag-to-slot-dom.js` owns hardened pointer lifecycle and ghost cleanup.
- Shared `voice-clips.js`, `audio-unlock.js`, `sfx.js`, `music.js`, `tap.js`, `timers.js`, `rng.js`, `preload.js`, and `debug-harness.js` remain authoritative.
- All generation is authoring-time. The shipped game is static, offline, and dependency-free at runtime.

## QLOBE_DEBUG v1

The hook exposes the standard contract plus:

- `getState()` → screen, mode, phase, card index/id, selected card, placed ids/continents, completed modes, busy, muted, reduced motion, active drag, and asset failures.
- `getTargets()` → visible controls and continent tap targets.
- `startMode(id)`, `tap(id)`, `place(itemId, continentId)`, `dropAt(itemId, normalizedX, normalizedY)`, `winRound()`, `completeMode()`, `mute(on)`, `seed(n)`, and `fastTimers(scale)`.
- `getAudioLog()` proves the exact guide/fact key and clip-vs-speech path.

## Explicit departures

- The written brief and concept video define a continent-matching geography game. The four fox-jigsaw PNGs conflict with that mechanic, so they guide material finish, hierarchy, card framing, and celebration only; the implementation follows the written loop.
- The brief asks for a “vibrant vector map,” but the user explicitly prohibits vector/CSS artwork. The game therefore uses geographically accurate **raster** land geometry with papercraft texture.
- Six inhabited continents are used. Antarctica is omitted because the three chosen content families cannot offer one accurate, equivalent familiar match without distorting the single skill.
- The target pulse appears after engagement rather than continuously, preserving discovery while still supporting younger players.
- Persistent passport stamps are an additive replay aid. They never gate modes, score children, or collect personal data.

## Beta acceptance and live-promotion gate

- Direct and hub launch, all three modes, all eighteen correct paths, wrong map/off-map retry, drag and tap parity, idle hand cue, facts, passport persistence, reload, and replay must work with zero console errors, failed requests, or 404s.
- Real pointer drag, cancel, blur, visibility, resize-mid-drag, phone and tablet portrait, landscape, reduced motion, keyboard placement, ≥96 px semantic targets, mask-routed phone taps for all six continents, and teardown pass automated probes.
- Recorded narration provenance, transcript QA, and the runtime decode gate are satisfied. Promotion to `live` still requires the real child/iPad playtest; the game remains beta and makes no production-deployment claim.
- Static checks verify config ids, exact 18-card/6-continent coverage, case-sensitive paths, no emoji art, local-only runtime, raster budgets, manifest/registry parity, and valid source/provenance records.
- Visual review separately approves material fidelity for the backdrop, map, manipulatives, tray, prompt ribbon, rewards, portrait/landscape hierarchy, geography recognizability, title spelling, retry, success, and end states at full size.
- A separate adversarial ART DIRECTOR review must find no unresolved high- or medium-severity visual issue before handoff.
