# QLOBE Studio — quickstart

How to start the studio and get real work done in it. The full contract is
`docs/qlobe-studio-v2.md`; this is the runbook.

## 0. One-time setup

The studio needs the local authoring server, and generation needs your LAN
GenAI host. Both are configured once:

1. **Local config** — create `tools/state/local.json` (git-ignored; never
   commit the host address):

   ```json
   {
     "qwenUrl": "http://YOUR-MODEL-HOST:8100",
     "teacherVoicePath": "/path/to/voice_teacher.wav"
   }
   ```

   `qwenUrl` is the ComfyUI wrapper on your LAN. `teacherVoicePath` is the
   canonical teacher-voice reference wav for voice cloning. Flags/env
   (`--qwen-url`, `QLOBE_QWEN_URL`) override the file when set.

2. **Voice cue alignment** (optional, for character speech): the
   whisper-visemes chain uses the Python venv at `tools/lipsync/venv`.
   Without it, voice generation still works — only cue alignment falls back.

## 1. Start the studio

From the `qlobe-kids/` repo root:

```
python3 tools/puppet-studio-server.py
```

Open **http://127.0.0.1:8000/shared/js/studio/**. The header pill should say
**authoring server** (green). If it says "static preview", the studio is
browse-only: no saves, no generation.

The four domains across the top are the map:

| Tab | What it's for |
|---|---|
| **Library** | Every reusable object — characters, packs, shared art, and generated media awaiting assignment. **+ Generate** lives here. |
| **Modules** | Browse engines/services/stage code and launch test harnesses. Read-only — code is authored in Claude Code sessions. |
| **Games** | The catalog. Per-game dashboards: manifest, validation, what it uses, playtest link. `config.json` games are content-editable here. |
| **Production** | Job queue, validation triage, completeness reports. |

The Rig / Animate / Speech / Assemble / Props / Scenes tabs are the
contextual workspaces the Library routes into when you open an object.

## 2. Make a new asset (icon, prop, backdrop, voice line)

1. **Library → + Generate.** Pick the kind:
   - *UI icon / object card / prop cutout* — runs the validated cutout chain
     (dark-ground render → alpha extraction → QA → crop/resize).
   - *Scene backdrop* — single wide render.
   - *Voice line* — teacher-voice clone with whisper transcript QA.
2. Write the prompt (see `docs/art-direction.md` for the world's style
   language), leave the seed on the ladder default, submit. The job queues —
   watch it in **Production → Job Queue** (generation takes ~20s/image on
   the LAN host; jobs batch by workflow type).
3. The result lands in **Library** with an **UNASSIGNED** badge and QA
   pills. From the card:
   - **Provenance** — the full recipe: every step, prompt, seed, QA result,
     and the magenta-composite check for cutouts.
   - **Regenerate** — re-runs the recipe (same seed = same asset; pass a new
     seed to explore).
   - **Accept / Reject** — accept marks QA approved; reject moves the whole
     folder to a git-ignored trash (nothing is hard-deleted).
   - **Assign to…** — moves the asset (recipe included) into
     `shared/assets/…`, a game's `assets/`, or a character folder, and
     appends the provenance line to the game's `ASSETS.md`.
4. Commit when happy — git is the version store; the recipe sidecar means
   any committed asset can be regenerated later.

Every generated asset carries a `recipe.json` (`qlobe-recipe` v1, spec
§7.6). That file *is* the provenance — validators check it, and Regenerate
replays it.

## 3. Make or edit a game

- **New game**: start a Claude Code session in the repo and type
  `/new-game` — that flow scaffolds from `templates/stub-game/` with content
  in `config.json`, registers the game, and walks the design process. The
  studio is the *review* surface: its Games dashboard shows validation,
  assets, and a playtest link, and can edit `config.json` content directly.
- **Existing games**: open **Games**, pick the game, use the dashboard.
  Older `config.js` games are read-only in the studio (edit them in agent
  sessions).

## 4. Work on a character

Open the character from **Library** (or the Rig/Animate/Speech tabs with
`?char=`):

- **Assemble** — the build pipeline (source sheets → sliced visemes → alpha
  extraction → parts).
- **Rig** — joints, anchors, layers on the live puppet.
- **Animate** — clips, keyframes, drag-to-pose on the timeline.
- **Speech** — voice lines, waveform cue editing, viseme sync preview; new
  voice takes upload + transcribe here.

Every save is plain JSON in the repo, written atomically by the server.

## 5. Keep it healthy

- **Production → Validation → Run** (or `node tools/validate/run.mjs`) —
  the whole catalog checked; errors are real, warnings are triage.
- `node tools/build-usage-index.mjs` after adding/assigning assets keeps
  "used by" counts fresh (`--check` detects drift).
- After pulling server changes, **restart the authoring server** — a stale
  process silently lacks new endpoints.
