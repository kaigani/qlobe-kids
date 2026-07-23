# QLOBE Studio specification

Status: implementation contract  
Format version: 1  
Primary URL: `/shared/js/studio/`  
Legacy URL: `/shared/js/stage/puppet-studio.html`

## Purpose

QLOBE Studio is the integrated, local-first authoring suite for the QLOBE Kids
stage runtime. It turns the JSON and ES-module data that already ships in the
repository into visual, hand-tunable source assets without changing the static
HTML5 runtime or requiring a production build service.

The Studio is deliberately domain-specific. It authors recurring QLOBE
characters, reusable animation, attachable props, puppet theater scenes, speech
cues, and music-reactive performances. It is not a general 2D game engine or a
replacement for an image editor.

## Product principles

1. **What you see is what ships.** Previews use `puppet.js`, `theater.js`,
   `music.js`, and the same assets used by games.
2. **Source remains open and reviewable.** Authored output is formatted JSON and
   ordinary repository assets. Generated runtime databases are not the source of
   truth.
3. **No runtime build step.** Games continue to run as static files. The optional
   localhost authoring server exists only to write files and run local pipelines.
4. **Backward compatible migration.** Existing rigs, clips, prop definitions,
   scenes, and both Studio URLs continue to load. Versioned adapters fill defaults
   for old data.
5. **Reuse before specialization.** Shared packs provide defaults; character,
   game, and scene overrides remain small and explicit.
6. **Safe persistence.** The authoring server only reads or writes allow-listed
   repository roots, validates JSON, uses atomic replacement, and never accepts
   absolute paths or `..` traversal.
7. **Accessible authoring.** All essential controls are keyboard reachable,
   labelled, and usable without color alone. Canvas manipulation has numeric
   inspector equivalents.

## Application structure

One application shell, derived from Puppet Studio's bold ink/yellow/blue visual
language, owns project selection, workspace navigation, status, undo state,
save/export actions, and responsive layout.

```
QLOBE Studio
├── Character
│   ├── Build / Poses (project profile)
│   ├── Rig
│   ├── Animate
│   └── Speech
├── Props
├── Stage
└── Music Sync
```

The Character workspaces initially host the proven Puppet Studio editor through
the integrated shell. The legacy URL remains directly usable and accepts its
existing `char` and `mode` query parameters. New links should target QLOBE
Studio.

## Shared data model

All new documents have `format`, `formatVersion`, and a stable id. Unknown
optional fields are preserved when editing.

### Character Pack

The existing `shared/characters/<id>/rig.json` remains the character source of
truth. Version 1 adds semantic sockets without invalidating old rigs:

```json
{
  "format": "qlobe-character",
  "formatVersion": 1,
  "id": "fox",
  "sockets": {
    "hand.L": { "bone": "arm-lower.L", "point": [0, 110], "rotation": 0 },
    "hand.R": { "bone": "arm-lower.R", "point": [0, 110], "rotation": 0 },
    "mouth":  { "bone": "head", "point": [0, 32], "rotation": 0 }
  }
}
```

Legacy rigs receive computed `hand.L`, `hand.R`, `mouth`, `chest`, and `lap`
sockets in memory. Saving a rig materializes the editable socket values.

### Animation Pack

An animation pack contains portable clips for a named skeleton profile. Existing
`default-clips.json`, `acting-clips.json`, and character-local `rig.clips` remain
valid. Resolution order is platform defaults, shared packs, character overrides,
then explicit scene overrides. A clip declares its reduced-motion pose through
its first frame, matching current behavior.

### Pose Actor Pack

A pose actor is a complete-image alternative to a bone rig. Its manifest owns a
stable canvas/anchor and named semantic illustrations:

```json
{
  "format": "qlobe-pose-actor",
  "formatVersion": 1,
  "id": "dragon",
  "canvas": [1024, 1024],
  "anchor": [0.5, 0.949],
  "transition": { "kind": "paper-pop", "durationMs": 220 },
  "poses": {
    "neutral": { "art": "poses/neutral.webp", "alt": "Friendly Dragon — neutral pose" },
    "celebrate": { "art": "poses/celebrate.webp", "alt": "Friendly Dragon — celebrate pose" }
  }
}
```

