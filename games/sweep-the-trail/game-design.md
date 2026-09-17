# Sweep the Trail — production game design

## Product promise

Sweep the Trail turns one broad, satisfying cleaning gesture into a tiny felt-puppet adventure. A child chooses a trail, takes hold of a soft broom, and pushes every loose object into a clearly pictured basket or dustpan. The loop teaches purposeful whole-arm movement, spatial planning, and the pleasure of finishing a care task without punishment, timers, scores, or reading.

- **Audience:** ages 5–6; tablet-first; fully playable without reading.
- **One skill:** coordinate a push from behind an object toward a visible collection target.
- **Session shape:** one 30–75 second trail; three replayable variations.
- **Canonical art direction:** **Puppet / Cozy felt fabric**.
- **Per-game treatment:** a hand-sewn woodland quiet book: wool felt, fleece, padded appliqué, visible blanket stitching, embroidered details, woven cloth, soft stuffing, painted wood, and warm theatrical light.
- **Status at launch:** `beta` until a real iPad child playtest confirms the sweep gesture and the three target placements.

## Concept and prototype decisions

The concept brief and its UI mockups are the visual and interaction north star. The shipped game deliberately departs from the old prototype and resolves two concept inconsistencies:

1. **Replace the coach-timer prototype.** The registered prototype asks a child to do real-world sweeping and tap “Done.” That does not deliver the brief’s promised on-screen broom, pushed debris, or target capture. The production route keeps the existing `sweep-the-trail` id and hub slot but becomes a custom direct-manipulation game.
2. **Use the brief’s squirrel helper.** The brief specifies a squirrel; the generated mockup shows a hedgehog. The production cast follows the brief with one original felt squirrel helper. It does not invent a human QLOBE cast role for a game that does not need one.
3. **Three trails, one learned gesture.** The mockup presents three selectable environments. Production keeps that promise as Leaf Lane, Acorn Bend, and Porch Path, with only material weight and target art changing.
4. **Voice carries the instruction.** Short HTML labels remain for adults, accessibility, and QA, but no child must parse them. The broom, loose pieces, pulsing target, first modeled sweep, and narration explain play.
5. **No vector/CSS primary art.** CSS supplies layout, hit areas, focus, transforms, clipping, and motion only. Every child-facing world object is an authored raster asset.

## Screen map

```text
catalog
  → trail select / splash
      home → catalog
      mode card → play
          back → trail select
          sound → repeat current prompt
          all pieces captured → clear celebration
              again → replay same trail with a seeded layout variation
              choose trail / back → trail select
```

The trail-select screen is the game splash: it contains the title lockup, three large wordless scene cards, the squirrel helper, and the only Home control. Play and clear screens use Back, never Home.

## Modes

### Leaf Lane

- Seven light felt leaves in orange, mustard, and moss.
- A broad woven basket target.
- Lowest mass and widest capture radius; designed as the first successful play.
- Learning emphasis: large, steady pushes.

### Acorn Bend

- Seven padded acorns, slightly heavier than leaves.
- The same basket target, staged deeper along a curving woodland path.
- More than one stroke may be needed; target assist remains generous.
- Learning emphasis: move behind an object and push again.

### Porch Path

- Seven small connected felt crumb patches on a cozy porch mat.
- A bright padded dustpan target.
- Shorter broom travel and lighter pieces reward small finishing strokes.
- Learning emphasis: precise little pushes near corners.

## Core loop

1. A mode-card press unlocks voice, SFX, and the quiet recorded music bed.
2. The chosen 4:3 felt tableau appears with a calm center, the target near the destination edge, the broom in easy reach, and loose pieces safely outside HUD reserves.
3. Narration names the task while the target and one nearby piece perform a slow, reduced-motion-safe visual nudge.
4. The child presses anywhere on the broom and drags. The broom preserves the grab offset; its brush head follows broad pointer movement.
5. A swept-segment collision pushes nearby pieces. Movement that already points toward the target gets a modest invisible assist; movement away remains reversible and never triggers failure.
6. A piece entering the generous target radius pops into the basket/dustpan, plays a soft tactile sound, and changes the pictured progress row.
7. Idle help stays gentle: replay the directional prompt and highlight the nearest piece and target. It never moves or completes a piece for the child.
8. The final capture reveals the cheering squirrel, an overflowing target, stitched star particles, a warm voice line, and an obvious replay button.

