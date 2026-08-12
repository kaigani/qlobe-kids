# Rhythm Copycat — asset provenance

Canonical art-direction label: **Kawaii**. The concept brief is authoritative;
the concept index's Claymation label is a historical mockup tag. The runtime
keeps the mockup's tactile sticker package: puffy soft-vinyl/clay surfaces,
cream die-cut outlines, candy-color instruments, cocoa type, and warm shadows.

All committed art was produced through the QLOBE LAN authoring pipeline and
deterministically finalized for the static runtime. Model calls are not made
at runtime.

## Runtime art

| file family | purpose | notes |
|---|---|---|
| `assets/bg/*.webp` | splash/music room, play field, completion stage | opaque 1600×1200 plates |
| `assets/kiki/poses/*.webp` | Kiki's semantic poses | shared pose-actor canvas and baseline |
| `assets/pads/*.webp` | child action targets | one authored raster per action |
| `assets/cards/*.webp` | optional level cards | orange, yellow, and teal authored card plates |
| `assets/ui/tray.webp` | sequence tray | four authored recessed seats |
| `assets/ui/plaque.webp` | title/prompt/reward plate | exact runtime HTML copy sits above it |
| `assets/ui/button.webp` | red CTA plate | exact runtime HTML copy sits above it |
| `assets/ui/star.webp` | reward/celebration sprite | authored face and outline |
| `assets/ui/djembe.webp`, `tambourine.webp`, `woodblock.webp` | level badges | authored raster instruments |

## Rebuild 3 (2026-08-12)

The composition rebuild replaced the following assets, generated on the LAN
pipeline and extracted with `qwen-image-layered` (async, `layer_2`), all
sources retained under `assets/source/rebuild3/`:

| asset | source | workflow / seed | notes |
|---|---|---|---|
| `assets/ui/title.webp` | `rebuild3/title.png` → `title.layer2.png` | `ideogram4-t2i` seed 42 | true-alpha lockup, spell-checked at full size; layered outputs carry faint full-canvas alpha specks, so finalization trims at alpha>24 (513px, 38 KB) |
| `assets/pads/clap.webp` | `rebuild3/pad-clap.png` → layer2 | `krea2-turbo-t2i` seed 42 | cocoa border, cream panel |
| `assets/pads/stomp.webp` | `rebuild3/pad-stomp.png` → layer2 | `krea2-turbo-t2i` seed 42 | first extraction kept only the shoes (rejected file retained); re-extracted with an "entire pad button" subject |
| `assets/pads/tap.webp` | `rebuild3/pad-tap2.png` → layer2 | `krea2-turbo-t2i` seed 1337 | seed-42 take rejected: blue inner panel broke the pad family |
| `assets/pads/shake.webp` | `rebuild3/pad-shake2.png` → layer2 | `krea2-turbo-t2i` seed 1337 | seed-42 take rejected: motion arcs rendered as blue outline blobs |
| `assets/ui/tray.webp` | `rebuild3/track.png` (local luminance key) | `krea2-turbo-t2i` seed 1337 | clean empty cream track replacing the pop-it wells tray; its layered extraction returned an empty layer, so the flat-charcoal source was keyed locally (threshold L>58 + feather) |
| `assets/audio/mode-*.m4a`, `watch-kiki.m4a` | `rebuild3/tts-*.flac` | `qwen3-tts-voiceclone` seed 7 | whisper-QA'd (`model_size=small`, `language=en`), AAC 64k `+faststart` |
| `assets/ui/button.webp` | `rebuild3/button-v4.png` (local luminance key) | `krea2-turbo-t2i` seed 1337 | critic-driven v4: stitched border + bilateral sparkles; layered extraction failed twice (opaque plate), so keyed locally (L>62, 2px erode) and gently stretched 4.2:1→2.8:1; v2/v3 takes retained |
| `assets/bg/play-portrait.webp` | `rebuild3/bg-play-portrait.png` | `krea2-turbo-t2i` seed 42 | dedicated portrait play backdrop (edge garnish + coral bottom band); landscape crop starved portrait of set dressing |
| `assets/ui/star.webp` | `rebuild3/star-src.png` → `star-gold.png` → layer2 | `qwen-image-edit` + layered, seed 42 | pale star recolored to saturated gold with a bigger kawaii face |
| `assets/bg/splash.webp`, `assets/bg/play.webp` | `rebuild3/bg-*-clean.png` | `qwen-image-edit` seed 42 | prop-collision pass: splash djembe removed, play corner xylophone/maraca removed |
| `assets/pads/*.webp` (final) | `rebuild3/pad-*-big.png` → layer2 | `qwen-image-edit` + layered, seed 42 | icons enlarged ~1.3× per critic round 1 |

The sequence chips are the pad art itself scaled down inside colored CSS
coins — a deliberate 1:1 icon mapping between the beat strip and the pads, so
they need no separate asset. Finalization is `tools/finalize_rebuild3.py`
(alpha-trim, pad, LANCZOS resize, WebP).

## Production pipeline

- `tools/kawaii_gen.py` — LAN generation prompts and style core.
- `tools/finalize.py` — deterministic alpha cleanup, pose assembly, raster
  resizing, and contact-sheet QA. The center-dot crop is deliberate because
  the source masters are playful multi-object sheets.
- `assets/source/` — retained raw generations, layered sources, voice sources,
  and QA composites for provenance and reruns.
- `assets/audio/` — recorded teacher voice clips and manifest; WebAudio body
  percussion remains zero-byte local synthesis in `js/percussion.js`.

## Visual QA requirements

Review splash, Levels, Play demo/copy, wrong-pad, Rewards, and Complete in both
tablet orientations. Reject a pass when title plates show an opaque source
background, any pad or dot contains unrelated contact-sheet objects, Kiki's
silhouette changes identity between poses, or primary objects fall back to
CSS/emoji/vector stand-ins.

## Credits and licenses

Original generations: CC-BY-4.0. Runtime derivatives: CC-BY-4.0. Code: MIT.
Teacher voice is the rights-cleared platform reference voice. See the source
folder and `game-design.md` for the full spoken script and production record.
