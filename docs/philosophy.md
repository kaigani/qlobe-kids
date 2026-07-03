# QLOBE Kids — Design Philosophy

This is the canonical philosophy document for QLOBE Kids. Every other doc links here rather than repeating it. If you are building, reviewing, or proposing a game, start here.

## Vision

QLOBE Kids is an open-source, tablet-first educational games platform for children aged 5–6. Think of it as **ABC Mouse reimagined as an open game repository** — simpler, more transparent, and built around small, playful learning games instead of a walled subscription world.

Each game is a themed learning environment made of several short mini-games (modes). The reference game, **Sound Sprouts** (phonics), establishes the pattern: one concept area, several short modes, shared assets, gentle feedback, and replayable skill practice. The repository should make it obvious how **one game can become many**.

Two audiences, two feelings:

- The **child** experience should feel like play — curiosity, sound, motion, surprise.
- The **adult** experience (parents, homeschoolers, teachers, designers, developers) should feel organized, inspectable, and easy to trust. No ads, no accounts, no dark patterns, no loot mechanics.

## The Educational Blend

QLOBE Kids combines four traditions on purpose:

- **Montessori-style concreteness** — visible objects, manipulatives, clear categories, sensory grounding. The child touches and moves real-feeling things.
- **Kumon-style repetition** — tiny, repeatable steps that quietly build fluency. Small wins, often.
- **Play-first design** — curiosity, surprise, touch, sound, motion, and gentle exploration come before instruction.
- **Developmentally appropriate practice** — short loops, concrete choices, low pressure, and learning goals that are visible to the grown-ups.

## The 9 Core Interaction Principles

1. **One clear skill per mini-game.** Each sub-mode focuses on one specific skill — nothing more.
2. **Many modes per game family.** A game is not a single activity; it is a small world of related activities.
3. **Touch first.** Large targets (minimum 96px), simple gestures, minimal text, no precision-heavy controls.
4. **Hear it, see it, do it.** Audio, visual cues, and direct manipulation always work together. No reading required.
5. **Short loops.** A mini-game loop runs 30–90 seconds. A full session feels complete in 3–7 minutes.
6. **No harsh failure.** Use hints, retries, modeling, and playful correction — never punishment.
7. **Repeat with variation.** Keep the same learning structure but vary images, sounds, prompts, difficulty, and combinations.
8. **Digital-only, body-aware.** Games may suggest real-world movement — clap, hop, point, stretch, freeze, act it out — but the core experience stays playable on a tablet.
9. **Shared assets over one-off screens.** Build reusable tiles, cards, icons, sounds, and interaction components. Reach for `shared/` before making something new.

## The Reference Standard

Before a game is considered strong, it should be:

- **Understandable in 5 seconds** — a child grasps what to do almost instantly.
- **Playable without reading** — audio and pictures carry everything.
- **Organized into multiple mini-games** — a family, not a one-off.
- **Complete in short sessions** — satisfying in a few minutes.
- **Replayable with variation** — fresh on the tenth play, not just the first.
- **Gentle when the child is wrong** — mistakes are invitations to try again.
- **Visually clear** — uncluttered, high-contrast, one focus at a time.
- **Audio-rich** — voice, sound effects, and music do real work.
- **Tablet-friendly** — big touch targets, forgiving gestures.
- **Easy to inspect in the repository** — clean structure, honest docs.
- **Easy to expand later** — new modes and assets slot in without a rewrite.

## Guardrails

- Pure static site: no framework, no build step, no npm. Vanilla ES modules, served as-is and deployed to GitHub Pages.
- All paths relative and lowercase.
- Reuse `shared/` (assets, audio, fonts, three.js) instead of one-off content.
- Licensing: code is MIT; original assets and docs are CC BY 4.0.
- No ads, no accounts, no dark patterns, no loot mechanics.
