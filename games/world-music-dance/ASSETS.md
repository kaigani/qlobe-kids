# Asset Log — World Music Dance (festival-night rebuild, 2026-07-29)

Art world: Paper Garden — festival night variant (ink-blue cardstock night,
cut-paper collage, paper-lantern motif). All generation ran on the project's
local ComfyUI wrapper (host configured via `QLOBE_QWEN_URL` /
`tools/state/local.json`; never committed). Prompts, seeds, and retry history:
`assets/source/PROMPTS.md`, `assets/source/gen/seed-state.json`, and the
rejected takes kept alongside the accepted sources under `assets/source/gen/`.

## Generated art (all CC BY 4.0, created for this game)

| Asset | Pipeline | Source & seeds | Post-processing |
|---|---|---|---|
| `assets/bg/map-night.webp` (2048×1280, 134 KB) | krea2-turbo-t2i | `gen/scenes/map-night.png`, seed 42 | WebP q76 |
| `assets/bg/stage-night.webp` (1600×1200, 89 KB) | krea2-turbo-t2i | `gen/scenes/stage-night.png`, seed 42 | WebP q76 |
| `assets/ui/title.webp` (1004×454, 89 KB) | krea2-turbo-t2i → local chroma key | `gen/ui/title-lockup.png`, seed 1337 (seed 42 rejected: rainbow ground) | corner-sampled distance key, median despeckle, component filter ≥1200 px, alpha-trim, WebP q88; spelling visually verified at full size |
| `assets/ui/card-backing.webp` (512×708, 34 KB) | krea2-turbo-t2i → qwen-image-layered (layer_2) | `gen/ui/card-backing.png`, seed 42 | alpha-trim, WebP q88 |
| `assets/ui/lantern.webp` (320×372, 31 KB) | krea2-turbo-t2i → qwen-image-layered | `gen/ui/lantern.png`, seed 42 | alpha-trim, WebP q88; runtime-tinted per culture accent |
| `assets/pose-actors/<culture>/` ×6 (5 poses each, WebP q90, ~81–240 KB/pose) | krea2 identity master → qwen-image-edit charcoal re-ground → qwen-image-edit pose derives (from re-grounded neutral) → qwen-image-layered cutouts → `tools/pipeline/pose_actor_assemble.py` (canvas 1024, maxArt 900, baseline 972, shared scale) | masters seed 42 (india, ghana, mexico) / 1337 (brazil, japan, ireland — rerolled for open eyes); derives seed 42; ghana move-3 seed 9001 (42: literal ring artifact, 1337: literal beach ball); cutouts seed 42, retries seed 1337 (ghana-celebrate subject deletion; mexico ×4 kept background) | magenta-composite alpha QA on every cutout, per-culture contact strips in `gen/contact/` |

Pose remediation (2026-07-30): Ghana `neutral`, `move-1`, `move-2`,
`move-3`, and `celebrate`; Ireland `move-1`; Japan `move-1`; Mexico
`neutral` and `move-1`; and India `move-3` were recreated with GPT Image 2
on neutral grey to correct style, missing-limb, extra-limb, and anatomy
defects. Each accepted source then ran through the local
`qwen-image-layered` async workflow (seed 42, `layer_2`) with an explicit
complete-full-body retention prompt and was assembled to 1024×1024
transparent WebP q90. Ireland `move-1` required a second GPT Image 2 source
pass adding a thin pale paper edge around the black shoes before Qwen would
retain both complete legs and shoes. All 30 final WebPs passed dimension,
manifest, alpha-range, nonempty-bounds, and edge-clearance validation; the
five affected culture contact sheets were visually reviewed.

Dancer roster (original characters, no real-person likeness): India — Kathak
girl (marigold/pink lehenga); Brazil — samba girl (yellow/green carnival
dress); Japan — Bon Odori child (indigo yukata, uchiwa fan); Ghana — Kpanlogo
child (kente wrap); Mexico — folklórico girl (fuchsia ribbon dress); Ireland —
step-dance child (green celtic dress).

## Music

All six songs are **original compositions authored as note data** in
`js/songs.js` (no external melodies, license-clean by construction), played at
runtime by `shared/js/music.js` on the shared instrument samples
(`shared/assets/instruments/`, provenance recorded there / my-puppet-band).
Culture flavor comes from scale, rhythm, and tempo choices documented per-song
in `js/songs.js` comments. Per-culture `band` arrays in `config.json` name
preferred world-instrument samples with `bandFallback` mapping onto the
existing 12 shared samples; the game resolves at boot against
`music.instrumentIds()` so it ships correctly with or without new samples.
LTX-generated world-instrument one-shot candidates (experiment, 2026-07-29)
live under `assets/source/gen/instruments/` with waveform QA
(`final/waveforms.png`): most candidates rendered as rhythmic phrases rather
than single hits; tabla-a / djembe-a / koto are plausible one-shots but ship
NOTHING unheard — the game runs on `bandFallback` (the proven shared 12) until
a human auditions and merges accepted samples into
`shared/assets/instruments/`.

## Voice

45 recorded teacher-voice lines: `qwen3-tts-voiceclone` against the shared
rights-cleared reference (`shared/assets/refs/voice-teacher.wav`), seed 7
(retries 8/9), each transcribed with `whisper-stt` (model small, language en)
and compared to the script in `game-design.md`. Three loanword greetings
(greet-brazil/ghana/mexico) initially mismatched on spelling; re-verified
exact with a loanword-biased whisper `initial_prompt` and accepted (log:
`assets/source/voice/qa-transcripts.json`). FLAC sources under
`assets/source/voice/`; runtime AAC 64k `+faststart` m4a in `assets/audio/`
with `manifest.json` durations; `data/lines.json` carries the Web Speech
fallback text for every key.

## Shared / reused

| Asset | Source | License | Notes |
|---|---|---|---|
| Fredoka SemiBold (`shared/fonts/`) | Google Fonts via Fontsource | SIL OFL 1.1 | display font |
| HUD buttons (`shared/assets/ui/btn-home.png`, `btn-back.png`) | shared QLOBE library | CC BY 4.0 | splash home / in-game back |
| Instrument samples (`shared/assets/instruments/`) | project-owner recordings (see my-puppet-band ASSETS.md) | project | WebAudio band engine |
| SFX | `shared/js/sfx.js` WebAudio synthesis | n/a | zero-file |
| New shared module `shared/js/stage/pose-conductor.js` | written for this game | MIT | reusable pose-actor ↔ beat bridge |

## Link preview (og:image)

`assets/og-image.jpg` — regenerate with `node tools/pipeline/capture_og_images.mjs`
after splash changes; do not hand-edit.