`pose-sprite.js` swaps complete illustrations without interpolating anatomy.
`theater.js` accepts pose actors beside standard puppets, while keeping puppet
rigs, clips, lip sync, and music sync untouched.

### Prop Pack

A Prop Pack describes reusable visual objects, their presentation, semantic
contact points, and safe defaults. It contains no music-specific behavior.

```json
{
  "format": "qlobe-prop-pack",
  "formatVersion": 1,
  "id": "my-puppet-band-props",
  "props": {
    "guitar": {
      "art": "guitar.png",
      "presentation": {
        "anchor": [0.5, 0.5], "scale": 0.3,
        "rotation": 0, "layer": "front"
      },
      "placement": { "mode": "held", "primary": "grip-main" },
      "sockets": {
        "grip-main": { "point": [0, 0], "rotation": 0 },
        "grip-support": { "point": [-90, -55], "rotation": 0 },
        "strings": { "point": [35, -5] }
      },
      "bindings": {
        "grip-main": "hand.R", "grip-support": "hand.L"
      },
      "characterOverrides": {}
    }
  }
}
```

Art paths resolve relative to the pack document. Old inline theater prop
definitions adapt to an in-memory one-prop pack. Runtime definitions may combine
`pack`/`prop` references with scene-local overrides.

### Set Pack

A Set Pack describes backdrops, normalized floor lines, actor marks, prop marks,
and optional foreground/background layers. Existing backdrop maps remain valid
and may be adapted into a set pack in memory.

### Scene Pack

A Scene Pack stores the theater beat grammar already executed by `theater.js`:
actor movement, clips, poses, dialogue, narration, prop changes, effects, waits,
and parallel groups. It may replace or overlay scenarios embedded in a game
config. The source game declares `scenePack`; engines load it before gameplay
starts and retain embedded data as a fallback.

### Music Sync profile

Music Sync is a module, not an instrument-specific pack. Optional profiles are
plain data associating a prop or role with a base clip and event gestures:

```json
{
  "format": "qlobe-music-sync",
  "formatVersion": 1,
  "profiles": {
    "guitar": {
      "baseClip": "play-strum",
      "cycleBeats": 1,
      "gestures": { "note": "play-strum" }
    }
  }
}
```

## Runtime contracts

### Prop attachment

`theater.js` must support legacy `handBone`/`handOffset` plus semantic character
and prop sockets. Presentation includes independent anchor, scale, rotation,
layer, and flip. A primary binding controls the prop transform. Secondary
bindings are authoring guides in v1; they do not imply a full IK solver.

### Music Sync

`music-sync.js` is the musical cousin of `lipsync.js`:

```
WebAudio transport / scheduled score / analyser
  -> beat, bar, note, section, energy and band hooks
  -> clip phase, gesture, pose, effect or editor visualization
```

The deterministic API receives scheduled context time and full note metadata.
The reactive API exposes normalized RMS plus low/mid/high energy from an
`AnalyserNode`. Consumers may use either or both.

Puppets expose externally sampled clip phase so a loop can follow musical time.
Transient note gestures may temporarily overlay or retrigger a performance pose;
v1 does not require a general animation blend tree.

## Workspace requirements

### Character: Build, Rig, Animate, Speech

The existing Puppet Studio capabilities remain available inside the application:
source-sheet processing, rig placement, animation timeline, speech/viseme
waveform editing, undo, direct save, export, and debug hooks.

Build has three registry-selected profiles. `canonical-puppet` preserves the
ten-part biped plus viseme workflow. `scene-actor` accepts any alpha-separated
part sheet, reports its detected islands, stores a versioned build manifest,
writes every named manifest box as a transparent production cut, and sends a
game-local arbitrary skeleton into the same Rig and Animate tools. Part names
and boxes remain directly editable before recutting. `pose-library` relabels the
workspace **Poses**, previews the exact paper-pop runtime, replaces and
normalizes complete-image pose art, and edits anchor, alt text, and transition
duration. Story Stones is the reference pose-library implementation.

All workspaces discover games through `shared/js/studio/projects.json`; adding
a project no longer requires editing hardcoded project lists in each tab. A
project declares only the workspaces it supports and their pack/document URLs.

### Props

- Choose a pack, prop, and preview character.
- See real art on the real stage runtime.
- Edit anchor, scale, rotation, layer, placement mode, primary attachment,
  contact sockets, and character bindings numerically and visually.
