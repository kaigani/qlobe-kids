# QLOBE Kids — agent quickstart: concept to production

Last grounded against the repository, the Puppet Tales production pass, the
Teen Bead Builder style-fidelity correction, and the six-world art-direction
reconciliation on 2026-08-08.

This is the clean-context runbook for an agent asked to choose, build, polish,
or extend a QLOBE Kids game. It connects the concept library, static game
runtime, shared modules, local GenAI API, QLOBE Studio, asset-production
lifecycle, automated QA, and GitHub Pages deployment.

Read this first, then follow the links relevant to the game. Do not try to
memorize the whole repository before beginning.

## The 10-minute orientation

The workspace usually looks like this:

```text
260703 QLOBE Kids/
├── 00-reference/          product briefs, historical specs, source references
├── 01-game-concepts/      briefs, concept videos, and 4:3 UI mockups
│   └── _completed/        concepts already promoted into real games
├── 02-generated/          older production scratch and batch artifacts
└── qlobe-kids/            the actual static-site Git repository
```

Start in `qlobe-kids/` and establish the state before editing:

```sh
pwd
git status --short --branch
git log --oneline -8
```

Never assume the checked-out branch is `main`, that it contains the newest
production commits, or that an existing dirty change belongs to you. If the
user has unrelated work in the current tree, use an isolated worktree based on
the intended target branch:

```sh
git worktree add /private/tmp/qlobe-<game-id>-main main
```

Make, test, commit, and push only the files owned by the task. Remove the
temporary worktree only after it is clean. Never reset, overwrite, or bundle
the user's unrelated changes into your commit.

Read these canonical documents:

1. `CLAUDE.md` — hard platform constraints, shared inventory, registry rules.
2. `docs/philosophy.md` — child-development and learning principles.
3. `docs/interaction-patterns.md` — touch, audio, navigation, drag, safe areas.
4. `docs/art-direction.md` — shared interaction grammar, the six canonical art
   direction labels, legacy runtime aliases, and material-fidelity rules.
5. `docs/polish-process.md` — beta-to-live gates.
6. `docs/studio-quickstart.md` — current Studio operating instructions.
7. `docs/qlobe-studio-v2.md` — detailed Studio/data/pipeline contract.
8. `shared/js/engines/README.md` — engine and `QLOBE_DEBUG` contracts.

Then inspect:

```sh
find ../01-game-concepts/<concept-id> -type f | sort
find games/<game-id> -maxdepth 3 -type f | sort
rg -n '"id": "<game-id>"' games.json games/<game-id>/game.json
```

Play the existing prototype before deciding what to keep. A directory name and
manifest are not evidence that a game is complete.

## Non-negotiable runtime constraints

QLOBE Kids is a pure static site deployed as written.

- No framework, bundler, runtime package install, CDN, or compile step.
- Vanilla HTML, CSS, and ES modules only.
- Vendored PixiJS and three.js live under `shared/vendor/`.
- Runtime paths are relative and lowercase. macOS can hide case mistakes that
  become production 404s on GitHub Pages.
- Model calls are authoring-time only. A shipped game must run offline from its
  committed files.
- Reuse `shared/` before creating a local copy.
- Core play must not require reading. Use pictures, spoken guidance, sound, and
  touch.
- Touch targets are at least 96 px and forgiving.
- Use gentle retries and modeling, never punishment or “Game Over.”
- Unlock every audio channel on the first real child gesture.
- Support tablet landscape and portrait, safe areas, and reduced motion.
- Splash Home returns to the catalog. Play/end Back returns to the game splash.

The minimum bar is not “it loads.” A child should understand what to do within
about five seconds.

## Choosing a concept

The concept library is under `../01-game-concepts/`. Each concept normally has:

- `brief.md` — the product idea, intended learning/play loop, and canonical
  `UI Mockup Art Direction` label.
- `output/ui-mockups/` — cleaned 4:3 screen concepts.
- `output/ui-mockups/PROMPTS.md` — generation direction when present.
- an optional concept video.

`../01-game-concepts/UI_MOCKUPS_INDEX.md` is the inventory. `_completed/` is a
historical signal, not the runtime source of truth; verify the corresponding
game and production status in `games.json`.

