# Neighborhood Explorer — production game design

## Product promise

A child draws the first marks of a home, watches those marks become a storybook
cottage, makes a road with one continuous finger movement, and fills an open
watercolor clearing with familiar community places. The payoff is not a score:
the same road and placed landmarks become a tiny living world with a moving car,
swaying plants, shimmering water, fireflies, sound, and spoken celebration.

The single learning promise is spatial representation: home, paths, and familiar
places can become symbols on a map. Fine-motor drawing is the physical vehicle
for that idea.

Target: ages 3–6, tablet-first. Art direction: **Watercolor / Storybook**.

## Core loop

1. Start from the illustrated Neighborhood Explorer storybook cover.
2. Draw freely on the big paper page. Six oversized illustrated crayon regions
   change color; no likeness test can reject a child’s home.
3. Tap Done. The marks sparkle into a finished watercolor cottage.
4. Draw one or more roads directly across the open neighborhood clearing.
   Runtime converts the gesture into a soft painted road with a center trail.
5. Pick a large illustrated landmark and tap the map to place it. Three filled
   dots model the minimum needed for a lively town, while further placements
   remain open-ended.
6. Bring the map alive. The exact road strokes and landmark positions remain,
   the car follows the longest child-made road, and ambient life starts.
7. Visit the saved town from the cover or make another without punishment,
   timers, scores, or “wrong” states.

The active loop is about 60–120 seconds, but drawing and placement are unbounded.

## Screen map and navigation

### Cover

- Full-bleed concept illustration and raster title.
- One dominant Start hotspot over the painted Start control.
- If a saved town exists, a small illustrated My Town card revisits it.
- Catalog Home exists only here.
- First child gesture unlocks voice and SFX.

### Draw your home

- Full-bleed illustrated sketchbook, robin guide, crayons, and Done control.
- Live canvas is an invisible interaction layer over the paper.
- Free drawing is preserved in local state; there is no “correct house.”
- Back returns to the cover.

### House magic

- The production cottage appears in a radial sparkle reveal.
- A large Draw a Road control advances immediately; narration never gates play.

### Draw a road

- The open production clearing is the full playfield.
- The derived home remains at the center.
- One or more pointer strokes render as broad watercolor roads.
- Pointer capture prevents an off-canvas release from stranding input.

### Place landmarks

- Six raster choices: tree, park, library, pond, bakery, and flowers.
- Selected art lifts and receives a warm yellow halo.
- Tap anywhere safe on the grass to place; coordinates are normalized so
  orientation changes preserve the map.
- The final action unlocks after three placements. Debug and fallback paths can
  seed sensible defaults so the experience never strands.

### Living neighborhood

- The same roads, home, and placements remain on screen.
- A raster car follows the child’s longest road.
- Raster foliage sways, water shimmers, fireflies drift, and confetti marks the
  first reveal. Reduced motion keeps the finished tableau and removes travel.
- Make Another resets the canvas. All Done returns to the cover, where My Town
  revisits the saved result.

Navigation rule: play Back moves one authored step back; finale Back returns to
the cover; only cover Home leaves for the catalog.

## Interaction and feedback

- Primary actions are at least 96 CSS px in the normal tablet layouts.
- Drawing uses Pointer Events and pointer capture, normalized points, rounded
  joins, and aggressive point thinning to remain responsive.
- Palette and place choices show selection before placement.
- No step judges representational accuracy.
- SFX supply immediate press, drawing, reveal, placement, and finale feedback.
- Recorded narration is primary; device speech is the offline fallback.
- Visible text reinforces the picture and narration but is never required.
- Reduced-motion mode retains all state and feedback without route animation.

## Spoken script

| Key | Verbatim line |
| --- | --- |
| draw-home | “Draw your home. Any shape you make can become a wonderful house!” |
| house-magic | “A little neighborhood magic. Your drawing became a home!” |
| draw-road | “Draw a wiggly road from your home to somewhere you love.” |
| place-intro | “Choose a special place, then tap the grass. Add at least three!” |
| pick-place | “Great choice. Tap the grass to put it in your neighborhood.” |
| town-alive | “Look what you made! Your neighborhood is alive. Every road and place has your story.” |

## Art list

| Asset | Visible renderer | Interaction substrate |
| --- | --- | --- |
| Cover | Raster watercolor concept screen | Start hotspot and HUD buttons |
| Drawing page | Raster watercolor sketchbook screen | Transparent canvas and crayon hit regions |
| Open world | GPT Image 2 watercolor background plate | Responsive world-stage element |
| Cottage | GPT Image 2/Qwen transparent raster sprite | Positioned image |
| Tree, park, library, pond, bakery, car, flowers | GPT Image 2 contact sheet, deterministic cutting, Qwen layered alpha | Palette buttons and positioned images |
| Roads | Child-authored canvas strokes with watercolor-like layered rendering | Pointer event canvas |
| Finale ambience | Raster sprites plus bounded transform/filter animation | Runtime animation layer |

CSS supplies layout, hit areas, focus, masks, and feedback only. It does not
substitute for visible primary artwork.

## Persistence and privacy

The latest house strokes, road point arrays, and landmark coordinates stay in
localStorage under qk-neighborhood-explorer-v1. Nothing is uploaded. Reset and
Make Another replace this local record. No microphone, camera, location, name,
or personal identifier is requested.

## Explicit departures

- Replaces the old Neighborhood Map Walk timer/checklist prototype completely;
  an off-tablet real-world walk could not deliver the concept’s on-screen town
  building fantasy or reliable unattended play.
- Keeps the existing neighborhood-map-walk route and id so saved catalog links
  do not break; the child-facing product name is Neighborhood Explorer.
- Uses one coherent build loop instead of the mockup cover’s three destination
  cards. Those cards remain visual world-building on the cover, while Start
  enters the promised draw-connect-place-alive sequence.
- A child’s free drawing transforms into a curated cottage rather than being
  evaluated by recognition. This preserves creative agency and makes the final
  world visually coherent.
- The animated finale is produced from runtime layers rather than a baked final
  screenshot, so the child’s road and chosen placement genuinely remain.

## Shared systems and debug contract

Uses shared audio unlock, tap handling, SFX, voice clips, preload, timers,
celebration, and debug harness. QLOBE_DEBUG format v1 exposes:

- ready; listModes; startMode
- getState and live target geometry
- semantic tap and winRound
- mute, deterministic seed, and fastTimers
- completeHouse, completeRoad, placeLandmark, finishMap
- audio log and progress reset

## Release gates

- Zero missing local assets, page errors, unexpected requests, or new validator
  errors.
- Real Chrome smoke traverses every stage, verifies saved composition state,
  reload, back routing, mute, portrait, short landscape, and reduced motion.
- Full-size visual review covers cover, house drawing, road, selected placement,
  three-place map, living finale, and portrait.
- Production smoke repeats against qlo.be after deployment.
- Status remains beta until a real child completes the loop on iPad.
