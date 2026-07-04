# Lunchbox Pack 🍱

> Part of [QLOBE Kids](../../README.md) — Practical Life & Independence, ages 5–6.

Kid characters line up with empty lunch boxes and you pack each one what they
ask for. Maya, Leo, Nia, and Sam each have favorite foods, so requests feel
personal — and kids learn the cast across replays. Audio + pictures + touch
only; no reading required.

## The three modes

- 🎒 **Pack for Me!** — a character asks for three things, one at a time: a
  specific food, a food group, or an attribute ("something red", "something
  crunchy"). Every request is spoken *and* shown as a picture chip.
- 🥗 **Healthy Helper** — build a balanced box: one fruit, one veggie, one
  main, one drink, and one little treat. A five-icon meter fills as you pack.
- 🔢 **Count & Pack** — "Can you pack *three* of these?" Drag the same food
  again and again while the game counts aloud. Quantities ramp 2 → 5.

Drag foods into the box, or use the tap-tap fallback (tap a food, tap the
box). A session is 3 boxes ≈ 3–5 minutes: close each lid, get confetti and a
star, then a big-star cheer screen with free replay.

## Run it locally

No build step. Serve the **repo root** over HTTP (the game loads shared food
and character art from `../../shared/`):

```sh
cd qlobe-kids          # the repo root
python3 -m http.server 8000
```

Then open <http://localhost:8000/games/lunchbox-pack/>.

Voice lines are recorded clips in `assets/audio/` (manifest-driven); if a clip
is missing the game falls back to the device's Web Speech voice, so it always
speaks. See `ASSETS.md` for asset provenance and `SPEC.md` / `game-design.md`
for the design.