Before generating, reviewing, or implementing a concept UI, read
`docs/art-direction.md` and use exactly one of its six canonical labels:
**Puppet / Cozy felt fabric**, **Toy**, **Watercolor / Storybook**,
**Claymation**, **Papercraft**, or **Kawaii**. Resolve older names such as Toy
Table, Paper Garden, Field Journal, and Storybook Rooms through the alias table
in that document. Record the canonical label in the brief and keep any legacy
runtime slug only as an implementation detail.

Choose capability-first, not only theme-first. Prefer a concept that makes an
incomplete shared system real and reusable. Useful questions:

- Does an archetype engine exist but lack a polished flagship game?
- Does the game exercise a Stage feature that currently has only a test page?
- Can it turn a one-off local behavior into a reusable service or module?
- Does it force missing robustness: free drag, persistence, recording, replay,
  microphone fallback, scene packs, pose actors, prop sockets, music sync,
  video, or export?
- Can it replace a stub/prototype without breaking the registered route?
- Will the new capability clearly benefit at least one future game?

Puppet Tales was a strong choice because it converted the existing rigged
puppet/stage stack from directed scenarios into a child-controlled theater,
then added reusable performance recording, local storage, replay, MP4 export,
and additive ragdoll motion.

### Treat mockups correctly

Concept screens are an interaction storyboard and visual north star, not an
implementation specification.

The brief's art-direction label and `docs/art-direction.md` define the visual
world. The concept video's look is a gameplay reference only; when the video
and the selected art world disagree, preserve the interaction and follow the
canonical art world for the mockup and production assets.

Extract from them:

- the screen sequence and strongest affordance on each screen;
- visual hierarchy, color relationships, framing, and emotional tone;
- what the child sees before and after every action;
- the fantasy the game promises.

Do not blindly reproduce:

- baked text that a pre-reader cannot use;
- impossible generated controls;
- one-off characters when the shared cast is more coherent;
- layouts that fail real safe areas or portrait mode;
- features that do not support the learning promise;
- inconsistent AI-generated anatomy, labels, or iconography.

Write explicit departures and reasons in `game-design.md`. The polished
Flashlight Cave GDD is a useful model for this level of decision record.

## Decide the implementation path early

There are three common paths.

### 1. Data-driven archetype game

Use an engine from `shared/js/engines/` and scaffold from
`templates/stub-game/`.

The important files are:

```text
games/<id>/
├── index.html
├── config.js       thin fetch shim
├── config.json     canonical editable game content
├── game.json
├── game-design.md
└── ASSETS.md
```

New engine games keep content in `config.json`; `config.js` fetches and exports
it so old browsers do not need JSON import attributes. This also makes the
content editable in QLOBE Studio.

Available archetypes include choose-one, match-pairs, sort-into-bins,
sequence-order, tap-count, pattern-continue, trace-path, build-assemble,
observe-journal, coach-timer, story-stones, puppet-theater, and puppet-band.
Inspect the actual inventory in the engine README and Studio Modules tab rather
than relying on this list forever.

### 2. Custom polished game

Use `templates/game-family/` when the fantasy or interaction genuinely does not
fit an engine. A common polished structure is:

```text
games/<id>/
├── index.html
├── config.js
├── config.json
├── css/style.css
├── js/main.js
├── game.json
├── game-design.md
├── ASSETS.md
├── assets/
└── tools/
```

Custom does not mean isolated. Import the shared audio, input, stage,
characters, and effects modules. If the game creates a generally useful
capability, put that capability in `shared/js/` and keep game orchestration
local.

### 3. Stage/theater game

Use the Pixi stage stack when the game needs recurring characters, semantic
poses, props, scenes, dialogue, music synchronization, or performance capture.

The important runtime pieces are:

