# Blend Train Assets

All original art and voice for this game was generated locally on the project's
ComfyUI wrapper. Nothing is fetched at runtime: the shipped game runs entirely from its
committed files plus the shared library. Original assets are CC BY 4.0.

Generation is authoring-time only. The private LAN endpoint is deliberately not recorded
here; it lives in git-ignored `tools/state/local.json`.

## Generated for this game

| Asset | Workflow | Seed | Prompt / reference | License | Modifications |
|---|---|---|---|---|---|
| `assets/art/track.webp` (1600×700, 45 KB) | `krea2-turbo-t2i` at 1536×672, then a deterministic composite | 42 | "A cheerful sunny toy railway landscape seen from the side… wide empty railway track with wooden sleepers running straight across the lower third… The centre of the picture is calm, open and uncluttered with no objects on the track." | CC BY 4.0 | Locomotive cutout flipped horizontally and composited in at the left (380px wide, right edge x=396, baseline y=558) so it faces the direction of travel and its coupler meets the first car. Encoded WebP q86. |
| `assets/art/car-blue.webp` (512², 22 KB) | `krea2-turbo-t2i` | **1337** | "A single toy train wagon seen directly from the side… Its side is one very large blank SQUARE cream-white signboard panel with softly rounded corners… completely empty and plain" on flat dark charcoal | CC BY 4.0 | Background keyed with `cut_dark.py` (border flood fill on the charcoal ground), downscaled 1024→512, WebP q90. |
| `assets/art/car-green.webp` (512², 22 KB) | derived | — | derived from `car-blue` | CC BY 4.0 | Hue rotation of the saturated blue body to 110°, `recolor_car.py`. Cream panel, grey wheels and gold couplers fall outside the hue window and are untouched. |
| `assets/art/car-orange.webp` (512², 22 KB) | derived | — | derived from `car-blue` | CC BY 4.0 | Hue rotation to 28°, as above. |
| `assets/art/splash.webp` (1200×900, 54 KB) | `krea2-turbo-t2i` at 1536×1152 | 42 | "A cheerful little red toy steam locomotive pulling three empty colourful wagons… Each wagon has a large blank cream-white signboard panel on its side with nothing written on it." | CC BY 4.0 | Resized, WebP q85. |
| `assets/art/mode-couple.webp`, `assets/art/mode-sounds.webp` (384², ~20 KB each) | derived | — | composed from `car-*.webp` + the shared letter tiles | CC BY 4.0 | Deterministic composite: the mode's own cars rendered at the runtime inset offsets, overlapped 6% so they read as coupled, padded to a square canvas so the engine's contain-fit centres them. These exist because the engine's splash mode buttons were text-only, which a pre-reader cannot use. |
| `assets/audio/{greet,intro,prompt-couple,prompt-sounds,nudge,wait,cheer}.m4a` | `qwen3-tts-voiceclone` | 7 | Voice reference `shared/assets/refs/voice-teacher.wav`; verbatim lines in `game-design.md` §6 and `assets/audio/lines.json` | CC BY 4.0 | Model emits FLAC despite the filename; converted `afconvert -f m4af -d aac -b 64000`. Durations measured with `afinfo` into `manifest.json`. |

### Why the cars were keyed rather than run through `qwen-image-layered`

The platform standard for transparent cutouts is generate-on-charcoal then extract with
`qwen-image-layered`. That was used for the **locomotive**, which has near-black parts
(funnel, wheels) touching the ground that a dark key would eat.

It was deliberately **not** used for the cars. The extractor is a *generative
decomposition* — a faithful redraw, not a crop — and the letter tile is composited into
the car's cream panel at fixed fractional coordinates that all three cars share. A redraw
would give each colour a slightly different panel, so no single inset offset could be
correct for all of them. A border flood fill on the flat charcoal ground is exact, and the
cars have no near-charcoal colours, so it is safe here.

## Added to the shared library by this game

