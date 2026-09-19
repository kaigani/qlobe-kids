# Asset log — My Awesome Day

All child-facing artwork is authored raster art. The runtime uses no SVG,
emoji, canvas-drawn illustration, CSS-gradient illustration, or live model
request. CSS is limited to layout, focus, opacity, and motion.

## GPT Image 2 production

The accepted source masters were generated through Codex built-in image
generation on the requested GPT Image 2 path. Exact accepted recipes and the
shared material anchor are retained in
[`assets/source/gpt-image-2/PROMPTS.md`](assets/source/gpt-image-2/PROMPTS.md).
The supplied PLAN DO REVIEW mockups were used as style/composition references;
Barnaby's mockup appearance was used as the strict identity reference.

| Source master | Runtime use | Generation treatment |
| --- | --- | --- |
| `plan-room-master.png` | PLAN and splash room | New opaque 4:3 felt environment |
| `do-room-master.png` | DO room | New opaque 4:3 felt environment |
| `review-room-master.png` | REVIEW and reward room | New opaque 4:3 felt environment |
| `title-master.png` | “MY AWESOME DAY” splash lockup | Exact-text transparent title art |
| `barnaby-idle-master.png` | Splash and unselected PLAN | Transparent extraction from supplied identity reference |
| `barnaby-point-master.png` | Selected PLAN and skill review | Identity-preserving pose edit |
| `barnaby-cheer-master.png` | Feeling review and reward | Identity-preserving pose edit |
| `ui-carriers-master.png` | Boards, cards, buttons, mat, tray, rope, jar, star, sparkle | Text-free 12-object contact sheet |
| `reflection-patches-master.png` | Four feelings and three learning powers | Text-free 7-object contact sheet |
| `hud-controls-master.png` | Home, back, sound, mute, replay | Text-free 5-object contact sheet |
| `tower-pieces-master.png` | Four tower pieces and completed preview | Text-free 5-object contact sheet |
| `garden-pieces-master.png` | Four garden pieces and completed preview | Text-free 5-object contact sheet |
| `picnic-pieces-master.png` | Four picnic pieces and completed preview | Text-free 5-object contact sheet |
| `hub-tile-master.png` | Root catalog tile | New text-free 6:5 felt tableau using accepted game art as strict references |

Creator: OpenAI GPT Image 2 operated by Codex for QLOBE Kids. License for the
accepted project assets: CC BY 4.0 under the repository's game-asset license.
No external stock art is embedded.

## Local API attempts

The project owner explicitly approved LAN generation. The QLOBE wrapper health
check succeeded and reported ComfyUI reachable. Krea 2, Qwen Image Layered,
Qwen3 TTS voice clone, and Whisper were then exercised. Each generation failed
before inference because the wrapper's internal upload/free callback returned
HTTP 404. No corrupt response was promoted into the game. The host is local
configuration and is not committed.

Machine-readable evidence and fallbacks are in
`assets/source/local-api-attempts.json`. The reproducible voice tool is
`tools/gen-voice.py`; its sanitized run receipt is
`assets/source/voice/generation-attempt.json`.

Fallback decisions:

- Krea catalog tile: GPT Image 2 accepted source, optimized locally.
- Qwen Layered extraction: GPT Image 2 transparent extraction, then shared
  alpha validation.
- Voice clone / Whisper: no unverified clip shipped. The exact 19-line script
  remains in `data/lines.json`, and `shared/js/voice-clips.js` intentionally
  uses Web Speech for absent manifest entries.

## Contact-sheet cutting

Every multi-object source was cut with the required shared tool,
`tools/cut-asset-sheet.py`, with `--expected-count`, `--order reading`,
`--close-radius 0`, `--padding 18`, a retained debug mask, and `--force`.

| Sheet | Expected / accepted count | Detection setting |
| --- | ---: | --- |
| UI carriers | 12 / 12 | alpha threshold 32 |
| Reflection patches | 7 / 7 | alpha threshold 8 |
| HUD controls | 5 / 5 | alpha threshold 8 |
| Tower pieces | 5 / 5 | alpha threshold 64 |
| Garden pieces | 5 / 5 | alpha threshold 96 |
| Picnic pieces | 5 / 5 | sampled-background threshold |

The cutter's `boxes.json` receipts live beside each crop in
`assets/source/cuts/`; masks live in `assets/source/qa/`. The RGB picnic sheet
received the repository's `remove_chroma_key.py` border-key pass before alpha
QA.

## Finalization and runtime budgets

`tools/finalize-assets.py` is the reproducible build step. It normalizes the
near-opaque GPT alpha band, calls the required
`tools/pipeline/cutout_finalize.py` for every transparent asset, saves finalized
PNGs and magenta composites, then emits lossy RGBA WebP. The machine-readable
receipt is `assets/source/production-receipt.json`.

- 47 production outputs are receipted.
- Room plates: 1440×1080 WebP, quality 82, each below 310 KB.
- Transparent runtime art: WebP quality 88 with exact alpha.
- Catalog tile: 640×533 progressive JPEG, quality 88, about 98 KB.
- Runtime character poses are 104–137 KB; activity pieces are 30–62 KB.

## Audio and shared resources

| Asset | Source | License / use |
| --- | --- | --- |
| `../../shared/assets/music/mug-and-sunbeam.mp3` | QLOBE Kids shared recorded music library | Reused unmodified through `shared/js/bgm.js` |
| `../../shared/assets/refs/voice-teacher.wav` | QLOBE Kids approved teacher reference | Authoring input only; not copied into this game |
| `assets/audio/manifest.json` | `tools/gen-voice.py` output | Empty when no Whisper-verified LAN take exists |
| `data/lines.json` | Original game script | Exact Web Speech fallback text and future clone source |
| Placement and tap SFX | `shared/js/sfx.js` | Runtime WebAudio feedback; no asset file |

## Link preview

`assets/og-image.jpg` is a 1200×630 capture of the production splash. Regenerate
it with `tools/pipeline/capture_og_images.mjs` after intentional splash changes;
do not paint over it by hand.