- `shared/js/stage/stage.js` — Pixi stage substrate.
- `shared/js/stage/puppet.js` — segmented rig and clips.
- `shared/js/stage/theater.js` — actors, marks, props, dialogue, beats.
- `shared/js/stage/pose-sprite.js` — whole-image semantic pose actors.
- `shared/js/stage/prop-pack.js` and `scene-pack.js` — pack adapters.
- `shared/js/stage/lipsync.js` and `mouth.js` — speech animation.
- `shared/js/stage/music-sync.js` — beat/note/energy animation hooks.
- `shared/js/stage/tween.js`, `spline.js`, and `particles.js` — motion/payoff.
- `performance-recorder.js` / `performance-video-export.js` — tableau, events,
  audio, IndexedDB, replay-to-MP4 export. Single-consumer (puppet-retell); lives
  in `games/puppet-retell/js/`, not `shared/js/`.

Studio previews use these same runtime modules. “What you see is what ships” is
an architectural requirement, not a slogan.

## Write the production design before producing assets

For a serious replacement or live-quality game, `game-design.md` should answer:

- product promise and one skill per mode;
- complete screen map and navigation loop;
- exact 30–90 second core loop;
- full spoken script, verbatim;
- complete art list with dimensions and intended renderer;
- canonical art-direction label, material language, and shared cast;
- interaction and feedback rules;
- difficulty/replay variation;
- privacy, permission, persistence, and fallback behavior;
- explicit departures from the brief, mockups, and old prototype;
- shared modules used or made stronger;
- `QLOBE_DEBUG` surface;
- known risks and release gate.

Write spoken lines before voice generation. Write the art list before generating
images. This avoids expensive production work for controls or content that later
disappear.

### Keep visible art separate from the interaction substrate

The selected art world applies to the **entire child-facing play field**, not
only its backdrop, title, hub tile, and characters. Primary manipulatives and
props—beads, blocks, cards, racks, trays, tools, bins, rewards, and comparable
objects—must visibly belong to the same material and rendering language as the
world around them.

Do not let implementation convenience turn a raster-style game into an
illustrated shell around a generic vector UI:

- Runtime HTML text should stay HTML, but that rule does not make the physical
  object carrying the text an HTML/CSS illustration. A numeral may be HTML on
  top of an authored clay, felt, watercolor, or paper card sprite.
- CSS, SVG, canvas, and DOM geometry are appropriate for layout, hit areas,
  focus states, masks, slot guides, responsive transforms, particles, and
  invisible interaction logic. They are not automatic substitutes for the
  visible identity of a primary raster-style object.
- `docs/asset-system.md` permits emoji and CSS shapes as **beta placeholders
  while real art is in production**. A game remaining `beta` for a child
  playtest does not make placeholder art acceptable after its production-art
  pass.
- “Code-native clay,” “CSS watercolor,” and similar labels are not evidence of
  style fidelity. Gradients, rounded corners, highlights, and box shadows still
  read as vector UI unless the chosen world itself calls for that treatment.
- Dynamic quantities do not require procedural-looking art. Compose exact
  educational state from authored sprites—for example, an authored empty cord
  rack behind exactly ten authored bead instances—so code controls count and
  interaction while the asset controls material appearance.

The GDD art list must therefore distinguish two things for every primary
object:

1. **Visible renderer:** the authored sprite, pose, texture, video, or genuinely
   world-appropriate procedural treatment the child sees.
2. **Interaction substrate:** the DOM/Pixi/canvas element that supplies size,
   placement, state, accessibility, and input behavior.

Before asset production, inventory every child-facing object on every screen.
If the art direction is raster/material-based, give each primary object an
asset or an explicit, reviewed reason why a procedural renderer is faithful to
that world. Do not spend the image budget only on the background and splash.

At visual QA, review **foreground material fidelity separately from layout and
usability**. Compare backdrop, manipulatives, containers, choice objects, and
rewards at full size. Reject the pass when their texture, lighting, edge
treatment, dimensionality, or medium disagree—even if the game is responsive,
the targets are large, and every automated interaction test passes. A useful
code audit is to inspect primary-object selectors for gradient/border/box-shadow
illustrations; in a raster-style game, those declarations require deliberate
justification or replacement with authored art.

## QLOBE Studio

QLOBE Studio is a local-first authoring and review application. The production
site remains static; the authoring server is used only for validated writes,
generation, local pipelines, and previews.

### Start it

From `qlobe-kids/`:

