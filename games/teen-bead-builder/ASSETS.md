# Teen Bead Builder assets

All shipped media is committed and runs offline. Original generated sources are
retained under `assets/source/`. Original game assets and documentation are CC
BY 4.0 unless a shared asset's row states otherwise.

## GPT Image 2 claymation art

The built-in GPT Image 2 workflow produced the environment, exact-spelling
graphic title, and every primary child-facing manipulative.

| Runtime asset | Source | Processing | QA |
|---|---|---|---|
| `assets/workshop.webp` | `assets/source/clay-workshop-gpt-image-2.png` | resized to 1600 px; WebP q82 | 97 KB; calm central workspace; no text/UI/characters |
| `assets/title.webp` | `assets/source/title-chroma-magenta-gpt-image-2.png` | magenta removed with imagegen helper; alpha floor 4; tight crop + 18 px pad; resized to 1000×574; WebP q82 alpha q93 | exact “Teen Bead Builder” spelling checked at full size; alpha pass; 50.676% transparent, 0.319% partial; 75 KB |
| `assets/manipulatives/bead-{gold,coral,teal,green,blue,cream}.webp` | `assets/source/bead-atlas-chroma-gpt-image-2.png` | exact 3×2 atlas split; chroma removal; alpha floor 4; 240 px max; WebP q84 | six tactile donut beads; 8–16 KB each; every cutout passed alpha QA with 0.609–0.709% partial alpha |
| `assets/manipulatives/rack-cord.webp` | `assets/source/rack-cord-chroma-gpt-image-2.png` | chroma removal; alpha floor 4; 900 px max; WebP q84 | 60×900, 20 KB; empty cream double cord with two physical knots; alpha pass, 0.446% partial |
| `assets/manipulatives/tray.webp` | `assets/source/tray-chroma-gpt-image-2.png` | chroma removal; alpha floor 4; 900 px max; WebP q84 | 900×625, 64 KB; empty turquoise-and-cream clay tray; alpha pass, 0.276% partial |
| `assets/manipulatives/card-{orange,teal,blue}.webp` | `assets/source/card-atlas-chroma-gpt-image-2.png` | exact three-cell atlas split; chroma removal; alpha floor 4; 360 px max; WebP q84 | blank clay numeral tablets, 24–28 KB each; all alpha passes, 0.305–0.347% partial |

The environment prompt describes a full-bleed warm claymation toy workshop:
turquoise hand-formed wall, honey-birch worktable, perimeter-only clay
decorations, and an uncluttered central interaction area. It explicitly forbids
characters, number rods, central beads, text, numbers, UI, logos, and
watermarks.

The accepted title prompt requires the exact two-line text “Teen Bead Builder”
in rounded hand-sculpted clay letters, a six-bead ornament, cream outline, navy
edge, and a solid `#ff00ff` removable background. Purple/magenta are forbidden
inside the subject. The earlier green-key candidate is retained as
`title-chroma-gpt-image-2.png` but rejected: green subject letters contaminated
the first alpha extraction and it is not referenced by production.

Background removal used:

```text
remove_chroma_key.py --auto-key border --soft-matte
  --transparent-threshold 12 --opaque-threshold 220 --despill
cutout_finalize.py --max-size 1000 --pad 18 --alpha-floor 4
```

The magenta QA composite was inspected at full size; edges are continuous with
no key-color holes or fringe.

The complete prompt and retry record for the foreground correction is committed
as `assets/source/manipulative-gpt-image-2-prompts.json`. The workshop image is
the style reference: hand-shaped clay, fine fingerprint texture, softly uneven
edges, and upper-left studio light. All cutouts were inspected on magenta at
full size before integration.

Two complete-rack attempts were rejected even though their material styling was
good: the initial generation contained twelve beads, and a count-only edit
contained eleven. Neither is referenced or shipped. The accepted solution is an
empty authored cord-and-knot sprite with exactly ten authored golden bead
instances layered over it by runtime layout. Code controls the educational
quantity; bitmap art controls the visible material.

