# Momma Bear's Storybook — asset production ledger

This ledger covers accepted runtime assets and retained production sources. Generated
assets use QLOBE Studio recipes or adjacent source recipes; runtime files are local to
this game except for the catalog tile.

## Story provenance

The script is an original, preschool-safe adaptation of three stories in Andrew Lang's
public-domain *The Blue Fairy Book* (Project Gutenberg eBook 503), preserved locally at
`../../../01-game-concepts/momma-bear-storybook/blue-fairy-book.txt`:

- “Why the Sea Is Salt” → “The Little Mill and the Sea”
- “Felicia and the Pot of Pinks” → “Fia and the Pink Flowers”
- “The Princess on the Glass Hill” → “The Glass Hill”

The adaptations retain the source tales' memorable images while replacing death,
revenge, humiliation, coercion, and marriage-as-reward with generosity, care, calm
courage, and sharing. The exact child-facing script and adaptation policy are in
`game-design.md`.

## Visual production

| Runtime assets | Production source | Treatment and acceptance |
|---|---|---|
| `assets/backdrops/*.webp` (4) | QLOBE Studio, Krea 2 Turbo text-to-image; source PNGs and recipes in `assets/source-backdrops/` | Accepted after full-bleed landscape/portrait stage review. |
| `assets/pose-actors/{momma-bear,pip,fia,ash}/` (24 poses) | GPT Image 2 pose-sheet masters in `assets/source/pose-sheets/`; Qwen Image Layered jobs recorded in `qwen-layer-jobs.json` | Six whole-image poses per actor, assembled on a shared 1024px canvas and accepted against dark and live backdrops. Fia received a second direct chroma recut with despill; exact settings are in her pose recipe. |
| `assets/props/*.webp` (22) | GPT Image 2 prop-sheet masters and retained raw crops in `assets/source/prop-sheets/` and `assets/source/prop-crops/` | Direct chroma extraction preserved the approved masters better than redundant Layered jobs, which were cancelled before execution. The sea-sparkles correction and edge recipe are retained beside its corrected raw crop. |
| `assets/story-cards/*.webp` (3) | GPT Image 2 contact sheet, prompt, recipe, raw crops, and cutouts in `assets/source/story-cards/` | Accepted for exact story identity, blank label panels, and clean alpha on dark. |
| `assets/ui/*.webp` (12) | GPT Image 2 title, HUD, and paper-surface masters in `assets/source/ui-masters/`; runtime crops in `assets/source/ui-crops/` | All child-facing carriers and controls are raster papercraft. Direct cutouts outperformed the cancelled redundant Layered UI jobs. |
| `../../assets/hub/tiles/momma-bear-storybook.jpg` | QLOBE Studio, Krea 2 Turbo; source PNG and recipe in `assets/source/hub/` | Accepted at 640×533 after catalog-center-crop review. |
| `assets/og-image.jpg` | Real Chromium capture of the finished game | Accepted at the required 1200×630 share-card size. |

The four-screen production target is
`assets/source/ui-mockups/00-overview-v1.png`, generated with GPT Image 2 from the
approved Tiny Reader Theater and Story Stones references. It is retained as the visual
contract, not loaded at runtime. Prompts and settings for the mockup, pose sheets, prop
sheets, story cards, and UI masters remain beside their source files.

No SVG, CSS illustration, emoji, or generated vector substitute is used for primary
child-facing artwork. CSS supplies layout, focus, motion, and hit-area behavior only.

## Audio production

The accepted set contains 109 M4A clips: 78 unique tappable words, 18 complete page
lines, 3 story-completion lines, and 10 UI prompts. Production uses QLOBE Studio's
`qwen3-tts-voiceclone` workflow with the approved `teacher` voice reference and Whisper
transcript analysis. Web Speech remains a defensive runtime fallback.

- `assets/audio/manifest.json` and `assets/audio/lines.json` each contain all 109 keys.
- Every clip has an adjacent recipe recording spoken text, seed, teacher reference,
  generation steps, and transcript QA.
- Final gate: 109 complete, 102 native/context-verified, 7 documented equivalences,
  0 hard failures, 0 pending, and 0 missing.
- The only equivalences are `one`/`1`, `to`/`two`/`2`, `by`/`buy`/`bye`,
  `sea`/`see`, `whirr`/`whir`/`where`, and the isolated article
  `a`/`ay`/`hey`; the auditable list is
  `assets/source/audio/qa-overrides.json`.
- `half` was extracted from a longer exact teacher-voice take after both local and LAN
  Whisper-base returned “Half”; the retained source and timing recipe live under
  `assets/source/audio/context/` and beside the runtime clip.
- `hay` was timestamp-extracted from its accepted source line. Its recipe records the
  exact context-aware `hay` decode and separately retains the unprompted `Hey`
  homophone diagnostic; it is not represented as a hay/hey equivalence override.
- `finds` was timestamp-extracted from its exact accepted page line; both local and
  LAN Whisper-base return the isolated word exactly. Its source timing and QA remain
  in the adjacent runtime recipe.

## QA record

- Automated game validation: 4 pose actors × 6 poses, 22 props, registry wiring, and
  all declared assets.
- Real-Chromium interaction smoke: story shelf, all three six-page stories,
  beginning/middle page turns, completed-word states, completion/replay/shelf flows,
  persistence, sound controls, keyboard paths, and zero runtime console/network errors.
- Responsive visual review: 16:10 landscape and iPad Air portrait (820×1180), including
  all three page-one layouts, Fia's longest middle pages, every act turn, every page-six
  settled state, and every completion screen.
- All audited portrait primary touch targets are at least 96×96 CSS pixels.
- Independent adversarial art direction approved the final landscape, wide-short,
  and portrait evidence with no remaining blockers. Evidence is retained under
  `../../qa-shots/momma-bear-storybook/` (ignored from the public bundle).

## License and retained sources

The source stories are public domain. Generated visual and voice assets are project
assets produced through the approved local workflows; QLOBE Studio recipes record
workflow, prompt or spoken text, seed, references, derived-from fields, QA, and the
project's CC BY 4.0 asset designation where applicable. Raw sheets/crops and recipes
are intentionally retained for reproducibility and future edits.