```sh
python3 tools/puppet-studio-server.py
```

Open:

```text
http://127.0.0.1:8000/shared/js/studio/
```

The header should report `authoring server`. If it says `static preview`, saves
and generation are unavailable. Restart the process after server-code changes;
a stale process silently lacks new endpoints.

Machine-specific values belong in the git-ignored `tools/state/local.json`:

```json
{
  "qwenUrl": "http://YOUR-MODEL-HOST:8100",
  "teacherVoicePath": "/local/path/to/reference.wav"
}
```

Flags or environment variables such as `--qwen-url` and `QLOBE_QWEN_URL`
override the file. Never commit a LAN hostname, IP address, credential, or
personal source path.

Do not copy hard-coded hosts from older scripts in `../02-generated/`. Current
production drivers live in `tools/pipeline/` or in a game's `tools/` folder and
take the host from configuration.

### Studio map

- **Generate** — template-driven Menu, Character, Prop, and Scene production;
  Review accepts, rejects, regenerates, assigns, and exposes provenance.
- **Library** — reusable characters, packs, and shared media.
- **Modules** — read-only engine/service/stage inventory and test harnesses.
- **Games** — catalog, manifest, config editor, validation, and playtest entry.
- **Production** — job queue, validation, completeness, and triage.
- Context workspaces — Assemble/Poses, Rig, Animate, Speech, Props, Stage, and
  Music Sync.

`shared/js/studio/projects.json` is the object/workspace registry. Add a game
there only when it exposes a pack or contextual editing workspace. Ordinary
game registration still belongs in `game.json` plus root `games.json`.

### Generated-media lifecycle

Studio's safe path is:

```text
template → queued job → shared/media/<id>/ → recipe.json
→ Review → accept/reject → assign → ASSETS.md → validate
```

Every Studio asset has a `qlobe-recipe` sidecar with workflow, prompt, seed,
references, outputs, and QA status. Rejection moves the object to git-ignored
trash rather than hard-deleting it.

Hub tiles are an exception: Studio stages and reviews them, but assignment to
`assets/hub/tiles/` is intentionally hand-curated.

## GPT Image 2 and the local GenAI API

Use each model for the job it is good at. Generation is not finished asset
production; it is the first nondeterministic stage of a reproducible pipeline.

If the session exposes the `imagegen` skill/tool, read its instructions before
using GPT Image 2.

| Capability | Best use in this project | Critical rule |
| --- | --- | --- |
| GPT Image 2 | concept-driven backgrounds, cohesive contact sheets, story cards, complete visual-system passes, editing from supplied mockups | retain source and prompt; inspect every cell before deterministic slicing |
| `krea2-turbo-t2i` | fast reproducible backdrops, hub tiles, props on a simple ground, neutral pose sources | default seed 42; use the proven seed ladder for retries |
| `qwen-image-edit` | carry an accepted style/identity into variants or change an existing asset | use a real reference; do not ask text alone to preserve identity |
| `qwen-image-layered` | separate a subject from a plain background | asynchronous job; fetch `output=layer_2`, never assume the composite is the cutout |
| `qwen3-tts-voiceclone` | additional lines from an approved voice reference | batch TTS lines together and transcribe every result |
| `whisper-stt` | voice QA and editable transcription | compare normalized transcript to intended text; reject material mismatches |
| `ltx2-3` | short image-to-video character cues with baked audio | neutral key frame, static camera, first frame = last frame for clean loops |

The server may expose more workflows. The allow-list in
`tools/puppet-studio-server.py`, the template registry in
`shared/data/generate-templates.json`, and the live Studio template endpoint are
the current authorities:

```sh
curl -s http://127.0.0.1:8000/api/studio/templates
```

Prefer the Studio templates when one exists. They encode dimensions, style
suffixes, reference slots, provenance, and assignment warnings that a raw API
call can miss.

### Image seed and batching discipline

The proven image retry ladder is:

```text
42 → 1337 → 9001 → 7
```

Keep all jobs for one workflow together. Repeated model swaps on the local host
destroy throughput. A typical efficient order is:

