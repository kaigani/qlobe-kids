# Shelf Reset — production game design

## Product promise

Shelf Reset turns tidying into a warm, tactile picture-matching game. A child chooses one wooden shelf, moves six familiar objects from a tray into three clearly pictured homes, watches the shelf become orderly, and celebrates with Sunny when the tray is empty. It teaches visual categorization and the pleasure of restoring a shared space without scores, timers, penalties, or required reading.

- **Audience:** ages 2–5; tablet-first; fully playable without reading.
- **Session shape:** one 35–80 second shelf; three replayable categories.
- **Canonical art direction:** **Toy**.
- **Per-game treatment:** a sunlit Montessori playroom made from warm maple, lightly worn paint, rounded handcrafted toys, fabric details, soft pastel sage/blue/coral, and shallow miniature-photography depth.
- **Status:** `beta` until a real child completes all three shelves on the target iPad.

## Decisions from the concept and prototype

1. **Replace the coach-timer stub.** The old prototype described a real-world work cycle and rendered emoji checklist cards. Production delivers the brief's on-screen tray, shelf, cubbies, direct manipulation, visible completion, and Toy world at the existing route.
2. **Three shelves, one learned rule.** Art, Blocks, and Nature each contain three picture homes and two objects per home. The category changes; the gesture and feedback stay consistent.
3. **Picture matching before text.** Each cubby uses a large raster medallion showing its contents. Labels exist for adults and accessibility, but the play rule is visible without reading.
4. **Two equivalent inputs.** Children may drag an object directly to a cubby or tap an object and then its matching home. Both paths use the same placement function and feedback.
5. **No-fail care.** A wrong home gives a soft wobble, Sunny points, and the correct picture glows. Nothing is lost, scored, or reset.
6. **Raster-first presentation.** Every child-facing room, shelf, card, plaque, tray, helper pose, picture marker, and loose object is original raster art. CSS only lays out assets, provides hit areas, and animates interaction state.

## Screen map

```text
catalog
  → shelf chooser / splash
      home → catalog
      Art / Blocks / Nature card → sorting play
          back → shelf chooser
          sound → replay current prompt
          six correct placements → shelf-ready reward
              again → reshuffle and replay same shelf
              back → shelf chooser
```

## Core loop

1. The splash presents Sunny and three oversized illustrated wooden cards in the real playroom.
2. A card press unlocks recorded narration, SFX, and the quiet music bed, then reveals the selected shelf and six shuffled objects in a wooden tray.
3. Each shelf cubby displays a faded picture-home medallion. Selecting an object makes its matching medallion glow.
4. The child drags to a cubby or taps object then cubby. Generous slot padding accepts near-edge drops.
5. A correct object arcs into the cubby, becomes visibly stored, plays a tactile sparkle, and reduces the raster progress plaque.
6. A wrong cubby wobbles without consuming the object; Sunny leans in and narration invites another try.
7. After three placements, narration marks the halfway point. Idle help repeats the mode prompt, then highlights the next object's picture home.
8. The sixth placement reveals the fully stocked shelf, empty tray, cheering Sunny, gentle confetti, and replay control.

## Modes and matching sets

| Mode | Picture homes | Loose objects |
|---|---|---|
| Art Shelf | brushes, paints, art tools | blue brush, red brush, red paint, blue paint, palette, crayons |
| Blocks Shelf | arches, cubes, cylinders | red arch, yellow arch, blue cube, wood cube, green cylinder, yellow cylinder |
| Nature Shelf | leaves, pinecones, treasures | oak leaf, maple leaf, tall pinecone, round pinecone, smooth stone, acorn |

Every home receives exactly two objects. Visual pairs vary in silhouette or colour so the child categorizes rather than matching identical copies.

## Interaction and safety rules

- Primary controls and effective object/cubby hit regions are at least 96 px at supported viewports.
- Pointer Events power drag; pointer cancel and screen exit remove the ghost safely.
- Drag preserves a comfortable grab offset so artwork remains visible above the finger.
- `slotPad: 48` makes near-target drops generous without allowing a neighbouring cubby to steal the item.
- Keyboard Enter/Space selects an object; a subsequent cubby activation places it.
- Input locks only during the short correct-placement arc and completion transition.
- The selected object and correct home retain a clear visual relationship after a wrong attempt.
- `prefers-reduced-motion` removes travel flourishes and looping pulses while preserving state changes and audio.

## Spoken script

