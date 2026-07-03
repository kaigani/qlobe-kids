# Adding a game

The step-by-step manual for building a QLOBE Kids game. (This is the long-form
version of the `/new-game` skill.) A game is a flat folder in `games/<id>/` that
consumes the shared library in `shared/`. No framework, no build step, no npm —
just static files served as-is.

---

## 0. Reuse first — check `shared/`
Before designing anything, skim [`docs/asset-system.md`](./asset-system.md).
There is already a warm teacher voice, a synthesized SFX kit, a display font, a
UI button set, 56 letter tiles, 134 object picture-cards, and a word manifest.
Reuse beats building. Design your game around what exists.

## 1. Pick from the queue (or bring an idea)
Browse [`docs/game-queue.md`](./game-queue.md) for curated ideas, or bring your
own. Skim [`docs/philosophy.md`](./philosophy.md) so your design fits: one skill
per mini-game, many modes per family, touch-first (≥96px targets),
hear-it/see-it/do-it, 30–90s loops, no harsh failure, audio-rich, no reading
required.

## 2. Choose an id
- **kebab-case, lowercase, unique** — letters, digits, hyphens only.
- It becomes the folder name `games/<id>/`, the `id` in `game.json`, and the `id`
  in `games.json`.
- Good: `shape-sorter`, `count-critters`. Bad: `Shape_Sorter`, `shapeSorter`.

## 3. Copy the template
```sh
# from the repo root
cp -R templates/game-family games/<id>
```
The template is a working skeleton (menu + two stub modes + Home button). Serve
it once to confirm it runs before you change anything (see step 6).

## 4. Write the design (GDD)
Fill in `games/<id>/game-design.md` — it's a pre-filled copy of
[`docs/game-design-template.md`](./game-design-template.md). Nail down the modes,
the one skill each teaches, the core loops, and the feedback model **before** you
code. Optionally record a proof-of-concept video first.

## 5. Build it
Edit the copied files:
- `index.html` — set the `<title>`/description; keep the iPad viewport meta;
  rename the menu buttons and their `data-mode` values; keep the three.js import
  map **only if** you render 3D (delete it otherwise).
- `js/main.js` — add a `case` per mode in `startMode()`, matching the button
  `data-mode` ids. Keep the first-gesture audio unlock and the Home handler.
- `css/style.css` — set your accent color; keep the `@font-face`, the ≥96px
  touch targets, and the `prefers-reduced-motion` guard.
- Fill in `game.json` (see step 7) and delete its `_comment_*`/`_readme` keys.

### Paths: relative + lowercase (this bites people)
- **Every path is relative and lowercase.** GitHub Pages is case-sensitive;
  macOS is not, so a wrong-case path works on your Mac and 404s once deployed.
- From `games/<id>/index.html`, the shared library is `../../shared/`.
- From a file one level deeper (`js/main.js`, `css/style.css`), it's
  `../../../shared/`. ES-module imports resolve relative to the **module** URL,
  the import map resolves relative to the **document** — that one-level offset is
  why the template's `main.js` imports use `../../../shared/` while its
  `index.html` import map uses `../../shared/`.
- Shared JS resolves its own assets via `new URL('../assets/…', import.meta.url)`
  so it works at any page depth (see the module-URL rule in
  [`docs/asset-system.md`](./asset-system.md)).

### New assets
Prefer shared ones. If you must add art/audio, decide shared vs. game-local (see
`asset-system.md`), and log provenance + license in `games/<id>/ASSETS.md`
(model it on [`games/sound-sprouts/ASSETS.md`](../games/sound-sprouts/ASSETS.md)).

## 6. Test locally
Serve from the **repo root** so `../../shared/` resolves:
```sh
python3 -m http.server 8000
```
Open `http://localhost:8000/games/<id>/` on a desktop browser **and** on an iPad
(or the browser's device emulator). Check:
- [ ] Page loads with **no console errors** (open DevTools → Console).
- [ ] Fredoka font renders (text isn't the fallback system font).
- [ ] The first tap **unlocks audio** — you hear voice and/or SFX.
- [ ] Each menu button starts its mode; the **Home** button returns to the menu.
- [ ] Touch targets are comfortably ≥96px; no accidental pinch-zoom or text
      selection on the iPad.
- [ ] All paths are lowercase (grep your files for stray capitals).

## 7. Register in `games.json`
Add your game to the root `games.json` `games` array (the hub reads this single
file). Mirror the richer `game.json`. Diff-style example:

```diff
   "games": [
     { "id": "sound-sprouts", "title": "Sound Sprouts 🌱", "category": "reading-phonics",
       "path": "games/sound-sprouts/", "status": "live", ... },
+    { "id": "shape-sorter", "title": "Shape Sorter 🔺", "category": "sensorial-science",
+      "path": "games/shape-sorter/", "icon": "🔺",
+      "age": { "min": 5, "max": 6 }, "status": "in-design", "accent": "#5AB1BB",
+      "uses": ["shared/js/sfx.js", "shared/fonts/fredoka-latin-600-normal.woff2"],
+      "modes": [
+        { "id": "sort", "title": "Sort It", "skill": "shape discrimination" },
+        { "id": "find", "title": "Find It", "skill": "shape naming" }
+      ] }
   ]
```
`category` must be one of the 10 kebab-case ids in `docs/categories.md`. Start
`status` at `"in-design"`; move to `"live"` after a playtest.

## 8. Don't forget `.nojekyll`
GitHub Pages runs Jekyll by default, which **ignores files/folders starting with
an underscore**. The repo root ships an empty `.nojekyll` to disable that. If you
copied the template folder, keep any `.nojekyll` it carries; when in doubt the
root one covers the whole site. (This is why underscores in asset names are safe.)

## 9. Playtest, then open a PR
Playtest with an actual 5–6-year-old, polish, flip `status` to `live`, then open
a pull request. Include: what the game teaches, the modes, any new assets (with
their `ASSETS.md` provenance), and a note that it loads clean on iPad Safari.

Code is MIT; original assets and docs are CC BY 4.0.