1. all text-to-image jobs;
2. all image-edit jobs;
3. all layered extractions;
4. all voice-clone jobs;
5. all Whisper QA.

Do not force a failed candidate through deterministic cleanup. A changed face,
missing limb, merged component, malformed object, or invented text is a reroll.

## Art-production rules

The canonical lifecycle is:

```text
brief → generate → source candidates → extract → visual/alpha QA
→ deterministic finalize → runtime asset → manifest/provenance → validate
```

Keep nondeterministic source material separate from deterministic finalization.
Game-local production scripts should be resumable and skip valid existing
outputs.

### Raster strategy

- Use JPEG/WebP for opaque full-bleed backdrops.
- Use transparent PNG/WebP for sprites, icons, and props.
- Generate cutout subjects against flat dark charcoal, then run Layered.
- Inspect alpha on a saturated magenta composite; transparent-on-white hides
  fringes and holes.
- Alpha-trim, pad, normalize canvas size, resize, and encode deterministically.
- Keep important action clear of HUD/safe-area zones.
- Keep background centers calm when cards or controls overlay them.
- Retain original generations under `assets/source/`.
- Record source, workflow, prompt/seed, processing, creator, and license in
  `ASSETS.md`.

The repo budgets in `docs/art-direction.md` are defaults: approximately 300 KB
for a background, 30–80 KB for ordinary sprites, and 1.5 MB per short video.
Deviate only deliberately and record why.

For a raster or material-led world, confirm the selected canonical label before
generation and retain the prompt/style provenance. If a Studio template still
uses a legacy style id, record both values: the canonical label for design and
the legacy slug for the current pipeline.

### Replace placeholders before calling a game polished

Emoji are acceptable scaffolding for an engine prototype. They are not a final
visual system. Replace:

- mode and action icons;
- story/content cards;
- empty/loading/privacy/delete/replay states;
- props and rewards;
- any child-facing symbol whose platform renders inconsistently.

**Game titles are generated graphic lockups, not HTML text** (maintainer
preference, 2026-07-29). A splash title is brand art: generate a fun painted
lockup in the game's art world (decorative lettering, ornaments, a ribbon or
splash motif — see `games/sink-or-float/assets/title.webp` for the reference
example), alpha-trim it, optimize to roughly ≤150 KB, and keep an accessible
name on the element. Because AI image models are not a reliable typography
engine, visually spell-check every generated title at full size and reroll on
any malformed letter.

Functional text a child or parent must actually parse — instructions, labels,
buttons, anything where exact spelling matters at runtime — stays real HTML
(and, for children, audio-first).

Contact sheets are efficient for a coordinated icon family, but only when the
cells have an explicit grid and the final crop is deterministic. Inspect the
full sheet and every extracted asset.

### Hub tiles use their own grammar

Do not derive a hub tile by cropping the splash screen. The hub is a coherent
toy-object menu system.

Use Studio's `menu-game-tile` template:

