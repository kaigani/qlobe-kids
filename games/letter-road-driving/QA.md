# Letter Road Driving — production QA

Date: 2026-07-28

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

Result: **24/24 checks passed** in real Google Chrome.

- splash boots and both modes register;
- runtime makes no remote requests;
- mode targets and trace starts meet the touch minimum;
- first real gesture starts the matching recorded teacher clip;
- every round presents a named car, destination, and letter-linked word;
- partial tracing separates the translucent ghost car from the waiting solid car;
- completing the trace starts the solid-car drive replay;
- trace, replay, and arrival invoke `vroom`, sustained `motor`, and `honk`;
- Easy Roads has real trace geometry and advances through the engine input path;
- different seeds produce different four-letter decks from the expanded pool;
- Letter Town exposes and completes ordered multi-stroke letters;
- seeded M exposes all four strokes and the Music Shop scenario;
- both complete modes reach the end screen;
- portrait road board is 792×863 CSS px and remains usable;
- reduced-motion trace completes;
- zero page errors, failed requests, or 404s;
- legacy `scissor-trail-safari` dotted rendering still advances with no errors.

## Visual QC

Reviewed at 1180×820 landscape and 820×1180 portrait:

- new soft-3D countryside plate closely matches the supplied visual direction;
- hero car cutout is crisp and readable against the bright center;
- white button labels pass visual contrast on blue and green;
- expressive three-quarter character faces remain readable while rotating;
- ghost and solid cars are visually distinct at mid-trace;
- destination labels sit above the road and remain readable;
- house, tree, flowers, mailbox, lamp, bench, and fountain props enrich maps;
- road border, dark asphalt, and white dashes remain distinct;
- inactive stroke numbers 2 and 3 stay visible while the car marks stroke 1;
- prompts, progress dots, Back, and Voice avoid the road board;
- sampled single- and multi-stroke letters fit without clipping;
- end screen hierarchy and replay control are clear.

The production Open Graph shot was regenerated from the approved splash with
`tools/pipeline/capture_og_images.mjs` at 1200×630 (102 KB, JPEG quality 82).

## Asset QA

- Five new expressive gpt-image-2 character-car composites were reviewed.
- Red/yellow/blue/purple chroma cutouts and green Qwen Layered extraction passed.
- Alpha finalizer passed after applying the recorded floor of 4.
- 45/45 cloned teacher clips exist.
- 45/45 Whisper transcript checks passed; all remain above the 0.72 gate.
- Clip durations: 1.118–4.234 seconds; 130.833 seconds total.

## Repository gates

- `node tools/validate/run.mjs letter-road-driving --json`: 0 errors, 0 warnings.
- Full 154-subject validation sweep: 0 errors. The 23 warnings are pre-existing
  character/registry inventory warnings unrelated to this game.
- Registry mirror check passes.
- `git diff --check` passes.

Status remains `beta` until an actual child playtest; this QA is production
engineering review, not a substitute for the release playtest.
