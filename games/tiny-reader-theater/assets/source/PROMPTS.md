# Tiny Reader Theater — Production visual pass

Generated 2026-08-13 with the built-in image-generation tool, using the approved
concept screens only as style/composition references. Transparent runtime art
was then extracted by the approved LAN `qwen-image-layered` workflow at seed 42
(`layer_2`), with saturated-magenta alpha QA.

## Blank setup theater

Use case: `stylized-concept`. Production 4:3 setup-screen background matching
the reference's cozy felt-and-embroidery art world: burgundy side curtains,
arched burgundy valance with scalloped gold trim, uninterrupted cream felt
center, and brown felt footer. Symmetric front view, large clear UI area. No
title, words, buttons, cards, characters, icons, scenery, logos, or watermark.

Input reference:
`01-game-concepts/tiny-reader-theater/output/ui-mockups/01-story-library.png`

Master: `setup-stage-master.png`; runtime: `../ui/setup-stage.webp`.

## Six-piece blank UI kit

Use case: `stylized-concept`. Production contact sheet on a perfectly flat
solid `#ff00ff` background. Exactly six separate blank felt components in a
strict 3×2 grid with clear gutters: teal portrait-card backing, cream word-tile
backing, teal label plaque, gold action button, cream star-tab story banner,
and cream endings panel with teal header. Tactile wool fibers, blanket stitches,
soft stuffing, warm object lighting. No text, icons, characters, scenery,
logos, watermark, overlap, or cast shadows outside the objects.

Input references:

- `01-game-concepts/tiny-reader-theater/output/ui-mockups/01-story-library.png`
- `01-game-concepts/tiny-reader-theater/output/ui-mockups/02-read-and-act.png`
- `01-game-concepts/tiny-reader-theater/output/ui-mockups/04-story-complete.png`

Master: `ui-kit-raw.png`; layered source: `layered/ui-kit.layer2.png`; runtime
pieces: `../ui-kit/*.webp`.

## Qwen layered extraction

Each source is submitted with `layers=2`, `seed=42`, and this normalized prompt:

> Background layer: a single perfectly flat solid magenta background. Top
> layer: the exact complete named felt asset from the input image on true
> transparency. Keep every subject identical to the input, including its
> silhouette, felt texture, stitches, lighting, and colors. Do not redesign,
> crop, add text, or add any new object.

The executable/resumable recipe is `../../tools/extract-ui-layers.py`. It keeps
opaque masters, raw `layer_2` files, magenta composites, and `alpha-report.json`.
Because semantic extraction can drop dark foreground pieces inside a card, the
finalizer conservatively unions Qwen's soft alpha with the edge-connected flat
source-background silhouette while preserving the exact source RGB.