- workflow: `krea2-turbo-t2i`;
- canvas: 768 × 640;
- seed: 42 first;
- one recognizable game moment staged as objects;
- no title or UI baked into the image;
- style: `toy-table` (the Toy category's legacy Toy Table variant).

The proven style suffix is stored in
`shared/data/generate-templates.json`. A representative prompt is:

```text
A treasure chest sitting on a beach. Bright, soft 3D cartoon style with
rounded, simplified forms and cheerful proportions. Saturated colors, smooth
shading, soft highlights, toy-like glossy finish. Premium preschool learning
app asset, no text, no letters, no words.
```

After approval, curate the source into
`assets/hub/tiles/<game-id>.jpg` at the hub's expected 6:5 presentation
(existing examples use 640 × 533). Preserve the source and recipe in the
game's source tree and log it in `ASSETS.md`.

## Voice production

The script in the GDD or `data/lines.json` is the source of truth. Runtime
recordings are a warm primary channel; Web Speech remains the fallback.

Production order:

1. Finalize every line as spoken language, including punctuation.
2. Use an approved, rights-cleared voice reference.
3. Batch all `qwen3-tts-voiceclone` lines, normally seed 7 first.
4. Convert model FLAC to AAC/M4A with `+faststart` and sane loudness.
5. Batch all Whisper checks after TTS completes.
6. Compare intended and heard text; retry or omit a rejected clip.
7. Write `manifest.json` with durations and a cache-busting/version mechanism.
8. Test that a real recorded clip plays after a gesture, not only the fallback.

Seeds 8 and 9 are the usual voice retry ladder. Do not ship a confidently wrong
line because a file exists. Omitting it and using the correct device-speech
fallback is better.

For rigged character speech, Studio Speech can also transcribe, encode, align,
and write viseme cue files. See `docs/puppet-pipeline.md`.

## Video production

Use short video only when motion communicates something a pose cannot.
`games/red-green-light/ASSETS.md` is the proven local LTX reference.

For a looping talking/action cue:

- start from a calm, neutral, camera-facing key image;
- avoid raised-arm or celebratory references unless every clip should inherit
  that posture;
- use `ltx2-3` image-to-video with baked voice audio;
- request a static camera;
- pin first and last frames to the same portrait for a clean return to rest;
- generate at a modest size, then encode H.264, `yuv420p`, and `+faststart`;
- provide a poster/fallback;
- inspect identity, action readability, artifacts, text, and loop boundary;
- transcribe baked dialogue again after final encoding.

Do not assume a browser or Apple player accepts any file named `.mp4`.

## Recording, replay, and MP4 export

For child performances, prefer semantic recording over screen capture:

```text
initial tableau + timestamped game events + optional microphone Blob
```

This gives a small, editable, privacy-preserving show that can be replayed by
the real runtime. `games/puppet-retell/js/performance-recorder.js` is the reference service.

If a game offers keepsake export,
`games/puppet-retell/js/performance-video-export.js` replays into a fixed 1280 × 720 canvas
and records locally. No upload is required.

Compatibility rules learned from Puppet Tales:

- Prefer H.264 `avc1`; use `avc3` only as a capability fallback.
- Audio exports should be AAC; movement-only exports must also work.
- Preserve replay state needed to reproduce every visible motion.
- Verify MIME/container signatures and nontrivial file size.
- Decode at least one exported frame independently.
- On macOS, run a native check:

  ```sh
  qlmanage -t -s 480 -o /private/tmp/ql-video-check <export.mp4>
  ```

- Test the actual file in QuickTime when practical. VLC accepting a file is not
  evidence that QuickTime accepts its sample format.
- Chrome can emit a known `avc1` MediaRecorder diagnostic while still producing
  a valid file. Separate that expected diagnostic from genuine page errors.

Recording UI must explain what stays on-device, request microphone permission
only after an explicit action, and keep movement-only recording available when
permission is denied.

## Motion and direct manipulation

Drag behavior must be built for fingers, not a desktop mouse:

- use Pointer Events;
- capture or listen at window level so release outside the object cannot strand
  it;
- maintain a single active drag;
- cancel safely on blur/pointer cancel;
- use the pointer-to-object offset so the actor does not snap;
- constrain from actual rendered bounds, not a guessed nominal size;
- test mirrored characters and both viewport orientations.

For stage actors, normalized horizontal and vertical offsets belong in theater
state so playback and export can reproduce them. The floor line remains the
settled baseline.

Puppet Tales' final movement pass exposed an important design truth:
physically plausible but subtle motion can be invisible to a young child.
Tune animation at the rendered tablet size and review screenshots at the peak
of motion. Its production QA measured roughly 45° while dragging and 70° during
the release flare—large enough to read clearly without unbounded joints.

Additive ragdoll motion should:

- sit on top of authored animation rather than replacing clips;
- keep every joint bounded;
- respond to both horizontal and vertical pointer velocity;
- let airborne limbs trail;
- flare limbs upward during the gravity drop;
- settle with a small bounce and decay back toward authored pose;
- record the motion inputs or resulting semantic state used by replay/export.

Never validate motion only after it has settled. Capture the drag, airborne
release, near-landing flare, and resting frames separately.

## Runtime integration

### Manifests and registration

`games/<id>/game.json` is canonical for the descriptive fields mirrored into
the hub: title, status, category, age, accent, and the `{id,title,skill}` mode
subset.

Root `games.json` is the hub registry. Registration is deliberate:

1. add the game entry by hand with its route, curated hub tile, summary, and
   other registry-owned fields;
2. synchronize the mirrored fields:

   ```sh
   node tools/pipeline/sync-games-registry.mjs --write --only <game-id>
   ```

3. check for drift:

   ```sh
   node tools/pipeline/sync-games-registry.mjs --check --only <game-id>
   ```

Do not let a sync tool invent registration. Do not hand-fix a mirrored
`games.json` title/status/mode when `game.json` is wrong.

### Usage index

When modules, packs, or shared assets change:

```sh
node tools/build-usage-index.mjs
```

This powers Studio's “used by” data and makes shared changes auditable.

### Studio projects

If the new game has editable characters, pose actors, prop packs, scene packs,
story packs, or music-sync profiles, add the corresponding objects/project to
`shared/js/studio/projects.json` and validate it. Keep documents plain and
versioned; embedded config may remain as a runtime fallback while the game
adopts a pack.

## `QLOBE_DEBUG` is part of the game

Every new game needs `window.QLOBE_DEBUG` format version 1. It is the stable QA
surface, not throwaway debug code.

At minimum provide:

- a `ready` promise;
- mode listing and deterministic mode start;
- state inspection;
- truthful current targets;
- input through the same handler real pointers use;
- a way to complete/win a round;
- mute;
- deterministic seed;
- a fast-timer option for long scripted beats.

Custom games may extend the contract with domain state such as actors, stage,
recording, saves, or export progress. Keep it semantic and serializable.

## Verification ladder

Do not jump directly from implementation to production.

### 1. Static and syntax checks

Run checks proportional to the touched files:

```sh
git diff --check
node --check games/<id>/js/main.js
node tools/validate/run.mjs
```

The full validator may have known warnings. Record the baseline and require
zero new errors. Do not “fix” unrelated warnings during a focused game change.

### 2. Local server

Simple static preview:

```sh
python3 -m http.server 8000
```

Studio/write/generation preview:

```sh
python3 tools/puppet-studio-server.py
```

Boot the game both directly and through the hub. Watch for page errors, failed
requests, and 404s.

### 3. Automated browser smoke test

Use real Chrome (`channel: "chrome"`) when AAC, MP4, microphone, or media
decoding matters. Headless Chromium alone is not a substitute.

The game-local Playwright script should cover:

- splash and all modes;
- the whole navigation loop;
- every meaningful branch and a wrong-input probe;
- recorded voice playback;
- microphone denial/fallback;
- save/reload/delete if persistent;
- replay if recorded;
- audio and silent MP4 export if supported;
- landscape and portrait;
- reduced motion;
- zero unexpected page errors and failed requests.

### 4. Visual QC

Automation must capture screenshots of meaningful states, not only the splash:

- every screen in the setup flow;
- representative play;
- success/retry;
- menus and overlays;
- peak animation or drag;
- portrait and landscape;
- a decoded export frame when relevant.

Inspect the images at full useful detail. Check hierarchy, clipping, overlap,
safe areas, art consistency, target size, empty states, and whether motion reads
without knowing what the code intended.

The first visually correct screenshot often reveals a systems bug that DOM
assertions cannot: a character behind the HUD, an alpha fringe, a cropped prop,
an invisible render-pump update, or movement too subtle to perceive.

### 5. Production

When the user's task includes shipping:

1. commit only owned files;
2. push the intended branch;
3. watch the GitHub Pages run:

   ```sh
   gh run list --branch main --limit 5
   gh run watch <run-id> --exit-status
   ```

4. rerun the complete smoke test against `https://qlo.be`;
5. visually inspect production captures;
6. confirm the deployed behavior, not merely the workflow's green check.

GitHub Pages is case-sensitive and cached differently from localhost. A local
pass is necessary but not sufficient.

### 6. Child playtest

Automated QA cannot determine whether a five-year-old understands, enjoys, or
wants to repeat the game. Keep a game `beta` until the target child succeeds on
the real iPad. Record the resulting interaction fixes in the GDD so they become
platform knowledge.

## Lessons from Puppet Tales

The production sequence was:

```text
concept brief + five-screen mockup
→ capability choice
→ custom theater + performance recorder
→ readiness/race-condition gate
→ complete visual-art replacement
→ six stages
→ local MP4 export
→ hub tile corrected to the menu grammar
→ QuickTime codec correction
→ subtle ragdoll
→ dramatic 2D drag, gravity flare, bounce
→ production 30/30 QA
```

The reusable lessons are:

1. **Build the promised fantasy, not the mockup pixels.** The mockup suggested
   a puppet theater; the final system made the shared puppets, stage, voice, and
   recording stack actually perform that fantasy.
2. **A feature can need a readiness gate after it “works.”** Controls were
   initially reachable before all stage assets were ready. The fix was lifecycle
   state plus a regression check, not a delay.
3. **The second visual pass is part of production.** Replacing emoji and generic
   UI with a coordinated GPT Image 2 contact-sheet family made the game read as
   one finished world.
4. **The hub is a separate product surface.** Its Krea toy-object tile should
   match neighboring games, even when the game's interior uses storybook art.
5. **Expansion requests should strengthen data, not duplicate screens.** Moving
   from three to six backgrounds remained a `config.json` expansion because
   stage selection was already data-driven.
6. **Export is a runtime feature plus a compatibility matrix.** Replay timing,
   optional audio, H.264 sample entry, local privacy, browser support, and native
   Apple decoding all mattered.
7. **Visible motion beats theoretical motion.** The first ragdoll was correct but
   too subtle. The final pass used larger bounded arcs and tested the peak
   airborne state.
8. **Record semantics, not incidental pixels.** Puppet x/y offsets, drag forces,
   fall state, and landing were preserved so replay and MP4 matched live play.
9. **Test the fallback as a first-class mode.** Microphone-denied recording and
   movement-only MP4 export received their own checks.
10. **Ship, then test production with the same suite.** Final confidence came
    from 30/30 checks on `qlo.be`, not from the local server alone.

## Definition of done

A new or replacement game is ready to hand off when:

- the concept choice and capability contribution are documented;
- `game-design.md` reflects the final behavior, not the initial aspiration;
- every child-facing path works without reading;
- no final UI relies on emoji placeholder art;
- art is coherent, optimized, and provenance-logged;
- voice clips are transcript-QA'd with a correct fallback;
- model/runtime services are not called in production;
- the hub tile matches the QLOBE menu grammar;
- manifests and registry agree;
- reusable systems live in `shared/` and list their consumers;
- `QLOBE_DEBUG` can drive every path;
- local validation adds no errors;
- browser smoke tests cover landscape, portrait, fallbacks, and media;
- screenshots have been visually reviewed;
- production deployment succeeds and the production suite passes;
- the game remains `beta` until the real iPad child playtest passes.

## Fast reference map

- Platform contract: `CLAUDE.md`
- Studio operations: `docs/studio-quickstart.md`
- Studio implementation/data contract: `docs/qlobe-studio-v2.md`
- Runtime Studio contract: `docs/qlobe-studio.md`
- Asset lifecycle: `tools/pipeline/README.md`
- Asset recipes/provenance: `docs/asset-provenance.md`
- Art worlds and budgets: `docs/art-direction.md`
- Interaction rules: `docs/interaction-patterns.md`
- Engine/debug contract: `shared/js/engines/README.md`
- Character build: `docs/puppet-pipeline.md`
- Rig anatomy: `docs/puppet-rig-spec.md`
- Generation templates/styles: `shared/data/generate-templates.json`
- Studio object/project registry: `shared/js/studio/projects.json`
- Production validator: `tools/validate/run.mjs`
- Registry synchronizer: `tools/pipeline/sync-games-registry.mjs`
- Usage index builder: `tools/build-usage-index.mjs`
- Reference full GDD: `games/flashlight-cave/game-design.md`
- Reference local-video pipeline: `games/red-green-light/ASSETS.md`
- Reference pose/story packs: `games/story-stones/`
- Reference puppet/props/music: `games/my-puppet-band/`
- Reference recording/export/ragdoll: `games/puppet-retell/`