## Interaction rules

- Pointer Events only; one primary pointer; window-level move/up/cancel listeners.
- Preserve the pointer-to-broom-head offset so the broom never snaps under the finger.
- `pointercancel`, page hide, blur, resize, and orientation change end the gesture safely and never count as a sweep/drop.
- Continuous swept-segment collision prevents fast child swipes tunneling through small pieces.
- Pieces remain inside authored play bounds. Near-target motion gains a modest target assist to avoid deadlocks.
- Empty-path sweeps play a quiet swish but do not scold or reset anything.
- The broom is keyboard focusable. Arrow keys travel through the same movement/collision path as touch.
- All navigation controls and the broom’s interactive footprint are at least 96 px.
- `prefers-reduced-motion` removes looping bobs, flying particles, and travel flourishes while retaining state changes and sound.

## Spoken script (verbatim)

| Key | Line |
|---|---|
| `select-intro` | “Pick a trail to help our squirrel friend.” |
| `leaf-intro` | “Sweep every soft leaf into the basket. Big, gentle sweeps!” |
| `acorn-intro` | “Sweep every acorn into the basket. Nudge them again when they need it.” |
| `porch-intro` | “Brush every little crumb into the dustpan. Short sweeps work best!” |
| `capture-one` | “In it goes!” |
| `capture-two` | “Lovely sweep!” |
| `halfway` | “The trail is looking clearer.” |
| `nudge-one` | “Move the broom behind one, then push toward the basket.” |
| `nudge-porch` | “Move the broom behind a crumb, then push toward the dustpan.” |
| `almost` | “Almost clean. Find the last one!” |
| `leaf-clear` | “Leaf Lane is clean. You cared for the trail!” |
| `acorn-clear` | “Acorn Bend is clean. What helpful sweeping!” |
| `porch-clear` | “Porch Path is clean. Every crumb is tucked away!” |

All thirteen lines use the approved platform teacher reference through local `qwen3-tts-voiceclone`, seed 7 first and 8/9 only for failed takes. Every final M4A must pass local Whisper transcription comparison. `voice-clips.js` supplies device-speech fallback for any omitted clip.

## Audio

- Recorded narration is the primary channel through `voice-clips.js`.
- `quirky-forest-adventure.mp3` is reused from the shared music library at a deliberately quiet volume through `bgm.js`; it starts only after a real gesture, loops with fades, ducks beneath every line, follows mute, and stops on splash exit/page teardown.
- Shared synthesized `tick`, `whoosh`, `pop`, `sparkle`, and `tada` effects provide tactile feedback. No audio file is required for input correctness.
- First-gesture unlock fans out to recorded voice, Web Speech, SFX, and BGM and reopens after an iPad app switch.

## Art and renderer inventory

| Child-facing object | Visible renderer | Interaction substrate / final target |
|---|---|---|
| Trail-select world | opaque GPT Image 2 felt tableau | full-bleed `<img>`; 1600×1200 WebP, target ≤425 KB |
| Leaf, acorn, porch worlds | opaque coordinated felt tableaux; accepted master plus reference-conditioned variants | full-bleed responsive `<img>`; 1600×1200 WebP each, target ≤425 KB |
| Title “SWEEP THE TRAIL” | spell-checked stitched felt graphic lockup | accessible `<img>`; transparent WebP, up to 1000×375, ≤150 KB |
| Three mode cards | wordless padded felt scene miniatures | large `<button>` with HTML accessible label; transparent WebP, about 460×520 each |
| Felt squirrel, idle and cheer | two identity-consistent raster poses | absolutely positioned `<img>`; about 520×620 each |
| Child broom | top-down padded broom, handle and brush connected | focusable `<button>` positioned by CSS variables; transparent WebP, about 360×680 |
| Basket and dustpan | woven/padded raster targets with readable open mouths | `<div data-target>` with forgiving invisible radius; transparent WebP, about 520 px |
| Leaf family | three connected padded appliqué sprites | repeated `<img>` pieces; transparent WebP, 180–260 px |
| Acorn and crumb patch | connected tactile sprites | repeated `<img>` pieces; transparent WebP, 140–220 px |
| Progress carrier | blank stitched felt strip | DOM row and live accessible count on top; transparent WebP, about 640×293 |
| Stars, thread curls, sparkle | small felt reward sprites | temporary DOM particles animated by transforms; transparent WebP, 80–180 px |
| Navigation and replay | shared platform raster HUD buttons | `hud.js` buttons; ≥96 px targets |
| Hub tile | separate Toy-grammar Krea 2 scene with broom, leaves, basket; no text/UI | 640×533 progressive JPEG |
| Link preview | screenshot of the real splash | 1200×630 JPEG generated by repository tool |

