# Contributing to QLOBE Kids

Thank you for helping build free, joyful learning for little kids. New games,
fixes, and assets are all welcome. The AI-assisted path is a first-class citizen
here — most contributors will build a whole game without writing code by hand.

Whichever path you take, the platform rules are the same: **no build step,
vanilla ES modules, relative + lowercase paths, reuse `shared/` first, and no
reading-required or harsh-failure gameplay.** See [CLAUDE.md](CLAUDE.md) for the
full brief and the `shared/` inventory.

---

## Path A — Build with Claude Code (recommended)

1. Clone and open Claude Code in the repo:
   ```bash
   git clone https://github.com/kaigani/qlobe-kids && cd qlobe-kids && claude
   ```
2. Type **`/new-game`**, or just describe what you want ("help me build a
   counting game my dino-obsessed 5-year-old will love").
3. The agent reads [CLAUDE.md](CLAUDE.md), offers queue picks, confirms the
   category and a one-skill-per-mode breakdown, scaffolds from
   `templates/game-family/`, writes `game-design.md`, builds the first mode with
   `shared/` modules, helps you test locally, and registers the game.
4. Playtest with a real kid, polish, and open the PR.

The agent does the mechanics; **you bring the taste** — what your kid finds fun,
whether the voice feels warm, whether a 5-year-old can actually tap it.

---

## Path B — Build by hand

Same steps, done manually:

1. Read [docs/philosophy.md](docs/philosophy.md) and
   [docs/interaction-patterns.md](docs/interaction-patterns.md).
2. Pick an idea from [docs/game-queue.md](docs/game-queue.md) (or bring your own).
3. Copy `templates/game-family/` to `games/<kebab-id>/`.
4. Write `games/<id>/game-design.md` from `docs/game-design-template.md`: the one
   skill, 3–4 modes (each a single skill), the 30–90s loop, the shared assets.
5. Build **one mode end-to-end** before starting the next, importing `shared/js/`
   modules and reusing `shared/assets/` via `../../shared/…` paths.
6. Fill in `games/<id>/game.json` and add one entry to the root `games.json`.
7. Test locally: `python3 -m http.server 8000`, open `http://localhost:8000/`.

---

## PR checklist

Before you open a pull request, confirm every item:

- [ ] The game **boots from the hub** — it appears in `games.json` and launches.
- [ ] **All modes are playable** start to finish.
- [ ] **No console errors and no 404s** (check DevTools while playing every mode).
- [ ] **Touch targets are ≥ 96px** and work with a finger, not just a mouse.
- [ ] The game **works without reading** — audio + pictures + touch only.
- [ ] **No harsh failure** — wrong taps get a gentle retry, never "Game Over".
- [ ] All assets are **licensed and listed** in the game's `ASSETS.md` (source,
      creator, license, attribution needed?, modifications).
- [ ] `games.json` is **valid JSON** (no trailing commas) and your entry matches
      the schema in [CLAUDE.md](CLAUDE.md).
- [ ] All paths are **relative and lowercase**; nothing hard-codes the domain.
- [ ] No frameworks, bundlers, `package.json`, npm, CDNs, ads, accounts, or
      tracking. `games/sound-sprouts/` is untouched.

---

## Asset rules

- **Shared-first.** If a tile, card, or sound could serve another game, add it to
  `shared/`, not to your game folder. Reuse the existing library before creating
  anything new.
- **Provenance.** Every asset (yours or third-party) goes in the game's
  `ASSETS.md` with source, creator, license, whether attribution is required, and
  any modifications. Original assets you create are licensed **CC BY 4.0**.
- **Optimize.** Ship right-sized art: compress PNGs/JPEGs, subset fonts, prefer
  synthesized `sfx.js` sounds (zero bytes) over sound files. No 4K textures.
- **Per-game budget.** Aim to keep a game folder **under ~35 MB**. If you're over,
  you're probably duplicating something that belongs in `shared/`.
- **Concept videos** (optional): an AI-generated proof-of-concept **≤ 15 MB** may
  live at `games/<id>/concept/`; anything larger should be an external link.

### Asset-growth policy

The repo ships assets directly (no LFS) so it clones and deploys with zero setup.
That's deliberate while the library is small. **As the total repo approaches
~1 GB**, we'll revisit moving large binaries to Git LFS or external hosting.
Until then, keep assets lean and shared — that's what keeps this simple.
