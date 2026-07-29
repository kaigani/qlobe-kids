# Blend Train Assets

All original art and voice for this game was generated locally on the project's
ComfyUI wrapper. Nothing is fetched at runtime: the shipped game runs entirely from its
committed files plus the shared library. Original assets are CC BY 4.0.

Generation is authoring-time only. The private LAN endpoint is deliberately not recorded
here; it lives in git-ignored `tools/state/local.json`.

## Generated for this game

**Every visual element here was lifted out of the approved UI mockups**
(`01-game-concepts/blend-train/output/ui-mockups/`) with `qwen-image-edit`, rather than
generated from scratch "in the style of" them. That is the difference between a game that
looks like the concept and a game that looks like a weaker cousin of it — see the note
below.

| Asset | Workflow | Seed | Source / prompt | License | Modifications |
|---|---|---|---|---|---|
| `assets/art/car-{m,a,t}.webp` | `qwen-image-edit` then `qwen-image-layered` | 42 | image `02-blend-mat.png`; prompt `Isolate the blue 'm' train car on a white background` (and the green `a`, red `t`) | CC BY 4.0 | Normalised to a flat magenta ground, then background removed with the async layered job (`output=layer_2`). Registered against the family median core and re-encoded 460x474 WebP q80. |
| `assets/art/car-{c,s,d,p}.webp` | `qwen-image-edit` then `qwen-image-layered` | 42 | derived from `car-m` | CC BY 4.0 | Letter-swap edit only — "Change the letter shown on the cream panel… Keep the car body, its colour, the cream panel, the gold trim, the couplers, the wheels, the lighting and the white background exactly the same." Then keyed as above. |
| `assets/art/car-{u,o,i}.webp` | as above | 42 | derived from `car-a` | CC BY 4.0 | As above. |
| `assets/art/car-{n,g,un,og,ig}.webp` | as above | 42 | derived from `car-t` | CC BY 4.0 | As above. |
| `assets/art/car-at.webp` | as above | **1337** | derived from `car-t` | CC BY 4.0 | Seed 42 rendered only the `a` and dropped the `t`; reprompted naming both letters explicitly. |
| `assets/art/track.webp` (1600×884, ~100 KB) | `qwen-image-edit` + composite | 42 | image `02-blend-mat.png`; prompt removed the locomotive, every letter car, all buttons, banners and text, keeping only the landscape and the empty rail | CC BY 4.0 | Cropped to the 1.81 play aspect keeping the rail with grass beneath, resized 1600×884; the locomotive (extracted and keyed the same way, 400px wide) composited at the left with its wheels on the rail. |
| `assets/art/splash.webp` (1280×951) | `qwen-image-edit` | 42 | image `01-title.png`; prompt removed all text, letters and the orange button, keeping the train, sunburst sky, clouds and stars | CC BY 4.0 | Resized, WebP q86. The engine renders the real title as HTML — spelling has to stay correct and an image model is not a typography engine. |
| `assets/art/mode-{couple,sounds}.webp` (420²) | derived | — | composed from the final cars | CC BY 4.0 | The mode's own cars overlapped 14% so they read as coupled, padded square for the engine's contain-fit. These exist because the engine's splash mode buttons were text-only, which a pre-reader cannot use. |
| `assets/audio/{greet,intro,prompt-couple,prompt-sounds,nudge,wait,cheer}.m4a` | `qwen3-tts-voiceclone` | 7 | Voice reference `shared/assets/refs/voice-teacher.wav`; verbatim lines in `game-design.md` §6 and `assets/audio/lines.json` | CC BY 4.0 | Model emits FLAC despite the filename; converted `afconvert -f m4af -d aac -b 64000`. Durations measured with `afinfo` into `manifest.json`. |

### Extract from the mockup; do not re-imagine it

The first production pass generated the cars from scratch with `krea2-turbo-t2i` and
composited a shared letter tile into a blank panel. It was competent and it was wrong: the
result was *adjacent* to the concept art rather than the concept art, and the shipped
screens read as a weaker version of a design that had already been approved.

Feeding the mockup itself to `qwen-image-edit` with `Isolate the <element> on a white
background` returns that element cleanly lifted, in the mockup's exact style. The whole
16-car family is then derived by editing only the **letter** on an already-extracted car,
which keeps body, couplers, wheels and panel geometry identical across the set — that
geometric consistency is what makes a row of them read as one train.

Colour carries meaning, taken from the mockup's own scheme: **blue onset, green vowel,
red coda / rime chunk**.

### Background removal: `qwen-image-layered`, and the colour it must not be

Alpha is produced with the async `qwen-image-layered` job (`output=layer_2`), never a
flood fill or colour key. An earlier pass here did flood-fill these cars and was wrong to:
it is not the house pipeline, and the reasoning behind it (a redraw might disturb geometry
the runtime depends on) was solved properly by registering the family after extraction.

**The ground colour matters more than it looks.** The sprites arrive opaque on near-white,
which the extractor handles badly, so they are normalised to a flat ground first. Doing
that in *grey* silently deleted every car's **dark grey wheels** — the extractor classifies
by description, so a subject part matching the background description is assigned to the
background. It failed identically on every seed with the body extracted perfectly, which
reads as a prompt problem and is not one; naming the wheels explicitly did not help.
Normalising to **magenta**, a colour that appears nowhere in the car palette, fixed it
immediately. Pick a ground that clashes with the whole subject.

### Registration

Each car is extracted independently, so the extractor frames and scales them slightly
differently (cores measured 355–416px wide across the 16). Cropping each to its own ink
would leave a row of cars with mismatched sizes and wheels at different heights. Instead
every car is scaled so its solid core matches the family **median** core, then cropped to
that box plus an 11% margin so roofs and wheel shadows are not clipped flush to the sprite
edge. The wheels then land on the rail together and the row reads as one train.

## Added to the shared library by this game

| Asset | Workflow | Seed | Reference | License | Modifications |
|---|---|---|---|---|---|
| `shared/assets/letter-tiles/{a,e,i,o,u}.png` (512² RGBA, ~100 KB each) | `qwen-image-edit` | 42 | image `shared/assets/refs/asset-b.png`; prompt "Change the tile colour to a bright grass green and change the letter to the white lowercase letter *x*. It must be the single lowercase alphabet letter *x*, not a punctuation mark or a quotation mark. Keep the exact same rounded-square glossy 3D tile shape, the same lighting, the same soft highlights, the same camera angle and the same white background." | CC BY 4.0 | Keyed and normalised by `finalize_tile.py`: border flood fill on white (which preserves the interior white glyph), a 4px soft rim, then the solid body re-placed in the family's exact core box **(99, 81)–(412, 417)**. |

The tile set previously had 19 consonants and 40 rimes but **no vowels at all**, so no
letter-level CVC game could be built from shared art. Green marks them as vowels, against
the existing blue-consonant / orange-rime convention.

**Blend Train no longer consumes these.** The visual pass replaced the tile-in-a-panel
composite with cars that carry their letter baked in, lifted from the mockup. The tiles
are kept anyway: they close a real gap in the shared set and unblock the next letter-level
CVC game. They are listed here as a contribution, not as a dependency, and the game's
`uses[]` no longer claims them.

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
