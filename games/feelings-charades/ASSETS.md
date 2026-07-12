# Asset Log — Feelings Charades (polished remake)

First game through `docs/polish-process.md`. Story Screen art world.

## Generated assets (local pipelines, CC BY 4.0, no attribution required)

| Asset | Pipeline | Modifications |
|---|---|---|
| `assets/bg.jpg` — sky/hills backdrop | text-to-image | 1600×1200 JPEG q82 |
| `assets/cards/{happy,proud,frustrated,excited,sad,calm,worried,shy}.png` — posed cast demonstrators | identity-preserving image-edit from `shared/characters/*/portrait.png` → dark-bg → layered extraction | trimmed, 512px, PNG-8 |
| `assets/video/*.mp4` ×8 — demo vignettes | reference-conditioned video (neutral-pose cast refs), per-clip quality gate | cropped, 720px, h264 crf28, muted, 132–464KB (1.7MB total) |
| `assets/badge-sun.png` — Well done! badge | text-to-image → extraction | trimmed, 440px, PNG-8 |
| `assets/audio/*.m4a` + `manifest.json` + `lines.json` — recorded teacher voice (~87 clips) | voice-clone per script line, every clip transcription-QA'd | AAC 64k m4a |
| `assets/audio/intro.viseme.json` — Ravi splash lip-sync | Rhubarb Lip Sync from the intro clip | — |

Production lessons recorded: the `sad` vignette needed a retry with explicit
motion beats (head drop + eye wipe) — subtle "low energy" emotions need
concrete physical actions in the prompt, not adjectives.

## Shared runtime assets

| Asset | Source | License |
|---|---|---|
| Fredoka SemiBold (`shared/fonts/`) | Google Fonts via Fontsource | SIL OFL 1.1 |
| UI buttons (`shared/assets/ui/btn-{home,back,sound}.png`) | Shared QLOBE Kids library | CC BY 4.0 |
| Cast portraits + mouth rigs (`shared/characters/`) | Shared QLOBE Kids library | CC BY 4.0 |
| Sound effects | Synthesized at runtime (`shared/js/sfx.js`) | — |
| Web Speech fallback voice | Device built-in via `shared/js/speech.js` | — |

## Assets needed

- None blocking. Nice-to-have: viseme timelines for all host lines (only the
  splash intro is synced today).
