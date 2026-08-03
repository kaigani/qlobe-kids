# Clay Physics Lab Assets

These assets exist only for the research pages under this directory. They are
not promoted to `shared/assets/` or a production game.

## `assets/matcap-clay-study.png`

- **Purpose:** neutral clay matcap A/B for the implicit and PBD renderers.
- **Creator/tool:** OpenAI built-in image generation, gpt-image-2-class path.
- **Date:** 2 August 2026.
- **Reference:** the project owner's Clay Creature Studio screenshot, used only
  for its ball material, light softness and clay-grain target.
- **Processing:** one targeted generation revision after browser QA removed a
  black sampling gap and lifted the edge illumination; the accepted image was
  downscaled to 512×512 with `sips`.
- **Source files:** both generated passes are retained under `assets/source/`.
- **Prompt/provenance:** `assets/matcap-clay-study.recipe.json`.
- **Attribution:** none required by the generation tool. Before moving the image
  into a production/shared asset collection, confirm the repository's chosen
  license treatment for generated output and record it in the destination
  manifest.

Visual QA found that the revised matcap gives a clean broad light but does not
yet outperform the existing procedural shader against the source ball sprites.
It remains an experiment rather than an approved house material.

## `assets/clay-height-study.png`

- **Purpose:** material-locked tri-planar height source for dappled unevenness,
  sparse fingerprint ridges, pores and hand-kneaded marks on the PBD mesh.
- **Creator/tool:** OpenAI built-in image generation, gpt-image-2-class path.
- **Date:** 2 August 2026.
- **References:** the project owner's current PBD screenshot as the problem
  reference and two-ball tablet concept as the target material reference.
- **Processing:** generated as grayscale height data, downscaled to 512×512,
  loaded without a colour-space transform, and sampled in three axes by the
  runtime shader. No normal-map dependency or runtime network call is required.
- **Source:** `assets/source/clay-height-study-gpt-image-2.png`.
- **Prompt/provenance:** `assets/clay-height-study.recipe.json`.
- **Attribution:** none required by the generation tool. Confirm the repository's
  chosen license treatment before production promotion.
