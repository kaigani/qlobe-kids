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

   `qwenUrl` is the ComfyUI wrapper on your LAN. `teacherVoicePath` is
   optional — if unset, the server falls back to the committed
   `shared/assets/refs/voice-teacher.wav`, so voice generation works on a
   fresh checkout with no local config. Flags/env (`--qwen-url`,
   `QLOBE_QWEN_URL`) override the file when set.

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

The five domains across the top are the map:

| Tab | What it's for |
|---|---|
| **Generate** | The template catalogue — Menu / Character / Prop / Scene sections, each a left rail of templates plus a form — and the **Review** tab, the whole unassigned-media queue (accept / reject / assign / regenerate / provenance). |
| **Library** | Every reusable object — characters, packs, shared art. The `Media (unassigned)` facet is read-only cards with an **Open in Generate** link into Review; generation itself happens in Generate now. |
| **Modules** | Browse engines/services/stage code and launch test harnesses. Read-only — code is authored in Claude Code sessions. |
| **Games** | The catalog. Per-game dashboards: manifest, validation, what it uses, playtest link. `config.json` games are content-editable here. |
| **Production** | Job queue, validation triage, completeness reports. |

The Rig / Animate / Speech / Assemble / Props / Scenes tabs are the
contextual workspaces the Library routes into when you open an object.

## 2. Make a new asset (icon, prop, backdrop, voice line)

1. Open **Generate**, pick a section tab — **Menu**, **Character**, **Prop**,
   or **Scene** — and pick a template in the left rail. Each section maps to
   a slice of the registry:
   - *Menu* — category/game tiles, splash title art and background, shared UI
     buttons.
   - *Character* — puppet body sheet, viseme grid, pose sprite (cutout
     chain), video key image, voice line (teacher-voice clone).
   - *Prop* — prop cutout (dark-ground render → alpha extraction → QA →
     crop/resize).
   - *Scene* — backdrop, a single wide render.
2. Pick a **style** — unproven worlds are selectable too, just badged as
   such — then fill the fields. Click an **examples** chip to drop a proven
   past value straight into the big field.
3. Set an **id** and a **seed** (leave it on the template default unless
   you're exploring), then **Generate**. Watch it settle — generation takes
   ~20s/image on the LAN host, jobs batch by workflow type — and the new
   card appears under "Recent outputs" for that template. **Production →
   Job Queue** shows the same job if you'd rather watch it from there.
4. Switch to the **Review** tab — the whole unassigned-media queue — to
   dispose of it:
   - **Provenance** — the full recipe: every step, prompt, seed, QA result,
     and the magenta-composite check for cutouts.
   - **Regenerate** — re-runs the recipe (same seed = same asset; pass a new
     seed to explore).
   - **Accept / Reject** — accept marks QA approved; reject moves the whole
     folder to a git-ignored trash (nothing is hard-deleted).
   - **Assign to…** — moves the asset (recipe included) into
     `shared/assets/…`, a game's `assets/`, or a character folder, and
     appends the provenance line to the destination's `ASSETS.md`. Hub-tile
     templates (`menu-category-tile`, `menu-game-tile`) carry an assign
     warning instead — hub tiles are hand-curated, so the accepted file goes
     to the maintainer, never straight into the hub tile folder.
5. Commit when happy — git is the version store; the recipe sidecar means
   any committed asset can be regenerated later.

Every generated asset carries a `recipe.json` (`qlobe-recipe` v1, spec
§7.6). That file *is* the provenance — validators check it, and Regenerate
replays it.

**From a terminal**, the same endpoint is smokeable directly:

```
curl -s -X POST http://127.0.0.1:8000/api/studio/generate \
  -H 'Content-Type: application/json' \
  -d '{"template":"scene-backdrop","styleId":"storybook",
       "fields":{"setting":"a quiet woodland clearing at dawn"},
       "params":{"id":"backdrop-clearing-dawn","seed":42}}'
```

Returns `202 {"ok":true,"jobId":…,"mediaId":…}` and queues the job.
`params` accepts only `id`, `seed`, `overwrite`, and any declared `refs` —
prompt material comes from the registry, never the client; the server
expands the named template server-side. List the registry the form fields
above are drawn from with:

```
curl -s http://127.0.0.1:8000/api/studio/templates
```

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
