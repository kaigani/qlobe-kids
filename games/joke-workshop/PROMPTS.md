# Joke Workshop reproducible prompt records

These descriptive final-intent records capture accepted GPT Image 2 generations (not guaranteed verbatim API transcripts).

## GPT Image 2

**Stage background.** “Saturated cut-paper comedy club for ages 5–8: deep navy cardstock, ruby curtains, warm amber spotlight on a wood-paper stage, visible fibres, scissor-cut edges and soft tactile shadows; uncluttered center, no characters, no text.” Output `assets/source/gpt-image-2/stage-background.png` → `assets/art/backgrounds/comedy-stage.webp`.

**Character contact sheet.** “Coordinated 4×3 contact sheet on a perfectly uniform chroma-magenta field: bear, gummy/sleepy/dancing bear; banana, peeling/split/phone banana; friendly ghost, boo-berry/toast/moon-cereal ghost. Consistent scale, warm tactile papercraft, clean gaps, no words.” Output `character-sheet-magenta.png`, deterministically keyed to `character-sheet-alpha.png`; fixed grid crops become `art/topics/*.webp` and `art/answers/*.webp`.

**UI contact sheet.** “Blank paper furniture for a preschool comedy workshop on a perfectly uniform chroma-magenta field: three topic cards, joke book, three choice cards, question banner, three CTA buttons and speech plaque; jewel cardstock, cut edges, tactile shadows, no text.” Output `ui-sheet-magenta.png`, deterministically keyed to `ui-sheet-alpha.png`; inspected silhouette crops become `art/ui/*.webp`.

**Title lockup.** “JOKE WORKSHOP as cheerful layered cut-paper marquee, bold rounded child-readable forms, ruby and golden cardstock on transparent background, subtle shadow, exact spelling, no extra words.” Output `title-alpha.png` → `art/title.webp`; spelling checked.

**Repaired gummy bear.** “Single clean red gummy-bear performer matching the reference sheet: cute seated teddy silhouette, translucent-looking layered red paper/gummy material, round ears, simple friendly face and paw pads; fully visible and centered on a flat #FF00FF field. No black stains, speckles, holes, smears, missing texture, background fragments, text, props, panels, or extra characters.” Output `gummy-bear-magenta.png`, keyed to `gummy-bear-alpha.png` → `art/answers/bear-gummy.webp`; this replaces the visibly corrupted contact-sheet cell.

**Recording microphone.** “Single old-fashioned chrome microphone as a cheerful
paper-craft cutout for a children’s comedy stage: rounded silver grille, layered
navy and amber paper stand, tactile fibres, soft cut-paper shadow, fully visible
and centered on a flat chroma background, no text or extra props.” The accepted
generation was edited to a uniform magenta plate and keyed with the imagegen
chroma-key utility, then encoded to `art/ui/recording-microphone.webp`; the
transparent source is retained as `assets/source/imagegen/recording-microphone-alpha.png` and the magenta source
remains outside the runtime bundle.

## Visual rules and decisions

Canonical style is `paper-garden`: saturated navy/ruby/amber, visible fibres, scissor-cut edges, stacked layers and soft shadows. Functional copy is HTML over blank furniture. Reject emoji, gradients, lettering errors, clipped silhouettes, opaque cutout backgrounds, or inconsistent scale. Magenta plates are QA only; deterministic crops are recorded in `tools/finalize-art.sh`.

## Local voice generation

`tools/gen-voice.py` is locked to the project concept's exact `voice-comedian.wav` path and SHA-256 and rejects non-local/non-private service URLs. The accepted pack was generated with Qwen voice cloning at seed 19, with a seed-31 retry for `crowd-laugh`, then transcript-checked with local Whisper. New raw response cache names include both reference-content and authored-text hashes; accepted records also carry the reference, seed, text, and final-audio hashes, so a stale clip cannot be silently relabeled. The runtime receives only the resulting M4A files and never calls either model service.
