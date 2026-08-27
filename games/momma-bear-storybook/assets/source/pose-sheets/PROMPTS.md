# Pose-sheet provenance

The four source sheets below were accepted as visual source sheets for review. “Accepted” refers to the sheet image only; deterministic crop extraction and Qwen Layered transparency processing are follow-on steps and are not claimed as accepted here.

# momma-bear

- Execution: `exec-bafe1c44-7eb0-444e-9b5a-dd4d4217c444`
- Model/workflow: `gpt-image-2` via built-in imagegen
- Source output: GPT Image 2 execution `exec-bafe1c44-7eb0-444e-9b5a-dd4d4217c444`
- Accepted workspace output: `games/momma-bear-storybook/assets/source/pose-sheets/momma-bear-v1.png`
- Referenced image paths: `games/momma-bear-storybook/assets/source/ui-mockups/00-overview-v1.png`
- Exact prompt:

```text
Create a premium preschool game asset: a 3x2 contact sheet of six full-body pose-actor illustrations of the same friendly Momma Bear character, in a handmade papercraft storybook style. Momma Bear wears an indigo embroidered shawl over a cream apron and warm brown clothing; preserve her identity, proportions, colors, felt and construction-paper fibers, stitched details, and soft paper edge shadows in every cell. The six cells, in reading order left-to-right then top-to-bottom, are exactly: neutral standing calmly facing the viewer; enter stepping in with a welcoming smile; notice head turned with raised brows looking toward something offscreen; interact leaning forward with both paws reaching toward a story object; react rocking back with paws open in delighted surprise; celebrate arms raised and beaming with joy. Put one complete character in each cell, evenly spaced, no overlap, no cropped body parts, consistent scale, on a perfectly flat saturated magenta background suitable for later layer extraction. No text, letters, logos, watermark, UI, border, extra characters, scenery, props, or background texture.
```

# pip

- Execution: `exec-0ceccb65-900e-48ab-8bcb-bea81dbaad22`
- Model/workflow: `gpt-image-2` via built-in imagegen
- Source output: GPT Image 2 execution `exec-0ceccb65-900e-48ab-8bcb-bea81dbaad22`
- Accepted workspace output: `games/momma-bear-storybook/assets/source/pose-sheets/pip-v1.png`
- Referenced image paths: `games/momma-bear-storybook/assets/source/ui-mockups/00-overview-v1.png`
- Exact prompt:

```text
Create a premium preschool game asset: a 3x2 contact sheet of six full-body pose-actor illustrations of the same cheerful child Pip, in a handmade papercraft storybook style. Pip wears a cream shirt, red neckerchief, and patched slate trousers; preserve the same child identity, proportions, colors, paper fibers, stitching, and soft die-cut edge shadows in every cell. The six cells, in reading order left-to-right then top-to-bottom, are exactly: neutral standing calmly facing the viewer; enter stepping in with a welcoming smile; notice head turned with raised brows looking toward something offscreen; interact leaning forward with both hands reaching toward a story object; react rocking back with hands open in delighted surprise; celebrate arms raised and beaming with joy. Put one complete character in each cell, evenly spaced, no overlap, no cropped body parts, consistent scale, on a perfectly flat saturated magenta background suitable for later layer extraction. No text, letters, logos, watermark, UI, border, extra characters, scenery, props, or background texture.
```

# fia

- Execution: `exec-8fc04910-ba86-44b8-a5ff-119e8b21a8f8`
- Model/workflow: `gpt-image-2` via built-in imagegen
- Source output: GPT Image 2 execution `exec-8fc04910-ba86-44b8-a5ff-119e8b21a8f8`
- Accepted workspace output: `games/momma-bear-storybook/assets/source/pose-sheets/fia-v1.png`
- Referenced image paths: `games/momma-bear-storybook/assets/source/ui-mockups/00-overview-v1.png`
- Exact prompt:

```text
Create a premium preschool game asset: a 3x2 contact sheet of six full-body pose-actor illustrations of the same bright child Fia, in a handmade papercraft storybook style. Fia has two puff buns and wears a sage blouse with a dusty-rose pinafore; preserve the same child identity, proportions, colors, paper fibers, stitching, and soft die-cut edge shadows in every cell. The six cells, in reading order left-to-right then top-to-bottom, are exactly: neutral standing calmly facing the viewer; enter stepping in with a welcoming smile; notice head turned with raised brows looking toward something offscreen; interact leaning forward with both hands reaching toward a story object; react rocking back with hands open in delighted surprise; celebrate arms raised and beaming with joy. Put one complete character in each cell, evenly spaced, no overlap, no cropped body parts, consistent scale, on a perfectly flat saturated magenta background suitable for later layer extraction. No text, letters, logos, watermark, UI, border, extra characters, scenery, props, or background texture.
```

# ash

- Execution: `exec-2ddb5c11-5790-4a68-a644-abfdc72d7b04`
- Model/workflow: `gpt-image-2` via built-in imagegen
- Source output: GPT Image 2 execution `exec-2ddb5c11-5790-4a68-a644-abfdc72d7b04`
- Accepted workspace output: `games/momma-bear-storybook/assets/source/pose-sheets/ash-v1.png`
- Referenced image paths: `games/momma-bear-storybook/assets/source/ui-mockups/00-overview-v1.png`
- Exact prompt:

```text
Create a premium preschool game asset: a 3x2 contact sheet of six full-body pose-actor illustrations of the same calm child Ash, in a handmade papercraft storybook style. Ash wears a teal tunic and ochre quilted vest; preserve the same child identity, proportions, colors, paper fibers, stitching, and soft die-cut edge shadows in every cell. The six cells, in reading order left-to-right then top-to-bottom, are exactly: neutral standing calmly facing the viewer; enter stepping in with a welcoming smile; notice head turned with raised brows looking toward something offscreen; interact leaning forward with both hands reaching toward a story object; react rocking back with hands open in delighted surprise; celebrate arms raised and beaming with joy. Put one complete character in each cell, evenly spaced, no overlap, no cropped body parts, consistent scale, on a perfectly flat saturated magenta background suitable for later layer extraction. No text, letters, logos, watermark, UI, border, extra characters, scenery, props, or background texture.
```

## Deterministic crop and extraction ledger

Each sheet is cropped as a 3×2 grid in reading order: `neutral`, `enter`, `notice`, `interact`, `react`, `celebrate`. The crop source is the corresponding workspace sheet; extraction is tracked by `games/momma-bear-storybook/tools/prepare-pose-media.mjs` and the generated Qwen Layered ledger `games/momma-bear-storybook/assets/source/pose-sheets/qwen-layer-jobs.json`. No crop or Layered extraction is asserted accepted by this provenance record.
