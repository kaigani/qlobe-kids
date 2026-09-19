# Rejected local image jobs

## Qwen Image Layered — UI cutouts

Three accepted GPT Image UI crops (`action-button`, `paw-stamp`, and
`parade-banner`) were submitted individually to `qwen-image-layered` with two
requested layers, seed 42, and prompts that explicitly placed the preserved
subject on the top layer. The jobs completed and advertised `layer_0`,
`layer_1`, and `layer_2` outputs.

Per the Studio contract, production downloaded **only `layer_2`**. All three
files were 100% transparent. `tools/pipeline/cutout_finalize.py` rejected every
file with `empty extraction (fully transparent layer_2)`; none became a runtime
asset. The rejected files remain in `../../layered/` for auditability.

The accepted fallback used the uniform-magenta source sheet and the image
pipeline's deterministic chroma-key remover, followed by alpha/magenta visual
QA and WebP optimization. No composite or wrong Qwen layer was substituted.
