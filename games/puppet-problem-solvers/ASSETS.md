# Assets — Problem-Solving Puppets

All original assets CC BY 4.0 (see LICENSE-ASSETS). Provenance below.

## Reused from shared/ (no copies made)

- `shared/characters/<id>/` — bone-rig puppet art (parts, viseme heads, rig.json)
  and voice clips for bear, doggy, fox, frog, rabbit, unicorn, princess-lily,
  princess-zoe. Produced by the puppet pipeline (docs/puppet-pipeline.md).
- `shared/characters/acting-clips.json` — portable acting-clip pack authored for
  this game, shared for future theater games (2026-07-20).
- `shared/assets/ui/` — home/back/sound/play buttons.
- `shared/fonts/fredoka-latin-600-normal.woff2`.
- Sound effects are synthesized at runtime (`shared/js/sfx.js`) — no files.

## Game-local assets

| Asset | Path | Status | Provenance |
|---|---|---|---|
| Playroom backdrop | `assets/bg/playroom.png` | done | local GenAI (krea2, seed 42), 2026-07-20 |
| Playground backdrop | `assets/bg/playground.png` | done | local GenAI (krea2, seed 1337 — seed 42 rendered prompt text), 2026-07-20 |
| Splash/casting menu classroom | `assets/ui/menu-classroom-gpt-image-2.png` | done | GPT Image 2, generated from the approved UI concept as a style/composition reference; no baked UI, text, or characters, 2026-07-20 |
| Props ×12 (toy-truck, crayon, storybook, ball, drum, telescope, wagon, kite-tangled, blocks-spilled, shelf-tall, slide, swing) | `assets/props/*.png` | done | local GenAI (krea2 dark-bg seed 42 + qwen-image-layered transparent extraction), PNG-8, alpha/magenta/identity QA'd, 2026-07-20. shelf-tall regenerated empty (no baked teddy) + bg-color alpha cleanup |
| Narrator voice clips | `assets/audio/*.m4a` + `manifest.json` + `lines.json` | pending | teacher-voice clone (shared canonical ref, seed 7), transcription-QA'd |
| Hub tile | `../../assets/hub/tiles/puppet-problem-solvers.jpg` | done | local GenAI (krea2, seed 42), 640×533 JPEG, 2026-07-20 |

Until "pending" assets land, the game runs on documented fallbacks: solid-color
backdrops, tinted rounded-rect props, emoji choice cards, Web Speech narrator.
Every fallback is a config-only swap — no code changes when art lands.

Character dialogue lines (the shared 28-line catalog × 8 voices) live in
`shared/characters/<id>/voice/` — provenance logged there / in the puppet
pipeline docs, generated 2026-07-20 with per-character voice cloning +
whisper transcription QA + faster-whisper/CMUdict viseme cues.

## Supersedes

This game supersedes `games/problem-solving-puppets/` (choose-one engine with
muted mp4 vignettes + emoji cards), now `status: archived` in `games.json`.
That folder and its assets are unchanged for reference.