| Asset | Workflow | Seed | Reference | License | Modifications |
|---|---|---|---|---|---|
| `shared/assets/letter-tiles/{a,e,i,o,u}.png` (512² RGBA, ~100 KB each) | `qwen-image-edit` | 42 | image `shared/assets/refs/asset-b.png`; prompt "Change the tile colour to a bright grass green and change the letter to the white lowercase letter *x*. It must be the single lowercase alphabet letter *x*, not a punctuation mark or a quotation mark. Keep the exact same rounded-square glossy 3D tile shape, the same lighting, the same soft highlights, the same camera angle and the same white background." | CC BY 4.0 | Keyed and normalised by `finalize_tile.py`: border flood fill on white (which preserves the interior white glyph), a 4px soft rim, then the solid body re-placed in the family's exact core box **(99, 81)–(412, 417)**. |

The tile set previously had 19 consonants and 40 rimes but **no vowels at all**, so no
letter-level CVC game could be built from shared art. Green marks them as vowels, against
the existing blue-consonant / orange-rime convention.

Family match, measured against `m.png`: opaque 38.0% vs 37.9%, content bbox identical to
within 1px. The soft edge band is slightly tighter than the family's (1.5% vs 3.6%) —
crisper, not mismatched.

## Rejected candidates and lessons

1. **Vowels `e`, `i`, `o`, `u`, first batch — all four rendered a double-quote glyph.**
   Not a model failure: the prompt was nested inside `bash -c '…'` and the shell mangled
   the quoted letter before it ever reached the API. Fixed by moving generation into a
   script file (`gen_vowels.sh`). Worth remembering — the output looked exactly like the
   documented "wrong glyph" failure mode and would have burned several seed retries.
2. **First car (`car-base`, seed 42) — rejected on composition, not quality.** Its cream
   panel was a wide landscape rectangle, so a square letter tile would have sat small in
   the middle with dead cream either side. Re-prompted for an explicitly SQUARE panel;
   seed 1337 gave the squarest panel and the better body proportions.
3. **`prompt-couple` v1 — "Couple the cars. First the sound, then the ending."**
   Whisper QA (`model_size=small`, `language=en`) heard *"couple of the cars"*: the clone
   inserted a word. Rather than reroll the seed, the line was rewritten to
   *"First the sound, then the ending. Put them together!"* — which also drops "couple" as
   a verb, advanced vocabulary for a five-year-old. Re-QA transcribes it exactly.
4. **Locomotive orientation.** Generated facing right, which would have trailed its cars
   leftward, against reading order. Flipped horizontally during the composite.

## Voice QA

Every generated clip was transcribed with `whisper-stt` (`model_size=small`,
`language=en`) and compared to the intended line. **7/7 match** after the fix in note 3.

Phonemes and celebration words are **not** generated for this game — they are shared
recordings resolved at runtime through the engine's clip-ref grammar:

| ref | resolves to |
|---|---|
| `letter:m`, `letter:at`, … | `shared/assets/audio/fragments/` (63 clips: every letter and every rime) |
| `cheer:mat`, `cheer:cat`, … | `shared/assets/audio/celebrate/` |

Forking the platform teacher voice for sounds that already exist would have been the
wrong call; the clip-ref grammar exists precisely so a game can reuse them.

## Shared runtime assets

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| Fredoka SemiBold (`shared/fonts/fredoka-latin-600-normal.woff2`) | https://fonts.google.com/specimen/Fredoka via Fontsource | Milena Brandao & Hafontia | SIL OFL 1.1 | No | Reused unmodified |
| HUD buttons (`shared/assets/ui/btn-*.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused unmodified |
| Consonant + rime tiles (`shared/assets/letter-tiles/{m,c,s,d,p,t,n,g,at,un,og,ig}.png`) | Shared QLOBE Kids library | Generated for this project | CC BY 4.0 | No | Reused unmodified via `shared:letter-tiles/<x>.png` |
| Teacher voice reference (`shared/assets/refs/voice-teacher.wav`) | Shared QLOBE Kids library | Designed with `qwen3-tts-voicedesign` | CC BY 4.0 | No | Used as the clone reference only; not shipped in this game |
| Sound effects | Synthesised at runtime (`shared/js/sfx.js`, WebAudio) | N/A | N/A | N/A | No sourced audio |
| Web Speech voices | Device built-in, via `shared/js/speech.js` | N/A | N/A | N/A | Fallback only — every line has recorded audio |

## Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Screenshot of this game's splash (1200×630) via `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand |

## Hub tile

`assets/hub/tiles/blend-train.jpg` is **hand-curated by the project owner** and was not
touched by this production pass.
