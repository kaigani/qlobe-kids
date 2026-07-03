# shared/characters/

The adopted cast for QLOBE Kids — the recurring guides, friends, and mascots that appear across games.

**One subfolder per adopted character**, named by its kebab-case id:

```
shared/characters/
  README.md
  character-sheet-template.md
  <character-id>/
    character-sheet.md   # filled-in copy of the template
    art/                 # silhouettes, poses, expressions (readable at 128px)
    audio/               # voice lines: greeting, success, hint
```

Characters are proposed via a filled-in copy of `character-sheet-template.md`. A game features a character by naming its id in that game's `game.json` `characters` field.

The character system, its principles, and how to propose one are documented in [`../../docs/characters.md`](../../docs/characters.md).
