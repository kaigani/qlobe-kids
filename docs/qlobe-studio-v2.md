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

- **Two pipeline generations coexist.** `tools/content-pipeline/` (9 scripts)
  still hard-codes the predecessor repo path (`260612 phonics game`) and its
  `sound-sprouts` layout, while current games run ad-hoc scripts from
  `../02-generated/`. §11 consolidates them.
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

## 5. Information architecture — four domains

Primary navigation for Studio v2:

```
LIBRARY     MODULES     GAMES     PRODUCTION
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
runbook. "Generate" is an action available wherever media can be supplied
(character workspace, game dashboard), queued through this domain — not a
separate wizard.

Explicitly not: builds or release channels. Publishing is a `games.json`
status flip; deployment is git push to GitHub Pages. The studio reports
status; it does not push.

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
  consistent with `game.json`.
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

Top nav becomes the four domains (§5); the v1 two-cluster character/stage nav
retires with the registry migration. The header keeps the server-status pill
("authoring server" / "static preview") — static preview stays functional for
browse and JSON export, exactly as v1 promised.

### 9.2 Contextual workspaces per object type

Workspace tabs derive from object type + declared capabilities:

| Object | Tabs |
|---|---|
| Character (rigged) | Overview · Assemble · Rig · Animate · Speech · Preview · Usage |
| Character (anim-only / pose-actor) | Overview · Poses (or Portraits) · Preview · Usage |
| Prop pack | Overview · Props · Preview · Usage |
| Scene / story pack | Overview · Scenes · Preview · Usage |
| Music sync | Overview · Sync · Preview · Usage |
| Game | Overview · Content* · Validate · Playtest |
| Engine / Service / Stage module | Overview · Contract · Harness · Consumers |

\* Content tab is editable only for `config.json` games (§5.3).

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
  freezes at Phase 1 (bug fixes only), is removed in Phase 3 after the iframe
  retires. The capabilities behind it (pipeline file writes, extraction jobs,
  voice jobs, transcription) re-land as `/api/studio/*` equivalents with the
  same safety invariants.
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
  persistent `/api/studio/jobs` v2 — Phase 3.
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
| "Generate" as a contextual action, not a top-level section | **Keep** | §5.4 |
| Every object: stable ID, type, version, status, owner, tags, dependencies, reverse refs, provenance, schema, preview, manifest | **Adapt** | Kept: id/format/formatVersion/tags/provenance/validation. Dropped: owner, live dependency+reverse-ref storage (computed instead), separate runtime manifest |

## Appendix B — Deprecation register

| Item | Status | Retired |
|---|---|---|
| `shared/js/stage/puppet-studio.html` + `puppet-builder.js` as embedded iframe | Port source | Phase 1 (URL archived at parity) |
| `/api/puppet/*` endpoints + `/__puppet_files__/` bridge | Frozen Phase 1 | Phase 3 |
| `qlobe-studio-projects` formatVersion 1 shape | Read via adapter | Phase 1 (write side) |
| In-memory job registry | Replaced by `tools/state/` store | Phase 3 |
| MFA→Rhubarb default aligner chain | Demoted to optional/fallback | Phase 3 |
| `tools/content-pipeline/` (9 scripts, predecessor-repo paths) | Keepers ported, rest to git history | Phase 3 |
| Root-level ad-hoc drivers in `../02-generated/` | Conventions promoted into `tools/pipeline/` | Phase 3 |
| "Build" as a workspace name | Renamed Assemble | Phase 1 |
| Voice manifests without `format` field | Become `qlobe-voice-pack` v1 at first touch | Phase 2 onward |
| v1's proposed standalone Set Pack format | Never shipped; folded into scene/story packs (floor lines and marks live inline) | Already effective |
