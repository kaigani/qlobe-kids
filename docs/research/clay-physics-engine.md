# Clay modelling physics for QLOBE Kids

**Research spike:** 2 August 2026  
**Status:** initial recommendation backed by a working sandbox; not yet a production or iPad sign-off  
**Prototypes:** [sculptural solid](../../experiments/clay-physics-lab/solid.html) and
[flat dough field](../../experiments/clay-physics-lab/)

## Finding

QLOBE Kids should not adopt a general-purpose soft-body physics library as its
clay engine. Soft bodies are normally elastic: they squash and then try to
recover. Modelling clay is **plastic**: a dent remains after the finger leaves.
The other behaviours which make a digital material read as clay are approximate
volume conservation, local bulging when pressed, gentle surface tension, direct
continuous response, and a material renderer that reveals small shape changes.

There should not be one representation for both current games:

- **Clay Creature Studio needs sculptural implicit solids.** Each placed ball
  must remain a recognisable three-dimensional lobe with front, side, volume,
  contact flattening, and a restrained neck where balls join. A small set of
  volume-preserving ellipsoidal SDF primitives is the recommended first route.
- **Playdough Letter Factory may still benefit from a 2.5D conservative
  heightfield.** Its work is performed into a horizontal slab: rolling,
  pressing grooves, stamping, and laying down ropes do not require a back side.

This correction followed visual review against the actual Creature Studio ball
sprites. The first heightfield study transported height sideways and read as
thick paint. Fixed camera angle alone does not make a heightfield appropriate:
the represented object must also be fundamentally surface-like. A creature
assembled from balls is fundamentally volumetric.

If later playtests establish that children need arbitrary carving rather than
ball assembly, the next candidate is a bounded 3D scalar field rendered with
three.js Marching Cubes. MPM/XPBI-level material simulation remains a longer-term
research track, not the first browser implementation.

## What “feels like clay” means

