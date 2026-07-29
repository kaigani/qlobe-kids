# Renaming a game without changing its identity

A cosmetic rename changes the name children and grown-ups see while preserving
the game's stable technical identity. Keep the game id, folder, URL, asset
paths, storage keys, engine id, and other slug-based references unchanged.

For example, the display name **Puppet Retell** became **Puppet Tales**, while
`puppet-retell` remained the id and slug.

## Impact

The code and data impact is low. There is no URL redirect, saved-data
migration, analytics migration, or asset move when the slug stays stable.
Existing bookmarks and locally saved shows continue to use the same game id.

The content impact varies by game:

| Surface | What to check | Typical action |
| --- | --- | --- |
| Hub/catalog | `game.json` and the root `games.json` mirror | Change the canonical manifest, then run the registry sync |
| Game UI | Runtime config, HTML, and hard-coded JavaScript strings | Change visible text; prefer reading the title from config |
| Browser and sharing | `<title>`, Open Graph metadata, Web Share copy | Change the display title, not the URL or image path |
| Images | Hub tile, splash/menu art, instructions, badges, and OG image | Inspect visually; regenerate or edit only assets with baked-in old text |
| Voice | Narration lines and recorded clips | Change authored text and regenerate each clip that speaks the old name |
| Supporting material | Design docs, asset logs, source prompts, QA labels | Update prose, but preserve commands and paths that contain the slug |

The main risk is an inconsistent partial rename: a new hub label can still open
a game that shows, says, shares, or previews the old name. Blind replacement is
also risky because it can rename the stable slug and break URLs or saved data.

## Process

1. Choose the new display title and explicitly confirm that the id/slug will
   stay stable.
2. Search separately for the old display title and the stable slug:

   ```sh
   rg -n -i 'old game title' .
   rg -n 'game-slug' .
   ```

   Classify every result as display text, a stable identifier, or historical
   prose. Do not globally replace the slug.
3. Change `games/<id>/game.json` first. It is canonical for the catalog title.
   Update `shareTitle` there as well.
4. Sync only that game's mirrored registry fields:

   ```sh
   node tools/pipeline/sync-games-registry.mjs --write --only <id>
   ```

5. Update runtime sources such as `config.json`, authored voice lines,
   `index.html`, and any UI or share strings in JavaScript. Where practical,
   render the title from config to remove a duplicate hard-coded name.
6. Visually inspect likely image surfaces. File-name searches cannot detect
   pixels containing text. Check the hub tile, splash/menu backgrounds, help
   art, badges, and `assets/og-image.jpg`.
7. If the OG image contains the old title, regenerate it from the updated game
   splash rather than painting over it:

   ```sh
   python3 -m http.server 8000
   node tools/pipeline/capture_og_images.mjs \
     --playwright /tmp/pw/node_modules \
     --only <id> --force
   ```

8. Regenerate recorded narration clips that speak the old title. Updating
   `data/lines.json` alone is insufficient when the audio manifest still points
   to an accepted old clip.
9. Update current design docs, asset logs, generation prompts, and QA labels.
   Leave folder names, command paths, recipe ids, test-output paths, export
   filename prefixes, and engine ids alone when they encode the stable slug.
10. Validate JSON, registry agreement, stale visible strings, and the game
    smoke test. Open both the catalog and the game splash to verify the result.

## Working test: Puppet Tales

The test rename found these surfaces:

| Surface | Finding and action |
| --- | --- |
| Stable identity | Kept `puppet-retell` in the folder, id, URL, hub-tile path, engine id, saved-show store, QA paths, and MP4 filename prefix |
| Catalog | Changed `game.json.title` and synchronized `games.json` |
| Game splash | Changed the runtime title to render `config.title` |
| Browser/social text | Changed the document title, Open Graph title, manifest share title, and Web Share title |
| Voice | Changed both authored intro sources and regenerated the `intro` clip |
| Hub tile | Inspected; it contains no text, so no change |
| Splash background | Inspected; it contains no text, so no change |
| OG image | Inspected; it contained the old title, so it was recaptured from the updated splash |
| Supporting prose | Updated current game docs, asset provenance headings, source prompts, shared-character notes, and QA labels |

This is a cosmetic-only change. The public game remains at
`games/puppet-retell/`, and existing local data remains reachable because
`config.id` is unchanged.

## Second test: Word Train

The same process changed **Blend Train** to **Word Train** while preserving
`blend-train`. Its hub tile and `assets/art/splash.webp` contained no text. Its
generated OG screenshot did contain the old HTML title and was recaptured.
Both title-bearing voice clips (`greet` and `cheer`) were regenerated from the
updated authored lines. The folder, URL, engine configuration, source-concept
paths, QA identifiers, and usage-index entries kept the stable slug.

## Verification checklist

- `game.json`, `config.json`, `data/lines.json`, and root `games.json` parse.
- Registry sync reports no drift for the game.
- A case-insensitive old-title search has no unexplained current-product hits.
- A slug search shows no accidental path or identifier changes.
- The hub says the new name and opens the unchanged URL.
- The splash visually says the new name at supported viewport sizes.
- Narration says the new name.
- Browser tab, link metadata, OG image, and share sheet use the new name.
- Saved shows still load, and exported files retain the intentionally stable
  slug prefix.
