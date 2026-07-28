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

Result: **30/30 checks passed** in real Google Chrome.

- splash boots and both modes register;
- runtime data contains A–Z exactly once with 26 unique generated destinations;
- all 45 transparent sprite-pack assets load from committed offline paths;
- all 26 A–Z reward cutouts plus the bonus cutout load from committed offline
  paths;
- runtime makes no remote requests;
- mode targets and trace starts meet the touch minimum;
- first real gesture starts the matching recorded teacher clip;
- every round presents a named car, destination, and letter-linked word;
- the solid car disappears on first drawing touch, leaving only the translucent
  ghost car during tracing;
- the full destination mission plays once at round start and does not repeat
  when the child begins tracing;
- completing the trace hides the ghost and restarts the solid-car drive replay
  from the beginning of the route;
- the matching destination-action reward appears after the replay;
- trace, replay, and arrival invoke `vroom`, sustained `motor`, and `honk`;
- Easy Roads has real trace geometry and advances through the engine input path;
- different seeds produce different four-letter decks from the expanded pool;
- Letter Town exposes and completes ordered multi-stroke letters;
- dynamically selected M exposes all four strokes and the Music Shop scenario;
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
- no duplicate solid car remains visible once finger tracing begins;
- the full-body Cupcake Cafe action reward is crisp, centered, and clearly
  separated from the completed road in the captured completion frame;
- generated destination art and live labels sit above the road and remain readable;
- generated cottage, tree, flowers, mailbox, lamp, bench, fountain, fence,
  topiary, hydrant, signpost, pond, swings, gazebo, and picnic table enrich maps;
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
- Five gpt-image-2 yellow-ground 3×3 sheets were visually reviewed.
- Five Qwen Image Layered `layer_2` sheets produced 45 production sprites:
  27 destinations and 18 map details.
- Per-cell alpha checks passed; 45/45 magenta composites and all five labeled
  contact sheets were visually reviewed after border-fragment cleanup.
- Three gpt-image-2 Maya-style reward sheets were visually reviewed before
  extraction.
- Three Qwen Image Layered `layer_2` reward sheets produced 26 destination
  action cutouts plus one bonus celebration cutout.
- Per-cell reward alpha checks passed; all three labeled contact sheets and
  representative magenta composites were visually reviewed with complete
  bodies and destination props intact.
- 63/63 cloned teacher clips exist.
- 63/63 Whisper transcript checks passed; minimum match 0.902.
- Clip durations: 1.118–4.234 seconds; 186.335 seconds total.

## Repository gates

- `node tools/validate/run.mjs letter-road-driving --json`: 0 errors, 0 warnings.
- Full 154-subject validation sweep: 0 errors. The 23 warnings are pre-existing
  character/registry inventory warnings unrelated to this game.
- Registry mirror check passes.
- `git diff --check` passes.

Status remains `beta` until an actual child playtest; this QA is production
engineering review, not a substitute for the release playtest.
