# Asset provenance & regen recipes

QLOBE Kids keeps no asset database and no version-pinning graph. Provenance is a
**convention**, backed by git history and the validators + usage index (see
`docs/qlobe-studio-v2.md` §6.4, §8). This doc states the one rule that is easy to
get wrong: generated media that is not committed must be regenerable from its own
pack.

## The four provenance trails (all already in use)

1. **Committed sources.** Finals reference the source tree they were cut from
   (`games/<id>/assets/source/`, `../00-reference/puppet parts/<id>/`). The
   source stays in git.
2. **`ASSETS.md` per game.** Every game logs each asset's source, processing, and
   license (originals are CC BY 4.0). The validator warns when `ASSETS.md` is
   missing.
3. **Machine-readable regen recipes** — the rule below.
4. **Staged raws are never overwritten.** Each derivative is a new file that knows
   its source; a later pipeline stage never clobbers an earlier one.

**`games/<id>/assets/og-image.jpg` is generated, not drawn.** It is the 1200×630
link-preview shot of that game's own splash screen, produced by
`tools/pipeline/capture_og_images.mjs` against a locally served copy of the repo
(the tool rejects a blank render rather than writing a grey rectangle). It is
committed, logged in the game's `ASSETS.md`, CC BY 4.0 like the art it shows, and
pointed at by the game's `og:image` meta and by the Studio Games workspace.
Regenerate it with the tool — never retouch it by hand:
`node tools/pipeline/capture_og_images.mjs --only <id> --force`.

## The regen-recipe rule

> Generated media that is **not committed** to the repository must carry a
> machine-readable regen recipe in its **owning pack**, of the form:
>
> ```json
> { "workflow": "...", "prompt": "...", "seed": 42,
>   "width": 1344, "height": 768, "steps": 8, "cfg": 1 }
> ```

The recipe lives beside the thing it produces, inside the pack document, so the
image bytes need not be committed: anyone can regenerate the exact asset from the
pack alone against the LAN ComfyUI wrapper (host injected at launch, never
committed — see the `local-genai` skill).

### Worked example — `qlobe-story-pack` v2

`games/story-stones/story-pack.json` is the canonical pattern this rule is
promoted from. Each of its 220 stories stores the recipe for its backdrop inline,
so the 220 scene images are reproducible without committing them:

```json
"setting": {
  "label": "Sunlit Meadow",
  "backdrop": "assets/backdrops/....webp",
  "prompt": "<verbatim Krea 2 prompt>",
  "workflow": "krea2-turbo-t2i",
  "width": 1344, "height": 768, "steps": 8, "cfg": 1
}
```

`tools/validate-story-stones.mjs` (the story-stones authority validator, wrapped
by `tools/validate/validators/story-pack.mjs`) checks every recipe's shape, and
`--assets` re-verifies the produced images decode at the recipe's dimensions.

## Where recipes belong per format

| Format | Recipe location |
|---|---|
| `qlobe-story-pack` | each story's `setting` block (prompt/workflow/dims/steps/cfg) |
| `qlobe-prop-pack` / `qlobe-pose-actor` | a `regen` block on the prop/pose, or the pack's `ASSETS.md` row when the media is committed |
| `qlobe-character` (rig art) | committed under `parts/` + `anim/`; intermediates in `../00-reference/puppet parts/<id>/` |
| `qlobe-voice-pack` | cue metadata records the `aligner`; voice audio is committed (m4a), so a recipe is not required |

Committed media does not need a recipe — `ASSETS.md` covers it. The recipe rule
applies specifically to the media the repo deliberately does **not** carry.

## Shared-asset repairs (editing something already in `shared/`)

`shared/assets/` is normally hands-off for a single game's build (CLAUDE.md).
When a game's own polish process surfaces a genuine defect in a **canonical**
shared asset — not new content, a fix to something already shipping — and the
user explicitly approves touching `shared/` for it, the provenance trail is
the same as any other asset, just logged in the *fixing* game's `ASSETS.md`
rather than a new game's:

- The precedent: `games/flashlight-cave/ASSETS.md` §"Shared-asset repair —
  Stage 6" re-exported 9 of `shared/assets/objects/`'s truecolour-RGB (no
  alpha) sprites with `qwen-image-layered`, after a screenshot caught one of
  them rendering as a solid white box on a dark background. 7 of 9 were fixed
  and shipped **directly to the shared file**; 2 (`cat`, `van`) exhausted the
  full retry ladder and were left unmodified rather than shipped as a
  redrawn-and-wrong asset — logged as failures, not silently dropped.
- Keep the pre-fix original somewhere reversible — that game's
  `assets/source/<...>-originals/` is the convention — even though the
  shared file itself is what changed.
- Note in the fixing game's `ASSETS.md` which *other* games/consumers of the
  shared asset benefit automatically (found via `shared/js/content.js` and
  `shared/data/*.json` cross-references, or a repo-wide grep for the asset
  path) — they don't need their own edit, but they do need a mention so a
  later reader knows why their output changed without a commit to their own
  folder.
