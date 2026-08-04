# Clay Physics for QLOBE Kids — Implementation Recommendation

**Date:** August 2026 · **Status:** Research complete, ready for prototype
**Scope:** How to build the tactile clay engine shown in the tablet concept image (matte blue/orange clay balls; Push / Pinch / Pull / Smooth / Flatten tools; dents that slowly bounce back) for games in the QLOBE Kids playground.

---

## 1. Recommendation in one paragraph

Build a small, hand-written, dependency-free clay engine in `shared/js/clay/` — not a vendored physics library. The engine has two halves that should be kept separate: a **solver** (a ~500-line position-based-dynamics surface-spring simulation with *plasticity*, the one technique that turns "jelly" into "clay") and a **renderer** (three.js r166, already vendored, using `MeshMatcapMaterial` with an authored clay matcap plus a CC0 fingerprint bump map — which gives the concept image's studio-lit claymation look with near-zero GPU cost on old iPads). A simpler 2D variant of the same solver, rendered as a Pixi mesh with an authored clay sprite, covers 2D engine-family games like Playdough Letter Factory. Every off-the-shelf engine evaluated (ammo.js, matter.js, LiquidFun, WebGPU MPM) fails at least one hard repo constraint; the hand-written route follows the repo's own strongest precedent (`shared/js/stage/water.js`, a dependency-free spring simulation shipped in a live game).

## 2. What the concept image is actually asking for

The mockup shows: two matte clay balls, studio-lit on a warm beige backdrop, with soft contact shadows; a finger **pushes** the top ball and it **dents where touched**; continued pushing **deforms the whole ball** (volume shifts, it slumps); on release the clay **slowly bounces back**, but not perfectly — it remembers some of the deformation; a tool rail offers **Push, Pinch, Pull, Smooth, Flatten**; there's a **simulation speed** slider, undo/redo, and reset.

Decomposed, that's four requirements:

1. **Local denting with global response** — poking one side should bulge the rest slightly (volume-ish conservation), or it reads as erasing rather than pressing.
2. **Plasticity with slow recovery** — clay yields (keeps the dent), then relaxes back over seconds. This is the defining "clay vs. jelly vs. balloon" behavior.
3. **The claymation *look*** — matte with a whisper of sheen, fingerprint grain, hand-made lumpiness, soft warm studio light, soft contact shadow. Research is unanimous that this is a *rendering* problem, not a physics problem: shipped "clay" products (Hey Clay, Clay Jam, even Claybook's marketing) sell the material with shading and squash-stretch more than with simulation accuracy.
4. **Unbreakable under child input** — five fingers mashing at once must never explode the sim. This rules out force-based spring integrators at high stiffness and favors position-based (constraint projection) methods, which are unconditionally stable by construction.

## 3. Hard constraints from the repo (what the engine must respect)

From `CLAUDE.md`, `CONTRIBUTING.md`, `docs/philosophy.md`, `docs/interaction-patterns.md`, and `docs/agent-quickstart.md`:

- **No build step, no npm, no CDN.** Vanilla ES modules; any third-party code must be a single vendorable MIT/BSD/Apache/zlib file in `shared/vendor/`.
- **Device floor:** iPad Safari ~iOS 15 on hand-me-down tablets (worst case A8X-class iPad Air 2). WebGL2 is available (Safari 15+); **WebGPU is permanently out of reach** on these devices.
- **Already vendored:** three.js r166 (used only by `sound-sprouts`, which must not break) and PixiJS v8 (the load-bearing renderer for the Stage engine fleet). No physics library of any kind exists in the repo today.
- **Precedent for physics:** `shared/js/stage/water.js` — a hand-written, dependency-free spring-mesh + buoyancy sim with fixed timestep and settle-to-rest, shipped in the live game `sink-or-float`. `shared/js/stage/puppet.js` does the same for ragdoll joints. This is the house style: small bespoke simulations, honestly documented, driven by `update(dt)`.
- **Input contract** (interaction-patterns #9/#11): Pointer Events only, listeners on `window` filtered by `pointerId`, one active pointer (`isPrimary`), `pointercancel` + window `blur` both cancel cleanly, `touch-action: none`, DPR clamped to 2, touch targets ≥ 96 px.
- **Art-direction gate** (agent-quickstart): "code-native clay" is explicitly called out as insufficient — procedural gradients read as vector UI, not material. Primary objects need an authored visible renderer. Any clay engine will be QA'd against this, so authored textures (matcap, grain, backdrop) must be part of the plan, not an afterthought.
- **Culture of battery care:** stop the ticker when nothing moves (pattern #12); sims settle to rest (`water.js` does this).
- **The opening already exists:** `docs/game-queue.md` line 83 specifies Playdough Letter Factory as "squish and pull a dough blob… (physics-lite)" and line 166 specifies Clay Creature Studio as "sculpt a soft 3D blob… reuse vendor/ three.js; ambitious." Both games shipped *without* that physics. The clay engine is the designed-but-unbuilt piece.

## 4. The two key technical insights from research

### 4.1 Plasticity is a 15-line addition to a standard soft body

Every soft-body demo on the web is *elastic* — it always springs back fully, which reads as jelly or balloon, not clay. The sanctioned technique (from Müller et al.'s shape-matching plasticity model, SIGGRAPH 2005, and standard in the PBD literature) is **rest-state creep with yield**:

```
after each solve step, for each constraint:
  strain = (length - restLength) / restLength
  if |strain| > YIELD:                       // clay gives way
      restLength += CREEP * dt * (length - restLength)
  restLength += RECOVER * dt * (originalLength - restLength)  // slow bounce-back
```

Dent the ball → constraints past the yield threshold let their rest lengths flow toward the deformed shape (the dent *persists*) → a much slower reverse creep relaxes rest lengths back toward the original sphere (the dent *slowly heals*). Exactly the "Release: watch the clay slowly bounce back" panel of the concept image, controlled by two child-friendly tunables. The same rule applies unchanged to 2D rest areas and 3D rest volumes. The concept image's **simulation speed slider maps directly to these creep rates** — a lovely, honest science-toy control.

### 4.2 The claymation look is cheapest via matcap, and old iPads love it

`MeshMatcapMaterial` (three.js) bakes material + studio lighting into one small sphere-image sampled by view-space normal: no lights, no shadow passes, one texture fetch per fragment, and it shades *deforming* geometry correctly as long as normals are recomputed. This is precisely how sculpting tools (ZBrush, Blender sculpt mode, SculptGL, Nomad Sculpt) get their signature clay look at interactive rates. For a fixed-camera kids' game the matcap's one limitation (lighting glued to the camera) is invisible. The recipe that matches the concept image:

- One **authored neutral-grey clay matcap** (rendered in Blender with a soft warm key light — authored, so it passes the art-direction gate and is owned outright), tinted per ball via `material.color` → blue and orange balls from one texture.
- A **CC0 fingerprint/clay-grain bump map** (ambientCG `Fingerprints001` / `Clay001`, license-safe) at low intensity — the research consistently identifies fingerprint grain as *the* signature claymation detail.
- **Baked lumpiness**: one-time low-frequency noise displacement of the sphere so it starts hand-made, never CG-perfect.
- **Blob contact shadow**: an authored soft radial-gradient plane under each ball, warm brown (never grey), squashing with the ball. Zero shadow passes. The backdrop itself is an authored raster with baked vignette/grain.

This whole stack runs at 60 fps on an iPad Air 2. `MeshStandardMaterial` with one warm directional light is a viable "nicer tier" for newer devices; `MeshPhysicalMaterial` (sheen/clearcoat) and real-time shadow maps should be avoided at the floor.

## 5. Recommended architecture

```
shared/js/clay/
  clay-solver.js     — dependency-free physics. No imports. createClaySolver(opts)
                       → { particles, update(dt), grab(x,y,id), move(...), release(id),
                           addBall(...), settled, applyTool(tool, ...) }
  clay-three.js      — 3D renderer binding: three.js sphere mesh per ball,
                       vertex positions driven by solver, computeVertexNormals()
                       on deform, MeshMatcapMaterial + bump map, blob shadows.
                       THREE passed in via opts (same pattern as water.js
                       receiving PIXI) — never imported directly.
  clay-2d.js         — 2D binding: rim-particle blob → Pixi MeshPlane (or canvas)
                       with authored clay sprite + shading that shifts away from
                       the dent. For engine-family and simpler games.
shared/assets/clay/
  matcap-clay.png, fingerprint-normal.png (CC0, documented in ASSETS.md),
  shadow-blob.png, backdrop textures
```

### The solver (the heart of it)

A **surface-based position-dynamics sphere**, not a tetrahedral volume and not a particle fluid:

- Each ball ≈ 400–900 surface vertices mirrored as particles; constraints = edge distance constraints + long-range "spoke" constraints to the center + a global volume constraint (sum approximation) so pokes bulge the far side.
- Semi-implicit integration, **fixed timestep with substeps** (house precedent in `water.js`), constraint projection XPBD-style — unconditionally stable no matter what a five-year-old does to it.
- **Plasticity + recovery** exactly as §4.1.
- **Settle-to-rest threshold** → renderer stops the ticker (pattern #12) until the next pointer event.
- Interaction = **grab constraints**: on `pointerdown`, bind the nearest surface region (smooth falloff radius ≈ a child's fingertip at ≥96 px) to the pointer; `pointermove` drags the bound region; `pointerup`/`pointercancel`/`blur` releases. Raycasting via three.js `Raycaster` in the 3D binding; simple distance test in 2D.
- Ball-vs-ball and ball-vs-ground contact: sphere-ish proxy collisions per particle against the other ball's implicit surface and the ground plane — sufficient for stacked clay as in the image.

**Estimated cost:** 2–3 balls × ~600 particles × ~8 substeps is on the order of 10⁵ constraint projections per frame in plain JS — comfortably 60 fps on A10-class iPads, with `computeVertexNormals()` run only while a ball is actively deforming or relaxing.

### Tool mapping (from the concept image's rail)

| Tool | Solver behavior |
|---|---|
| **Push** | Grab constraint pushes region inward along the surface normal; yield high enough that dents persist while pressed |
| **Pinch** | Single-finger friendly: grab two opposing points around the touch and draw them together (research: pinch *gestures* are unreliable under age ~6 — never require two fingers) |
| **Pull** | Grab constraint pulls region outward; creep lets pulled lobes keep their shape |
| **Smooth** | Laplacian relax of rest lengths toward neighbors within the brush radius (SculptGL's smooth brush, applied to rest state) |
| **Flatten** | Project rest positions in the brush region toward the tangent plane |

All five are variations on "edit the rest state within a falloff radius" — one code path, five parameterizations. Undo/redo = snapshot rest-state + positions (small typed arrays; cheap), matching the repo's existing snapshot/restore culture (`freeform-board.js`).

### Two render tiers, one solver

- **Tier A — 3D hero experience** (`clay-three.js`): the concept image, faithfully. Fixed camera, matcap shading, fingerprint bump, blob shadows. First consumer: a new "clay table" game, or the sculpting mode Clay Creature Studio's queue entry always wanted (built as a new game/mode — Clay Creature Studio is live and shouldn't be touched in the same pass; `sound-sprouts` is protected and stays untouched — the engine only *reads* the already-vendored three.js).
- **Tier B — 2D blob** (`clay-2d.js`): the same solver reduced to a rim of 24–32 particles + area constraint + identical plasticity rule, skinned as a Pixi mesh over an authored clay sprite, with shading that shifts away from the dent (the Blob Opera trick — a 2D deformable blob with good shading reads as fully 3D to children). First consumer: upgrading Playdough Letter Factory (beta) from its current CSS `scaleX/scaleY` fake to real squish-and-pull, closing its queue-spec gap. Also the graceful floor if a specific old device struggles with Tier A.

## 6. Options considered and rejected

| Option | Why not |
|---|---|
| **WebGPU MLS-MPM / PB-MPM** (matsuoka-601 demos, EA's PB-MPM) — the "Claybook feel" state of the art | WebGPU will never exist on iOS-15-era hand-me-down iPads. Revisit only if a WebGPU enhancement tier is added years from now; EA's position-based MPM would then be the algorithm of choice. |
| **GPU MPM on WebGL2** (David Li-style additive-blend scatter) | No open-source implementation exists; ~3–6k LOC of expert GLSL, weeks of specialist effort, thermal risk on A10. Wildly out of proportion for a kids' toy. |
| **CPU MPM / particle fluids** (mls-mpm.js MIT, LiquidFun elastic particles) | Real option for a future *goo/dough-mixing* game (2–8k particles at 60 fps is feasible), but for discrete pokable balls it's the wrong abstraction: harder to control shape identity, needs a metaball render layer, and LiquidFun is archived (Feb 2026) with a 2014-era asm.js build. Keep on the shelf. |
| **ammo.js soft bodies** (three.js official example) | 2 MB asm.js or a two-file WASM pair — fails the single-vendorable-file spirit and the 35 MB game budget's spirit; slow startup parse on old iPads; Bullet soft bodies are elastic-only, so the defining clay behavior (plasticity) would be fought through the API rather than 15 lines of our own code. |
| **matter.js `Composites.softBody`** | Officially deprecated; a "bag of marbles" (grid of rigid circles), jittery, no skin, no plasticity hook. |
| **Pressure-model blobs** (Matyka) | Reads as balloon/water-balloon — the wrong material. Force-based, so stability under child mashing needs care that PBD gives for free. |
| **SDF raymarched dent-ball** (miniature Claybook: sphere SDF + smooth-min poke dents that decay) | Strongest *rejected* option — gorgeous look for ~500 LOC of GLSL and no sim at all. Rejected as the primary because it can't do Pull/Pinch lobes, smearing, or two balls squashing against each other, and fragment-shader raymarching is fill-rate-risky on A8X at retina. Worth keeping as a possible special-effect (e.g., a "magic clay" moment) later. |
| **Vertex-spring "fake squish" without constraints** (SculptGL-style brush + per-vertex springs) | Very close cousin of the recommendation and the fallback simplification if the solver over-runs its budget — but no volume response (dents just erase), and pull/pinch are awkward. The constraint solver costs little more and does all five tools properly. |

## 7. Fit against repo constraints — checklist

- ✅ **No build step / no npm:** all first-party ES modules; zero new vendored code (three.js and Pixi are already in `shared/vendor/`).
- ✅ **Licensing:** first-party code under repo MIT. Reference material is MIT (Ten Minute Physics solver patterns, SculptGL brush math — reference only, not copied wholesale) and CC0 textures (ambientCG), documented per `ASSETS.md` conventions. Avoid the nidorx/matcaps image pack (unverified provenance) — author the matcap in Blender instead.
- ✅ **Device floor:** CPU solver + matcap rendering is the lightest plausible 3D stack; 2D tier lighter still. iOS 15.0–15.3 had known WebGL2/ANGLE regressions — test on a real iOS 15.x device early (the repo's real-iPad playtest gate covers this).
- ✅ **Input contract:** single primary pointer, window-level listeners by `pointerId`, cancel/blur → release grab and let the sim relax (physics gives "glide home" for free).
- ✅ **Battery / pattern #12:** settle-to-rest → stop ticker; render on demand.
- ✅ **Art direction gate:** visible renderer = authored matcap + authored grain + authored backdrop/shadow sprites; interaction substrate = three.js/Pixi mesh. Declare both separately in the GDD as agent-quickstart requires.
- ✅ **No-failure philosophy:** clay has no wrong answers; Reset and undo/redo map to snapshot/restore; `prefers-reduced-motion` → skip idle wobble and snap recovery to a short ease instead of physical settling (state outcome unchanged).
- ✅ **Shared-first:** engine lands in `shared/js/clay/`, consumed by games as data + thin `main.js`, like the Stage kit.

## 8. Risks and mitigations

1. **Art-direction QA rejects procedural shading.** Highest real risk, called out explicitly in `docs/agent-quickstart.md`. Mitigation: treat the matcap, grain, backdrop, and shadow sprites as *authored art deliverables* rendered/painted to match the house claymation style (Clay Creature Studio's asset world is the reference palette); do a look-dev spike **before** building the full solver, and QA the still frame against the concept image.
2. **Perf on A8X (iPad Air 2).** Mitigation: solver budget knobs (particles per ball, substeps) + the 2D tier as designed fallback; recompute normals only while deforming; DPR ≤ 2; render-on-demand.
3. **Solver tuning feel.** Yield/creep/recover constants are the difference between jelly, clay, and mud. Mitigation: build the debug page with sliders first (the concept image's simulation-speed slider is already this), tune on-device, then freeze constants.
4. **Scope creep toward a sculpting app.** The image is a toy, not ZBrush. Mitigation: cap tools at the five shown; no mesh topology changes (no cutting/merging balls in v1 — merging is the single hardest upgrade and should be explicitly out of scope).

## 9. Suggested build plan

1. **Look-dev spike (1–2 days):** static three.js scene — two noise-lumped spheres, authored matcap, fingerprint bump, blob shadows, beige backdrop. Compare side-by-side with the concept image; pass the art gate first.
2. **Solver spike (2–3 days):** `clay-solver.js` with Push + plasticity + recovery on one ball, debug sliders for yield/creep/recover/speed. Feel-test on a real iPad.
3. **Engine hardening (1 week):** all five tools, two-ball contact, undo/redo snapshots, settle/ticker integration, reduced-motion path, `clay-2d.js` reduction.
4. **First game:** a minimal "clay table" free-play game (the concept image, essentially) registered via the standard `game.json` / `games.json` flow — the playtest vehicle for beta → live.
5. **Second consumer:** Playdough Letter Factory upgrade (2D tier), closing the "physics-lite" queue spec.

## 10. Key sources

**Solver:** Ten Minute Physics (M. Müller) tutorials 09 XPBD & 10 soft bodies, MIT-licensed single-file demos — https://matthias-research.github.io/pages/tenMinutePhysics/ · Müller et al., *Meshless Deformations Based on Shape Matching* (SIGGRAPH 2005) — the yield/creep/max plasticity model · PBD survey (Bender/Müller) · Gorilla Sun, *Soft Body Physics and Blobs* (2D rim-blob pattern).
**Rendering:** three.js `MeshMatcapMaterial` docs + `webgl_materials_matcap` / `webgl_shadow_contact` examples (MIT, in the vendored distribution) · SculptGL (MIT, github.com/stephomi/sculptgl) — matcap-shaded tablet sculpting prior art and brush math · ambientCG `Fingerprints001` / `Clay001` (CC0) · kchapelier/matcap-studio (MIT) for matcap tweaking · Z. Rowbotham, *Rendering Clay for Digital Stop Motion* (fingerprint + layered-specular recipe).
**Continuum family (evaluated, shelved):** nialltl, *incremental MPM* guide + repo (MIT) · r03ert0/mls-mpm.js (MIT, 148-line JS MLS-MPM) · Claybook GDC 2018 (S. Aaltonen) — SDF-first clay, GPU-compute, not portable to WebGL2 · matsuoka-601's WebGPU fluid demos · EA SEED PB-MPM (SIGGRAPH 2024) · David Li, *Fluid Particles* (MIT) — the only WebGL-era GPU-scatter precedent · Google LiquidFun (zlib-style; archived).
**Kids' UX:** NN/g *Design for Kids by Physical Development* (tap/short-drag reliable from ~3–4; pinch unreliable under ~6; ≥2 cm targets) · Google *Building for Kids* · Blob Opera (David Li / Google Arts & Culture) — proof 2.5D blob + shading reads as 3D to children · Hey Clay, Clay Jam, Let's Create! Pottery — shipped "clay" products that sell the material through look and forgiving verbs, not simulation.
**Repo:** `shared/js/stage/water.js` (house-precedent sim), `docs/interaction-patterns.md` #9/#11/#12, `docs/agent-quickstart.md` (art gate), `docs/game-queue.md` lines 83 & 166 (the designed-but-unbuilt clay specs).

---

## 11. Revision after implementation comparison — 2 August 2026

**Status:** the original PBD recommendation remains a valuable local-sculpting
candidate, but it is no longer recommended as the single substrate for both
games. A working implicit-lobe prototype exposed a topology requirement that
the original recommendation explicitly placed out of scope: Clay Creature
Studio needs separate source balls to become one visually continuous body.

This revision is additive. It records what the working prototypes changed in
the decision, which original claims remain hypotheses, and the next bounded
comparison. It does not retroactively rewrite the independent recommendation.

### 11.1 What the working implementation established

The first mass-conserving 2.5D heightfield correctly moves material and remains
useful for a horizontal dough slab, but visual review showed that it turns
spherical creature parts into a paint-like layer. Fixed camera angle does not
make a surface representation appropriate for a fundamentally volumetric
object.

The replacement Creature prototype uses two analytic, volume-preserving
ellipsoidal SDF lobes. Contact compresses each lobe along the centre-to-centre
axis, expands its perpendicular axes, and applies a tightly bounded smooth
union. It therefore demonstrates three properties which the rejected
"SDF raymarched dent-ball" row did not evaluate:

- the original balls remain readable as sculptural lobes;
- two balls can squash against one another;
- their silhouette can become one permanent, restrained-neck solid without a
  topology change.

The SDF rejection in §6 applies fairly to a static sphere plus subtractive
poke dents. It does **not** establish that all implicit-lobe models are unable
to squash or combine. Conversely, the current implicit prototype is not yet a
general moulding solver: it deforms and joins whole lobes but does not yet keep
a local fingertip dent, pinch, flattened patch, or pulled tip.

### 11.2 Revised comparison

| Requirement | Surface PBD from the original recommendation | Analytic implicit lobes from the implementation |
|---|---|---|
| Preserve the existing Creature Studio ball language | Plausible with careful material art, but a deformed triangulated sphere is a new renderer | Strong; the primitive, colour boundary, highlight and joint are designed around the source balls |
| Join two balls into one body | Not solved as written; §8 explicitly excludes merging and fixed meshes remain two surfaces | Strongest property; smooth implicit union gives a continuous silhouette and controllable neck |
| Local Push / Pull / Pinch / Flatten | Stronger foundation; brush-region constraints and plastic rest state can support them | Missing from the first implementation; whole-lobe transforms only |
| Plastic memory | Yield/creep rest-state rule is the clearer general model | Permanent fusion and transforms only; no general local rest surface yet |
| Volume | Global mesh-volume constraint, approximate and sensitive to inversion | Exact for each compressed ellipsoid; total union-overlap compensation remains unfinished |
| Rendering cost | CPU solve plus inexpensive rasterised mesh | Very small CPU state, but raymarch fill-rate risk at Retina resolution |
| Topology and saved state | Fixed topology; larger particle/rest-state snapshots | Joining is natural; a few lobe records and anchors are compact to save |
| Letter rolling, grooves and stamps | A 2D rim blob is good for free squish, weaker for a broad slab and impressed paths | Conservative heightfield directly represents those verbs and preserves the existing SVG pedagogy |

### 11.3 Revised architectural decision

Do **not** force one solver or representation across both games:

1. **Clay Creature Studio assembly:** retain the compact implicit-lobe model as
   the current leading vertical-slice representation. It is the only evaluated
   route which solves the requested natural ball fusion while preserving the
   familiar lobes.
2. **Creature local moulding:** run a separate, small surface-PBD spike for one
   ball with Push and Pull, plastic rest-state creep, a non-creeping volume
   constraint, and near-zero recovery. If it produces a materially better
   touch response, evaluate it as a coarse local deformation control layer;
   do not give its fixed mesh responsibility for fusion.
3. **Playdough Letter Factory:** retain the conservative 2.5D field for rolling,
   traced impressions, stamps and deposited ropes. A rim-PBD blob may remain a
   useful free-squish mode, but is not the shared foundation.
4. **Rendering:** compare a generated/authored neutral clay matcap against the
   procedural studio light in the same implicit scene. Matcap sampling is
   compatible with a raymarched normal and does not require abandoning the
   implicit surface. Keep object-space micro-normal detail separate where
   possible so fingerprints do not appear glued to the camera.

The likely long-term Creature shape stack is therefore **implicit fusion plus
bounded local deformation**, not a choice between "SDF everywhere" and "PBD
everywhere." The experiments must remain separable until local feel and device
cost are measured; premature hybridisation would make failures difficult to
attribute.

### 11.4 Corrections to confidence and repo interpretation

- The repository supports hand-me-down devices and requires real-device QA,
  but it does not currently declare iPad Air 2 / A8X / iOS 15 as an exact hard
  floor. Treat that pairing as a conservative test candidate until the product
  owner names the oldest supported hardware and OS.
- The 60 fps A8X statements in §§4–5 are estimates, not measurements. PBD has a
  favourable cost shape and matcap mesh rendering avoids raymarch fill rate,
  but neither path has an iPad performance sign-off.
- PBD constraint projection is robust, not literally failure-proof. Extreme
  grab constraints, collision ordering, inverted triangles, incompatible
  plastic rest lengths and self-intersection still require bounded input and
  tests.
- The yield/creep rule is small; a production 3D plastic material is not merely
  a 15-line change. Edge, spoke and volume constraints must agree without
  turning the ball into rubber, a balloon, or a collapsing shell.
- `docs/agent-quickstart.md` does not categorically ban procedural clay. It
  requires an authored asset **or an explicit, reviewed reason** that a
  procedural renderer is faithful. The matcap study is an art comparison, not
  an automatic gate winner.
- The single-primary-pointer contract and the claim that "five fingers mashing
  at once" must drive the material are different requirements. Extra pointers
  should be ignored safely; simultaneous multi-touch sculpting is not required
  for the first spike.

### 11.5 Recovery policy

The concept's slow bounce-back is not automatically appropriate for Creature
Studio. A child's deliberate modelling should not visibly erase itself. Use:

- brief damping or smoothing to remove numerical chatter;
- persistent plastic rest state for intentional dents and pulls;
- recovery defaulting to zero or nearly zero in Creature Studio;
- an exposed recovery control in the engineering lab only, so playtesting can
  determine whether a very slow heal adds life or removes agency.

### 11.6 Added comparison prototypes

The implementation comparison lives under
`qlobe-kids/experiments/clay-physics-lab/`:

- `solid.html` — two volume-preserving implicit lobes, restrained fusion, and a
  switchable authored-matcap/procedural-light material comparison;
- `pbd.html` — one fixed-topology surface ball used only to test local Push and
  Pull, plastic yield/creep, global volume response and optional recovery;
- `index.html` — the retained conservative dough-heightfield experiment.

The PBD and implicit pages deliberately answer different questions. A visually
successful PBD dent does not prove fusion; a successful implicit join does not
prove moulding.

### 11.7 Revised evidence gates

Do not move either experiment into `shared/js/clay/` until the same oldest-iPad
session records:

- response beginning in the input frame and p95 interaction work within an
  8 ms game-side budget;
- 50–60 fps during 30 seconds of continuous manipulation at two render-buffer
  scales, without a thermal slide or context loss;
- target-volume drift below 0.5% after repeated Push/Pull operations;
- a persistent local mark after release without uncontrolled oscillation,
  inversion, or a rubber snap-back;
- for implicit lobes, a joined neck which children read as solid clay rather
  than overlap, liquid, or two sprites;
- for PBD, an explicit finding on whether its improved local feel justifies a
  hybrid layer despite its inability to merge topology;
- a side-by-side art review of procedural lighting and the neutral matcap,
  viewed in the actual Creature Studio scene rather than on an isolated sphere.

**Revised recommendation in one sentence:** retain implicit lobes for Creature
Studio fusion, use a bounded PBD experiment to learn the missing local plastic
interaction, retain the conservative heightfield for Letter Factory, and make
the final renderer/solver decision only after a same-device comparison.

### 11.8 First comparison results

The bounded PBD page now uses a welded detail-3 icosphere: 642 vertices, 1,280
triangles, 1,920 unique edge constraints, 642 centre spokes, one global volume
constraint, three substeps and six projection iterations. Push and Pull both
modify the edge/spoke rest state only after yield; the target volume never
creeps. Pointer displacement is capped and the lab reports locally inverted
triangles rather than allowing volume alone to hide foldover.

Deterministic Node testing produced a persistent pulled mark with **0.060%
volume drift**, mean stored plastic strain of **0.0080**, zero inverted
triangles, and finite coordinates throughout. Headless system-Chrome interaction
at a 758×505 render buffer produced:

| Browser gesture | Volume drift after release | Inverted triangles | Result |
|---|---:|---:|---|
| Push | 0.177% | 0 | broad local dent remained |
| Pull, capped at 0.48 radius | 0.075% | 0 | bounded local lobe remained |

The page reached 60 fps in settled and multiple interaction sample windows on
the development Mac, with no console errors, failed requests, WebGL errors, or
horizontal overflow at 1180×820 and 820×1180. Screenshot capture caused some
short FPS windows to dip, so these observations are browser-feasibility checks,
not timing evidence for an iPad.

The material A/B also produced a useful negative result. The first generated
matcap had a black gap around its circular lookup disc, which created an ink-like
rim at grazing normals. A second generation removed the gap and lifted edge
illumination. It now supplies clean broad shape light, but the existing
procedural shader still matches the Creature Studio source balls' brightness,
colour and moving microtexture more closely. The generated matcap remains a
comparison asset; it is **not** promoted as the production renderer by this
test. A production matcap would need deliberate look-development, ideally with
lighting and grain split so surface detail is object-locked rather than
view-locked.

These results support the revised split: PBD has already demonstrated a local
plastic mark that analytic lobes lack, while the fixed mesh still offers no
fusion path. Real-iPad cost, repeated multi-mark degradation, recovery feel and
child interpretation remain open gates.

### 11.9 Clay material and colour-seam revision

The PBD renderer now separates broad form lighting from material detail. A
neutral matcap still supplies the large-scale light response, while a generated
grayscale clay-height source perturbs the surface normal through derivative
bump mapping. The height source is sampled tri-planarly from an immutable copy
of each vertex's original material position, so fingerprints, pores and shallow
dimples stay attached while the solver dents or pulls the mesh instead of
swimming through it.

The first browser pass used a bump strength of 7.5 at a texture scale of 1.18.
It proved that the detail survived deformation, but read as stucco rather than
soft modelling clay. A later material review also found that matcap-only form
light became almost uniform across large front-facing deformations. The accepted
lab setting therefore combines a soft directional key and restrained
position-based studio sweep with a much quieter bump strength of 0.22 at a
texture scale of 0.64. Correct output colour conversion restores the intended
orange instead of compensating with unlit albedo. This is a prototype material
recipe, not evidence that one texture should be shared by every clay colour or
camera distance.

The implicit fusion page also no longer projects an orange/red circle onto the
second lobe. Colour ownership is now derived from the same per-lobe implicit
field weights that define the joined surface. A very small noise offset breaks
the mathematical edge without crossing the join, so the red material ends at
the seam rather than extending as a circular decal.

The revised pages passed deterministic solver tests and browser interaction QA
without console, request, WebGL or overflow failures. The settled PBD view and
the sampled Push and Pull interactions ran at 60 fps on the development Mac;
volume drift remained 0.177% and 0.075% with zero inverted triangles. These
checks validate integration only. Material readability, GPU cost and moire at
the target render scale still need a real oldest-supported-iPad review.

---

## 12. The stored-field experiment — 3 August 2026

**Status:** prototype complete, measured, and recommended for adoption *with
changes*. Everything below was measured on the development Mac (Intel UHD 630
through ANGLE/Metal, system Chrome, DPR 1.5). Nothing here has touched an iPad.

### 12.1 Why this experiment exists

The product owner, watching the current engine in a live playtest, said:

> "The intention is that the green clay should now be a part of the whole and
> behave accordingly, not have an atomic identity. Are we using meshes that can
> be blended and simplified, with just the colour texture on the exterior
> remaining?"

That is not a request for a better blend. The implicit-lobe engine already
blends beautifully — §11 records why it won — but every lobe it blends stays in
a list, stays addressable and stays draggable, so a child can lever an entire
welded mass back out of a finished creature. The owner watched that happen. The
identity is not visible in the render; it is visible in the *behaviour*.

So this experiment builds the representation the owner was actually describing:
**one stored signed-distance + colour field**, with no primitive list anywhere in
it. §6 rejected an "SDF raymarched dent-ball" in July on the grounds that it
could not do Pull, lobes or smearing. That rejection was correct **for a static
analytic SDF**, and it does not carry over: a *stored* field supports a pull as
local material advection, which is exactly what an analytic one cannot express.

The prototype is `experiments/clay-physics-lab/field/` — `field-core.js` (the
field, dependency-free and node-testable), `field-three.js` (a WebGL2 raymarch
renderer), `field.html/js/css` (the lab page) and `field-test.mjs` (eight
deterministic tests, all passing, ~2.6 s).

### 12.2 Architecture, and why

| Decision | Choice | Reason |
|---|---|---|
| Grid | 80³ over a 2.0-unit cube (0.025 voxel) | 8.9% of a typical ball radius. The middle of a three-way comparison (12.5) in which 64³ blunts a drawn-out tip and 96³ costs 73% more memory for a difference you have to look for. Exported as a constant, and overridable on the lab page with `?res=`. |
| Distance precision | 8-bit, encoded over ±4 voxels (±0.1) | Quantisation step 0.00078 world units — a third of a device pixel at DPR 1.5 on a 700 px stage, invisible — while still letting the march cross empty space in ~10 steps. Half-float would have doubled the bandwidth to buy precision nothing can see. |
| Colour | RGB, 8-bit, per voxel | Palette indices cannot be interpolated. RGB means the *hardware trilinear filter* does the blending, so colour smearing costs the renderer nothing at all. |
| Layout | ONE RGBA8 3-D texture: RGB = colour, A = distance | One fetch returns both, already blended, already in step. Two textures would have been two fetches and two chances to drift. |
| Ops | `stampBall`, `pull`, `settleRest`, `simplify` | Four verbs. None of them takes or returns an object identifier. |
| Dirty tracking | 8³ bricks, coalesced to one region per upload | See 12.5 — the coalescing is worth 15x. |

The field is repaired rather than trusted. Advection distorts an SDF's metric,
so every warping op is followed by a bounded Lipschitz sweep that restores
`|grad d| <= 1` over the touched region only. A pleasant side effect: the baked
stamp noise needs no equivalent of `lobes.js`'s `NOISE_SAFETY` fudge, because the
sweep repairs the displacement into a marchable field instead of the shader
having to step timidly around it forever.

### 12.3 Q1 — Does pull-as-advection feel like clay at interactive rates?

Yes, comfortably, and the cost scales with the brush rather than with the
creature. Measured in the browser as a real pointer drag, 80³, per pointermove
(the number is the whole op: advect, ground-cut, Lipschitz repair, local volume
renormalisation, colour dilation):

| Brush radius | Pull median | Pull p95 | Full frame (pull + upload + render) median / p95 | Dirty region |
|---|---:|---:|---:|---|
| 0.14 (fingertip) | 0.7 ms | 1.8 ms | 1.2 / 2.0 ms | 32×24×24 |
| 0.22 (medium) | 1.0 ms | 4.2 ms | 1.3 / 2.8 ms | 32×32×32 |
| 0.34 (whole hand) | 2.6 ms | 8.5 ms | 1.8 / 3.0 ms | 48×40×40 |

The house gate is 8 ms of game-side work at p95. A fingertip or medium brush
sits well inside it; the largest brush touches the ceiling and is the honest
worst case to quote. Deterministic node measurement over a 50-op session at
medium brush: median 1.39 ms, p95 2.10 ms, max 2.14 ms.

Does the material *read* as flowing? Yes, and better than expected — but with a
caveat that turned out to be the most interesting behavioural finding in the
whole experiment, recorded in 12.7.

### 12.4 Q2 — Is the raymarch flat with respect to sculpting complexity?

**Yes, and this is the strongest result in the experiment.** Both engines
measured in the same session, same machine, same DPR 1.5, through each one's own
`readPixels`-barriered probe:

| Balls / lobes | Incumbent `lobes-three.js` (1170×891) | Stored field (1302×867, 8% *more* pixels) |
|---:|---:|---:|
| 1 | 5.16 ms | 2.70 ms |
| 4 | 7.93 ms | 3.50 ms |
| 8 | 11.67 ms | 3.10 ms |
| 12 (incumbent's cap) | 14.59 ms | 3.40 ms |
| 16 | — cannot | 3.90 ms |

The incumbent climbs about +0.85 ms per lobe, because its fragment shader
re-walks the whole lobe list at every march step, every normal tap and every
colour lookup. The field's inner loop is one texture fetch and does not know how
much clay is in front of it. At the incumbent's own twelve-lobe ceiling the field
is **4.3x cheaper on a larger buffer**, and it has no ceiling: `MAX_LOBES = 12`
exists because the cost curve made it necessary, and that constraint simply
stops existing here. At drag quality (DPR 1.0, 64 steps, 868×578) the field
measures 2.1 ms.

The residual slope the field does show (2.7 → 3.9 ms) is not primitive count. It
is the bounding box growing, so more pixels get rasterised; a creature that
sprawls costs more than a compact one at any complexity.

### 12.5 Q3 — Memory, and the upload finding

| Grid | Voxels | CPU (distance + colour) | GPU texture | Voxel as % of a ball radius | Drag region | Bytes per drag frame | Pull median |
|---|---:|---:|---:|---:|---|---:|---:|
| 64³ | 262 k | 1.84 MB | 1.05 MB | 11.2% | 32×32×24 | 96 KB | 1.2 ms |
| 80³ | 512 k | 3.58 MB | 2.05 MB | 8.9% | 40×40×24 | 150 KB | 2.6 ms |
| 96³ | 885 k | 6.19 MB | 3.54 MB | 7.4% | 40×48×40 | 300 KB | 2.3 ms |

(The pull medians in that last column come from a single in-page run each and
carry JIT noise — 96³ measuring under 80³ is not real. Memory, region size and
bandwidth are exact; treat pull time as "1–3 ms across all three" and use the
per-brush table in 12.3 for the number that matters.)

Plus a transient 3.58 MB pristine snapshot at 80³ while a settle sequence is
running (12.6 explains why it earns its keep). Total resident at 80³ is about
9 MB worst case — an order of magnitude under a single background texture in any
of these games.

**On the visual difference, honestly: it is smaller than expected.** Rendering
the same worked shape — a ball with a thin limb drawn out of it, the case where
voxel size should show worst — at all three resolutions
(`field.html?res=64|80|96`), none of them facets and all three read as clay. What
64³ actually loses is the *end* of a fine taper: its drawn-out tip is blunter and
slightly shorter where 96³ resolves a needle. If the CPU budget on a tablet
forces 64³, the cost is that pulled points get stubbier, not that the material
falls apart — a much cheaper concession than it looked like on paper.

Two things surprised us. Volume came out within 0.3% across all three grids
(0.1130 / 0.1132 / 0.1133), so the local renormalisation is doing its job
independently of resolution. And the raymarch got *faster* as the grid got
finer (4.6 / 4.0 / 3.7 ms), which is the opposite of the intuition that a finer
grid means smaller steps: the encoded band scales with the voxel, so a finer
field converges onto the surface with less overshoot-and-retry. Grid resolution
is therefore a CPU and memory decision, not a GPU one.

**The negative result worth recording.** The obvious implementation — upload each
dirty 8³ brick with its own `texSubImage3D` — measured **13.5 ms per drag frame**
and was by a wide margin the most expensive thing in the whole system, worse
than the physics and the raymarch put together. The bytes were never the
problem: 128 KB at 60 Hz is 7.7 MB/s, nothing. The *call count* was. Each
sub-upload costs a texture bind, three `pixelStorei` calls and several
synchronous `glGetParameter` round trips, and 64 of those per frame is 13 ms of
pure driver overhead. Coalescing the dirty bricks into a single bounding region
and issuing one upload moved the identical bytes in **0.9 ms — a 15x
improvement** for a twenty-line change. Anyone building on this should treat
"how many uploads" as the first-order question and "how many bytes" as a distant
second.

### 12.6 Q4 — Gravity by resampling, and what repeated resampling costs

An elongated loaf built at 40° and released does rotate onto its belly and come
to rest on the table. Measured: the shortest principal axis goes from
y = 0.58 to y = 0.9999 (level to within 0.6°), the longest from y = 0.65 to
y = -0.0002 (horizontal), the body settles within half a voxel of the ground
plane, and volume drifts 0.06% across the whole settle. Screenshots
`32-crit2-tilted.png` → `34-crit2-rest.png`.

Resampling a sampled field blurs it, and a settle animation is the obvious way
to blur a sculpture into pudding. Two things prevent it:

1. **The animation never resamples.** The rotation the child watches is a *pose*
   on the renderer — the ray is carried into field space, so sixty frames of
   settle cost sixty uniform writes and zero voxels. The field is baked exactly
   once, at the end.
2. **A settle sequence resamples from a pristine base, not from itself.** The
   field snapshots itself when a settle begins and resamples *that* by the
   accumulated total transform each step, so blur is O(1) per sequence rather
   than O(frames). Rotation and translation are fused into one backward map for
   the same reason.

Measured, using mean `|grad d|` in the surface band as a sharpness proxy (a
well-formed SDF reads 1.0): 0.9975 before any settle → **0.9924** after an
eight-step accumulated-base sequence, versus **0.9715** when the base is
invalidated every step. Five times less degradation, and 0.5% off a perfect
gradient is not visible. A creature would have to be settled dozens of separate
times, with edits in between, before resample blur became the thing anyone
noticed.

The settle bake itself costs 62–78 ms at 80³ and is the one visible hitch in the
system. It is a once-per-release-of-a-drag cost, hidden behind the animation, but
it is real and it is the first thing to optimise if this ships.

### 12.7 Q5 — Colour: does it read as clay, and do unworked seams stay crisp?

Both, and the mechanism is that colour is *stored per voxel* and blended by the
same hardware fetch that returns the distance. Nothing implements smearing; it is
what the substrate already does.

Measured as "mixed fraction" — material whose colour has drifted more than a
fifth of the way from its nearest tray colour toward another:

| State | Mixed fraction |
|---|---:|
| Two balls stamped together, untouched | 0.012 – 0.039 |
| After a genuine stir through the boundary | 0.109 (pointer) / 0.181 (scripted) |
| After applying the exact inverse pulls, in reverse order | **0.258** |

Running the drag backwards makes it *worse*, not better. There is no undo in the
material — which is precisely the property the owner asked for. `31-crit1-worked.png`
shows the result: a marbled green-into-orange spiral at the worked centre, with
the outer boundary still as crisp as the day it was stamped. That is the answer
to "can seams stay crisp where unworked" — crispness is the default and mixing is
something the child has to *do*.

Two supporting details. Colour ownership at stamp time blends over exactly one
voxel, so an unworked seam is as sharp as the grid allows. And the seam carries a
small baked wobble on the same wave as the surface lumps — `lobes-three.js` does
this in the shader, but baking it means the wobble is *material*, so a later pull
drags the wobbly boundary along with the clay instead of leaving a fixed pattern
in space for the colour to slide under.

**The behavioural finding.** Straight-line dragging across a colour boundary
barely mixes anything (0.040 → 0.048 over thirty ops): pure translation
relocates a still-crisp interface without creating new interfacial area. Only
*shear* — an orbiting, stirring, folding motion — actually mixes. This is exactly
how real clay behaves and it is a lovely thing to have fall out of the physics
rather than be authored. It is also a design constraint with teeth: **a game that
wants children to blend colours has to elicit a stirring gesture, not a dragging
one.** A "smoosh it back and forth" instruction would produce almost no mixing
and would read as the material being broken.

### 12.8 Q6 — Save strategy

| Strategy | Size (a 12-op creature) | Restore cost |
|---|---:|---:|
| Op-log replay | **194 bytes** | 78 ms (12 ops) · 161 ms (100 ops) |
| Raw grid snapshot | 2,048,000 bytes | instant |
| Grid, gzipped | 34,825 bytes | + inflate |

**Recommend op-log replay.** It is 180x smaller than even the gzipped grid, it is
bit-exact (test 2 asserts a replayed field is byte-identical to the original,
which the seeded per-stamp noise makes possible), it survives a resolution change
— a saved creature replayed at 96³ is simply a better-looking version of the same
creature — and 161 ms for a hundred-op creature is a splash-screen cost, not an
interaction cost. It also lands in the same shape as the existing v1–v4 lobe
documents, which is what makes 12.9 tractable.

The grid snapshot should exist anyway, as an in-session undo buffer, where its
instant restore is the point and its size does not matter.

### 12.9 Q7 — Migration sketch (not implemented; scope estimated honestly)

Only four files import the clay engine: `lobes-three.js` (constants only),
`games/clay-creature-studio/js/blob-lobes.js`, that game's `main.js` (indirectly),
and `lobes.test.mjs`. The renderer needs just five field methods, with
`shading()` doing all the work; `blob-lobes.js` uses 33.

- **Keep unchanged (~400 lines):** the hand-worked noise (`noisePhase`,
  `noiseWave`) and the `toJSON`/`fromJSON` v1–v4 compatibility essay. Every
  saved creature on every shelf is a v1–v4 lobe document, and the migration path
  is simply that **`fromJSON` becomes a replay**: each saved lobe is one
  `stampBall`, each `sx/sy/sz` stretch is a short scripted `pull`, and the
  `fused` list stops meaning anything because everything is fused. Old creatures
  come back looking like themselves and can no longer be taken apart, which is
  the intended behaviour change, not a regression.
- **Reimplement (~1,600 lines):** volume/shape derivation, the CPU SDF union,
  the whole pull gesture subsystem (~430 lines, the largest single piece), merge,
  settle, consolidation. Most of this *disappears* rather than being ported —
  merge and consolidation have no meaning in a field, and the settle is 80 lines
  here against 260 there.
- **The real cost is not the field, it is the eight lobe-shaped accessors.**
  `protrusion()`, `shape()`, `list()`, `isProtrusion()`, `mergeCandidate()`,
  `partners()`, `consolidate()` and `toJSON()` hand back per-lobe records that
  `blob-lobes.js` and `games/clay-creature-studio/tools/qa.mjs` destructure by
  field name — `ra`, `rb`, `tipRatio`, `law`, `elongation`. `qa.mjs` L134 and
  L218 do `getLobes().lobes.find(l => l.id === id)`, which is the hardest
  coupling in the codebase and cannot be preserved by definition: the whole point
  is that there is no `l.id` any more.
- **QLOBE_DEBUG:** `pullAt`, `settleBlob`, `blobSeed`, `lobeVolume`,
  `lobeStats`, `lobeProbe` and `clearSaved` survive unchanged. `getLobes`,
  `blobShapes`, `getTargets`, `pullOnLobe`, `binPull`, `blobMergeCandidate`,
  `consolidateBlob` and `getState().lobes/.protrusions` do not, and `qa.mjs`
  needs a rewritten vocabulary — most naturally colour-census and volume
  assertions in place of per-lobe geometry ones, which is what `field-test.mjs`
  already demonstrates.
- **`lobes.test.mjs` (1,203 lines)** encodes the current semantics as
  assertions. Perhaps a third of it transfers.

**Honest estimate:** two to three weeks of focused work, of which roughly half is
the QA and debug vocabulary rather than the engine. Nothing in it is speculative
— every piece has a measured prototype behind it — but "the child can no longer
drag a ball back out" is a *product* change that needs the owner's explicit
sign-off before a line of it is written, because it will also remove the
"actually I wanted that ball over there" recovery that the current engine gives
for free.

### 12.10 Q8 — The iPad question

**More likely to pass on the GPU, less likely to pass on the CPU. Net: about
even, and for the first time the risk is in a place we can actually fix.**

*In favour.* The fill-rate story is strictly better than the incumbent's and,
crucially, it is *flat* — a tablet that renders a two-ball creature can render a
sixteen-ball one, which is not true today. The measurement anchor is unusually
relevant: the development machine's Intel UHD 630 is an integrated GPU in the
same broad class as a mid-generation iPad GPU, not a discrete card that would
flatter the numbers. At drag quality the field measures 2.1 ms where the
incumbent's twelve-lobe case measures 14.6 ms at full quality; there is real
headroom to spend on a slower device, and the obvious levers (drop to 64³, drop
drag DPR, cut march steps) all reduce cost without changing behaviour.

*Against, and this is the honest half.* The physics moved from the GPU's problem
to the CPU's. The incumbent's pull is a few arithmetic operations on a handful of
analytic lobes; the field's pull touches 30–70 thousand voxels in plain
JavaScript. At 1.0–2.6 ms on this Mac, a 5–8x slower tablet core puts a
medium-brush pull at 5–20 ms — straddling the frame budget. **That, not the
raymarch, is what an iPad session has to measure**, and it is the single
sentence a device spike should be pointed at.

*Two unknowns that no Mac number can settle.* First, 3-D texture sampling on a
tile-based mobile GPU: a raymarch's texture access is incoherent by nature, and a
2 MB volume does not fit in the texture caches these GPUs are built around.
Nothing about the desktop measurement predicts that behaviour. Second, iOS
15.0–15.3's known WebGL2/ANGLE regressions, already flagged in §7, apply with
more force here because `sampler3D` and `texSubImage3D` are exactly the sort of
less-travelled path those regressions lived in.

The mitigation, if the CPU turns out to be the wall, is straightforward and does
not require abandoning the representation: 64³ costs half the pull time and looks
acceptable (it is the level at which a small limb starts to facet, not where the
whole thing falls apart), and the advection loop is a flat typed-array kernel
that would port to a worker or, eventually, to a GPU pass.

### 12.11 What was NOT built, and why

- **No push, pinch, flatten or smooth brushes.** The experiment's question was
  whether the *substrate* supports material verbs; `pull` is the one §6 said was
  impossible, so it is the one that had to be built. The others are the same
  advection with a different displacement field and carry no new risk.
- **No matcap comparison.** §11.9 already established that the procedural light
  matches the source balls better. Re-running that A/B would have compared
  materials, not representations. The field deliberately wears the incumbent's
  material verbatim — including its faint concentric ring artifact, which is
  visible on `solid.html` too and is therefore not a finding about this work.
- **No iPad test.** Out of reach from here, and 12.10 is a reasoned estimate,
  clearly labelled as one.
- **No undo/redo.** The grid snapshot in 12.8 is the mechanism; wiring it to a
  stack is not a research question.
- **No multi-resolution or sparse storage.** A dense 80³ is 3.6 MB and fits.
  Sparse bricks would matter at 128³ and above, and nothing yet argues for that.

### 12.12 Recommendation

**Migrate, with changes, and only after two gates.**

The owner's stated intent — "part of the whole, not an atomic identity" — is not
achievable by tuning the implicit-lobe engine, because the identity is in its
data model rather than its rendering. This representation delivers it literally:
there is no accessor anywhere in `field-core.js` by which a caller could ask for
the green ball back, and `field-test.mjs` asserts that structurally. It also
delivers, unasked, the flat render cost that removes `MAX_LOBES` as a design
constraint, and a colour behaviour that is *more* clay-like than the incumbent's
while keeping the crisp unworked seams that were the best thing about it.

The staged path:

1. **Gate A — the owner sees it and agrees to the trade.** Run `field.html` in
   front of them. The thing to watch for is not the rendering; it is their face
   when a stirred creature cannot be un-stirred. That irreversibility is the
   feature, and it is also the loss of a forgiveness affordance the current game
   has. If they do not want it, stop here — everything above is still a valid
   negative result and the incumbent stays.
2. **Gate B — an iPad session on the oldest supported device**, aimed
   specifically at the CPU pull cost at 80³ and 64³, and at whether 3-D texture
   sampling behaves on a tile-based GPU. This is the one measurement that could
   still kill it. Do it before any migration work starts, not after.
3. **Then: promote `field-core.js` to `shared/js/clay/` alongside `lobes.js`,
   not in place of it**, and build the pull/push/pinch brush family on it. Both
   engines coexist; nothing that ships today changes.
4. **Then: a new free-play clay game on the field** — the playtest vehicle, and
   the honest way to learn whether children like clay that cannot be
   disassembled, without risking the live Clay Creature Studio.
5. **Only then: migrate Clay Creature Studio**, replaying its v1–v4 saved
   creatures into the field and rewriting `qa.mjs`'s vocabulary. Three weeks,
   with the QA rewrite as the larger half.

`shared/js/clay/heightfield.js` and Playdough Letter Factory are unaffected by
any of this. §11.3's split stands: the conservative 2.5-D field is still the
right answer for rolling and impressions.
