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

## Shared clip packs

- `default-clips.json` — the minimal baseline (idle, wave, walk, jump, talk) a new
  rig starts from; copied into each rig and retuned in puppet-studio.
- `acting-clips.json` — portable ACTING clips (sad, stomp, grab, ask, offer, nod,
  head-shake, hug, cheer, think) for theater games. NOT copied into rigs: they are
  loaded at runtime by `shared/js/stage/theater.js` and merged UNDER each rig's own
  clips, so a rig-tuned clip of the same name always wins. Both packs share the
  portability contract: rotation/scale/$spine/$motion tracks only — no per-bone
  x/y offsets — so one definition animates every standard bipedal plush rig.
  One-shot clips must return to rest at t=1; a clip's first frame doubles as its
  reduced-motion pose.
