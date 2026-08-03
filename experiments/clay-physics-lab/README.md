# Clay Physics Lab

These are the runnable sandboxes for the research in
[`docs/research/clay-physics-engine.md`](../../docs/research/clay-physics-engine.md).
They are deliberately outside `games/`: these are engineering experiments, not
catalogue games or production shared modules.

From the `qlobe-kids` repository root:

```sh
python3 -m http.server 8000
```

Then open:

- `http://127.0.0.1:8000/experiments/clay-physics-lab/solid.html` for the
  sculptural implicit-solid ball fusion study intended for Clay Creature Studio,
  including an authored-matcap/procedural-light A/B;
- `http://127.0.0.1:8000/experiments/clay-physics-lab/pbd.html` for the bounded
  642-vertex plastic PBD study of local Push and Pull;
- `http://127.0.0.1:8000/experiments/clay-physics-lab/` for the earlier flat
  heightfield dough study, retained only for letter rolling and impressions.

Run the deterministic material tests with:

```sh
node experiments/clay-physics-lab/test.mjs
node experiments/clay-physics-lab/pbd-test.mjs
```

The test imports the exact browser module through a data URL because this
repository correctly has no `package.json` or build step.

The PBD test checks welded topology, persistent plastic strain, finite
coordinates, reset behaviour, <0.5% volume drift, and zero triangle inversions
after a bounded pull. The code is intentionally small and dependency-free. It
is not ready to move to `shared/` until it passes the real-iPad and child-feel
gates in the research document.

The pages answer separate questions:

| Page | Question it can answer | Question it cannot answer |
|---|---|---|
| `solid.html` | Can familiar source balls compress and become one restrained-neck solid? | Does a local fingertip dent or pulled tip persist? |
| `pbd.html` | Can one surface ball retain a local Push/Pull mark while conserving approximate volume? | Can separate fixed meshes fuse topology? |
| `index.html` | Can a horizontal slab roll, stamp and move material conservatively? | Can it preserve a spherical body's front, side and back? |

The neutral matcap and material-locked clay-height source are generated
look-development assets, not downloaded runtime dependencies. Their complete
prompts, processing and cautions about production promotion are recorded in
`assets/matcap-clay-study.recipe.json`,
`assets/clay-height-study.recipe.json`, and `ASSETS.md`.