The useful test is not whether a solver is physically sophisticated. It is
whether a child gets the expected material response from a broad gesture.
Research on virtual clay repeatedly identifies the same important properties:
plasticity, conservation of material, and surface tension. Dewaele and Cani's
virtual-clay work is especially relevant: it explicitly prioritises intuitive
pressing and bending with constant-volume plastic deformation over perfect
physical accuracy ([paper abstract and method summary](https://www.sciencedirect.com/science/article/abs/pii/S1524070304000505),
[direct-hand follow-up PDF](https://citeseerx.ist.psu.edu/document?doi=4e84dbf0d32386b7e7ce4239005fe11c11211679&repid=rep1&type=pdf)).

For these games, the engine therefore needs to produce:

1. **Persistent deformation.** A finger dent, pulled edge, groove, or flattened
   area remains when input ends.
2. **Material displacement.** Pressing down raises a rim or spreads the lump;
   it does not merely darken, scale, or erase pixels.
3. **Direct response.** The shape changes during the gesture, not at the end of
   a successful swipe.
4. **Controlled settling.** Very sharp numerical artifacts soften, but the
   child's deliberate mark is not relaxed away.
5. **Readable material.** Broad highlights, contact shadows, roughness, small
   ridges, and an imperfect silhouette make shallow deformations visible.
6. **Forgiving tools.** A finger, roller, and letter stamp each operate over a
   broad area. The child is shaping material, not editing vertices.

## Audit of the current games

### Playdough Letter Factory

The game has good gesture recognition and learning logic, but no material state:

- rolling changes CSS scale variables on one DOM element;
- tracing reveals the stroke dash offset of an SVG path;
- Free Dough appends thick SVG strokes;
- the visual dough therefore grows or appears, but material never moves from
  one place to another.

The exact SVG paths and tolerant trace corridor are worth keeping. The physics
layer should become their visible output, not replace their pedagogical logic.

### Clay Creature Studio

The game has strong authored clay art and a robust freeform composition system.
Its body and parts are raster sprites. Blob construction places and moves four
independent ball sprites; the balls overlap but never fuse, dent, stretch, or
share volume. Replacing all of the authored bodies with generic simulated 3D
objects would lose more art quality than it gains.

The reference art establishes a stricter requirement than “a soft silhouette”:
the individual ball lobes, round highlights, and fine clay surface must survive
combination. The heightfield prototype failed this test because it flattened the
representation into one paint-like layer.

The first integration target remains only the Blob body-building phase, but its
body should be an implicit union of a few volume-preserving solid lobes. Keep the
existing raster eyes, mouths, limbs, decorations, storage, and Alive
choreography above that surface.

## Options considered

| Approach | Clay behaviour | QLOBE/browser fit | Art fit | Decision |
| --- | --- | --- | --- | --- |
| **Mass-conserving 2.5D heightfield** | Persistent press, smear, rolling, merge, stamp; no overhangs | Excellent: small typed arrays, plain ES module, input-driven work only | Strong for a horizontal dough slab; paint-like for spherical bodies | **Retain for Letter Factory only** |
| **2D PBD/XPBD particles plus an implicit skin** | Excellent squash/jiggle; plastic rest-shape updates must be added | Good at small particle counts | Good for living Blob silhouettes; less natural for rolled slabs and grooves | Keep as an optional post-release wobble/pose layer |
| **Volume-preserving ellipsoidal SDF lobes** | Spherical volume, compression bulge, persistent contact, bounded smooth neck | Good on WebGL with a strict lobe cap; already uses vendored three.js | Strongest match for the existing Creature Studio balls | **Recommended for the Blob vertical slice** |
| **3D voxel/scalar field plus Marching Cubes** | True add/remove, merge, holes, and all-angle sculpting | Plausible at low resolution, but remeshing and shading compete for the iPad frame budget | Can look excellent, but risks a visibly different 3D world | Phase 2 only if full 3D is proved necessary |
| **Shape-matching soft body** | Stable elastic deformation; returns to its rest shape unless rest state is continually rewritten | Lightweight | Useful for squash/recoil, not moulding | Not a clay engine by itself |
| **MPM / XPBI elastoplastic continuum** | Best physical match, including plasticine-like material | Compute-heavy and substantially more complex; realistic implementations target GPU compute | Potentially excellent | Longer-term WebGPU research, not baseline |
| **Dynamic-topology mesh sculpting** | Detailed brush sculpting, but normally adds/moves vertices without material physics | Large code and mesh-management burden | Artist tool rather than a preschool interaction model | Do not adopt for runtime |
| **Generated/imported 3D mesh deformation** | A Trellis mesh is still static; skinning/lattice deformation does not give it clay material behaviour | Adds loaders, mesh prep, and larger assets | May diverge from the current raster art | Authoring option only, not physics |

### Why PBD/XPBD is not the primary choice

Position-Based Dynamics is attractive for games because geometric constraints
are simple and stable. Shape matching was explicitly designed as an efficient,
stable real-time deformation method ([Müller et al. 2005](https://graphics.stanford.edu/courses/cs468-05-fall/Papers/p471-muller.pdf)),
and XPBD makes constraint stiffness independent of iteration count and time step
([Macklin et al. 2016](https://matthias-research.github.io/pages/publications/XPBD.pdf)).
Those strengths describe a good **soft body**, not automatically clay. A basic
solver has an elastic goal shape and springs back.

Modern XPBI research does demonstrate real-time plasticine by adding continuum
inelasticity and plastic flow to an XPBD-family method
([Yu et al. 2024](https://arxiv.org/abs/2405.11694)). That validates the research
direction, but its constitutive model and neighbour calculations are far beyond
what these two fixed-view games need for their first tactile improvement.

### Why MPM is not the first implementation

Material Point Methods are a natural high-end solution for large elastoplastic
deformation. MLS-MPM improves performance and handles material cutting and
rigid-body coupling ([Hu et al. 2018](https://dl.acm.org/doi/10.1145/3197517.3201293)),
and recent virtual-clay research combines MPM elastoplasticity with haptic
sculpting. The cost is a particle/grid transfer pipeline, constitutive material
model, collision system, and usually GPU compute. It is valuable background for
a future full-volume engine, but not proportional to a 30–90 second offline
iPad game.

WebGPU is now real on current Apple software—Safari 26 shipped it on iOS and
iPadOS in September 2025
([WebKit release notes](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
It should still be treated as an enhancement, not the QLOBE baseline: families
may use older iPads or OS releases, and the current library already has a proven
WebGL/Canvas path.

## Sandbox prototypes

### Sculptural solid — Creature Studio candidate

Open `experiments/clay-physics-lab/solid.html`. It uses two true 3D implicit
lobes rather than spreading a scalar height over a plane:

- each source ball has a centre, radius, depth order, colour, and local frame;
- contact compresses the lobe along the centre-to-centre axis;
- perpendicular axes expand by the reciprocal square root of that compression,
  keeping each ellipsoid's volume constant;
- a tightly bounded smooth union creates the joint without melting away the
  recognisable lobes;
- joining latches plastically, while the lobes remain directly draggable;
- a procedural stochastic/fingerprint micro-normal, broad highlight, warm fill,
  and curved two-colour boundary target the existing ball art.

The lab exposes “barely touching” and “pressed together” states plus a neck
softness control. The restrained setting is intentional: an unrestricted
metaball smooth-min produces the same melted/liquid failure in three dimensions
that the heightfield produced in two.

This remains a shape/dynamics prototype, not a complete physics engine. The
individual lobe transforms conserve volume, but the current implicit union does
not yet compensate exactly for overlap volume. Production should track target
total volume and apply a small global radius correction after contact.

### Flat dough field — Letter Factory candidate only

The original `experiments/clay-physics-lab/` remains useful for a horizontal
dough slab. It supports conservative Press, Pull, Roll, and Stamp operations,
then runs yield-limited relaxation. Numerical tests show those operations retain
field mass. It is no longer a Creature Studio candidate: its four-ball view is
documented as a negative result because it reads as thick paint.

### Plastic surface PBD — local-deformation comparison only

The follow-up `experiments/clay-physics-lab/pbd.html` implements the strongest
part of the independent PBD recommendation without treating a fixed mesh as a
fusion solution. A welded 642-vertex icosphere uses edge constraints, centre
spokes, one non-creeping global volume constraint, bounded grab input, and
yield/creep updates to its edge and spoke rest lengths. Push and Pull leave
local plastic marks; recovery is exposed but defaults to zero.

Deterministic testing retained a pulled mark at 0.060% volume drift with zero
inverted triangles. Browser-driven Push and capped Pull finished at 0.177% and
0.075% drift respectively, also with zero inverted triangles. This establishes
that PBD is a credible local-control layer. It does not change the Creature
vertical-slice choice because fixed surface meshes still do not naturally fuse.

The comparison renderer now adds a restrained, generated grayscale clay-height
source to the neutral matcap. It is projected tri-planarly from immutable
material coordinates and converted to a normal perturbation in the shader, so
the dapple, faint fingerprints and shallow pores stay attached during plastic
deformation. An initial high-strength pass read as stucco; the accepted lab
setting reduces both bump strength and texture frequency. This is still a
look-development asset, not an approved production texture.

The implicit fusion material now assigns colour from the two lobe field weights
rather than projecting one lobe's colour as a circle onto the union. This makes
the colour boundary share the sculptural seam, with only a restrained noisy
edge to avoid a synthetic razor-straight transition.

### Measured results

Tests used headless system Chrome at a 1180×820 viewport on the development Mac:

| Measure | Sculptural solid | Flat dough field |
| --- | --- | --- |
| Representation | two analytic 3D SDF lobes | 240×160 scalar field |
| Prototype size | about 21.5 KB unminified, plus existing vendored three.js | about 33 KB unminified, no dependency |
| Working state | two `vec4` lobes plus shader uniforms | about 300 KB in two float fields |
| Desktop Chrome | stabilises at 60 fps at a 758×505 render buffer after shader warm-up | approximately 4–6 ms per edit + CPU shading |
| Conservation | each compressed lobe preserves ellipsoid volume; union overlap correction pending | measured drift below 0.000001% |
| Browser QA | no page errors, failed requests, shader warnings, or GL errors | no page errors, failed requests, or console errors |

These are feasibility numbers, not an iPad performance claim. A real device may
be several times slower. The solid prototype currently renders continuously for
easy FPS observation; production should render only while dragging or when a
settle frame is dirty.

### Known limitations

- The solid model supports assembly and deformation of a small number of lobes,
  not arbitrary carving, holes, cuts, or a free voxel brush.
- Its joint is an art-directed implicit union, not continuum clay stress.
- Exact total volume correction across overlapping lobes is still required.
- The shader's procedural micro-surface needs side-by-side tuning against the
  source ball sprites on a physical iPad.
- Raster decorations do not yet have lobe-local anchors; these should replace
  contour-derived heightfield anchors for Creature Studio.
- The flat field retains its one-height-per-cell restrictions and is scoped only
  to top-down dough interactions.
- Neither prototype has undergone a child playtest.

## Recommended production architecture

Create two small shared substrates only after their respective iPad spikes pass:

```text
shared/js/clay/
  solid-model.js      lobe transforms, contact, plastic join, volume correction
  solid-renderer.js   bounded SDF union + clay material using vendored three.js
  solid-surface.js    lobe picking, drag constraints, anchors, serialization
  dough-field.js      height state + press/pull/roll/deposit/relax
  dough-renderer.js   WebGL height-texture renderer
  dough-renderer-2d.js CPU Canvas fallback and numerical test oracle
```

Both should expose semantic operations rather than raw vertices:

```js
solid.addLobe({ position, radius, color });
solid.pressTogether(first, second, { pressure, jointWidth });
solid.dragLobe(id, position, { plasticity });
solid.anchorToLobe(part, lobeId, localPosition);

dough.press(point, { radius, depth, pressure });
dough.pull(from, to, { radius, grip });
dough.roll(from, to, { width, flattening });
dough.impress(pathSamples, { radius, depth });
dough.deposit(point, { radius, amount, color });
```

Keep dynamics on the CPU. Creature Studio needs only a small lobe array and
contact constraints; its analytic SDF is rendered directly. Letter Factory can
upload its one-channel height field to a small WebGL texture and derive
normals/material lighting in a fragment shader. Keep the CPU dough renderer as
a fallback, deterministic screenshot oracle, and reduced-quality mode.

Production optimisations should be driven by measurements:

- coalesce pointer samples into one render per animation frame;
- update only the dirty dough brush rectangle and a small relaxation halo;
- avoid clearing full dough-field scratch arrays for local operations;
- cap Creature Studio at a measured number of lobes and stop its render loop
  when the shape is clean;
- compensate SDF overlap so total target volume remains stable after joining;
- use a lower field resolution on slow devices, with the same CSS size;
- stop all simulation when input and the brief settle animation end;
- quantise fields for storage, or store a bounded deterministic command log.

### Playdough Letter Factory integration

1. Preserve the current three-swipe progression and real pointer capture.
2. Replace the CSS dough rope with a field seeded as a lump. Each accepted and
   in-progress roller pass calls `roll`; the lump becomes wider and flatter by
   moving material, not changing a transform.
3. Keep the SVG path geometry and 82%-complete trace rules as the invisible
   learning/input layer. Sample the accepted path progress and call `impress`
   into the visible field underneath it.
4. Rebuild Free Dough as deposit + pull: a broad stroke lays down a clay rope
   that can subsequently be smeared, joined, and stamped.
5. Keep the generated workshop, mascot, tubs, rolling pin, exact letters, audio,
   and screen flow unchanged.

### Clay Creature Studio integration

1. Limit the first integration to the Blob shape phase.
2. Convert each selected ball into one volume-preserving SDF lobe using the
   source sprite's colour and approximate radius. A dropped ball remains round;
   overlap creates axial compression, perpendicular bulge, and a restrained
   permanent neck.
3. Store decorations in lobe-local coordinates so an eye or limb moves with the
   lobe it was attached to. The existing freeform board continues to own raster
   parts, z-order, trash, saving, and mirroring.
4. Save the compact lobe list and attachment anchors for the Alive screen and
   shelf; no voxel snapshot is needed.
5. Do not convert Dino, Monster, Unicorn, Bird, or Dragon until Blob playtesting
   proves that simulation adds more delight than the authored body art already
   provides.

## Full-3D escalation route

If analytic lobe assembly is rejected specifically because children want to
carve arbitrary details or make holes, run a separate bounded-volume prototype
using the already-vendored three.js version and the matching official
`MarchingCubes` addon. three.js's addon exposes `addBall`, plane fields, blur,
direct cell access, and mesh update
([official documentation](https://threejs.org/docs/pages/MarchingCubes.html));
three.js itself is MIT licensed
([repository](https://github.com/mrdoob/three.js)).

The comparison must use the same tools and acceptance tests as the heightfield,
not merely show attractive metaballs. Start at 32³ and 40³, update local dirty
regions if the addon needs modification, cap triangle count, use one clay
material, and test context loss. Do not ship it until its input latency,
thermals, memory, and reload behaviour pass on the oldest supported iPad.

## Generative 3D and art tools

Trellis.2 is eligible as an **authoring-time** tool: its official code and model
are MIT licensed, it produces high-resolution meshes with PBR materials, and it
handles arbitrary topology
([Microsoft repository](https://github.com/microsoft/TRELLIS.2)). Its own
dependencies have separate terms which still need checking for any local
pipeline distribution. A generated mesh does not supply plasticity, material
transport, or sculpting interaction, so Trellis.2 does not reduce the core
physics problem. It may later help create test forms, turntable reference
models, or clay material references.

Likewise, GPT Image 2 can produce authored roughness/fingerprint references or
style targets. The prototype did not call either generative service: procedural
micro-detail was sufficient to test behaviour, and preserving the existing
games' authored scenes was the more useful comparison.

### Tools reviewed but not eligible as dependencies

- **Clayxels** is a useful SDF/volumetric design reference, but its official site
  says the main compute shader is obfuscated. It is a Unity package, not a fully
  open runtime suitable for this project
  ([official site](https://www.clayxels.com/)).
- **SculptGL** is MIT licensed and demonstrates serious WebGL mesh sculpting,
  but the repository was archived in January 2026, requires a Node build, and is
  an artist-facing dynamic-topology application rather than a tiny material
  engine ([repository](https://github.com/stephomi/sculptgl)). Study techniques;
  do not vendor the application.
- Rigid-body engines do not solve plastic deformation. Adding Rapier, Ammo, or
  another general engine would add weight while leaving the core material model
  to custom code.

## Decision gates and next work

### Gate 1 — real iPad technical spike

Pass at two tested resolutions if all of the following hold on the oldest
supported iPad:

- visible response begins in the same frame as contact;
- lobe contact update or dough edit p95 stays within 8 ms, leaving frame budget
  for the game;
- interaction holds at 50–60 fps during a 30-second continuous moulding session;
- no sustained thermal degradation or browser reload;
- target volume drift stays under 0.5% for the session;
- Creature Studio has an authored raster fallback if WebGL is unavailable or
  lost; Letter Factory retains a playable Canvas fallback.

### Gate 2 — art and child-feel comparison

Place the simulated slab and SDF Blob directly in the existing game scenes. Test
with children, not only adults looking at screenshots. For Blob, do the lobes
still read as the familiar source balls, and does the joined neck read as solid
clay rather than overlap, liquid, or rubber? For dough, can children make a
visible dent and notice that rolling actually flattens the lump? Prefer broad
delight and control over physical precision.

### Gate 3 — thin vertical slice

Run two independent vertical-slice decisions. Creature Studio should test two
balls → press together → attach one eye. Letter Factory should test roll → trace
A → reveal. A failure in one representation must not block or validate the
other.

### Questions the next spike must answer

1. What is the oldest supported iPad and OS version?
2. How many SDF lobes can the oldest device shade within budget at the chosen
   buffer scale?
3. Should different-colour lobes keep a visible seam, use a narrow mixed band,
   or allow the child to choose?
4. Can lobe-local anchors keep raster parts visually attached after the Blob is
   stretched?
5. Does exact union-volume compensation make a visible improvement or only add
   complexity at the four-lobe scale?
6. For Letter Factory, does 192×128 look materially worse than 240×160, and is
   the WebGL height-texture renderer necessary?
7. Does a small, deliberately damped PBD wobble after release add life, or make
   plastic clay feel like rubber?

## Recommendation in one sentence

Proceed with compact, volume-preserving SDF lobes for a two-ball Creature Studio
vertical slice; keep the 2.5D conservative field only as an independent Letter
Factory experiment, and escalate to voxel remeshing only if children need
arbitrary carving rather than ball assembly.
