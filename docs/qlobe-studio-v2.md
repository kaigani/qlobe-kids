# QLOBE Studio v2 specification

Status: direction + implementation contract
Extends: `docs/qlobe-studio.md` (v1 — its format definitions and verification
gates remain the live contract for shipped code until superseded phase by phase)
Primary URL: `/shared/js/studio/`
Written against repo state as of 2026-07-23. Every path, format, endpoint, and
count in this document was checked against the repository on that date; the
path audit (§13.1) re-verifies on every phase close.

Provenance: this spec supersedes the exploratory draft at
`../00-reference/260723 QLOBE Studio v2.md` (written without codebase access).
Appendix A records what was kept, adapted, and rejected from that draft, and why.

---

## 1. Purpose

QLOBE Studio is the local-first authoring suite for the QLOBE Kids platform.
v1 authored the puppet stack (characters, props, scenes, speech, music sync)
for three pilot games. v2 grows it into the authoring surface for the whole
platform — a library of reusable assets, a catalog of 100+ games on shared
engines, and the GenAI production pipeline that feeds both — without changing
what the platform is: a no-build static site authored primarily through agent
sessions.

The studio is an instrument panel, not a replacement IDE. It edits data,
previews with the real runtime, runs jobs, and reports health. Code — engines,
services, stage modules — is written in Claude Code sessions, never in the GUI.

## 2. Principles

Carried forward from v1 (still binding):

1. **What you see is what ships.** Previews use `puppet.js`, `theater.js`,
   `music.js`, and the same assets used by games.
2. **Source remains open and reviewable.** Authored output is formatted JSON and
   ordinary repository assets. Generated runtime databases are never the source
   of truth.
3. **No runtime build step.** Games run as static files. The localhost authoring
   server exists only to write files and run local pipelines.
4. **Backward compatible migration.** Existing documents and both Studio URLs
   keep loading. Versioned adapters fill defaults for old data; saving
   materializes them.
5. **Reuse before specialization.** Shared packs provide defaults; overrides
   stay small and explicit.
6. **Safe persistence.** The authoring server only touches allow-listed roots,
   validates everything, writes atomically, and never accepts absolute paths or
   `..` traversal.
7. **Accessible authoring.** Essential controls are keyboard reachable,
   labelled, and usable without color alone. Canvas manipulation has numeric
   inspector equivalents.

New in v2 — constraints the platform already lives by, now stated as
first-class principles:

8. **Claude-Code-first authoring.** Parents and contributors build games in
   agent sessions; `CLAUDE.md` and `docs/` are the product surface. Everything
   the studio can do must also be doable (and scriptable) without it: every
   studio capability is backed by a document format, a CLI-runnable tool, or a
   server endpoint an agent can call. The studio complements agent authoring;
   it is never the only path.
9. **Git is the version store.** No parallel versioning system, no asset
   database, no pinned dependency graph. Documents carry `format` +
   `formatVersion` for schema evolution; git history covers everything else.
   Derived indexes (§8) are regenerated artifacts, safe to delete.
10. **Local-only.** No cloud, no accounts, no collaboration server, no
    analytics. The authoring server binds localhost. The GenAI host is a LAN
    ComfyUI wrapper passed at launch (`--qwen-url`); its address is never
    committed to this public repository.

## 3. Current state (inventory)

The ground this spec is built on. Counts are as of 2026-07-23.

### 3.1 Runtime platform

- Hub: `index.html` + `js/hub.js` + `js/registry.js`, driven entirely by root
  `games.json` (`schemaVersion` 1; 10 categories as metadata, not folders).
  A game is invisible until registered there.
- Catalog: 102 registered games (4 `live`, 97 `beta`, 1 `archived`). ~96 are
  **pure config**: a folder holding an `index.html` stub, a `config.js` (data),
  `game.json`, `game-design.md`, `ASSETS.md`, and optional `assets/`.