The verbatim 23-line script lives in `assets/audio/lines.json` and is mirrored in `config.json`. It covers chooser guidance, a prompt and completion line for each shelf, one explanation per picture home, gentle wrong-place recovery, three rotating praise lines, the halfway beat, and the final shelf-ready reflection.

All lines use the approved teacher reference through local `qwen3-tts-voiceclone`, seed 7 first and seeds 8/9 only for transcript failures. Local Whisper must accept every shipped M4A. Device speech remains a runtime fallback if a clip cannot decode.

## Audio

- Recorded narration is the primary channel through `voice-clips.js`.
- `mug-and-sunbeam.mp3` is reused from the shared music library at volume 0.12. It starts after a shelf choice, ducks beneath speech, follows mute, and stops when play exits.
- Shared `pop`, `whoosh`, `tick`, `silly`, `sparkle`, and celebration SFX give tactile responses without controlling correctness.
- First-gesture unlock fans out to recorded clips, speech fallback, SFX, and BGM.

## Art and renderer inventory

| Child-facing element | Visible renderer |
|---|---|
| Montessori room | full-bleed 1600×1200 GPT Image 2 raster plate |
| Title, progress, tray | transparent raster cutouts from the coordinated UI sheet |
| Sunny neutral / point / cheer | three identity-consistent transparent raster poses |
| Art / Blocks / Nature choice cards | three wooden transparent raster cards with live HTML labels |
| Shelf | one empty maple shelf raster with three upper cubbies and lower drawers |
| Nine picture homes | round maple medallion raster cutouts |
| Eighteen loose objects | transparent wooden/felt object cutouts |
| Navigation and replay | shared platform raster controls |
| Sparkles and focus glow | short-lived CSS interaction effects; never primary art |

### Production pipeline

1. Built-in GPT Image 2 established the room, shelf, UI/helper family, three object sheets, and mode-card sheet from the supplied brief and mockups.
2. Every exact prompt and immutable accepted master is retained under `assets/source/gpt-image-2/`.
3. A whole-sheet local Qwen Image Layered trial was rejected because it omitted disconnected sprites. Rejected evidence is retained separately and never ships.
4. Local Qwen Image Edit changed only each studio sweep to a flat magenta key, preserving all assets. The imagegen chroma helper created alpha; a narrow deterministic pass removed remaining key-coloured cast-shadow pixels.
5. `tools/cut-asset-sheet.py` cut each complete sheet with exact-count gates and retained masks/manifests. `cutout_finalize.py` normalized, padded, resized, and produced magenta alpha-QA plates before WebP encoding.
6. The existing Shelf Reset hub tile already met the brief's wooden shelf / direct tidying promise and was retained; the link preview is regenerated from the real splash.

## Responsive behavior

- **Landscape:** shelf dominates the upper centre, tray spans the lower work band, and Sunny points from the right without covering either.
- **Portrait:** shelf expands to 92% width; tray becomes a 3×2 grid; Sunny shifts above the tray; all objects remain visible.
- **Short landscape:** title/progress, shelf, tray, helper, and HUD compress independently; the direct-manipulation surfaces remain at least 96 px.
- Safe-area variables reserve corners for navigation and narration controls.

## Determinism and review surface

`window.QLOBE_DEBUG` format version 1 exposes `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`, `winRound`, `mute`, `seed`, `fastTimers`, `home`, `wrong`, `getAudioLog`, and `musicStats`.

The state snapshot includes screen, phase, selected shelf, shuffled items, picture homes, placement count, wrong-attempt count, input lock, seed, shelf completion history, mute state, and timer scale. Debug placement and completion call the same functions as child input; they never set completion directly.

## Verification and release gate

- Static: module syntax, JSON parse, registry sync, usage index, full validator with zero new errors, and `git diff --check`.
- Browser: real Chrome at landscape, portrait/reduced-motion, and compact landscape; all modes; mouse drag, tap-to-place, wrong recovery, replay, chooser return, recorded-clip evidence, BGM state, and 96 px control audit.
- Visual: inspect chooser, each mode, partial shelf, wrong feedback, full shelf, reward, portrait, and short-landscape captures at full size for hierarchy, clipping, alpha fringes, and category readability.
- Assets: exact cutter counts, retained masks/manifests, alpha QA, runtime dimensions/bytes, M4A signatures/durations, and Whisper transcripts.
- Production: push `main`, wait for Pages, rerun the same smoke suite at `https://qlo.be`, and visually inspect production captures.
