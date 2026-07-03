# Game Family Template

One-liner: _a starter skeleton for a QLOBE Kids game family — copy it, rename it,
and grow the two stub modes into real mini-games._

This folder is a working, minimal template. Served as-is it shows a menu with two
big buttons; tapping one starts a stub mode that speaks a line and plays a sound,
with a Home button back to the menu.

## How to run

From the **repo root** (the folder above `games/` and `shared/`):

```sh
python3 -m http.server 8000
```

Then open the template at:

```
http://localhost:8000/templates/game-family/
```

Once you copy this into `games/<your-id>/`, open it at
`http://localhost:8000/games/<your-id>/` instead.

## Where to start

1. Read the design brief: [`game-design.md`](./game-design.md) (a pre-filled copy
   of the GDD template at [`docs/game-design-template.md`](../../docs/game-design-template.md)).
2. Follow the step-by-step build guide: [`docs/adding-a-game.md`](../../docs/adding-a-game.md).
3. Reuse before you build — the shared library is inventoried in
   [`docs/asset-system.md`](../../docs/asset-system.md).

Files in this template:

- `index.html` — iPad viewport, menu overlay, HUD, optional three.js import map.
- `js/main.js` — audio unlock + mode-dispatch pattern (heavily commented).
- `css/style.css` — Fredoka font, warm theme, ≥96px touch buttons.
- `game.json` — per-game manifest stub with every field explained.
- `game-design.md` — the filled-in GDD to edit.
