# Letter Road Driving — production QA

Date: 2026-07-27

Branch: `letter-road-production`

Base: `origin/main` at `98a728c`

## Automated production smoke

Command:

```sh
python3 -m http.server 8008
node games/letter-road-driving/tools/qa.mjs \
  --base http://127.0.0.1:8008 \
  --shots /private/tmp/letter-road-qa-shots/final
```

Result: **18/18 checks passed** in real Google Chrome.

- splash boots and both modes register;
- runtime makes no remote requests;
- mode targets and trace starts meet the touch minimum;
- first real gesture starts the recorded `prompt-l` teacher clip;
- Easy Roads has real trace geometry and advances through the engine input path;
- Letter Town exposes and completes three ordered strokes for A;
- both complete modes reach the end screen;
- portrait road board is 792×899 CSS px and remains usable;
- reduced-motion trace completes;
- zero page errors, failed requests, or 404s;
- legacy `scissor-trail-safari` dotted rendering still advances with no errors.

## Visual QC

Reviewed at 1180×820 landscape and 820×1180 portrait:

- hero car cutout is crisp and readable against the storybook backdrop;
- white button labels pass visual contrast on blue and green;
- top-down driver is large enough to track and rotates with the lane;
- road border, dark asphalt, and white dashes remain distinct;
- inactive stroke numbers 2 and 3 stay visible while the car marks stroke 1;
- prompts, progress dots, Back, and Voice avoid the road board;
- A fits without clipping in both orientations;
- end screen hierarchy and replay control are clear.

The production Open Graph shot was regenerated from the approved splash with
`tools/pipeline/capture_og_images.mjs` at 1200×630 (45 KB, JPEG quality 82).

## Asset QA

- Both gpt-image-2 car sources were separated with Qwen Image Layered.
- Studio magenta composites were visually reviewed.
- Alpha finalizer passed after applying the recorded floor of 4.
- 26/26 cloned teacher clips exist.
- 26/26 Whisper transcript checks passed; 25 normalized matches were exact and
  `prompt-a` scored 0.909.
- Clip durations: 1.118–3.914 seconds; 68.1 seconds total.

## Repository gates

- `node tools/validate/run.mjs letter-road-driving --json`: 0 errors, 0 warnings.
- Full 154-subject validation sweep: 0 errors. The 23 warnings are pre-existing
  character/registry inventory warnings unrelated to this game.
- Registry mirror check passes.
- `git diff --check` passes.

Status remains `beta` until an actual child playtest; this QA is production
engineering review, not a substitute for the release playtest.
