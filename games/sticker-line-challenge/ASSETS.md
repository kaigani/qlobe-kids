# ASSETS — Sticker Line Challenge

All art was generated locally for this game (ComfyUI wrapper on the LAN;
workflows, prompts, and seeds are recorded in `tools/gen_images.sh` and the
raw sources retained under `assets/source/`). No third-party or scraped
material. Original assets are CC BY 4.0; code MIT.

## Backdrops (opaque JPEG, 1600×1200, ≤300 KB)

| file | workflow | seed | source |
| --- | --- | --- | --- |
| `bg-splash.jpg` | `krea2-turbo-t2i` | 42 | `assets/source/bg-splash.png` |
| `bg-play.jpg` | `krea2-turbo-t2i` | 42 | `assets/source/bg-play.png` |
| `bg-end.jpg` | `krea2-turbo-t2i` | 42 | `assets/source/bg-end.png` |

Style: layered cut-paper papercraft collage (canonical art-world label
**Papercraft**, legacy runtime slug `paper-garden`). Postprocess: resize to
1600×1200 + progressive JPEG q82 (see `tools/postprocess.py`).

## Transparent sprites (WebP/PNG with alpha)

Generated on flat charcoal via `krea2-turbo-t2i` (seed 42, seed 1337 for the
page retry), separated with `qwen-image-layered` (async, layers=2, `layer_2`
output), alpha-trimmed, resized, encoded by `tools/postprocess.py`. Alpha QA
composites over magenta live in `qa-shots/sticker-line-challenge/`.

| runtime file | source | notes |
| --- | --- | --- |
| `page.webp` | `source/page-v2.png` → `source/layered/page-layer2.png` | landscape notebook sheet; seed 1337 (seed 42 drew a portrait sheet) |
| `title.webp` | `source/title.png` (ideogram4-t2i, seed 42) → layered | lettering spell-checked letter-by-letter |
| `cards/wave.webp` `zigzag.webp` `loop.webp` | `source/card-*.png` → layered | mode cards |
| `buddies/star.webp` `rainbow.webp` `heart.webp` `flower.webp` | `source/buddy-*.png` → layered | buddy stickers, trail stamps, checkpoint stars |
| `ui/banner-green.webp` `banner-pink.webp` | `source/banner-*.png` → layered | blank paper banners; HTML text on top |
| `ui/dash.png` `ui/blob.png` | `source/dash.png` `source/blob.png` | small utility sprites; luminance-keyed from the charcoal background (feathered), QA composited |

## Shared assets reused

- `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png` (HUD buttons)
- `shared/assets/music/whimsical-toy-workshop.mp3` (BGM via `shared/js/bgm.js`)
- `shared/css/base.css`, `hud.css`, `screens.css`; Fredoka display font

## Voice

`assets/audio/*.m4a` — intended to be generated with `qwen3-tts-voiceclone`
from the platform teacher reference (seed ladder 7→8→9), FLAC→AAC, then
transcript-QA'd with `whisper-stt` by `tools/gen_audio.sh` (resumable).
At the time of the build pass the local voiceclone workflow was returning
connection resets; the game ships with the `voice-clips.js` Web Speech
fallback until the batch can run. `manifest.json` / `lines.json` follow the
platform voice-pack format.

## Hub tile

`assets/hub/tiles/sticker-line-challenge.jpg` (640×533) predates this pass,
follows the hub's toy-object grammar, and is curated separately — unchanged.