- Engines (13, in `shared/js/engines/`): `choose-one`, `match-pairs`,
  `sort-into-bins`, `sequence-order`, `tap-count`, `pattern-continue`,
  `trace-path`, `build-assemble`, `observe-journal`, `coach-timer`,
  `story-stones`, `puppet-theater`, `puppet-band`. Contract:
  `createGame(config, mountEl) → { destroy() }`, mandatory `window.QLOBE_DEBUG`
  hooks (the invariant is per running game: most engines install the hook
  themselves; `story-stones` installs it in the consuming game's `js/main.js`),
  engine-owned loop/input/gentle-retry/celebration/idle-reprompt/
  reduced-motion. Most ship a `*.test.html` harness. `engines/art.js` (with its
  Pixi twin `stage/art-pixi.js`) resolves the shared art-ref grammar:
  `emoji:` | `shared:` | `char:` | `text:` | `swatch:`.
- Services (`shared/js/`): `audio.js`, `speech.js`, `sfx.js`, `tap.js`,
  `voice-clips.js`, `content.js`, `music.js`.
- Stage substrate (`shared/js/stage/`): `stage.js`, `puppet.js`, `theater.js`,
  `lipsync.js`, `mouth.js`, `pose-sprite.js`, `prop-pack.js`, `scene-pack.js`,
  `music-sync.js`, `spline.js`, `tween.js`, `particles.js`, on vendored PixiJS
  (`shared/vendor/pixi.min.js`). three.js r166 is also vendored for 3D games.
- Shared content: `shared/data/{words,letters,letter-objects}.json`, accessed
  only through `shared/js/content.js` resolvers.
- Characters (`shared/characters/`): 8 fully rigged (`bear`, `doggy`, `fox`,
  `frog`, `rabbit`, `unicorn`, `princess-lily`, `princess-zoe`: `rig.json` +
  10 part PNGs + 9 viseme heads + voice manifest with cue files) and 5
  anim-only (`leo`, `maya`, `nia`, `ravi`, `sam`: portraits, no rig). Portable
  acting clips in `shared/characters/acting-clips.json`.
- Templates: `templates/stub-game/` (engine-based; the common path) and
  `templates/game-family/` (hand-coded skeleton).

### 3.2 Studio v1

- Shell: `shared/js/studio/` — `index.html`, `studio.js`, `api.js`,
  `projects.js` + `projects.json` (`qlobe-studio-projects` v1, 3 projects),
  `studio.css`, `workspaces/{build,props,stage,stage-story-stones,music}.js`.
  The shell already routes nav → dynamic `import('./workspaces/<id>.js')` →
  `mount(host, ctx)` → cleanup. Nav is filtered per project; `?project=`,
  `?workspace=`, `?char=` carry state; `window.QLOBE_STUDIO` exposes debug
  hooks.
- Legacy embed: the Rig / Animate / Speech workspaces load
  `shared/js/stage/puppet-studio.html` (with `puppet-builder.js`) in an iframe
  via `?char=&mode=&embedded=1`. This is the largest single piece of studio UI
  and the main v1 → v2 porting target.
- Build workspace profiles (registry-selected): `canonical-puppet` (10-part
  biped + 9-viseme workflow), `scene-actor` (alpha-island part cutter writing
  `assets/actors/<id>/build.json`), `pose-library` (relabelled "Poses";
  paper-pop pose swaps on a normalized 1024 canvas).

### 3.3 Authoring server

`tools/puppet-studio-server.py` — pure-stdlib Python `ThreadingHTTPServer` on
`127.0.0.1:8000`; serves the repo statically and adds write/inference APIs.

Go-forward endpoints: `GET /api/studio/status`,
`GET|POST /api/studio/document?path=`, `POST /api/studio/asset?path=`,
`POST /api/studio/story-scene`, `GET /api/studio/jobs/<id>`.

Legacy endpoints (frozen in Phase 1, removed in Phase 3): `/api/puppet/{status,
projects,voices,jobs,file,qwen/extract,voice,cues,transcribe}` and the
`/__puppet_files__/` file bridge.

Safety invariants (restated in §9; binding on all new endpoints): allow-listed
roots only (`shared/characters`, `shared/props`, `games/<id>`, plus the
pipeline staging roots), kebab-case id validation, no absolute paths or `..`,
JSON parsed before write, byte-signature checks on uploads, atomic temp-file
replacement, 4 MB document / 32 MB asset ceilings.

Known gaps: the async job registry is in-memory (lost on restart); the voice
alignment chain defaults to MFA→Rhubarb, but the bundled macOS Rhubarb binary
segfaults — the cues actually shipping (e.g. the bear's) were produced by
`tools/lipsync/whisper-visemes.py` (faster-whisper + cmudict), bypassing the
server. §10 fixes both.

### 3.4 Document formats in the wild

| Format | Version | Instances |
|---|---|---|
| `rig.json` (implicit `qlobe-character` v1) | 1 | `shared/characters/<id>/rig.json` × 8 |
| Animation packs (portable clips; adapter-free JSON) | — | `shared/characters/default-clips.json`, `shared/characters/acting-clips.json`, per-rig `clips{}` blocks |
| Voice manifest (`schemaVersion` only — no `format` field yet) | 1 | `shared/characters/<id>/voice/manifest.json`, game audio manifests |
| `qlobe-pose-actor` | 1 | `games/story-stones/assets/pose-actors/<id>/poses.json` |
| `qlobe-prop-pack` | 1 | `games/{story-stones,puppet-problem-solvers,my-puppet-band}/assets/props/pack.json` |
| Scene pack | 1 | `games/puppet-problem-solvers/scene-pack.json` |
| `qlobe-music-sync` | 1 | `games/my-puppet-band/music-sync.json` |
| `qlobe-story-pack` | 2 | `games/story-stones/story-pack.json` (220 stories, embedded regen recipes) |
| `qlobe-studio-projects` | 1 | `shared/js/studio/projects.json` |
| `games.json` registry | `schemaVersion` 1 | root `games.json` |
| Per-game manifest | — | `games/<id>/game.json` (with `uses[]`) |

Clip resolution order (platform defaults → shared packs → character overrides
→ scene overrides) is unchanged from v1. v1's proposed standalone **Set Pack**
was never implemented as its own file — floor lines and marks live inline in
scene packs and story packs; it is officially folded in (Appendix B).

### 3.5 Production pipeline as practiced

All generation is offline against the LAN ComfyUI wrapper (recipes in the
project-level `local-genai` skill; host never committed). The proven lifecycle:

```
brief (game-design.md art list + verbatim voice script)
→ generate  (batched by workflow type; seed ladder 42 → 1337 → 9001)
→ stage     (../02-generated/<game>-assets/raw/ — outside the public repo)
→ extract   (qwen-image-layered, layer_2 = subject alpha; chroma-key for
             GPT-Image masters)
→ QA        (images: alpha histogram + magenta composite;
             voice: whisper-stt transcript vs intended text, every clip)
→ finalize  (deterministic scripts: bbox-crop, resize, fixed-canvas normalize —
             e.g. tools/build-storybook-poses.py, tools/story-stones-assets.py)
→ finals    (games/<id>/assets/… or shared/assets/…, compact webp/png/m4a)
→ manifests (audio manifest.json with _v cache-bust; packs)
→ validate  (tools/validate-story-stones.mjs is the reference validator)
→ register  (game.json + games.json entry / status flip)
```

Provenance is already kept four ways: committed `assets/source/` trees,
per-game `ASSETS.md` tables (source, processing, license — CC BY 4.0),
machine-readable regen recipes embedded in packs (`story-pack.json` stores
prompt/seed/dims/steps/cfg for all 220 backdrops so the images need not be
committed), and `../00-reference/puppet parts/<id>/` intermediates for rigs.

Honest pain points v2 must fix:

- **Two pipeline generations coexisted.** `tools/content-pipeline/` (9
  scripts) hard-coded the predecessor repo path (`260612 phonics game`) and
  its `sound-sprouts` layout, while current games ran ad-hoc scripts from
  `../02-generated/`. *Resolved in Phase 3:* keepers ported to
  `tools/pipeline/` with root/host parameterized, remainder retired to git
  history (§11).
- **The ComfyUI host is one queue that swaps models per request.** Interleaving
  workflow types craters throughput ~25×. Batching by workflow type is a
  design constraint on the job system (§10), not an optimization.
- **Aligner drift** (§3.3): the documented MFA→Rhubarb chain is not the path
  that produced shipping cues.

### 3.6 Documented drift (to correct at first touch)

- `CLAUDE.md` says the only vendored library is three.js; PixiJS is also
  vendored (`shared/vendor/pixi.min.js`) and load-bearing for the stage stack.
- `CLAUDE.md` documents `status ∈ live|in-design|proposed|archived`; the data
  has 97 `beta` games and the hub styles them. The data is authoritative:
  **`beta` joins the documented vocabulary** (`live | beta | in-design |
  proposed | archived`).
- Voice manifests carry `schemaVersion` but no `format` field; they become
  `qlobe-voice-pack` v1 at first touch (§7.2).

## 4. Terminology

Precise meanings, with the repo reality each term maps to. These words are used
consistently across studio UI, docs, and formats from v2 onward.

| Term | Meaning | Repo reality |
|---|---|---|
| Media | An atomic source or derived file, before it joins a pack | `../02-generated/**/raw/`, `games/<id>/assets/source/`, `../00-reference/puppet parts/` |
| Asset / Pack | A game-aware document (`format` + `formatVersion` + stable id) plus the files it references | `rig.json`, `pack.json`, `poses.json`, `story-pack.json`, voice manifests |
| Service | Cross-cutting runtime capability | `shared/js/*.js` |
| Stage module | Puppet/theater substrate unit | `shared/js/stage/*.js` |
| Engine | A complete configurable activity loop | `shared/js/engines/*.js` |
| Template | A scaffolding starting point for a game | `templates/stub-game/`, `templates/game-family/` |
| Game | A registered folder: config on an engine, or hand-coded | `games/<id>/` + `games.json` entry |
| Scene | A beat-grammar composition inside a game or scene pack | scene packs, story-pack beats |
| Assemble | Turning prepared media into a multi-part asset (a rigged character, a pose actor) — renames the studio "Build" workspace | build profiles `canonical-puppet`, `scene-actor`, `pose-library` |
| Publish / Release | Flipping `status` in `games.json` + git push | there are no build artifacts |

Deliberate non-terms: **"Build"** no longer names a workspace (there is no
build step to confuse it with — the rename is purely to keep "build" available
for its ordinary meaning in conversation and docs). **"Collection"** is not an
artifact: curated groupings are expressed as facets/tags (§8.3), never as a new
document format. "Pack" keeps its existing meaning (a data document), which is
why the exploratory draft's "packs = reference collections" is not adopted.
One legacy naming wart, kept for compatibility: `POST /api/studio/asset`
uploads **Media** (raw image bytes) in this glossary's terms — the endpoint
name predates the glossary and keeps its path.

## 5. Information architecture — five domains

Primary navigation for Studio v2:

```
GENERATE     LIBRARY     MODULES     GAMES     PRODUCTION
```

Each domain is a stable map of one part of the platform; opening an object
inside a domain switches to that object's contextual workspace (§9.2). The
`?project=` scoping from v1 survives as a saved filter (a project pre-filters
each domain to its objects), not as the primary axis.

### 5.1 Library

Reusable content, independent of any one game.

Maps to: `shared/characters/` (rigged + anim-only), prop packs and pose actors
(today in game folders; the server-allow-listed `shared/props` root exists for
promotion when a prop set becomes cross-game), voice sets, scene/story packs,
`shared/assets/` (objects, letter-tiles, audio, foods, instruments, ui,
twemoji), `shared/data/` content (browsed via `content.js` semantics).

The studio provides: facet browse (type, capability tier, art world, license,
usage — powered by the usage index §8), per-object contextual workspaces,
completeness reporting (e.g. "characters missing viseme heads or voice cues"),
and safe editing through the document API.

Explicitly not: a media database. Media staging stays on disk under the
existing conventions (§3.5); the Library shows packs and their referenced
files, with provenance links to `ASSETS.md` and regen recipes.

**Unassigned media (Phase 5).** `shared/media/` is the Library's staging
shelf: an allow-listed root where generated (or imported) assets live as
first-class Library objects before they belong to anything. Each media
object is the asset file(s) plus a `qlobe-recipe` sidecar (§7.6). Library
facets include `unassigned`; the **Assign to…** action moves the asset into
`shared/assets/<category>/`, a game's `assets/`, or a character directory —
appending the provenance line to the destination's `ASSETS.md` where one
exists and keeping the recipe sidecar adjacent, so lineage survives
assignment.

### 5.2 Modules

Reusable runtime behavior: **Engines**, **Services**, **Stage**, **Templates**
(the inner objects keep their repo names; "Modules" is only the domain label).

The studio provides: a browsable inventory with each module's contract/README,
a launcher for its `*.test.html` harness, and its consumer list ("used by 21
games") from the usage index.

**Hard boundary: read, browse, document, test — never edit.** Module code is
authored in agent sessions. The studio never writes under `shared/js/`.

### 5.3 Games

Maps to: root `games.json`, per-game `game.json`, per-game `config.js` /
`config.json`.

The studio provides: registry views with facets (category, status, engine,
characters, world), and a per-game dashboard: manifest, `uses[]`, asset
completeness, validation results, playtest launch, `QLOBE_DEBUG` smoke status.

Editing depth follows the config format:

- **Existing games (`config.js`, a JS module): read-only.** The studio renders
  dashboards and launches playtests but never rewrites a JS module.
- **New engine games adopt `config.json` + a thin `config.js` shim** (§7.4).
  For these, the studio can edit content — mode copy, art refs, voice keys,
  item lists — through the document API, validated against the engine's
  config schema.
- Registration (a new `games.json` entry) and status flips are studio actions
  gated by validation passing.

### 5.4 Production

Processes and status, not content categories.

Maps to: the authoring server's job system, the validator suite, the pipeline
tools under `tools/`, and the staging conventions in `../02-generated/`.

The studio provides: the job queue (persistent, batched by workflow type,
§10), validation dashboard (§8), completeness/usage reports, and the pipeline
runbook. Generate is its own domain (§5.5), owning the template catalogue and
the review loop; Production keeps the queue those jobs run through and
reports their status. Inline "generate this" affordances on an object remain
legitimate — they enqueue through the same endpoint — but they are no
longer the only route in.

Explicitly not: builds or release channels. Publishing is a `games.json`
status flip; deployment is git push to GitHub Pages. The studio reports
status; it does not push.

### 5.5 Generate

The means of production: every generative call the studio can make is a
registry template (§7.7), and this domain is where a template is picked,
filled in, and run.

Maps to: `shared/data/generate-templates.json` (the template + style
registry), `shared/media/` (where a run lands before it is assigned), and
the authoring server's generate endpoint (`POST /api/studio/generate`,
`GET /api/studio/templates`) feeding the same job system Production
displays.

The studio provides five tabs. **Menu**, **Character**, **Prop**, and
**Scene** each hold a left rail of that section's groups and templates plus
a form pane: the selected template's fields, its style picker, `examples[]`
chips that fill the big field, an id and seed, and a Generate button, with a
"Recent outputs" strip of what that template has already produced beneath
it. **Review** is the whole unassigned-media queue, independent of section:
provenance, accept, reject, assign, regenerate, over everything sitting in
`shared/media/` waiting for a home.

The review loop is the domain's other half. **Provenance** opens the full
recipe — every step, prompt, seed, and QA result. **Regenerate** re-enqueues
the frozen recipe, not the live template (§7.7). **Accept** marks QA
approved; **Reject** moves the folder to a git-ignored trash. **Assign
to…** moves the asset and its recipe sidecar into `shared/assets/…`, a
game's `assets/`, or a character folder, appending the provenance line to
the destination's `ASSETS.md`.

`DEFAULT_WORKSPACE` deliberately stays `rig`, not Generate: Generate is
first in presentation, but it needs both the authoring server and the LAN
GenAI host reachable, which makes it a poor no-server landing default.

Under static preview (no authoring server), Generate still browses the
registry and renders every form from the committed
`shared/data/generate-templates.json` — only the actions that would enqueue
a job disable.

Explicitly not: a prompt scratchpad. The client supplies field values and a
style choice, never prompt material — the server expands the committed
template at enqueue, so the registry's transcribed prompts are the only
prompts that ever run (§7.7). Hub tiles are never auto-assigned out of
Review; the menu-tile templates carry an `assignHint` routing the accepted
file to the maintainer by hand instead.

## 6. Data-model conventions

1. **Identity.** Every document: `format`, `formatVersion` (integer), stable
   kebab-case `id` matching its directory where applicable. Art paths resolve
   relative to the document.
2. **Unknown-field preservation** (carried from v1): editors keep fields they
   don't understand; adapters fill defaults in memory; saving materializes
   computed values.
3. **Versioning stance.** Rejected: versioned asset URIs, per-game version
   pinning, a live dependency database. A single shared copy of each asset,
   git history as the timeline, `formatVersion` for schema breaks. The
   questions pinning would answer are answered instead by the usage index and
   validators (§8): *which games use this asset* (index), *what breaks if it
   changes* (validators run over the index's consumer set).
4. **Provenance.** Formalized as convention, not database:
   - finals reference their committed sources (`assets/source/` trees stay);
   - every game logs asset provenance in `ASSETS.md` (source, processing,
     license);
   - generated media that is *not* committed must carry a machine-readable
     regen recipe in its owning pack — `{ workflow, prompt, seed, width,
     height, steps, cfg }`, the `story-pack.json` pattern promoted to a rule;
   - staged raws are never overwritten by later stages (each derivative is a
     new file that knows its source).
5. **Derived indexes are disposable.** `shared/data/usage-index.json` (§8.2)
   and any report artifacts are tool-regenerated, never hand-edited, and safe
   to delete. They carry `generatedBy` + `generatedFrom` fields so staleness
   is detectable.

## 7. Format changes in v2

### 7.1 `qlobe-studio-projects` → formatVersion 2 (object-centric registry)

v1's registry is project-shaped: each project hard-declares its workspaces.
That worked for 3 pilot games; it does not scale to a library. fv2 is
object-centric: the registry enumerates (or globs) **objects**; workspace tabs
derive from object type.

```json
{
  "format": "qlobe-studio-projects",
  "formatVersion": 2,
  "objects": [
    { "type": "character", "id": "bear", "document": "shared/characters/bear/rig.json" },
    { "type": "pose-actor", "id": "dragon", "document": "games/story-stones/assets/pose-actors/dragon/poses.json", "project": "story-stones" },
    { "type": "prop-pack", "id": "my-puppet-band-props", "document": "games/my-puppet-band/assets/props/pack.json", "project": "my-puppet-band" },
    { "type": "scene-pack", "id": "puppet-problem-solvers", "document": "games/puppet-problem-solvers/scene-pack.json", "project": "puppet-problem-solvers" },
    { "type": "game", "id": "then-now-sort", "document": "games/then-now-sort/game.json" }
  ],
  "projects": [
    { "id": "story-stones", "label": "Story Stones", "gameBase": "../../../games/story-stones/" }
  ]
}
```

fv1 documents keep loading through an adapter (each v1 project expands to its
implied objects). Character-type objects may declare `assembleProfile`
(`canonical-puppet` | `scene-actor` | `pose-library`) exactly as v1's build
profiles did.

### 7.2 `qlobe-voice-pack` v1

Voice manifests gain identity at first touch (adapter accepts the current
shape):

```json
{
  "format": "qlobe-voice-pack",
  "formatVersion": 1,
  "id": "bear",
  "lines": [
    { "id": "intro", "label": "Intro", "audio": "intro.m4a",
      "cues": "intro.cues.json", "cueMap": "identity",
      "aligner": "faster-whisper+cmudict", "offsetMs": 0,
      "dur": 2.689, "text": "Howdy, I'm Benny the Bear!" }
  ]
}
```

`lines[].aligner`, `offsetMs`, and the cue files' metadata blocks are the
provenance trail for speech and must be preserved by every editor.

### 7.3 `qlobe-character`: capability tier

Character packs declare what they can do, so the Library can facet on it and
validators can check the right requirements:

```json
{ "format": "qlobe-character", "formatVersion": 1, "id": "maya",
  "tier": "anim-only" }
```

`tier ∈ rigged | anim-only | pose-actor`. Adapters infer the tier for legacy
documents (a `rig.json` with `bones[]` is `rigged`).

### 7.4 Game `config.json` + shim (new games)

`templates/stub-game/` gains the pattern:

```js
// config.js — thin shim so index.html keeps a single import shape
const config = await fetch(new URL('./config.json', import.meta.url))
  .then((r) => r.json());
export default config;
```

The shim uses `fetch` + top-level await unconditionally. JSON import
attributes (`import … with { type: 'json' }`) were considered and rejected:
they require iOS Safari 17.2+ / Firefox 138+, too new for a tablet-first
audience playing on hand-me-down devices, while top-level await has been safe
since Safari 15 / Chrome 89 / Firefox 89. Phase 4 still verifies the shim on
real devices, including an older-iOS profile.

Rules: new engine games use `config.json`; existing `config.js` games are
untouched (studio: read-only) and migrate only when a task touches them
anyway. Engines are agnostic — they receive the same object either way.

### 7.5 `games.json`

`schemaVersion` stays 1. `beta` is added to the documented status vocabulary
(matching 97 existing entries). No structural change.

Ownership is split. `game.json` is canonical for `title`, `status`,
`category`, `age`, `accent`, and `modes` (the `{id, title, skill}` subset);
`games.json` mirrors those six fields and alone owns `path`, `icon`, `uses[]`,
`iconBg`, `iconFit`, `summary`, entry ordering, `categories[]`, and
`schemaVersion`. `tools/pipeline/sync-games-registry.mjs` regenerates the
mirrored fields — `--check` reports drift (exit 1 if any), `--write` applies
it, `--only <ids>` scopes either to specific games. `games.json` round-trips
byte-identically through `JSON.stringify(value, null, 2)` and Python's
`json.dumps(indent=2, ensure_ascii=False)`, with no trailing newline, so the
sync tool and the authoring server's `set_game_status()` (which dual-writes
`game.json` and `games.json` on `POST /api/studio/game-status`) produce
identical bytes. Note the `icon` naming collision: in `games.json` it's the
curated hub tile path (`assets/hub/tiles/<id>.jpg`, hands-off); in `game.json`
it's an emoji glyph. Same key, different field, never synced.

### 7.6 `qlobe-recipe` v1 (Phase 5)

The machine-readable provenance sidecar for generated media — the
`story-pack.json` regen-recipe pattern (§6, provenance) promoted to a
standalone format. One `<asset>.recipe.json` next to each generated file:

```json
{
  "format": "qlobe-recipe",
  "formatVersion": 1,
  "id": "icon-watering-can",
  "kind": "image",
  "steps": [
    { "workflow": "krea2-turbo-t2i", "prompt": "…", "seed": 42,
      "width": 1024, "height": 1024 },
    { "workflow": "qwen-image-layered", "output": "layer_2" },
    { "op": "finalize", "crop": "bbox+12", "maxSize": 640, "encode": "png8" }
  ],
  "refs": { "style": "shared:objects/cat.webp", "voice": "teacher" },
  "derivedFrom": null,
  "qa": { "alpha": { "partialPct": 0.8 }, "status": "accepted" },
  "created": "2026-07-24"
}
```

Rules: the GenAI host is never stored (env only); named refs are symbolic
(`teacher`, `shared:` art refs), not machine paths; `derivedFrom` points at
the source media id for extraction/derivation chains (never overwrite
earlier stages — each derivative is a new file that knows its source);
`steps[]` must be sufficient for **Regenerate** to re-enqueue the job
unchanged (a new seed is an explicit edit). Voice recipes record the QA
transcript comparison; image cutouts record the alpha histogram.

**`kind: "pose-actor"` (Phase 6.3)** — the one recipe kind that is an
ASSEMBLY rather than a generation. Six already-reviewed pose media objects
are normalized into a `qlobe-pose-actor` pack, so there is no prompt and no
workflow: one local `op: "assemble-pose-actor"` step records the canvas,
baseline, shared scale and encoding, and names its six sources. Because the
shippable artifact is a FOLDER, two keys are specific to it: `asset` is the
pack's `poses.json` (what **Assign to…** moves, with the `poses/` directory
beside it) and `preview` names a flat image in the media folder for the
Review card to thumbnail. Lineage keeps `derivedFrom` as the single root
(the set's neutral, so the provenance chain still walks) and adds
`derivedFromSet` listing all six.

### 7.7 `qlobe-generate-templates` v1 (Phase 6)

The committed registry of generation recipes at
`shared/data/generate-templates.json` — one file, one static fetch, one
validator subject. A year of proven prompts previously lived in throwaway
shell scripts, per-game asset logs, and agent memory; this format is where
they live now. The name deliberately avoids "templates" alone, which already
means the game scaffolds under `templates/`.

A **style** is an art world (§ art-direction): a label, a status, and the
prompt suffix that makes an image belong to that world. A **template** is a
prompt with holes in it, plus the workflow, dimensions, seed, and references
needed to run it. The two are orthogonal — one scene backdrop template
crossed with four styles is four looks, not four templates.

```json
{
  "format": "qlobe-generate-templates", "formatVersion": 1,
  "styles": {
    "toy-table": { "label": "Toy Table", "status": "proven",
                   "suffix": "Bright, soft 3D cartoon style…, no text.",
                   "refs": { "style": "shared:refs/bus.png" } },
    "field-journal": { "label": "Field Journal", "status": "unproven",
                       "suffix": "soft gouache and watercolour…" }
  },
  "templates": [{
    "id": "scene-backdrop", "label": "Scene backdrop",
    "section": "scene", "group": "backdrop",
    "kind": "generate-image", "workflow": "krea2-turbo-t2i",
    "width": 1344, "height": 768, "seed": 42,
    "prompt": "Use case: illustration-story. Primary request: {setting}. Style/medium: {style.suffix} Lighting/mood: {mood}. Avoid: text, watermark, UI.",
    "fields": [
      { "name": "setting", "label": "Setting", "type": "textarea", "required": true },
      { "name": "mood", "label": "Lighting / mood", "type": "text", "default": "honey-gold light, gentle" }
    ],
    "styles": ["storybook", "toy-table", "field-journal"],
    "defaultStyle": "storybook",
    "variants": { "toy-table": { "prompt": "{setting}, open empty stage. {style.suffix}" } },
    "examples": ["Amber Acorn Village, a tiny woodland village…"],
    "assignHint": "keep the accepted file under about 300 KB",
    "provenance": "the Story Stones backdrop slot template; the puppet-band stage background"
  }]
}
```

Rules:

- **Slots** are `{fieldName}`, naming a declared field, plus the one reserved
  slot `{style.suffix}`. A slot that matches neither is a validation error, not
  a literal brace — there is no escape syntax, because a prompt has no reason
  to contain one.
- **Fields** are `text`, `textarea`, `select` (with `options[]`), or `number`.
  A `required` field has no default; everything else does. Field names are the
  contract the server expansion and the studio form both read.
- **Variants** are keyed by style id and shallow-override `prompt`, `workflow`,
  `width`, `height`, `seed`, and `refs` — no deep merge, no inheritance chain.
  A style whose look needs a different prompt gets a variant; a style that only
  needs a different suffix does not.
- **`kind`** is `generate-image`, `cutout-chain`, or `generate-voice`, and
  `workflow` must be one the server will dispatch. A cutout chain also declares
  its `target` so the finalize step knows what size to resize to; it must *not*
  write the dark charcoal ground into its prompt, because the server appends
  that to every cutout.
- **Refs are symbolic**, exactly as in §7.6: `shared:<path>` under
  `shared/assets/`, or a named key configured on the operator's machine. The
  style anchors themselves are committed under `shared/assets/refs/`, so a
  `shared:` ref resolves on any checkout and the validator can prove it. A
  style's own refs are merged only when the resolved workflow is an edit
  workflow — a text-to-image workflow has nothing to do with a reference image.
  A template's refs win over a style's; a `refSlots[]` entry declares a
  reference the operator supplies per run (a body sheet, a concept screen).
- **`gallery` and `default`** are two additive optional keys on a `refSlots[]`
  entry. `gallery` is an array of candidate sources for the studio's reference
  gallery chooser: each entry is either the literal `media` (the operator's
  current `shared/media/` staging objects) or `shared:<dir>`, naming a
  directory directly under `shared/assets/` (`shared:ui`, `shared:refs`,
  `shared:objects`); it is presentation-only, since the server never reads it,
  and instead backs `GET /api/studio/ref-candidates`. `default` is a
  registry-declared fallback in the same symbolic-ref grammar as `refs` — a
  `shared:` path or a bare styleRefs key — that the server applies to the slot
  when a run supplies no value, the way `menu-ui-button`'s `style` slot
  defaults to the shared home-button icon so a restyle run starts from a
  sensible button rather than an empty slot. A slot named `identity` is the
  optional SECOND reference an edit workflow accepts — dispatched as the
  workflow's `image2`, resolved exactly like `style` — so a layout picture and
  a character picture no longer have to fight over one slot; a template that
  declares no such slot is unaffected. A `select` field's option may also carry
  extra presentation keys the studio reads and the expander ignores (the pose
  enum's `action` holds the wording each derived pose is generated with).
- **Prompts are transcribed verbatim**, never referenced by path. The corpus
  they came from is private, so a template that cites its source instead of
  carrying it is a template that stops working when that directory moves. Where
  a proven prompt was game-specific, the subject is opened up as a field and the
  concrete past values are kept in `examples[]` — which is what the studio
  offers as suggestion chips, so examples are field values, not whole prompts.
  No absolute path, host, or URL may appear anywhere in the registry;
  `tools/validate/validators/generate-templates.mjs` sweeps every string.
- **Status** is `proven` (harvested from a run whose output was accepted) or
  `unproven` (drafted from the art direction and never run). A proven style must
  carry a suffix. Unproven styles are selectable and badged as such; promoting
  one after its first accepted generation is a one-word edit.
- **Regenerate replays frozen steps.** A template is expanded once, at enqueue,
  and the expanded prompt is written into the media object's `qlobe-recipe`
  `steps[]`. Regenerate re-runs *that*, not the template. So editing the
  registry changes future runs only, and an asset generated last month keeps
  reproducing exactly as it was made. This is the intended semantics, not a
  staleness bug: the recipe is the provenance record, and provenance that
  rewrites itself is worthless. The recipe's `template` block records which
  template and style produced it, so the link back survives.

## 8. Validation, usage index, and reports

The platform's answer to "what breaks?" — replacing the rejected dependency
database.

### 8.1 Validator framework

Generalize the `tools/validate-story-stones.mjs` pattern (Node, zero deps,
exhaustive, exit-code + JSON output) into `tools/validate/`:

- **Per-format validators**: one module per format in §3.4/§7 (shape, id/path
  discipline, referenced-file existence, art dimensions where cheap, cue
  monotonicity, viseme-set membership).
- **Per-game completeness**: manifest ↔ folder agreement, `uses[]` ↔ actual
  imports, audio manifest ↔ files, `ASSETS.md` present, registry entry
  consistent with `game.json` — the six mirrored fields (`title`, `status`,
  `category`, `age`, `accent`, `modes`) are ERROR-level agreement checks,
  fixed by running `tools/pipeline/sync-games-registry.mjs --write`.
- **Cross-cutting checks**: lowercase-relative paths, no CDN/model URLs in
  runtime code, orphaned assets, characters missing viseme heads or voice
  lines for their tier.

Dual consumption is the contract: CLI (`node tools/validate/run.mjs [target]`)
for agent sessions and CI-ish checks; JSON via `GET /api/studio/validate` for
the Production dashboard. Same code, both surfaces.

### 8.2 Usage index

`tools/build-usage-index.mjs` regenerates `shared/data/usage-index.json` by
scanning: `games.json`, every `game.json` (`uses[]`, `characters[]`), static
imports in game `index.html`/`config.js`/`js/`, and pack references
(`actorPack`, `propPack`, `scenePack`, backdrops, audio manifests). Output:
forward (`game → assets, engine, characters`) and reverse (`asset → games`)
maps, plus per-engine consumer counts. Served at `GET /api/studio/usage-index`.

The index answers, as reports rather than live guarantees: which games use
this asset; which use an outdated engine contract; which assets nothing uses;
what a change to X touches (validators then run over exactly that set).

### 8.3 Facets

Browse/search everywhere runs on metadata already in documents — category,
status, engine, tier, art world, license, plus `age` and `learningGoals[]`
from `game.json` — with free-form `tags[]` allowed on any pack and on
`game.json` for everything the structured fields don't cover. This is
deliberately narrower than the exploratory draft's full facet taxonomy
(curriculum objective, language, input method, accessibility status become
structured fields only when real data exists to fill them). Curated groupings
("cozy forest set") are saved facet queries in the studio's local state —
never a committed artifact.

## 9. Studio application

### 9.1 Shell

The v1 shell pattern is kept and generalized: nav → dynamic
`import('./workspaces/<id>.js')` → `mount(host, ctx)` → disposer. The v1
`ctx` (`params`, `toast`, `openWorkspace`) gains `object` (the registry entry
being edited) and `api` (document/asset/jobs client). `window.QLOBE_STUDIO`
debug hooks remain mandatory for every workspace (browser automation is a
verification gate).

The shell is a **three-row chrome**, one row per level of the hierarchy
(Phase 6.2 tuned the visual weight of each so they stop competing):

1. **Domain row** — the five domains (§5) as large bordered tabs, plus the
   brand, the server-status pill and the Legacy Studio link.
2. **Context row** — a workspace's internal views on the left (a quiet
   segmented control the shell paints from `ctx.setNav`), and the character /
   stage workspaces on the right as a second segmented cluster. Those seven
   buttons were demoted out of the domain row in Phase 6.2: they are global
   workspaces, not domains, so they stay permanently visible but never carry
   domain weight. Their `?project` availability filtering hides a whole
   `[data-nav-group]` structurally once every workspace inside it is
   unavailable.
3. **Breadcrumb row** — plain text, never boxed buttons.

The shell owns both lower rows' DOM outright; workspaces drive
them only through two more `ctx` functions:

- `ctx.setNav({tabs, activeTab, crumbs, count})` — full-replace render. The
  shell paints the secondary-nav tabs (managing `.on` / `aria-selected`), hides
  that row when `tabs` is empty, renders the breadcrumb trail (interactive
  segments, a non-interactive current segment, `›` separators) plus a
  right-aligned count pill. The shell resets both rows to a default root crumb
  (labelled from the primary-nav button) on **every** `openWorkspace`, including
  the iframe path, and a **mount-generation guard** makes a late `setNav` from a
  workspace the user already left a no-op — the "stuck breadcrumb / stale
  `?project`" bug class dies here. The removable `?project` chip is rendered
  automatically from the query string, not by the workspace.
- `ctx.setParam(key, value)` (value `null` deletes) — the single choke point
  that syncs the shared `URLSearchParams` and `history.replaceState`, ending the
  double-bookkeeping that let a workspace and the shell disagree about the URL.

`window.QLOBE_STUDIO.getState()` gains `{tabs, activeTab, crumbs}` (labels only,
serializable) so browser automation can assert the shell state per workspace.

**Param hygiene** (every query param obeys these; the shell enforces the last):

1. **One owner** — exactly one workspace owns each param.
2. **Set on enter / delete on in-workspace return** — an owner sets its param
   when it drills in and deletes it when it returns to its own root view.
3. **Validate on mount, delete on failure** — an owner validates its param on
   mount and deletes an invalid value rather than carrying it.
4. **Mutate only via `setParam`** — no workspace touches `history` or the query
   string directly.

Top nav becomes the five domains (§5); the v1 two-cluster character/stage nav
moved down to the context row in Phase 6.2 (its rotated "Character" / "Stage"
plates replaced by a single hairline between the two `[data-nav-group]`
clusters) and retires entirely with the registry migration. The header keeps
the server-status pill
("authoring server" / "static preview") — static preview stays functional for
browse and JSON export, exactly as v1 promised.

### 9.2 Contextual workspaces per object type

The secondary-nav row (§9.1) is the structural landing zone for these tab sets:
a workspace publishes them through `ctx.setNav` and the shell renders the row.

Workspace tabs derive from object type + declared capabilities:

| Object | Tabs |
|---|---|
| Generate | Menu · Character · Prop · Scene · Review |
| Character (rigged) | Overview · Assemble · Rig · Animate · Speech · Preview · Usage |
| Character (anim-only / pose-actor) | Overview · Poses (or Portraits) · Preview · Usage |
| Prop pack | Overview · Props · Preview · Usage |
| Scene / story pack | Overview · Scenes · Preview · Usage |
| Music sync | Overview · Sync · Preview · Usage |
| Game | Overview · Content* · Validate · Playtest |
| Engine / Service / Stage module | Overview · Contract · Harness · Consumers |

\* Content tab is editable only for `config.json` games (§5.3). The table is
otherwise per object type; the domain-level workspaces (Generate, Production)
publish their own tab sets through this same row rather than deriving them
from an object.

No Versions tab (git), no Owner field (single-author platform). Usage tabs
read the usage index.

### 9.3 The iframe retirement

Rig, Animate, and Speech are ported from `shared/js/stage/puppet-studio.html`
(1,086 lines) + `puppet-builder.js` into native workspaces, one at a time, in
that order (Rig has the most shared substrate; Speech has the most server
coupling). The legacy URL stays alive and green until each ported workspace
reaches parity (v1's regression gates govern the cut-over); it is archived —
not deleted — when all three land. "Build" is renamed **Assemble** in the same
phase; the three profiles carry over unchanged.

## 10. Authoring server evolution

`tools/puppet-studio-server.py` remains a single stdlib-only Python file — no
pip dependencies, same launch, same localhost binding.

- **Namespace**: `/api/studio/*` is the only growing surface. `/api/puppet/*`
  froze at Phase 1 (bug fixes only). Phase 3 landed the `/api/studio/*`
  equivalents (voices/voice/cues/transcribe, sharing one implementation) and
  pointed the native workspaces at them; the frozen `/api/puppet/*` handlers
  remain as a documented **compat shim** for the embedded canonical-puppet
  Assemble builder, and are removed once that profile is ported off the
  legacy iframe (Phase 4 follow-up — amended from the original Phase 3
  removal plan when porting revealed the remaining dependency).
- **Persistent jobs**: the in-memory registry is replaced by a JSON job store
  under a git-ignored `tools/state/` directory. Jobs survive restarts; the
  queue **batches by ComfyUI workflow type** (drain all queued jobs of one
  workflow before switching models) — this is the single-queue model-swap
  constraint from §3.5, encoded in the scheduler, with a bypass flag for
  interactive one-offs.
- **New endpoints**, tagged with their landing phase:
  `GET /api/studio/objects` (the fv2 registry, resolved — Phase 1);
  `GET /api/studio/usage-index` (serves the committed index; `?refresh=1`
  re-runs the generator — Phase 2);
  `POST /api/studio/validate` (run validators for a target, return the JSON
  report — Phase 2, consumed by the dashboard in Phase 3);
  `GET /api/studio/completeness?type=character` (generalizing the old
  `/api/puppet/projects` counts — Phase 2);
  persistent `/api/studio/jobs` v2 — Phase 3;
  `GET /api/studio/templates` (the whole `shared/data/generate-templates.json`
  document, lazily loaded and mtime-cached — Phase 6);
  `POST /api/studio/media/<id>/extract` (remove the background from an
  already-generated media object — Phase 6.1);
  `POST /api/studio/media/<id>/send-to-assemble` (feed an accepted source
  sheet into the canonical-puppet build pipeline — Phase 6.3);
  `POST /api/studio/pose-actor/assemble` (six extracted pose sprites → one
  `qlobe-pose-actor` pack — Phase 6.3).
- **Send to Assemble**: the build pipeline reads its two author-supplied
  sheets off disk under the reference root, which is what the frozen
  `/api/puppet/file` writes as `kind=raw-base` / `kind=head-visemes`. The
  bridge COPIES an accepted body-sheet or viseme-grid media object to exactly
  those names for a validated kebab character id — the media object stays in
  staging and gains a symbolic `sentToAssemble` provenance note (character +
  slot, never the machine path). A second send is a 409 unless it passes
  `force`. Generate then deep-links into Assemble on that character, which is
  what makes the canonical-puppet profile REACHABLE from the means of
  production; porting that profile off the legacy iframe is still the open
  follow-up.
- **Pose-actor assembly**: the `assemble-pose-actor` job kind is local image
  work only — it shells out to `tools/pipeline/pose_actor_assemble.py` (PIL,
  the same subprocess discipline as `tools/pipeline/cutout_finalize.py`), so
  it carries no ComfyUI workflow and never waits behind the model queue. It
  normalizes each pose off the full-resolution layered extraction rather than
  the downsized cutout, and — unlike the per-pose fit in
  `tools/build-storybook-poses.py` — gives all six sprites ONE shared scale
  (`maxArt` over the largest subject dimension in the set) on one baseline, so
  a paper-pop swap cannot change how big the character is. The pack lands in
  `shared/media/` as a reviewable media object; **Assign to…** then moves the
  whole folder into a game's `pose-actors/` root.
- **Extract on existing media**: the cutout chain generates and extracts in one
  job, which suits a prop but not a review-gated set. The `extract-media` job
  kind is the other half: it keeps the pre-extraction original as
  `<id>.raw.png`, runs the same layered → alpha-QA → finalize tail as the
  chain (one shared implementation, not a copy), replaces `<id>.png` with the
  transparent asset, and APPENDS the extraction and finalize steps to the
  existing `qlobe-recipe` `steps[]` so the object stays regenerable as one
  chain. It is resumable and batches with every other `qwen-image-layered` job.
  A second run on the same object is a 409 unless it passes `force`. This is
  what the pose set is built on: a resting pose is reviewed opaque, five poses
  are edited from it, and only the accepted six lose their backgrounds.
- **Template expansion**: `POST /api/studio/generate` gains a template branch
  (§7.7). A body of `{template, styleId, fields, params}` is expanded
  server-side — slot substitution, per-style `variants` shallow merge, style
  refs merged only for edit workflows — into the same worker dispatch the
  existing raw-params body already uses, which is unchanged. Expansion runs
  once, at enqueue; `params` may carry only `id`, `seed`, `overwrite`, and
  values for the template's declared `refSlots` (symbolic refs, resolved like
  every other ref), so the client never builds a prompt and cannot drift from
  the registry. The expanded prompt is frozen into the media object's
  `qlobe-recipe` `steps[]`, alongside a `template` block recording
  `{id, style, fields}` (§7.7 "Regenerate replays frozen steps").
- **Canonical speech alignment**: the `whisper-visemes` chain
  (faster-whisper + cmudict → the 9-viseme set `a o e wr ts ln uq mbp fv` +
  `rest`) becomes the server's default aligner, matching how shipping cues
  were actually made. MFA remains an optional upgrade when installed; Rhubarb
  is demoted to a documented fallback with its macOS segfault noted. Cue
  metadata continues to record `aligner` and any fallback reason.
- **Invariants restated** (binding on every endpoint, old and new):
  allow-listed roots; kebab-case ids; no absolute paths, no `..`; JSON parsed
  before write; byte-signature validation on uploads; atomic replacement;
  4 MB / 32 MB ceilings; localhost only; GenAI host injected at launch.

## 11. Production pipeline consolidation

One pipeline generation, documented and repo-local:

1. The proven `../02-generated/` conventions (staging layout, seed ladder,
   QA gates, state/resume files) are written up as the pipeline contract in
   this repo's docs, and the reusable drivers get promoted from ad-hoc
   root-level scripts into `tools/pipeline/` with the repo root passed as an
   argument, not hard-coded.
2. **Keepers from `tools/content-pipeline/` are ported now** (paths corrected
   to this repo, model host injected): the image generator (`gen_images.py`
   pattern), the voice generator (`gen_audio.py` pattern), and the
   phoneme-exact reference generator (`gen_kokoro_rimes.py`) — these
   capabilities recur for any future phonics/content work. The A/B analysis
   pair (`analyze_rimes.py`, `gen_clone_candidates.py`) ports with them as a
   documented QA recipe.
3. The remainder of `tools/content-pipeline/` (predecessor-repo-specific
   post-processing and manifest builders) retires to git history; the recipes
   they encoded are already superseded by the layered-extraction standard.
4. Voice, image, and video QA gates (whisper transcript diff; alpha histogram
   + magenta composite) become validator modules (§8.1) so the Production
   dashboard and the CLI report the same truths.

## 12. Roadmap

Effort is in agent-sessions. Each phase closes with its gates green, the path
audit re-run, and a user checkpoint. Delegation: each phase is owned by an
Opus lead session that decomposes work to Sonnet task agents and QCs their
output; the top-level session sequences phases and integrates.

**Phase 0 — this spec** (1–2 sessions). Gates: scripted path audit finds zero
unverifiable claims; independent adversarial review; user sign-off on the
flagged judgment calls (§3.6, §7.3, §7.4).

**Phase 1 — Shell unification & registry v2** (6–10 sessions; the big one).
Registry fv2 + adapter (+ `GET /api/studio/objects`); Build→Assemble (syncing
`docs/puppet-pipeline.md` naming); port Rig, then Animate, then Speech; retire
iframe; freeze `/api/puppet/*`. Gates: legacy URL green until each cut-over;
all 8 rigged characters round-trip rig + voice edits byte-identically (modulo
formatting) through the new workspaces; both studio URLs zero console errors;
`QLOBE_STUDIO` smoke drive passes; v1 acceptance demonstrations still pass;
portrait and landscape workspace layouts remain usable.

**Phase 2 — Library, validators, usage index** (3–5 sessions).
`tools/validate/` framework; `tools/build-usage-index.mjs`; Library facet
browse + contextual tabs; provenance/regen-recipe convention documented;
`qlobe-voice-pack` + `tier` adapters. Gates: index reports known truths
(bear's consumers; engine counts match §3.1); validators green on every
existing pack or emit a triaged known-issues list; completeness report matches
the 8/5 character census.

**Phase 3 — Production domain & pipeline consolidation** (4–6 sessions).
Persistent job store + workflow-type batching; production dashboard;
`/api/studio/*` equivalents for the puppet endpoints; whisper-visemes as
default aligner; port content-pipeline keepers; remove `/api/puppet/*`.
Gates: an end-to-end batch (generate → extract → QA → finalize) survives a
server restart mid-queue; whisper QA green on regenerated clips; batching
verified (no model swap between same-workflow jobs); legacy endpoints gone
with no studio references remaining.

**Phase 4 — Games domain polish** (2–3 sessions). Game dashboards;
`config.json` + shim in `templates/stub-game/` (device-verified: iPad Safari
including an older-iOS profile, plus an Android WebView check); studio content
editing for config.json games; four-domain nav
complete with Modules browse. Gates: a new game scaffolded via `config.json`
is hub-registered, studio-editable, passes its engine smoke; `git status`
clean outside intended paths; hub + `sound-sprouts` + `puppet-problem-solvers`
play with zero console errors and zero 404s.

**Phase 5 — Media & Generation** (4–6 sessions). The means of production —
added when the Phase 4 checkpoint surfaced that no phase had built the
generation surface §5.4 promised: `shared/media/` unassigned bucket (new
allow-listed root + media objects in Library); `qlobe-recipe` v1 sidecars
(§7.6) written by every generation job; **+ Generate** flows in the studio
for the proven recipe kinds (UI icon / object card / prop cutout via
dark-ground → layered extraction → alpha QA / scene backdrop / voice line
via teacher clone → whisper QA), queued through the Phase 3 batching
scheduler with seed-ladder retry; **Regenerate** on any asset carrying a
recipe (including story-pack backdrops); provenance/lineage view (recipe →
derivation chain → QA → consumers from the usage index); **Assign to…**
flow out of the bucket. Gates: mock-host end-to-end chain (generate →
extract → QA → recipe → appears unassigned in Library → assign moves files
+ provenance) survives restart mid-chain; one real-host smoke generation
when the LAN host is reachable; recipe validator added to
`tools/validate/`; no host address in any committed byte.

**Phase 6 — GENERATE domain** (delivered). Style refs (the anchor images and
the teacher-voice clone) committed under `shared/assets/refs/`;
`qlobe-generate-templates` v1 (§7.7) written to
`shared/data/generate-templates.json` with 12 templates across 5 art
worlds; server-side expansion at enqueue — the `POST /api/studio/generate`
template branch plus `GET /api/studio/templates` to list the registry;
shared machinery pulled out to `shared/js/studio/workspaces/lib/generate-core.js`;
the Generate workspace promoted to the first primary-nav domain with its own
Menu · Character · Prop · Scene · Review tabs, the Review tab absorbing the
whole unassigned-media queue; the Library's `+ Generate` modal retired in
favor of a read-only `Media (unassigned)` facet with an "Open in Generate"
deep link. Gates: full validator sweep green including the new
`generate-templates` subject; path audit green; a real generation per kind
lands a `recipe.json` carrying its `template` block; browser drive across
all five Generate tabs; static preview degrades to browse-only.

## 13. Verification

1. **Path audit** (`tools/audit-spec.mjs`, built in Phase 0): extracts
   backticked paths, endpoints, and format names from this spec and checks
   them against the repository. Re-run at every phase close; drift is a
   failing gate. Honesty caveat: the script's planned-artifact allowlist is
   hand-curated next to the spec — an edit that adds a new not-yet-built path
   must update both, so "0 failed" is only as trustworthy as that discipline;
   reviewers should diff the allowlist alongside spec changes.
2. **Studio drives**: Playwright against the authoring server, through
   `QLOBE_STUDIO` / workspace debug hooks; long drives wrapped in
   `caffeinate -dims`.
3. **Regression suite from Phase 2 on**: validators + usage index + v1's
   server security tests (traversal, absolute paths, oversized, wrong roots
   all rejected).
4. **Platform untouched-check after every phase**: hub loads; reference games
   play clean.
5. **Layout check**: portrait and landscape workspace layouts remain usable
   (carried from v1's gate list; binding on every phase that touches the
   shell or a workspace).
6. Each phase lead attaches a QC report (what Sonnet agents produced, what QC
   caught, gate evidence) at close.

## 14. Non-goals

Carried from v1: general game/level editing beyond declared config schemas;
mesh deformation / weight painting; two-hand IK or constraint solving;
nonlinear blend trees; editing arbitrary JavaScript; cloud storage, accounts,
collaboration, or runtime network dependencies.

New in v2: no module/engine code editing in the studio; no dependency
database or version pinning; no build system; no analytics, telemetry, or
parental-control services (the platform's no-tracking rule outranks the
exploratory draft's suggestion); no collection artifacts; no CDN or remote
asset loads, ever.

---

## Appendix A — Decision log vs the exploratory draft

`../00-reference/260723 QLOBE Studio v2.md`, section by section:

| Draft proposal | Verdict | Grounds |
|---|---|---|
| Four-domain nav: Library / Modules / Games / Production | **Keep** | Endorsed; maps cleanly to `shared/*`, `shared/js/*`, `games/*`+registries, `tools/*`+jobs (§5) |
| Studio must stop being a linear production wizard | **Reject premise, keep destination** | v1 is already a workspace shell (`studio.js`); the real gaps were the legacy iframe and the project-shaped registry (§3.2, §7.1, §9.3) |
| Build a Components/Activity/Presentation/Services module system | **Reject build, adapt as browse** | The system exists: 13 engines + services + stage substrate with a working contract. Studio browses/tests it, never edits it (§5.2) |
| Activity modules should expose a contract (inputs/config/events) | **Keep — already true** | `createGame(config, mountEl)` + `QLOBE_DEBUG`; engines own the loop (§3.1) |
| Games become manifests/configurations of templates | **Keep — already true (~94%)** | ~96 of 102 games are config on engines; v2 adds `config.json` so the studio can write new ones (§7.4) |
| Template layer between module and game ("three-round tracing game") | **Adapt** | Engines already own the full flow (intro/retry/celebrate); the template layer is the scaffolds `templates/stub-game`, `templates/game-family` |
| Versioned URIs (`character://bear@3.2`), per-game pinning, dependency DB | **Reject mechanism, keep questions** | Git-versioned static repo, shared-first single-copy assets; `format`+`formatVersion` exists. Questions answered by usage index + validators (§8) |
| Packs as curated reference collections | **Reject** | Name collides with existing data packs; groupings are facet queries (§4, §8.3) |
| Production = jobs, validation, reviews, builds, releases | **Adapt: jobs + validation + reports; reject builds/releases** | No build step exists; release = status flip + git push (§5.4) |
| Lifecycle Source→Prepared→Assembled→Validated→Published→Deprecated | **Adapt** | Real lifecycle: brief→generate→stage→extract→QA→finalize→register (§3.5); game statuses: `live/beta/in-design/proposed/archived` |
| Rename "Build" → "Assemble" | **Keep** | Correct call even written blind (§4) |
| Contextual tabs per object type; tools appear because the asset supports them | **Keep, trimmed** | Implemented via type-derived tabs (§9.2); Versions/Owner dropped (git; single author) |
| Media provenance chain with derivative tracking, never overwrite stages | **Adapt — formalize existing practice** | Already practiced via `assets/source/`, `ASSETS.md`, regen recipes; becomes convention + recipe rule (§6, provenance) |
| Facets, not folders | **Keep, narrowed** | `games.json` categories are already metadata; extended platform-wide, but only fields with real data become structured facets — the rest is `tags[]` (§8.3) |
| Global action bar (`+ CREATE  SEARCH  PLAYTEST  PUBLISH`) | **Reject bar, keep actions contextually** | Create/playtest live on objects and game dashboards; publish is a validation-gated status flip (§5.3); search/facets live in each domain's browse (§8.3) |
| Curriculum Map view; curriculum-area facets | **Adapt, deferred** | Curriculum metadata today is `games.json` categories + `game.json` `learningGoals[]`/`age`, all facetable (§8.3); a dedicated curriculum-map view is a saved facet query, promoted to a nav item only if real curriculum data (objectives per mode) ever gets authored |
| Platform services incl. analytics, parental controls, localization, save/resume | **Reject list, keep layer** | Real services are `shared/js/*`; analytics/parental-controls violate the no-tracking rule (§14) |
| "Generate" as a contextual action, not a top-level section | **Kept, then reversed (Phase 6)** | Phase 6 promoted Generate to the first primary-nav domain (§5.5) at the user's direction (2026-07-24): the contextual-action framing left no home for the template catalogue or the review queue. Inline generate affordances on an object survive as shortcuts into it |
| Every object: stable ID, type, version, status, owner, tags, dependencies, reverse refs, provenance, schema, preview, manifest | **Adapt** | Kept: id/format/formatVersion/tags/provenance/validation. Dropped: owner, live dependency+reverse-ref storage (computed instead), separate runtime manifest |

## Appendix B — Deprecation register

| Item | Status | Retired |
|---|---|---|
| `shared/js/stage/puppet-studio.html` + `puppet-builder.js` as embedded iframe | Port source | Phase 1 (URL archived at parity) |
| `/api/puppet/*` endpoints + `/__puppet_files__/` bridge | Frozen Phase 1; Phase 3 landed `/api/studio/*` equivalents and retained the frozen handlers as a compat shim for the Assemble canonical-puppet embed | When that Assemble profile is ported off the iframe (Phase 4 follow-up) |
| `qlobe-studio-projects` formatVersion 1 shape | Read via adapter | Phase 1 (write side) |
| In-memory job registry | Replaced by `tools/state/` store | Phase 3 |
| MFA→Rhubarb default aligner chain | Demoted to optional/fallback | Phase 3 |
| `tools/content-pipeline/` (9 scripts, predecessor-repo paths) | **Retired Phase 3** — keepers ported to `tools/pipeline/` (host from env/args), rest in git history | Done |
| Root-level ad-hoc drivers in `../02-generated/` | Conventions promoted into `tools/pipeline/`; the in-repo `tools/generate-story-stones-*.py` drivers were host-parameterized in Phase 3, full port pending | Phase 3 (partial) → follow-up |
| "Build" as a workspace name | Renamed Assemble | Phase 1 |
| Voice manifests without `format` field | Become `qlobe-voice-pack` v1 at first touch | Phase 2 onward |
| v1's proposed standalone Set Pack format | Never shipped; folded into scene/story packs (floor lines and marks live inline) | Already effective |
