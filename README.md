# QLOBE Kids 🌍

**A free, open-source library of tiny tablet games that help kids aged 5–6 learn
through play — and that you can extend with Claude Code in an afternoon.**

## ✨ Play now

👉 **[kaigani.github.io/qlobe-kids](https://kaigani.github.io/qlobe-kids/)**

No app, no account, no ads. Open it on a tablet, tap a game, hand it to a kid.

## What's here

- **The hub** — a friendly launcher that lists every game by learning category
  (reading, math, practical life, art, and more).
- **Sound Sprouts 🌱** — the reference game: a playful phonics word-builder where
  kids tap sounds, blend them into words, hear a warm teacher voice, and reveal a
  picture. Study it to see how a QLOBE Kids game is built.
- **A shared library** (`shared/`) — the recorded teacher voice, illustrated
  picture-cards, letter tiles, sound effects, fonts, and helper modules that
  every game reuses, so new games are small and consistent.
- **A game queue** (`docs/game-queue.md`) — curated, ready-to-build ideas.

## 🤖 Build a game with Claude Code

This is the whole point of QLOBE Kids: **you don't need to be a developer.** If
you have [Claude Code](https://claude.com/claude-code), you can go from an idea
your kid loves to a real, playable game.

```bash
git clone https://github.com/kaigani/qlobe-kids && cd qlobe-kids && claude
```

Then just say what you want. Try one of these to start:

> I'd like to build a game from the queue.

> My kid loves dinosaurs — help me design a counting game.

Claude reads `CLAUDE.md`, offers ideas, and walks you through design → build →
test → pull request. Or type **`/new-game`** to run the guided flow from step one.

## Run locally

From the repo root:

```bash
python3 -m http.server 8000
```

Then open **http://localhost:8000/**. That's it — no install, no build.

## Author with QLOBE Studio

The integrated character, prop, scene, and music-performance editor runs from
the same repository. Start its local authoring server:

```bash
python3 tools/puppet-studio-server.py
```

Then open **http://127.0.0.1:8000/shared/js/studio/**. The older Puppet Studio
URL remains compatible. See [the QLOBE Studio specification](docs/qlobe-studio.md)
for its data formats and runtime contracts.

## Project structure

```
qlobe-kids/
├── index.html            # the hub
├── games.json            # registry the hub reads
├── games/
│   └── sound-sprouts/    # reference game (one folder per game)
├── shared/               # library every game reuses
│   ├── vendor/           # three.js r166 + RoundedBoxGeometry
│   ├── fonts/            # Fredoka display font
│   ├── js/               # audio.js · speech.js · sfx.js
│   ├── assets/           # letter-tiles · objects · ui · audio · twemoji
│   ├── data/words.json   # master word/onset/rime manifest
│   └── characters/
├── templates/game-family/  # starting point for a new game
├── docs/                 # philosophy · interaction patterns · game queue
├── CLAUDE.md             # onboarding brief for a contributor's AI session
└── CONTRIBUTING.md
```

## Philosophy

Montessori concreteness + Kumon-style tiny repetitions + play first. One skill
per mini-game, hear-it-see-it-do-it, short 30–90s loops, big touch targets, and
**no harsh failure** — a wrong tap just tries again. See
**[docs/philosophy.md](docs/philosophy.md)** for the canonical version.

## Licensing

- **Code** — MIT. See [LICENSE](LICENSE).
- **Original assets & docs** — CC BY 4.0. See [LICENSE-ASSETS](LICENSE-ASSETS).

## Contributing

New games, fixes, and assets are welcome — the AI-assisted path is first-class.
See **[CONTRIBUTING.md](CONTRIBUTING.md)** and **[CLAUDE.md](CLAUDE.md)**.