- Preview a character clip while the prop is attached.
- Review the same prop across the shared cast.
- Save formatted pack JSON through the authoring server; export works on a
  static server.

### Stage

- Load a game module and its modes/scenarios.
- Render the selected scenario with its actual set, cast, props, and theater
  runtime.
- Change floor line, actor marks, prop placement, scale, rotation, and layer.
- Inspect and reorder beats; edit supported beat fields and parallel groups.
- Play from the start or a selected beat, stop, and preview reduced motion.
- Save a versioned Scene Pack and make the game consume it without deleting its
  embedded fallback.

### Music Sync

- Load a music-enabled game, song, band, prop pack, and sync profiles.
- Show transport position, beat/bar grid, scheduled note events, and analyser
  energy.
- Preview selected character/prop/clip combinations on the actual stage.
- Edit base clip, cycle length, event gesture, phase, and latency offset.
- Play/pause and audition note-synchronized animation.
- Save sync profiles and make the game consume them with legacy mappings as a
  fallback.

## Authoring server

The server is renamed in user-facing copy to the QLOBE Studio authoring server;
the existing executable path remains compatible. New endpoints:

- `GET /api/studio/status`
- `GET /api/studio/document?path=<allow-listed-relative-path>`
- `POST /api/studio/document?path=<allow-listed-relative-path>`
- `POST /api/studio/asset?path=<allow-listed-relative-path>`

Documents are limited to `.json`, maximum 4 MB, and roots under
`shared/characters`, `shared/props`, or `games/<id>`. Writes are atomic and JSON
is parsed before replacement. Existing `/api/puppet/*` endpoints remain.
The asset endpoint accepts validated PNG, JPEG, and WebP bytes only under a
game/shared asset root, retains the 32 MB upload ceiling, rejects traversal and
extension/signature mismatches, and writes atomically.

## Acceptance demonstrations

### Puppet Problem Solvers

1. Open Stage workspace and load `puppet-problem-solvers`.
2. Select a scenario and two cast members.
3. Render its actual backdrop, actors, props, setup beats, and choices.
4. Adjust at least one stage/prop value and save a Scene Pack.
5. Reload the editor and observe the saved value.
6. Launch the game; its engine loads that Scene Pack while retaining embedded
   scenarios as an offline/failure fallback.

### My Puppet Band

1. Open Props and load the band's Prop Pack.
2. Attach an instrument to a selected character using semantic sockets; edit and
   save its presentation.
3. Open Music Sync, select a song and band member, and preview the instrument on
   the actual stage.
4. Observe beat/note transport hooks and audio-reactive meters.
5. Save a sync profile, reload it, and launch the game.
6. The game consumes the Prop Pack and Music Sync profile; legacy inline props
   and clip mappings remain fallback behavior.

### Story Stones

1. Open Poses with project `story-stones`; select each actor and preview the six
   complete-image semantic poses with the exact paper-pop transition.
2. Replace a pose or tune its shared anchor, accessible description, and
   transition duration; save and reload the pose manifest.
3. Open Props and inspect the seven alpha story objects against a story setting.
4. Open Scenes, choose any unordered set, and preview the exact shipping
   resolver/runtime; edit its complete beginning, complication, resolution,
   cast order, pose cues, and unique Krea scene recipe.
5. Launch the game and verify that the same actor, prop, 220-story, and narrator
   packs play without an authoring server or model request.

## Verification gates

- Existing Puppet Studio regression checks remain green at the legacy URL.
- Both Studio URLs load with zero console errors over the authoring server.
- Static serving still permits preview and JSON export; only direct save is
  unavailable.
- Schema/adaptor tests cover legacy and v1 documents.
- Server tests reject traversal, absolute paths, non-JSON writes, oversized
  documents, and disallowed roots.
- Browser automation performs both acceptance demonstrations, including a real
  save/reload round trip against disposable copies or reversible demo values.
- Both games complete their existing `QLOBE_DEBUG` smoke paths after integration.
- Portrait and landscape workspace layouts remain usable.

## Explicit non-goals for format version 1

- General-purpose game or level editing
- Mesh deformation and weight painting
- Full two-hand IK or constraint solving
- Nonlinear animation blend trees
- Editing arbitrary JavaScript expressions
- Cloud storage, accounts, collaboration, or runtime network dependencies
