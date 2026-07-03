# QLOBE Kids — Design Process

How a game goes from idea to live in the registry. The flow is **video-first**: nail the feel before writing much code. It grounds every step in the shared design philosophy — see [philosophy.md](philosophy.md).

Pick an idea from the queue ([game-queue.md](game-queue.md)) or propose your own, then work through these steps.

## Step 0 — Proof-of-concept video (optional but encouraged)

Before building, make a short **AI-generated concept video** to lock in look, feel, and interaction tone. It is the cheapest way to find out whether an idea reads in 5 seconds and feels like play.

- Keep it small: **≤ 15MB** lives in `games/<id>/concept/`. Anything larger goes to an external link referenced from `game-design.md`.
- This is a mood/feel artifact, not a spec. It exists to align everyone on tone.

**What makes a good concept video**
- Show **a hand playing on a tablet** — real touch, real scale.
- Show **one core loop**, start to finish, not a feature tour.
- Keep it **10–30 seconds**.
- Convey tone: gentle pacing, warm audio, big friendly targets, a soft "yes!" moment.

## Step 1 — Write `game-design.md`

Copy [game-design-template.md](game-design-template.md) into `games/<id>/game-design.md` and fill it in: title, category, age target, 3–5 learning goals, the mini-game modes, shared assets used, interaction and feedback models, difficulty progression, replay variation, and any movement prompts. This is the source of truth for the build.

## Step 2 — Prototype one mode first

Build a single mode end-to-end using the `shared/` libraries (`../../shared/` — audio, speech, sfx, letter tiles, object cards, UI buttons, three.js). One working loop beats five stubs. Reach for shared assets before making anything new (principle 9). Runs via `python3 -m http.server` from the repo root.

## Step 3 — Playtest with a real kid

Put it in front of an actual 5–6-year-old. **Watch, don't coach.** If they need you to explain it, it fails the "understandable in 5 seconds / playable without reading" standard. Note where they hesitate, tap the wrong thing, or lose interest — that is your design feedback.

## Step 4 — Polish and add modes

Fix what the playtest exposed. Tighten audio timing, target sizes, and the gentle-failure path. Then add the remaining modes in the family, reusing the loop and assets you have proven.

## Step 5 — Register and open a PR

Add the game to `games.json` (status `live`) with its id, title, category, path, icon, age range, accent, `uses`, and `modes`. Keep the per-game `game.json` as the richer source of truth. Open a pull request.

## Status lifecycle

In the registry, a game moves through: `proposed` → `in-design` → `live`, and `archived` when retired. Update the status as it progresses so the hub and the queue stay honest.
