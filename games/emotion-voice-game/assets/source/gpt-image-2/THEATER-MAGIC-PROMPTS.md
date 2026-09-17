# Theater magic asset prompts

Generated 2026-09-17 with GPT Image 2 through the Codex image-generation
workflow. Both generations used `assets/felt-stage.webp` as the material,
lighting, and palette reference and `assets/source/ui-kit-gpt-image-2.png` as
the felt-control construction reference. They were image generations guided by
references, not edits of either reference.

## Feeling reward props

Production prompt:

> Create one production asset sheet for the QLOBE Kids Emotion Voice Game,
> matching the reference theater's premium handmade felt, visible fibers,
> padded appliqué, chunky cream stitching, warm honey light, and saturated
> navy, cranberry, gold, green, sky-blue, purple, and orange palette. Isolate
> exactly eight complete objects on a genuinely transparent background, with
> generous empty gutters and no object touching another. Reading order must be:
> five separate Happy celebration pieces across the top-left (gold felt star,
> green curling streamer, gold curling streamer, green curling streamer, gold
> felt star), one Proud gold-star medal with navy-and-red stitched ribbon at the
> top-right, one Calm moon/cloud/two-star nursery mobile at the bottom-left, and
> one Silly purple-and-orange jester hat at the bottom-right. Front-facing game
> sprites, consistent light and scale, complete silhouettes. No text, letters,
> labels, characters, faces, stage, floor, shadows, borders, panels, extra
> objects, crop, watermark, or checkerboard.

Master output:

- Persistent source: `reward-props-sheet-master.png` (1448 × 1086)

## Replay control and costume trunk

Production prompt:

> Create one production asset sheet for the QLOBE Kids Emotion Voice Game,
> matching the supplied premium cozy felt theater and felt UI references.
> Isolate exactly two complete objects on a genuinely transparent background,
> separated by a very wide empty gutter. On the left: a large round deep-navy
> padded felt replay/listen button with cream blanket stitching and a centered
> cream felt ear appliqué plus two small gold sound-wave marks. On the right: an
> open toy-theater costume trunk in deep navy and cranberry felt with gold
> stitched corners and latch; inside are a purple jester hat, a small red hero
> cape, and a pale-blue moon-and-stars wand. Front-facing, tactile padded
> appliqué, visible fibers, warm honey rim light, complete silhouettes. No
> text, letters, labels, characters, hands, stage, floor, cast shadow, border,
> extra objects, crop, watermark, or checkerboard.

Master output:

- Persistent source: `theater-tools-sheet-master.png` (1774 × 887)

## Processing

`tools/process-reward-art.py` sends each immutable master through the approved
LAN Qwen Image Layered workflow, accepts a layer only if the repository cutter
still detects the exact authored object count, then runs
`tools/cut-asset-sheet.py` and `tools/pipeline/cutout_finalize.py`. The complete
decision and alpha-QA receipt is `../theater-magic-processing.json`.
