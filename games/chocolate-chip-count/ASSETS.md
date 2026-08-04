# Chocolate Chip Count — asset log

All child-facing world art is original project-authored raster claymation. The
runtime makes no remote asset requests and uses no emoji, SVG, CSS-gradient, or
CSS-drawn primary artwork. Full-resolution generations and deterministic crop
intermediates are preserved in `assets/source/`; the accepted production prompt
set is archived in `assets/source/gpt-image-2-prompts.json`.

## Production art

| Asset | Final path | Workflow | Final QA |
| --- | --- | --- | --- |
| Bakery backdrop | `assets/bakery.webp` | built-in gpt-image-2; concept mockup referenced; WebP optimization | 1448×1086, 152 KB; quiet drop field; approved |
| Title lockup | `assets/title.webp` | built-in gpt-image-2; flat magenta key; local alpha cleanup | 105 KB; reads exactly “Chocolate Chip Count”; approved |
| Ravi chef + tray | `assets/ravi-chef-tray.webp` | built-in gpt-image-2; canonical Ravi identity reference; magenta key | 44 KB; transparent corners and canonical identity; approved |
| Chocolate chip | `assets/chip.webp` | built-in gpt-image-2; green key | 2.9 KB; readable at play size; approved |
| Plain cookie | `assets/cookie.webp` | built-in gpt-image-2; magenta key | 47 KB; exact 3/6/10 composites verified; approved |
| Balloon family | `assets/balloon-{red,yellow,blue}.webp` | one built-in gpt-image-2 contact sheet; deterministic crops; magenta key | 9.8–11 KB each; consistent silhouettes; approved |
| Recipe frames | `assets/recipe-{mint,yellow,blue}.webp` | one built-in gpt-image-2 contact sheet; deterministic crops; magenta key | 13–15 KB each; source divider gutter clipped; approved |
| Action button | `assets/button.webp` | built-in gpt-image-2; green key | 31 KB; real HTML label over authored raster; approved |
| Star medallion | `assets/star.webp` | built-in gpt-image-2; magenta key | 10 KB; approved |
| Gesture cue | `assets/gesture.webp` | built-in gpt-image-2; magenta key | 13 KB; portrait/landscape overlap checked; approved |
| Hub tile | `../../assets/hub/tiles/chocolate-chip-count.jpg` | built-in gpt-image-2 dedicated 6:5 object-menu scene; 640×533 curation | 78 KB; true JPEG; no title/UI; approved at catalog scale |
| Social card | `assets/og-image.jpg` | deterministic 1200×630 crop from accepted hub source | 118 KB; metadata crop inspected; approved |

Creator: OpenAI image generation with Kaigani art direction and QLOBE Kids
local processing. Project license: CC BY 4.0. Built-in image generation was used
for every generated raster; no external stock or scraped web imagery is present.

### Local API comparison

QLOBE Studio's canonical `menu-game-tile` template was also run through the
local `krea2-turbo-t2i` workflow at seed 42. The prompt-only job and full
`qlobe-recipe` sidecar are preserved as
`assets/source/local-api/hub-tile-krea2-seed42-rejected.*`. It was rejected in
Studio review because the output lost Ravi's identity and drew four tray chips
plus extra scene chips, so it could not communicate the exact-count mechanic.
The accepted gpt-image-2 tile preserved the recurring character and the intended
three-chip tray count. No private reference audio or uncommitted personal asset
was transmitted for this comparison.

## Shared runtime assets

| Asset | Path | Source / license | Use |
| --- | --- | --- | --- |
| Fredoka SemiBold | `../../shared/fonts/fredoka-latin-600-normal.woff2` | Fontsource; SIL OFL 1.1 | Functional child-facing labels |
| Home, Back, Sound HUD art | `../../shared/assets/ui/btn-*.png` | QLOBE Kids; CC BY 4.0 project asset | Shared platform chrome |
| Synthesized effects | `../../shared/js/sfx.js` | QLOBE Kids; MIT | Pop, catch, boing, and reward effects |
| Confetti behavior | `../../shared/js/celebrate.js` | QLOBE Kids; MIT | Reduced-motion-aware completion behavior |

## Voice production

The verbatim 24-line script is in `assets/audio/lines.json`. Runtime uses the
same line table through Web Speech unless an accepted local recording appears
in `assets/audio/manifest.json`. The optional Qwen teacher-reference batch is
intentionally not shipped yet: repository automation blocked transmission of
the rights-cleared reference to an endpoint configured outside the repository.
No unverified or partially generated clip is present. `tools/gen-voice.py`
implements batch generation, AAC normalization, Whisper verification, and
manifest admission for a later explicitly approved run.

## Visual and interaction QA

- [x] All foreground objects read in the same tactile clay medium.
- [x] Ravi preserves his face, skin tone, black hair, red neckerchief, and star motif.
- [x] The generated title is visually spell-checked at full size.
- [x] Runtime cookie compositions contain exactly 3, 6, and 10 chip sprites.
- [x] Alpha cutouts have transparent corners, solid interiors, and no key-color fringe.
- [x] Background contrast keeps balloons and falling chips readable.
- [x] Landscape and portrait contain no placeholder illustration.
- [x] Hub tile follows the 6:5 object-menu grammar and has no baked title or UI.
- [x] Backdrop is below 300 KB and every foreground production asset is below 150 KB.
- [x] Chrome QA covers splash, play, miss/return, reward, all three exact totals,
      navigation, portrait, landscape, reduced motion, failures, and remote requests.
