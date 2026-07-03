# QLOBE Kids — Characters

QLOBE Kids will grow a small, recognizable cast that carries across games — gentle guides, friends, and mascots that make the platform feel like one warm world instead of a pile of unrelated activities. A child should start to recognize a familiar face and feel, "Oh, it's you again!"

This system is intentionally slow and small. Read alongside the [design philosophy](philosophy.md).

## Principles

- **Simple silhouettes.** A character must be readable at small sizes — recognizable by shape alone at **128px** and below. If you can't tell who it is from the outline, redesign it.
- **Gentle and encouraging.** Characters cheer effort, model the answer, and invite another try. They **never mock failure** or express disappointment. No harsh reactions, ever (principle 6).
- **Voice-consistent.** A character sounds the same everywhere — same tone, same kind of phrasing, same warmth — whether it appears in a phonics game or a counting game.
- **Reusable across games.** Any game may feature a character via its `game.json` `characters` field. Characters belong to the platform, not to one game.

## When a character gets designed

**First character gets designed when a game needs it — not before.** We do not build a cast in the abstract. When a game's design calls for a guide or companion, propose the character then, so it is grounded in a real use.

## How to propose a character

1. Copy [`../shared/characters/character-sheet-template.md`](../shared/characters/character-sheet-template.md) and fill it in.
2. Create a folder `shared/characters/<character-id>/` holding the character sheet, art, and audio.
3. Start the sheet at status `proposed`. Once it ships in a game, mark it `adopted`.
4. Reference the character from a game by adding its id to that game's `game.json` `characters` field.

See [`shared/characters/README.md`](../shared/characters/README.md) for the folder layout.
