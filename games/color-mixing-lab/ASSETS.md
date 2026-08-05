# Color Mixing Lab — asset provenance

All model calls are authoring-time only. The shipped game is a static site and
makes no game-specific runtime request to a model, LAN service, asset CDN,
camera, microphone, or persistence service. Like every QLOBE page, it loads the
repository's shared analytics shim; art, audio, code, and fonts are all local.

## Runtime art

| Runtime asset | Production source | Finalization | License |
| --- | --- | --- | --- |
| `assets/lab-splash.webp`, `assets/lab-play.webp` | Original OpenAI `gpt-image-2` Field Journal watercolor environment plates | selected masters encoded WebP; each is under 300 KB | CC BY 4.0 |
| `assets/title.webp` | Original `gpt-image-2` exact-spelling title on a flat magenta plate | local color-distance matte, alpha trim/QA, 900×345 WebP | CC BY 4.0 |
| `assets/ui/mode-{discover,predict,recipe}.webp` | Original coordinated `gpt-image-2` three-card contact sheet | precise background-only chroma edit, deterministic equal-cell crop, local matte, alpha QA, WebP | CC BY 4.0 |
| `assets/flasks/{red,yellow,blue,empty}.webp` | Original coordinated `gpt-image-2` four-flask contact sheet | same inspected contact-sheet pipeline | CC BY 4.0 |
| `assets/beakers/{empty,orange,green,purple}.webp` | Original coordinated `gpt-image-2` four-beaker contact sheet | same inspected contact-sheet pipeline | CC BY 4.0 |
| `assets/mascots/{orange,green,purple}.webp` | Original coordinated `gpt-image-2` droplet-friend contact sheet | same inspected contact-sheet pipeline | CC BY 4.0 |
| `assets/effects/stream-{red,yellow,blue}.webp` | Original coordinated `gpt-image-2` pour-stream contact sheet | same inspected contact-sheet pipeline | CC BY 4.0 |
| `assets/effects/swirl-{orange,green,purple}.webp` | Original coordinated `gpt-image-2` watercolor-vortex contact sheet | same inspected contact-sheet pipeline | CC BY 4.0 |
| `../../assets/hub/tiles/color-mixing-lab.jpg` | QLOBE Studio `menu-game-tile`, `krea2-turbo-t2i`, Toy Table style, seed 1337 | accepted 768×640 Studio result center-cropped/resized to 640×533 JPEG | CC BY 4.0 |
| `assets/og-image.jpg` | Screenshot of the final game splash from the repository OG pipeline | regenerate after final production capture; never hand-edit | CC BY 4.0 |

The nine OpenAI source prompts and the exact common background-edit instruction
are recorded in `assets/source/gpt-image-2/prompts.json`. Original masters,
edited chroma plates, and derived alpha sheets remain beside that log. The
repeatable crop/finalize/encode path is `tools/process-assets.py`; per-object
crop boxes, alpha histograms, dimensions, sizes, steps, and QA status are in
`assets/source/processing.json`. Per-cell slices, raw mattes, final PNG masters,
and magenta QA plates are reproducible working files and are intentionally not
shipped; rerunning `tools/process-assets.py` recreates them from the retained
full-sheet sources and alpha sheets.

### Local cutout decision

The intended Qwen Image Layered path remains available as
`tools/process-assets.py --method qwen-layered`, but its direct artwork upload
was not authorized by the execution safety gate during this production run.
The selected result therefore uses the installed imagegen chroma helper on
flat `#ff00ff` background-only edits: hard RGB color-distance tolerance 60,
one-pixel edge contraction, and 0.5-pixel feathering. This is not flood fill.

A soft despill candidate was visually rejected because it interpreted orange,
purple, and cream watercolor pigment as key color and damaged the authored
art. The hard-distance result preserves those colors; all 20 final objects pass
the repository alpha finalizer and were inspected over transparent and light
grounds. The title uses the same local chroma/finalizer family; its chroma
source and 900×345 runtime WebP are retained while its reproducible working
alpha/PNG/QA files follow the same non-shipping policy.

### Hub tile

The accepted Studio source and recipe live at `assets/source/hub/`. Its exact
subject is preserved by the recipe:

```text
A red toy paint flask and a yellow toy paint flask pouring together into one
clear mixing beaker that glows orange, while one blue paint flask stands
upright behind them and a single tiny smiling orange color droplet watches
beside the beaker; one scientifically clear red-plus-yellow experiment,
staged as objects on a soft pale-blue tabletop, no hands.
```

The first seed-42 composition incorrectly implied that all three primaries were
being mixed. It was rejected and is retained with its recipe under
`assets/source/hub/rejected-v1/`. The accepted seed-1337 recipe has
`qa.status: accepted`.

## Recorded teacher voice

`tools/generate-voice.py` sends the exact 33 strings from
`assets/audio/lines.json` through QLOBE Studio’s allow-listed
`character-voice-line` template. Studio uses `qwen3-tts-voiceclone` with the
rights-cleared synthetic platform teacher reference, encodes AAC, and runs
Whisper. The game applies a strict normalized transcript/word-coverage gate,
uses seeds 7→8→9 only on rejection, normalizes accepted delivery to mono 24 kHz
AAC at 96 kb/s, and writes `assets/audio/manifest.json`.

All 33 final clips passed. Four seed-7 takes were rejected and preserved:

- `welcome`: “take an experiment” instead of “pick an experiment”;
- `mode-recipe`: “meets” instead of “needs”;
- `discover-red-yellow`: “poor” instead of “pour”;
- `pour-yellow`: “YOLO” instead of “yellow”.

Seed 8 passed for those four. `assets/audio/qa.json` is the aggregate evidence;
every candidate AAC, Studio recipe, and Whisper transcript is retained under
`assets/source/voice/candidates/`. Only accepted clips enter the runtime
manifest. If a clip ever fails to load, `shared/js/voice-clips.js` speaks the
same exact line as a safe fallback.

## Shared runtime resources

| Resource | Source | License / use |
| --- | --- | --- |
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | Fontsource / Google Fonts; Milena Brandão and Hafontia | SIL OFL 1.1; reused unmodified |
| HUD PNGs (`shared/assets/ui/btn-{home,back,sound,play}.png`) | QLOBE Kids shared authored library | project asset, CC BY 4.0 |
| Screen, HUD, drag, audio, timer, RNG, celebration, and debug modules | QLOBE Kids shared source | MIT |
| Pour/glug and interaction accents | local Web Audio plus `shared/js/sfx.js` | synthesized at runtime; no external recording |

## License

Game-specific generated art and audio are project assets released under the
repository’s CC BY 4.0 asset license. Code is MIT. No third-party artwork was
copied or embedded; the concept mockups used as the visual north star are part
of this repository.