### Production pipeline

1. GPT Image 2 establishes the cohesive felt world from the approved concept mockups: clean background plates, exact title, mode-card family, and a separated flat-ground asset sheet.
2. Retain every accepted source and the final prompt set under `assets/source/gpt-image-2/`.
3. Run the repository bounding-box cutter on the separated asset sheet with `--expected-count` and a debug mask; inspect every crop.
4. Use local Qwen Image Edit only for reference-conditioned world/pose variants, not independent identity redraws.
5. Send opaque cuts through local Qwen Image Layered, fetch `layer_2`, then run `tools/pipeline/cutout_finalize.py` and inspect saturated-magenta QA composites.
6. Generate the hub candidate with Krea 2’s menu grammar and seed ladder 42 → 1337 → 9001 → 7; do not crop a splash screen.
7. Optimize deterministic runtime derivatives, record provenance in `ASSETS.md`, and ship no authoring endpoint or model URL.

## Responsive and accessibility behavior

- Landscape and short-landscape contain-fit the authored 4:3 tableau so the entire trail remains visible. A dimmed, blurred duplicate of the same raster plate fills any outer letterbox area without changing gameplay coordinates.
- Portrait expands the normalized play stage to 86% of the viewport height and cover-crops only the raster scenery; broom, debris, helper, and target coordinates continue to span the full touch field so every interactive object remains visible and comfortably reachable.
- Safe-area variables reserve every corner for HUD controls.
- Screen-reader labels identify trail cards, the broom, remaining objects, the target, replay, sound, and navigation. A polite live region mirrors narration/progress.
- Muting silences voice, BGM, SFX, and stray media but leaves the live region active.

## Determinism and review surface

`window.QLOBE_DEBUG` format version 1 provides:

- `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`, `winRound`, `mute`, `seed`, `fastTimers`, and `home`;
- deterministic `tap("debris-<id>")` and `winRound()` paths that both drive the real broom movement/collision handler;
- `getAudioLog`, `clearAudioLog`, `getLayout`, and BGM stats.

The state snapshot includes screen, mode, remaining count, broom coordinates, every piece’s coordinates/captured flag, active gesture state, completion state, clip readiness, and mute state. Debug completion must never set capture flags directly.

## Verification and release gate

- Static: syntax-check both game modules; registry sync/check; head metadata generation; full validator with zero new errors; usage-index regeneration/check; `git diff --check`.
- Browser: real Chrome, direct route and hub route; all three modes; real mouse drag, touch PointerEvent swipe, keyboard broom movement, pointer cancel/blur/resize recovery, wrong-direction and empty-path probes, back/replay/home loops, recorded-clip evidence, mute, landscape, portrait, 1180×520, and reduced motion.
- Visual captures: splash, each trail at start, active sweep, partial progress, final capture, clear screen, portrait, short landscape, and reduced motion. Inspect at full size for hierarchy, clipping, alpha fringes, target clarity, foreground material fidelity, and whether the gesture reads without code knowledge.
- Asset QA: source sheet plus every cutter crop, every Layered alpha on magenta, title spelling, squirrel identity, image dimensions/bytes, M4A signatures/durations/transcripts, hub 6:5 crop, and OG screenshot.
- Production: commit only task-owned files from the isolated worktree, push intended branch/main, watch Pages, rerun the full smoke suite against `https://qlo.be`, and visually inspect production captures.
- Remain `beta` until the target child completes a trail on the real iPad.