Most magenta sources use the standard auto-border matte shown above. The bead
atlas uses an explicit `#ff00ff` key with thresholds 32/100 because the sampled
near-magenta border was slightly red-dominant and falsely classified the gold,
coral, and cream clay as key-colored. The corrected matte passed all six alpha
gates without visible fringe.

## QLOBE Studio / Krea hub tile

| Runtime asset | Source/recipe | Workflow | QA |
|---|---|---|---|
| `../../assets/hub/tiles/teen-bead-builder.jpg` | `assets/source/hub-krea-seed-42.png`; `hub-krea-recipe.json` | Studio `menu-game-tile`, `krea2-turbo-t2i`, Toy Table, seed 42, 768×640 → 640×533 JPEG | Studio-accepted; no title/UI/text; recognizable golden bead grouping on one blue mat; 46 KB |

The source recipe freezes:

> A golden ten-bead bar standing beside four loose glossy counting beads on a
> small rounded blue Montessori work mat, with a tiny cream drawstring cord
> ready to bundle them; one clear recognizable base-ten building moment,
> objects only, no hands, no title, no UI.

Studio appends the proven Toy Table style suffix. Assignment into the hub tile
folder was hand-curated, as required by the template's `assignHint`.

## Recorded teacher voice

All 29 clips were produced by QLOBE Studio with
`qwen3-tts-voiceclone`, encoded to AAC/M4A with `+faststart`, and transcribed by
`whisper-stt`. Each `.m4a.recipe.json` records the text, seed, symbolic approved
teacher reference, raw transcript, normalization, and acceptance. The pack is
about 876 KB.

`assets/audio/manifest.json` stores exact durations;
`assets/audio/lines.json` is the spoken source of truth; and
`assets/audio/qa.json` is the complete per-clip report. The deterministic
`tools/finalize-audio.mjs` rebuilds all three and rejects a file outside
0.2–9 seconds or without a transcript match.

| Clip group | Count | Seeds | Transcript result |
|---|---:|---|---|
| navigation/instruction/gentle retry | 11 | 7; welcome seed 8 | 11/11 accepted; bead/beat and teen/team are homophonic Whisper spellings |
| number names 11–19 | 9 | 7 | 9/9 exact after digits 11–19 normalize to number words |
| `10 + ones = teen` celebrations | 9 | 7; nineteen seed 8 | 9/9 exact after digit/word normalization and make/makes inflection normalization |

The seed-7 welcome was rejected because Whisper heard “Take away…” rather than
the intended choice prompt. The accepted seed-8 replacement says “Pick one bead
game to play.” The first seed-7 nineteen celebration was also rejected because
the transcript dropped “and”; seed 8 preserved the complete relationship.
Rejected takes moved to Studio's recoverable, git-ignored trash.

`voice-clips.js` uses one iOS-unlocked audio element and supplies the exact
script through Web Speech when a recorded clip is unavailable.

## Interaction substrate and shared assets

| Asset | Creator/source | License | Use/modification |
|---|---|---|---|
| Responsive tray geometry, ten/ones slot guides, hit areas, drag ghost placement, animation, labels, equations, confetti | local HTML/CSS in this game | MIT code / CC BY 4.0 visual design | interaction/state substrate only; primary visible objects are the authored clay WebP assets above |
| Fredoka SemiBold | Milena Brandão & Hafontia via Fontsource | SIL OFL 1.1 | runtime text, unmodified |
| `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png` | QLOBE Kids shared UI | CC BY 4.0 | navigation and prompt replay, unmodified |
| Runtime SFX | `shared/js/sfx.js` WebAudio synthesis | N/A | no file asset |

## Link preview

`assets/og-image.jpg` is a generated 1200×630 screenshot of the game's own
splash. Regenerate it with
`node tools/pipeline/capture_og_images.mjs --only teen-bead-builder --force`;
do not retouch it.
