# Post Office Letters — asset sources and provenance

All original game art and narration are CC BY 4.0. Code is MIT. No model or
asset host is contacted by the shipped game.

## Production lifecycle

```text
approved game design and verbatim voice script
→ GPT Image 2 visual-system anchor and production sources
→ Qwen Image Layered `layer_2` extraction for cutouts
→ deterministic alpha trim / pad / resize / quality-84 WebP encode
→ full-size and magenta visual QA
→ Qwen3 teacher-voice clone
→ AAC/M4A packaging and Whisper transcript QA
→ runtime manifest, validator, and browser screenshots
```

Machine-specific LAN host and local voice reference paths come only from the
git-ignored `tools/state/local.json`; they are never committed or printed.

## Original art

| Runtime/source asset | Production source | Processing | License |
| --- | --- | --- | --- |
| `assets/source/gpt-image-2/ui-anchor.png` | Codex built-in GPT Image 2 workflow; prompt in `PROMPTS.md` | retained 1448×1086 visual north star; not shipped directly | CC BY 4.0 |
| `assets/backgrounds/post-office.webp` | `assets/source/gpt-image-2/post-office-plate.png`, precise edit of anchor | opaque WebP encode; full-size visual QA | CC BY 4.0 |
| `assets/ui/title.webp` | `assets/source/gpt-image-2/title.png` | Qwen Image Layered `layer_2`; alpha finalize; spell-checked “Post Office Letters”; transparent WebP | CC BY 4.0 |
| `assets/props/envelope.webp` | `assets/source/gpt-image-2/envelope.png` | Qwen Image Layered `layer_2`; alpha finalize; transparent WebP | CC BY 4.0 |
| `assets/props/stamp-heart.webp` | `assets/source/gpt-image-2/stamp-heart.png` | Qwen Image Layered `layer_2`; alpha finalize; transparent WebP | CC BY 4.0 |
| `assets/props/stamp-moon.webp` | `assets/source/gpt-image-2/stamp-moon.png` | Qwen Image Layered `layer_2`; alpha finalize; transparent WebP | CC BY 4.0 |
| `assets/props/stamp-rainbow.webp` | `assets/source/gpt-image-2/stamp-rainbow.png` | Qwen Image Layered `layer_2`; alpha finalize; transparent WebP | CC BY 4.0 |
| `../../assets/hub/tiles/post-office-letters.jpg` | Krea 2 `menu-game-tile`, seed 42; source and recipe in `assets/source/krea2/` | direct 640×533 6:5 resize; no title/UI baked in | CC BY 4.0 |
| `assets/og-image.jpg` | real game splash | `capture_og_images.mjs`; no hand retouching | CC BY 4.0 |

Generated masters are intentionally retained under `assets/source/`. Layered
outputs and saturated-magenta alpha checks remain under `assets/source/layered/`
and `assets/production/`.

## Shared original art

- `../../shared/characters/{maya,leo,nia,sam,ravi}/portrait.png` — adopted QLOBE
  cast portraits, locally generated, transparent raster, CC BY 4.0. Used as
  sender and pickup customers without copying or restyling.
- `../../shared/assets/ui/` — platform navigation/play imagery, CC BY 4.0.
- Fredoka font via `../../shared/css/base.css`, SIL Open Font License.

## Narration and sound

- `assets/audio/lines.json` is the verbatim script.
- `assets/audio/*.m4a` — local `qwen3-tts-voiceclone`, using the approved
  rights-cleared teacher reference configured by the authoring environment.
  When macOS privacy controls make that external file unreadable, the pipeline
  uses the existing rights-cleared QLOBE teacher performance in
  `games/kindness-delivery/assets/audio/bunny-invite.m4a` as its AI voice source;
  seeds and Whisper results are recorded in `assets/audio/qa.json`.
- `assets/audio/manifest.json` — decoded duration and version/hash metadata.
- Production result: 35/35 lines accepted at seed 7; Whisper normalized-match
  minimum 0.931 and mean 0.989; 134.893 seconds of decoded narration total.
- `shared/js/sfx.js` provides synthesized tactile feedback at runtime.
- `../../shared/assets/music/mug-and-sunbeam.mp3` — shared original QLOBE
  background music, played quietly and ducked beneath narration, CC BY 4.0.
- Web Speech is the correct fallback through `shared/js/voice-clips.js`.

No AI-generated audio is accepted solely because a file exists. Material
transcript mismatches are retried with seeds 8/9 or omitted in favor of the
correct device-speech fallback.
