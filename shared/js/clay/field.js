// field.js — a STORED signed-distance + colour field for clay.
//
// WHY THIS EXISTS
// The other shipped engine (shared/js/clay/lobes.js, which stays exactly where
// it is) is a blended union of analytic primitives. The blend is beautiful and
// the seams are loved, but every lobe keeps an identity: it stays in a list, it
// stays draggable, and a child can lever a welded mass back apart because "the
// green ball" is still a row in an array. The product owner asked for the
// opposite — "the green clay should now be a part of the whole and behave
// accordingly, not have an atomic identity."
//
// This module is the other representation. There is exactly ONE object here: a
// 3-D grid of (signed distance, colour). A stamp writes into it. A pull moves
// its contents. After the write there is no record of what wrote it. Nothing in
// this file can answer the question "where is the green ball" because the field
// does not store balls — it stores clay.
//
// PROVENANCE. This is `experiments/clay-physics-lab/field/field-core.js`
// promoted, with the four additions a shipping game demanded and the research
// prototype did not need. The lab copy stays where it is as the research
// record; every measurement quoted in the comments below was taken against it
// and is reproduced in §12 of experiments/clay-physics-lab/clay-physics-
// recommendation.md. The additions, all marked SHIPPING ADDITION below:
//
//   1. QUANTISE-THEN-EXECUTE. Every op rounds its own parameters to 1e-6
//      BEFORE it runs, and logs the numbers it actually used. The lab logged
//      rounded parameters but executed with raw ones, which is bit-exact only
//      when the caller happens to pass 6-decimal values (its tests do). A
//      pointer drag does not, so a replayed creature would have drifted in the
//      last float bits — and an op-log save IS a replay. See `q6`.
//   2. GESTURE CAPTURE / REVERT. A copy-on-write brick snapshot so a
//      pointercancel, a lost window focus or a release over the bin can undo
//      an in-flight gesture BIT-EXACTLY. See beginGesture/revertGesture.
//   3. setGround(). The game measures its table off a DOM element, so the
//      ground plane arrives after construction and moves on every resize.
//   4. Documents. toDocument/fromDocument — the ~200-byte op-log save the
//      recommendation's §12.8 argues for, with the format/version envelope.
//
// NO DEPENDENCIES. Runs unchanged in node (field.test.mjs imports it through a
// data URL, the house pattern) and in the browser. No three.js, no DOM, no
// imports at all.
//
// REPRESENTATION
//   dist   Float32Array(res^3)      signed distance, world units, negative
//                                   inside, clamped to +/- CPU_BAND. Only the
//                                   narrow band around the surface is
//                                   meaningful; far voxels are saturated.
//   colour Uint8Array(res^3 * 3)    RGB per voxel, maintained across the whole
//                                   band (not just the interior) so the GPU's
//                                   trilinear fetch never mixes surface colour
//                                   with uninitialised black one voxel out.
//
// Colour is stored as RGB, not a palette index, for one decisive reason: the
// renderer gets its blending for free from hardware trilinear filtering, and
// trilinear interpolation of a palette index is meaningless. RGB also makes
// smearing a property of the substrate rather than a feature someone has to
// write — which is precisely the behaviour being tested.
//
// EVERY EDIT IS LOCAL. stampBall and pull write a bounded box and mark 8^3
// bricks dirty; the renderer uploads only those bricks. The two deliberately
// global verbs are simplify() ("smooth the whole lump") and settleRest()
// (gravity moves everything), and both say so.
//
// ACTIVE BOX. The field also tracks a conservative voxel-space box containing
// every non-saturated voxel. Volume, bounds, principal axes and the relax all
// iterate that box rather than the whole grid — on a typical creature it is a
// quarter of the domain, and without it the "global" verbs cost four times what
// they need to.
//
// SDF HYGIENE. Advecting a distance field distorts its metric: the values stop
// being distances to anything. Rather than pretend otherwise, every op that
// warps the field is followed by a bounded Lipschitz sweep (redistance) which
// restores |grad d| <= 1 over the touched region. That is the property the
// raymarch actually needs, it is cheap, and it means the baked stamp noise
// needs no equivalent of lobes.js's NOISE_SAFETY fudge — the sweep repairs the
// displacement into a marchable field instead of the shader stepping timidly
// around it forever.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Grid resolution per axis. 80^3 = 512k voxels. */
export const FIELD_RES = 80;
/** World-space side of the cubic domain. Matches the ortho camera's [-1,1]. */
export const FIELD_SIZE = 2.0;
/** World y of the table. Material is never left below it after a settle. */
export const GROUND_Y = -0.70;
/** Brick edge in voxels. Dirty tracking and texSubImage3D uploads use this. */
export const BRICK = 8;

/**
 * GPU encode half-band, as a multiple of the voxel size. Everything outside
 * +/-BAND_VOXELS*h saturates in the 8-bit alpha channel.
 *
 * This number is the whole precision/marching trade. Small band = fine
 * quantisation (good silhouettes) but the raymarch can only step that far
 * through empty space. Large band = coarse quantisation but fast traversal.
 * At 4h the 8-bit step is 8h/255 = 0.00078 world units, about a third of a
 * device pixel at DPR 1.5 on a 700 px stage — invisible — while the march
 * still crosses a typical creature's bounding box in ~10 steps before it has
 * to start refining.
 */
export const BAND_VOXELS = 4;
/**
 * CPU clamp, wider than the GPU band so ops have headroom to work in. Every
 * op's write box is sized off this, so it is also the single biggest lever on
 * how much work a stamp does: at 10 voxels a 0.3-radius stamp touched 175k
 * voxels and cost 60 ms; at 6 it touches 74k and costs a fifth of that, with
 * no visible difference because everything past 4h is saturated on the GPU
 * anyway.
 */
export const CPU_BAND_VOXELS = 6;

/** Baked surface displacement, as a fraction of the stamped radius. */
export const NOISE_AMP = 0.11;
/** Displacement wave numbers, in units of 1/radius. Ported from lobes.js. */
export const NOISE_FREQ = 2.40;
/**
 * How far a colour seam wanders off the exact field boundary, as a fraction of
 * the stamped radius. lobes-three.js's uSeamWobble default is 0.34 of a lobe
 * radius applied to a distance comparison; this is the same idea at the same
 * order, baked into the grid instead of evaluated in the shader.
 */
export const SEAM_WOBBLE = 0.055;

/**
 * THE PALM. The inner fraction of the brush that moves the material RIGIDLY.
 *
 * This is the difference between clay pulled with a fingernail and clay pulled
 * with a hand, and it is the whole answer to why a pulled limb comes away
 * rounded instead of drawn out to a needle.
 *
 * With the plain smoothstep falloff (this constant at 0) the displacement is
 * strictly largest under the exact centre of the brush and falls away in every
 * direction from there. Nothing on the leading surface ever moves as far as the
 * point beside it that is nearer the middle, so EVERY pull sharpens the front a
 * little, and a long drag — or thirty short ones at the same spot — compounds
 * that into a spike. Measured on the shipped build: after one long drag the
 * leading surface was 0.13 voxels thick a voxel behind its own tip. That is not
 * a shape clay can make; it is the falloff's own peak, drawn out.
 *
 * A palm has no peak. Inside `r < PULL_CORE` the weight is exactly 1, so that
 * disc of material is TRANSLATED, not stretched — and a translated surface
 * keeps the curvature it already had. The front therefore stays as round as the
 * ball it came off, however hard the child pulls, and all of the shear happens
 * in the outer ring where it belongs. The profile stays C¹ at the join
 * (smoothstep's derivative is zero at both ends) so there is no crease ring
 * where the palm meets the fingers.
 *
 * 0.45 was measured, not guessed: it reproduces the leading-edge bluntness of
 * the lab page at its "whole hand" brush (2.4 voxels of half-width one voxel
 * behind the tip) from a brush two thirds the size, and holds a floor of 2.6
 * voxels through the worst gestures a child can make. See field.test.mjs
 * "rounded pull fronts".
 */
export const PULL_CORE = 0.45;

/** Reciprocal of the falloff ring's width. Hoisted: it is read per voxel. */
const CORE_INV = 1 / (1 - PULL_CORE);

/**
 * A pull step may not displace material further than this fraction of the
 * brush radius. Semi-Lagrangian backward advection with a per-voxel falloff is
 * only well behaved while the warp stays close to invertible; past roughly a
 * third of the brush the map folds and the material tears. Pointer drags
 * naturally arrive as many small steps, so the cap costs nothing in feel — it
 * just means a fast flick becomes several advections instead of one bad one.
 *
 * IT SCALES WITH THE PALM, and it has to. The backward map p - w(p)·d folds
 * where |d|·max|∇w| reaches 1, and squeezing the falloff into the outer
 * (1 - PULL_CORE) of the brush makes it that much steeper: max|∇w| is
 * 1.5 / ((1 - PULL_CORE)·brush), so the fold arrives at
 * |d| = 0.667·(1 - PULL_CORE)·brush. The bare 0.34 that was safe with no palm
 * sits right on top of that bound at PULL_CORE = 0.45, and it shows — the same
 * six-step drag leaves a field whose worst |∇d| is 1.18 off unit instead of
 * 0.35, which is the arithmetic of a torn surface. Keeping the same 2x margin
 * below the fold restores it exactly (0.35).
 */
export const PULL_STEP_CAP = 0.34 * (1 - PULL_CORE);

// ---------------------------------------------------------------------------
// BALANCE. See settlePlan() for why these replaced a covariance solve.
// ---------------------------------------------------------------------------

/**
 * How thick the band above the table is that counts as "touching down", in
 * voxels. Four is the smallest number that still reads a genuine footprint
 * through the one-voxel surface shell and the ground cut's smooth-max fillet;
 * at two, a body resting perfectly flat reported a support interval that
 * flickered by a voxel between settles as the relax breathed on the contact
 * patch, and the overhang ratio flickered with it.
 */
export const CONTACT_BAND_VOXELS = 4;

/**
 * How far outside its own support the centre of mass must go before the body is
 * considered to be falling, as a fraction of the support's half-width.
 *
 * Not zero, because the exact tipping point is a measure-zero event and a
 * creature parked on it would twitch a degree back and forth forever. Eight
 * percent of the half-width is about a voxel and a half on a typical body:
 * comfortably inside "nobody could see that it was leaning", comfortably
 * outside the noise the relax puts into the contact patch every settle.
 */
export const TOPPLE_TOLERANCE = 0.08;

/**
 * Fraction of the measured imbalance a single settle corrects, and the hard cap
 * on one settle's rotation.
 *
 * A topple is quasi-static here: each settle rotates a bite, the next
 * re-measures the support (which has MOVED, because different material is
 * touching the table now) and takes another. That is both what falling looks
 * like — a roll, not a snap — and what makes the solve convergent: the plan
 * returns zero the moment the COM comes back inside the foot, so settling is
 * still a fixed point. The cap keeps any one animated step inside what
 * SETTLE_MS can show without strobing.
 */
export const TOPPLE_GAIN = 0.85;
export const TOPPLE_MAX_STEP = 0.45; // radians, ~26 degrees

/**
 * The smallest rotation a body that IS falling may be given.
 *
 * A body a hair past its tipping point produces a hair of correction — the
 * cantilever measures 24.7 degrees, but a loaf leaning just over its own edge
 * measures 2.9, and 2.9 is below the threshold the game runs a settle at at
 * all. Without a floor that body is judged to be falling and then never falls:
 * it sits there, permanently unbalanced, permanently not worth animating.
 *
 * The floor is set just above the game's own SETTLE_ANGLE_MIN (0.06 rad) so
 * that "the field says this is toppling" and "the game runs a settle" cannot
 * disagree. It also makes the fall ACCELERATE the way a real one does: the
 * first nudge moves the COM further past the edge, so the next step is bigger
 * than the last, and the roll completes in a handful of settles instead of
 * creeping there in fifty.
 */
export const TOPPLE_MIN_STEP = 0.10; // radians, ~5.7 degrees

// ---------------------------------------------------------------------------
// COMPRESSION UNDER LOAD. See compress().
// ---------------------------------------------------------------------------

/**
 * Peak fraction of a loaded column's height that one stamp may squash out of
 * it. Six percent is "the clay took the weight", not "the tower collapsed": on
 * a 0.7-unit column that is 0.042 world units, about a ball's worth of visible
 * settle. The owner's words are the contract — "some of the weight should
 * compress down and flatten down at the base" — and the failure mode to avoid
 * is a session of stamping quietly flattening a deliberate tall build.
 */
export const COMPRESS_MAX = 0.06;

/**
 * Squash is proportional to the load's share of the column that carries it:
 * `gain * V_load / (V_load + V_column)`. That ratio falls as the body grows, so
 * repeated identical stamps compress LESS each time with no extra bookkeeping —
 * the tower stiffens as it thickens, which is both true of clay and the reason
 * a long session cannot flatten it away.
 */
export const COMPRESS_GAIN = 0.16;

/**
 * Below this much squash the op is skipped entirely. Every compression is a
 * trilinear resample of its column and every resample blurs a little, so an op
 * too small to see must cost nothing at all. Combined with the diminishing
 * ratio above, this is what bounds total blur over a session: late stamps stop
 * compressing rather than compressing invisibly forever.
 */
export const COMPRESS_MIN = 0.004;

/** Column footprint as a multiple of the loading ball's radius. */
export const COMPRESS_FOOTPRINT = 2.2;

/**
 * What fraction of the column height the squash is spread over, measured up
 * from the table. Everything above that rides DOWN as a rigid piece.
 *
 * "Some of the weight should compress down and flatten down AT THE BASE" is the
 * owner's phrasing and it is also the better physics: the stress in a standing
 * column is highest at the bottom, so that is where clay yields. Squashing the
 * whole column uniformly instead — which is what this did first — quietly
 * thinned the top of the creature too, and it showed up somewhere unexpected:
 * the driver's rounded-pull-front check, which grabs near the top of the body,
 * measured a tip 7% thinner than its floor allows. Concentrating the squash low
 * fixes that at the same time as making it read better, because the part of the
 * creature the child is working on stops changing shape underneath them.
 */
export const COMPRESS_ZONE = 0.5;

/**
 * How much of the squashed height reappears as width at the base, as a multiple
 * of the squash fraction. Volume is restored exactly by renormalizeRegion
 * afterwards, so this number is not doing conservation arithmetic — it is
 * deciding where the displaced clay goes, and the owner asked for the base.
 */
export const COMPRESS_SPREAD = 1.6;

// ---------------------------------------------------------------------------
// DOMAIN GUARD. See faceLimit() and setCeiling().
// ---------------------------------------------------------------------------

/**
 * How close to a face of the cube material is ever allowed to get, in voxels.
 *
 * The grid is the world: clay pushed past a face is not clipped by a camera, it
 * stops existing, and what the child sees is a hard flat shear across their
 * creature where the boundary cut it. Measured on the shipping build before this
 * guard: a seven-ball tower left 179 solid voxels sitting on the j = res-1 face
 * with a signed distance of -0.146, i.e. a fully saturated slab of clay sliced
 * off square.
 *
 * Three voxels is enough for redistance() to close a rounded surface inside the
 * domain rather than against it, which is the difference between a dome and a
 * cut.
 */
export const FACE_MARGIN_VOXELS = 3;

/**
 * Fraction of the REMAINING headroom a single pull may consume.
 *
 * This is what makes the ceiling asymptotic instead of a wall. Each upward pull
 * closes at most half the gap to the limit, so the gap goes 1, 1/2, 1/4, … and
 * the clay visibly "runs out" as it approaches — the same feel as the lateral
 * stage clamp — without ever hitting a surface the child can bump against.
 */
export const CEILING_YIELD = 0.5;

/**
 * Save envelope. See toDocument().
 *
 * v6 — BALANCE, COMPRESSION AND THE DOMAIN GUARD. Three things changed that a
 * replay can see, so the version had to move:
 *
 *   1. `settlePlan` decides a topple from centre of mass against support
 *      instead of from the silhouette's principal axis, so a 'g' op resolves to
 *      a different pose.
 *   2. Stamps are clamped, and pulls attenuated, so nothing can reach a cube
 *      face — which moves any op that used to run off the edge.
 *   3. A new 'c' op exists (compression under load).
 *
 * Ops written by v6 already have the clamps applied to the numbers in the log,
 * so re-running the guard over them is a no-op and they replay identically with
 * or without it. Ops written by v5 do NOT, so replaying them through the guard
 * would silently reshape a child's saved creature. `legacyOps` in the envelope
 * is the shim: it says how many ops at the FRONT of the log predate all this and
 * must be replayed exactly as they were authored. See replay().
 */
export const DOC_FORMAT = 'qlobe-clay-field';
export const DOC_VERSION = 6;

const EPS = 1e-9;
const TAU = 6.283185307179586;

// ---------------------------------------------------------------------------
// Small maths helpers (no imports, remember)
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Shorten one component of an advection step so the brush's leading edge only
 * ever closes a FRACTION of its remaining room toward a limit.
 *
 * The asymptote is the whole point: repeated pulls approach the limit as
 * room·(1 - CEILING_YIELD)^n and never arrive, so there is no surface for the
 * material to pile up against and therefore no flat face for the raymarch to
 * draw. Already-shortened steps are unchanged by a second application, which is
 * what makes an op log replay the same with or without a limit in force.
 */
function yieldToward(d, from, brush, lo, hi) {
  if (d > 0 && Number.isFinite(hi)) {
    const room = hi - (from + brush);
    return Math.min(d, Math.max(0, room) * CEILING_YIELD);
  }
  if (d < 0 && Number.isFinite(lo)) {
    const room = (from - brush) - lo;
    return Math.max(d, -Math.max(0, room) * CEILING_YIELD);
  }
  return d;
}

/**
 * Polynomial smooth minimum, identical in form to the one in lobes.js and its
 * GLSL twin in lobes-three.js. h = 1 means `a` wins, h = 0 means `b` wins, and
 * the -k*h*(1-h) term is the fillet.
 */
function smoothMin(a, b, k) {
  if (k <= EPS) return a < b ? a : b;
  const h = clamp(0.5 + (0.5 * (a - b)) / k, 0, 1);
  return a * (1 - h) + b * h - k * h * (1 - h);
}

function smoothMax(a, b, k) {
  return -smoothMin(-a, -b, k);
}

/** Deterministic 32-bit hash -> [0,1). The only randomness in this module. */
function hash01(seed, salt) {
  let h = (seed | 0) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * The three-oblique-plane-wave lump generator from lobes.js's noiseWave(),
 * ported in shape. Axis-aligned waves corduroy a surface into visible ridges;
 * three incommensurate directions plus a per-stamp shear never close into a
 * repeat over the few radii a ball spans.
 *
 * Unlike lobes.js this is evaluated ONCE, at stamp time, and baked into the
 * stored distance. It therefore becomes material: a pull advects the lumps
 * along with everything else, instead of the clay swimming through a shader
 * function bolted to a primitive's frame.
 */
export function noiseWave(x, y, z, px, py, pz) {
  const shear = (px / TAU - 0.5) * 0.6;
  const qx = x + y * shear;
  const qy = y + z * shear;
  const qz = z + x * shear;
  return (
    0.42 * Math.sin(1.0 * qx + 0.62 * qy - 0.35 * qz + px) +
    0.34 * Math.sin(-0.48 * qx + 1.13 * qy + 0.77 * qz + py) +
    0.24 * Math.sin(0.71 * qx - 0.55 * qy + 1.29 * qz + pz)
  );
}

/** '#rrggbb' | '#rgb' | [r,g,b] | {r,g,b} -> [0..255, 0..255, 0..255]. */
export function parseColor(input) {
  if (Array.isArray(input)) {
    return [clamp(input[0] | 0, 0, 255), clamp(input[1] | 0, 0, 255), clamp(input[2] | 0, 0, 255)];
  }
  if (input && typeof input === 'object') {
    return [clamp(input.r | 0, 0, 255), clamp(input.g | 0, 0, 255), clamp(input.b | 0, 0, 255)];
  }
  let s = String(input || '#cccccc').trim();
  if (s[0] === '#') s = s.slice(1);
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return [204, 204, 204];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const r6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * SHIPPING ADDITION 1 — quantise-then-execute.
 *
 * `q6` is `r6` under a name that says what it is FOR. Every op below rounds its
 * own parameters through this before doing any work, and logs the rounded
 * numbers, so the field the child is looking at and the field a replay of the
 * op log produces are byte-identical by construction rather than by luck.
 *
 * The lab prototype rounded on the way into the log and executed with the raw
 * value. That is exact for the values its tests pass (0.05, 0.02, -0.1 — all
 * already 6-decimal) and inexact for every value a pointer produces. Since an
 * op-log save IS a replay, and the shelf card is rasterised from that replay,
 * the difference is the whole reason a saved creature would not have matched
 * itself. 1e-6 of a 2.0-unit domain is 1/40th of a voxel: invisible.
 */
const q6 = r6;

/**
 * A finite number, or null. Exists because `Number(null)` is 0 and
 * `Number.isFinite(0)` is true, so the obvious
 * `Number.isFinite(Number(doc.ground)) ? Number(doc.ground) : null` treats an
 * ABSENT ground as a ground plane at y = 0.
 *
 * That is not a hypothetical. A v1 save from before ground planes existed has
 * no `ground` key at all; read that way it got a table through the middle of
 * the domain, and since a creature sits BELOW the origin, the ground cut ate
 * every creature made before 2 August. The saves loaded, rendered an almost
 * empty frame, and the only thing that gave it away was the volume coming back
 * as 0.00005 instead of 0.089.
 */
/**
 * How many ops at the front of a document predate v6 and must replay under the
 * old rules.
 *
 * A pre-v6 file has no `legacyOps` key and EVERY op in it is legacy. A v6 file
 * states its own count, which is zero for a creature made from scratch today and
 * non-zero for one that was opened from an older save and worked on further.
 */
function legacyPrefixOf(doc) {
  const stated = finiteOrNull(doc.legacyOps);
  if (stated !== null) return Math.max(0, stated | 0);
  const version = finiteOrNull(doc.version);
  return version !== null && version >= 6 ? 0 : (Array.isArray(doc.ops) ? doc.ops.length : 0);
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const rgbHex = (rgb) => `#${((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1)}`;

/**
 * The three per-stamp noise phases a ball stamped at `index` will get from
 * `seed`. Exported because the RENDERER needs them BEFORE the stamp happens: a
 * tray ball that is still falling is drawn as an analytic sphere, and it has to
 * wear the exact lumps it will inherit the moment it welds, or a child watches
 * their ball change shape at the instant it joins the creature.
 *
 * @param {number} seed
 * @param {number} index  how many balls have already been stamped
 * @returns {[number, number, number]} phases in [0, TAU)
 */
export function stampPhase(seed, index) {
  return [
    hash01(seed, index * 3 + 1) * TAU,
    hash01(seed, index * 3 + 2) * TAU,
    hash01(seed, index * 3 + 3) * TAU,
  ];
}
const now = typeof performance !== 'undefined' && performance.now
  ? () => performance.now()
  : () => Number(process.hrtime.bigint()) / 1e6;

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------

/**
 * @param {object} [opts]
 * @param {number} [opts.res]    grid resolution per axis (default FIELD_RES)
 * @param {number} [opts.size]   world side of the domain (default FIELD_SIZE)
 * @param {number} [opts.ground] world y of the table (default GROUND_Y)
 * @param {number} [opts.seed]   noise seed; same seed => byte-identical field
 */
export function createClayField(opts = {}) {
  const res = Math.max(8, Math.floor(opts.res || FIELD_RES));
  const size = Number(opts.size) || FIELD_SIZE;
  // `let`, not `const` — see setGround(). The game measures its table off a
  // DOM element that moves with the layout.
  let groundY = opts.ground === null ? null : Number.isFinite(opts.ground) ? opts.ground : GROUND_Y;
  // World y above which material may not be built or dragged. null = no lid
  // beyond the cube's own face margin. See setCeiling().
  let ceiling = Number.isFinite(opts.ceiling) ? Number(opts.ceiling) : null;

  /**
   * How many ops at the front of this field's log were authored before v6, and
   * so must replay through the pre-v6 rules. See DOC_VERSION and replay().
   *
   * It is a COUNT rather than a flag because a child can open a creature saved
   * last week and keep working on it: the old ops need the old rules, everything
   * they add today needs the new ones, and the boundary between them has to
   * survive being saved again.
   */
  let legacyOps = Number.isFinite(opts.legacyOps) ? Math.max(0, opts.legacyOps | 0) : 0;

  /**
   * True only while replay() is re-running an op from that legacy prefix. Live
   * editing is NEVER legacy — the guards and the balance solve always apply to
   * what the child is doing now.
   */
  let replayingLegacy = false;
  const seed = (opts.seed ?? 1337) | 0;

  const h = size / res;                  // voxel edge, world units
  const origin = -size / 2;              // world coord of voxel 0's low corner
  const total = res * res * res;
  const band = BAND_VOXELS * h;          // GPU encode half-range
  const cpuBand = CPU_BAND_VOXELS * h;   // CPU clamp
  const stride = res;
  const slab = res * res;

  const dist = new Float32Array(total);
  const color = new Uint8Array(total * 3);
  dist.fill(cpuBand);

  // Voxel-centre world coordinates, precomputed. Called ~10^6 times per settle;
  // as a closure it showed up as a real fraction of the profile.
  const WC = new Float64Array(res);
  for (let i = 0; i < res; i++) WC[i] = origin + (i + 0.5) * h;

  // Brick dirty tracking -----------------------------------------------------
  const bres = Math.ceil(res / BRICK);
  const bcount = bres * bres * bres;
  const dirty = new Uint8Array(bcount);
  let dirtyCount = 0;

  const opLog = [];

  // settleRest's anti-blur base (see settleRest) ----------------------------
  let baseDist = null;
  let baseColor = null;
  let baseBox = null;
  let settleQ = null;      // accumulated rotation, base -> current
  let settleShift = null;  // accumulated translation, base -> current
  let settlePivot = null;

  let volumeTarget = 0;
  let resampleGenerations = 0;

  /**
   * Conservative voxel box containing every non-saturated voxel. null = empty.
   * Ops only ever grow it; a resample recomputes it from the transformed box.
   */
  let active = null;

  const stats = {
    ops: 0, stamps: 0, pulls: 0, settles: 0, simplifies: 0, compressions: 0,
    lastOpMs: 0, lastOpVoxels: 0, lastOpBricks: 0, lastOp: '',
  };

  // -------------------------------------------------------------------------
  // Indexing
  // -------------------------------------------------------------------------

  const idx = (i, j, k) => (k * res + j) * res + i;
  /** Continuous voxel coordinate of a world position (voxel-centre space). */
  const vc = (w) => (w - origin) / h - 0.5;

  function markRegion(box) {
    const bi0 = Math.max(0, (box.i0 / BRICK) | 0);
    const bj0 = Math.max(0, (box.j0 / BRICK) | 0);
    const bk0 = Math.max(0, (box.k0 / BRICK) | 0);
    const bi1 = Math.min(bres - 1, (box.i1 / BRICK) | 0);
    const bj1 = Math.min(bres - 1, (box.j1 / BRICK) | 0);
    const bk1 = Math.min(bres - 1, (box.k1 / BRICK) | 0);
    for (let bk = bk0; bk <= bk1; bk++) {
      for (let bj = bj0; bj <= bj1; bj++) {
        for (let bi = bi0; bi <= bi1; bi++) {
          const b = (bk * bres + bj) * bres + bi;
          if (!dirty[b]) { dirty[b] = 1; dirtyCount += 1; }
        }
      }
    }
  }

  function markAll() {
    for (let b = 0; b < bcount; b++) if (!dirty[b]) { dirty[b] = 1; dirtyCount += 1; }
  }

  function markBrick(b) {
    if (!dirty[b]) { dirty[b] = 1; dirtyCount += 1; }
  }

  // -------------------------------------------------------------------------
  // SHIPPING ADDITION 2 — gesture capture / revert
  //
  // A child who starts a pull and then has the gesture taken away from them —
  // pointercancel, the window losing focus, an iPad app switch, or a
  // deliberate release over the bin — must get their creature back EXACTLY, not
  // approximately. "Approximately" here means a re-pull in the opposite
  // direction, and §12.7 measured what that does: running a drag backwards
  // makes the colour MORE mixed, not less. There is no undo in the material,
  // so the undo has to be in the storage.
  //
  // COPY-ON-WRITE PER BRICK, not a whole-grid snapshot. Both mutating ops know
  // the exact voxel box they are about to write before they write it, so
  // captureBox() saves the pre-op contents of the bricks covering that box the
  // first time each is touched and never again. A drag across a creature
  // typically captures a few hundred KB; the pathological case is the whole
  // grid, which is what a snapshot would have cost every time.
  //
  // The two buffers are full-grid sized and allocated ONCE, lazily, then
  // reused for every gesture for the life of the field. Per-brick allocation
  // was the obvious version and it minted a thousand small typed arrays per
  // drag. Resident cost is 3.5 MB at 80^3, the same order as the settle base.
  let captureDist = null;
  let captureColor = null;
  const captured = new Uint8Array(bcount);
  let gesture = null;

  function captureBox(box) {
    if (!gesture) return;
    if (!captureDist) {
      captureDist = new Float32Array(total);
      captureColor = new Uint8Array(total * 3);
    }
    const bi0 = Math.max(0, (box.i0 / BRICK) | 0);
    const bj0 = Math.max(0, (box.j0 / BRICK) | 0);
    const bk0 = Math.max(0, (box.k0 / BRICK) | 0);
    const bi1 = Math.min(bres - 1, (box.i1 / BRICK) | 0);
    const bj1 = Math.min(bres - 1, (box.j1 / BRICK) | 0);
    const bk1 = Math.min(bres - 1, (box.k1 / BRICK) | 0);
    for (let bk = bk0; bk <= bk1; bk++) {
      for (let bj = bj0; bj <= bj1; bj++) {
        for (let bi = bi0; bi <= bi1; bi++) {
          const b = (bk * bres + bj) * bres + bi;
          if (captured[b]) continue;
          captured[b] = 1;
          gesture.bricks.push(b);
          const i0 = bi * BRICK; const j0 = bj * BRICK; const k0 = bk * BRICK;
          const w = Math.min(BRICK, res - i0);
          const hgt = Math.min(BRICK, res - j0);
          const d = Math.min(BRICK, res - k0);
          for (let k = 0; k < d; k++) {
            for (let j = 0; j < hgt; j++) {
              const n = idx(i0, j0 + j, k0 + k);
              // One row at a time: subarray copies are memmoves, and a row is
              // the longest run that is contiguous in this layout.
              captureDist.set(dist.subarray(n, n + w), n);
              captureColor.set(color.subarray(n * 3, (n + w) * 3), n * 3);
            }
          }
        }
      }
    }
  }

  /**
   * Open a revertible gesture. Everything the field does until commitGesture()
   * or revertGesture() can be undone bit-exactly.
   *
   * Nesting is not supported and is not needed: there is one primary pointer.
   * A second beginGesture() while one is open commits the first, which is the
   * forgiving reading rather than throwing at a child mid-drag.
   */
  function beginGesture() {
    if (gesture) commitGesture();
    gesture = {
      bricks: [],
      opLen: opLog.length,
      active: active ? { ...active } : null,
      volumeTarget,
      stamps: stats.stamps,
      pulls: stats.pulls,
      settles: stats.settles,
      simplifies: stats.simplifies,
      ops: stats.ops,
    };
    return true;
  }

  /** Keep everything the gesture did. Cheap: it only drops the capture flags. */
  function commitGesture() {
    if (!gesture) return false;
    for (const b of gesture.bricks) captured[b] = 0;
    gesture = null;
    return true;
  }

  /**
   * Put the field back exactly as it was when beginGesture() was called, and
   * mark every brick that changed so the renderer catches up on the next frame.
   *
   * `stats.stamps` is restored too, and that is not bookkeeping: it is the
   * index the per-stamp noise phase is derived from, so a gesture that stamped
   * and was then reverted must give the NEXT stamp the phase the reverted one
   * would have had. Otherwise a cancelled drop would silently change the lumps
   * on every ball a child places afterwards, and the op-log save would replay
   * into a different-looking creature.
   */
  function revertGesture() {
    if (!gesture) return false;
    for (const b of gesture.bricks) {
      captured[b] = 0;
      markBrick(b);
      const bi = b % bres;
      const bj = ((b / bres) | 0) % bres;
      const bk = (b / (bres * bres)) | 0;
      const i0 = bi * BRICK; const j0 = bj * BRICK; const k0 = bk * BRICK;
      const w = Math.min(BRICK, res - i0);
      const hgt = Math.min(BRICK, res - j0);
      const d = Math.min(BRICK, res - k0);
      for (let k = 0; k < d; k++) {
        for (let j = 0; j < hgt; j++) {
          const n = idx(i0, j0 + j, k0 + k);
          dist.set(captureDist.subarray(n, n + w), n);
          color.set(captureColor.subarray(n * 3, (n + w) * 3), n * 3);
        }
      }
    }
    opLog.length = gesture.opLen;
    active = gesture.active ? { ...gesture.active } : null;
    volumeTarget = gesture.volumeTarget;
    stats.stamps = gesture.stamps;
    stats.pulls = gesture.pulls;
    stats.settles = gesture.settles;
    stats.simplifies = gesture.simplifies;
    stats.ops = gesture.ops;
    invalidateBase();
    gesture = null;
    return true;
  }

  /** World AABB -> clamped inclusive voxel box. */
  function boxOf(minX, minY, minZ, maxX, maxY, maxZ) {
    return {
      i0: clamp(Math.floor(vc(minX)), 0, res - 1),
      j0: clamp(Math.floor(vc(minY)), 0, res - 1),
      k0: clamp(Math.floor(vc(minZ)), 0, res - 1),
      i1: clamp(Math.ceil(vc(maxX)), 0, res - 1),
      j1: clamp(Math.ceil(vc(maxY)), 0, res - 1),
      k1: clamp(Math.ceil(vc(maxZ)), 0, res - 1),
    };
  }

  const fullBox = () => ({ i0: 0, j0: 0, k0: 0, i1: res - 1, j1: res - 1, k1: res - 1 });

  function growActive(box) {
    if (!active) { active = { ...box }; return; }
    if (box.i0 < active.i0) active.i0 = box.i0;
    if (box.j0 < active.j0) active.j0 = box.j0;
    if (box.k0 < active.k0) active.k0 = box.k0;
    if (box.i1 > active.i1) active.i1 = box.i1;
    if (box.j1 > active.j1) active.j1 = box.j1;
    if (box.k1 > active.k1) active.k1 = box.k1;
  }

  const activeBox = () => active || { i0: 0, j0: 0, k0: 0, i1: -1, j1: -1, k1: -1 };

  function boxVoxels(box) {
    return Math.max(0, box.i1 - box.i0 + 1) * Math.max(0, box.j1 - box.j0 + 1) * Math.max(0, box.k1 - box.k0 + 1);
  }

  function boxBricks(box) {
    if (box.i1 < box.i0) return 0;
    return ((box.i1 / BRICK | 0) - (box.i0 / BRICK | 0) + 1)
      * ((box.j1 / BRICK | 0) - (box.j0 / BRICK | 0) + 1)
      * ((box.k1 / BRICK | 0) - (box.k0 / BRICK | 0) + 1);
  }

  // -------------------------------------------------------------------------
  // Sampling (trilinear, matching what the GPU will do)
  // -------------------------------------------------------------------------

  function sampleDistanceAt(x, y, z, src) {
    const s = src || dist;
    const fx = vc(x); const fy = vc(y); const fz = vc(z);
    if (fx < -1 || fy < -1 || fz < -1 || fx > res || fy > res || fz > res) return cpuBand;
    const i0 = clamp(Math.floor(fx), 0, res - 1);
    const j0 = clamp(Math.floor(fy), 0, res - 1);
    const k0 = clamp(Math.floor(fz), 0, res - 1);
    const i1 = i0 + 1 < res ? i0 + 1 : i0;
    const j1 = j0 + 1 < res ? j0 + 1 : j0;
    const k1 = k0 + 1 < res ? k0 + 1 : k0;
    const tx = clamp(fx - i0, 0, 1);
    const ty = clamp(fy - j0, 0, 1);
    const tz = clamp(fz - k0, 0, 1);
    const b0 = k0 * slab; const b1 = k1 * slab;
    const r0 = j0 * stride; const r1 = j1 * stride;
    const a = s[b0 + r0 + i0] + (s[b0 + r0 + i1] - s[b0 + r0 + i0]) * tx;
    const b = s[b0 + r1 + i0] + (s[b0 + r1 + i1] - s[b0 + r1 + i0]) * tx;
    const c = s[b1 + r0 + i0] + (s[b1 + r0 + i1] - s[b1 + r0 + i0]) * tx;
    const d = s[b1 + r1 + i0] + (s[b1 + r1 + i1] - s[b1 + r1 + i0]) * tx;
    const e = a + (b - a) * ty;
    const f = c + (d - c) * ty;
    return e + (f - e) * tz;
  }

  function sampleColorAt(x, y, z, out, src) {
    const s = src || color;
    const o = out || [0, 0, 0];
    const fx = vc(x); const fy = vc(y); const fz = vc(z);
    const i0 = clamp(Math.floor(fx), 0, res - 1);
    const j0 = clamp(Math.floor(fy), 0, res - 1);
    const k0 = clamp(Math.floor(fz), 0, res - 1);
    const i1 = i0 + 1 < res ? i0 + 1 : i0;
    const j1 = j0 + 1 < res ? j0 + 1 : j0;
    const k1 = k0 + 1 < res ? k0 + 1 : k0;
    const tx = clamp(fx - i0, 0, 1);
    const ty = clamp(fy - j0, 0, 1);
    const tz = clamp(fz - k0, 0, 1);
    const n000 = ((k0 * res + j0) * res + i0) * 3;
    const n100 = ((k0 * res + j0) * res + i1) * 3;
    const n010 = ((k0 * res + j1) * res + i0) * 3;
    const n110 = ((k0 * res + j1) * res + i1) * 3;
    const n001 = ((k1 * res + j0) * res + i0) * 3;
    const n101 = ((k1 * res + j0) * res + i1) * 3;
    const n011 = ((k1 * res + j1) * res + i0) * 3;
    const n111 = ((k1 * res + j1) * res + i1) * 3;
    for (let ch = 0; ch < 3; ch++) {
      const a = s[n000 + ch] + (s[n100 + ch] - s[n000 + ch]) * tx;
      const b = s[n010 + ch] + (s[n110 + ch] - s[n010 + ch]) * tx;
      const c = s[n001 + ch] + (s[n101 + ch] - s[n001 + ch]) * tx;
      const d = s[n011 + ch] + (s[n111 + ch] - s[n011 + ch]) * tx;
      const e = a + (b - a) * ty;
      const f = c + (d - c) * ty;
      o[ch] = e + (f - e) * tz;
    }
    return o;
  }

  // -------------------------------------------------------------------------
  // Volume
  // -------------------------------------------------------------------------

  /**
   * Soft occupancy: a voxel whose centre sits exactly on the surface counts as
   * half full, and the transition spans one voxel. This is what makes drift
   * measurable at all — a hard d<0 count quantises to whole voxels and reports
   * 1-2% noise for an op that moved nothing.
   */
  const occupancy = (d) => clamp(0.5 - d / h, 0, 1);

  function regionVolume(box, src) {
    const s = src || dist;
    const cut = h * 0.5;
    let sum = 0;
    for (let k = box.k0; k <= box.k1; k++) {
      for (let j = box.j0; j <= box.j1; j++) {
        let n = idx(box.i0, j, k);
        for (let i = box.i0; i <= box.i1; i++, n++) {
          const d = s[n];
          if (d < cut) sum += d <= -cut ? 1 : 0.5 - d / h;
        }
      }
    }
    return sum * h * h * h;
  }

  function volume() { return active ? regionVolume(active) : 0; }

  /**
   * Volume AND surface area in ONE pass. The area (from the same soft
   * indicator) is dV/d(offset) for the renormaliser; it only has to be right to
   * within a factor for the Newton step to converge in two or three iterations.
   * Measuring them separately doubled the cost of every pull for no accuracy.
   */
  const _va = { volume: 0, area: 0 };
  function regionVolumeArea(box) {
    const cut = h * 0.5;
    const w = h * 0.75;
    let sum = 0; let cells = 0;
    for (let k = box.k0; k <= box.k1; k++) {
      for (let j = box.j0; j <= box.j1; j++) {
        let n = idx(box.i0, j, k);
        for (let i = box.i0; i <= box.i1; i++, n++) {
          const d = dist[n];
          if (d < cut) sum += d <= -cut ? 1 : 0.5 - d / h;
          if (d < w && d > -w) cells++;
        }
      }
    }
    _va.volume = sum * h * h * h;
    _va.area = cells * h * h * 0.75;
    return _va;
  }

  /**
   * Push the surface in or out by a constant offset until the region's volume
   * matches `target`. LOCAL by design: a global offset would touch every brick
   * and destroy the locality that makes a pull cheap, and the error a local
   * advection introduces is itself local, so there is nothing to spread.
   */
  function renormalizeRegion(box, target) {
    for (let iter = 0; iter < 3; iter++) {
      const m = regionVolumeArea(box);
      const err = m.volume - target;
      if (Math.abs(err) < Math.max(target, 1e-9) * 2e-4) break;
      const area = Math.max(m.area, h * h);
      const delta = clamp(err / area, -h * 0.5, h * 0.5);
      if (Math.abs(delta) < 1e-9) break;
      for (let k = box.k0; k <= box.k1; k++) {
        for (let j = box.j0; j <= box.j1; j++) {
          let n = idx(box.i0, j, k);
          for (let i = box.i0; i <= box.i1; i++, n++) {
            const d = dist[n];
            if (d > -cpuBand && d < cpuBand) {
              const nd = d + delta;
              dist[n] = nd < -cpuBand ? -cpuBand : nd > cpuBand ? cpuBand : nd;
            }
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Field hygiene
  // -------------------------------------------------------------------------

  /**
   * Bounded Lipschitz sweep. Enforces |d(p)| <= |d(q)| + h for every 6-neighbour
   * pair, which is exactly the condition a sphere-tracing raymarch needs in
   * order never to overshoot the surface. It does NOT enforce |grad d| == 1 —
   * the field is allowed to under-report distance, which only makes the march
   * more conservative — so this is a handful of min() passes rather than a real
   * eikonal solve, and it costs about a tenth of the advection it repairs.
   */
  function redistance(box, passes = 2) {
    for (let p = 0; p < passes; p++) {
      const forward = (p & 1) === 0;
      const st = forward ? 1 : -1;
      const ka = forward ? box.k0 : box.k1; const kb = forward ? box.k1 : box.k0;
      for (let k = ka; forward ? k <= kb : k >= kb; k += st) {
        const ja = forward ? box.j0 : box.j1; const jb = forward ? box.j1 : box.j0;
        for (let j = ja; forward ? j <= jb : j >= jb; j += st) {
          const ia = forward ? box.i0 : box.i1; const ib = forward ? box.i1 : box.i0;
          for (let i = ia; forward ? i <= ib : i >= ib; i += st) {
            const n = idx(i, j, k);
            const d = dist[n];
            const a = d < 0 ? -d : d;
            if (a >= cpuBand) continue;
            let best = a;
            let t;
            if (i > 0) { t = dist[n - 1]; t = (t < 0 ? -t : t) + h; if (t < best) best = t; }
            if (i < res - 1) { t = dist[n + 1]; t = (t < 0 ? -t : t) + h; if (t < best) best = t; }
            if (j > 0) { t = dist[n - stride]; t = (t < 0 ? -t : t) + h; if (t < best) best = t; }
            if (j < res - 1) { t = dist[n + stride]; t = (t < 0 ? -t : t) + h; if (t < best) best = t; }
            if (k > 0) { t = dist[n - slab]; t = (t < 0 ? -t : t) + h; if (t < best) best = t; }
            if (k < res - 1) { t = dist[n + slab]; t = (t < 0 ? -t : t) + h; if (t < best) best = t; }
            if (best < a - 1e-7) dist[n] = d >= 0 ? best : -best;
          }
        }
      }
    }
  }

  /**
   * Push surface colour outward into the empty shell. The GPU's trilinear fetch
   * at a surface point reads eight voxels, some of which sit outside the
   * material; if those hold black then the whole silhouette darkens in a band
   * one voxel wide, which reads as a dirty outline around every shape. Two
   * dilation passes cover the encoded band comfortably.
   */
  function extendColor(box, passes = 2) {
    const reach = band + h;
    for (let p = 0; p < passes; p++) {
      for (let k = box.k0; k <= box.k1; k++) {
        for (let j = box.j0; j <= box.j1; j++) {
          let n = idx(box.i0, j, k);
          for (let i = box.i0; i <= box.i1; i++, n++) {
            const d = dist[n];
            if (d <= 0 || d >= reach) continue;
            const c = n * 3;
            if (color[c] || color[c + 1] || color[c + 2]) continue;
            let r = 0; let g = 0; let b = 0; let w = 0; let m;
            if (i > 0) { m = (n - 1) * 3; if (color[m] || color[m + 1] || color[m + 2]) { r += color[m]; g += color[m + 1]; b += color[m + 2]; w++; } }
            if (i < res - 1) { m = (n + 1) * 3; if (color[m] || color[m + 1] || color[m + 2]) { r += color[m]; g += color[m + 1]; b += color[m + 2]; w++; } }
            if (j > 0) { m = (n - stride) * 3; if (color[m] || color[m + 1] || color[m + 2]) { r += color[m]; g += color[m + 1]; b += color[m + 2]; w++; } }
            if (j < res - 1) { m = (n + stride) * 3; if (color[m] || color[m + 1] || color[m + 2]) { r += color[m]; g += color[m + 1]; b += color[m + 2]; w++; } }
            if (k > 0) { m = (n - slab) * 3; if (color[m] || color[m + 1] || color[m + 2]) { r += color[m]; g += color[m + 1]; b += color[m + 2]; w++; } }
            if (k < res - 1) { m = (n + slab) * 3; if (color[m] || color[m + 1] || color[m + 2]) { r += color[m]; g += color[m + 1]; b += color[m + 2]; w++; } }
            if (w > 0) { color[c] = (r / w) | 0; color[c + 1] = (g / w) | 0; color[c + 2] = (b / w) | 0; }
          }
        }
      }
    }
  }

  /** Smooth-max the ground plane into a region: the flat contact patch. */
  function groundCut(box) {
    if (groundY === null) return;
    const k = h * 2.2;
    for (let j = box.j0; j <= box.j1; j++) {
      const below = groundY - WC[j];
      if (below < -cpuBand) continue; // comfortably above the table
      for (let kk = box.k0; kk <= box.k1; kk++) {
        let n = idx(box.i0, j, kk);
        for (let i = box.i0; i <= box.i1; i++, n++) {
          const v = smoothMax(dist[n], below, k);
          dist[n] = v < -cpuBand ? -cpuBand : v > cpuBand ? cpuBand : v;
        }
      }
    }
  }

  function invalidateBase() {
    baseDist = null; baseColor = null; baseBox = null;
    settleQ = null; settleShift = null; settlePivot = null;
  }

  /**
   * SHIPPING ADDITION 3 — move the table.
   *
   * The lab page has a fixed ground plane; a game measures its own off the
   * turntable element and re-measures it on every resize and orientation
   * change. A plane that RISES eats the clay it now passes through, which is
   * the physically honest answer and also the only one that keeps the flat
   * contact patch correct. A plane that FALLS leaves the body floating, and the
   * next settle drops it — deliberately not an instant snap, because a
   * creature that teleported downward on an orientation change would read as
   * the toy breaking rather than as gravity.
   *
   * Not logged as an op. The ground is a property of the STAGE, not of the
   * creature, so it rides the save envelope (see toDocument) and is applied
   * before a replay rather than inside one.
   */
  /**
   * How close to a cube face anything is allowed to be. The grid IS the world:
   * there is no camera clipping here, only material that stops existing, and
   * what the child sees when it does is a flat shear across their creature.
   */
  const faceLimit = size / 2 - FACE_MARGIN_VOXELS * h;

  /** The effective ceiling: the game's, or the cube's, whichever is lower. */
  const ceilingY = () => (ceiling === null ? faceLimit : Math.min(ceiling, faceLimit));

  /**
   * SHIPPING ADDITION 5 — the lid.
   *
   * A ceiling is to the top of the stage what setGround is to the table, with
   * one deliberate difference: the ground CUTS (a rising table eats the clay it
   * passes through, which is the honest answer for a plane pushing into a body),
   * whereas the ceiling only ever stops material ARRIVING. Nothing is ever
   * removed at the top, because the thing being prevented is a shear and cutting
   * is exactly how you make one.
   *
   * WHY THE GAME HAS TO SET THIS. The clip the owner photographed was not the
   * grid: measured on the shipping stage, the field's cube top sits at y = +1.0
   * while the camera only shows up to y = +viewScale = +0.677, so a tall build
   * runs off the top of the CANVAS a third of a world unit before the grid has
   * anything to say about it. The field cannot know that — viewScale is a
   * property of the stage's shape — so the limit that matters is passed in, and
   * the cube's own face margin sits behind it as a floor that holds even if
   * nobody sets one.
   *
   * Rides the save envelope like the ground, and for the same reason: it is a
   * property of the STAGE, not of the creature. A creature carried to a
   * differently-shaped stage keeps its shape and gets the new stage's lid.
   */
  function setCeiling(y) {
    const next = y === null || y === undefined ? null : Number(y);
    if (next === ceiling || (next !== null && !Number.isFinite(next))) return false;
    ceiling = next;
    return true;
  }

  function setGround(y) {
    const next = y === null || y === undefined ? null : Number(y);
    if (next === groundY || (next !== null && !Number.isFinite(next))) return false;
    const rising = next !== null && (groundY === null || next > groundY);
    groundY = next;
    if (active && rising) {
      captureBox(active);
      groundCut(active);
      redistance(active, 1);
      extendColor(active, 1);
      markRegion(active);
      invalidateBase();
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // stampBall
  // -------------------------------------------------------------------------

  /**
   * Smooth-union a noise-displaced ball into the field.
   *
   * Colour ownership is decided per voxel by which surface is nearer, with a
   * blend band ONE VOXEL wide. That narrowness is the whole answer to "can
   * seams stay crisp where unworked": two balls stamped against each other meet
   * along a boundary as sharp as the grid allows, and nothing widens it until a
   * pull actually advects material across it.
   */
  function stampBall(center, radius, colorInput, options = {}) {
    const t0 = now();
    // QUANTISE FIRST, then execute with the quantised numbers — see q6. The
    // values that go into the op log are the values that ran.
    const r = q6(Math.max(h * 2, Number(radius) || 0.3));
    const rgb = parseColor(colorInput);
    // KEPT WHOLLY INSIDE THE WORLD, and quantised only afterwards so the op log
    // records the ball that was actually stamped. A ball whose lumps would poke
    // through a cube face writes a slab of saturated clay flat against that
    // face and the raymarch draws the cut; measured before this clamp, a
    // seven-ball tower left 179 solid voxels sitting on the top face. Nudging
    // the centre keeps the ball perfectly round — the lateral stage clamp in
    // blob-field.js has always worked this way, and this is its backstop for
    // every axis, including the one nothing was guarding.
    // Reach counts the LUMPS AND THE WELD, not just the radius. The noise
    // displacement is how far the surface can bulge past r, and the smooth-union
    // blend is how far the join to existing clay can bulge past THAT — measured,
    // leaving the blend out left a tower two voxels off the top face where three
    // were promised, because the seam to the ball below reached further than the
    // ball did.
    const guardBlend = Number.isFinite(options.blend) ? options.blend : r * 0.30;
    const guardReach = r * (1 + (Number.isFinite(options.noiseAmp) ? options.noiseAmp : NOISE_AMP)) + guardBlend;
    const lidY = ceilingY();
    // NO LOWER CLAMP WHILE THERE IS A TABLE, and that is not an oversight.
    // Balls are stamped deliberately BELOW the ground plane — that overlap is
    // what GROUND_SINK buys, and slicing it off is what gives a resting body its
    // flat, slightly-splayed contact patch. groundCut() already guarantees
    // nothing survives under the table, so the table is the floor guard. Only a
    // groundless field (the lab's free-floating mode) needs the cube's own.
    const floorY = groundY === null ? -faceLimit + guardReach : -Infinity;
    // Not while replaying a pre-v6 op: those numbers were authored without any
    // guard and clamping them now would reshape a saved creature. See replay().
    const gx = replayingLegacy ? Infinity : faceLimit - guardReach;
    const cx = q6(clamp(center.x ?? center[0] ?? 0, -gx, gx));
    const cy = q6(replayingLegacy ? (center.y ?? center[1] ?? 0)
      : clamp(center.y ?? center[1] ?? 0, floorY, lidY - guardReach));
    const cz = q6(clamp(center.z ?? center[2] ?? 0, -gx, gx));
    const blend = Number.isFinite(options.blend) ? options.blend : r * 0.30;
    const noiseAmp = Number.isFinite(options.noiseAmp) ? q6(options.noiseAmp) : NOISE_AMP;

    // Deterministic per-stamp phase. Same seed + same op order => the same
    // lumps, every session, forever — which is what makes an op-log save able
    // to regenerate a creature bit-for-bit.
    const stampIndex = stats.stamps;
    const px = hash01(seed, stampIndex * 3 + 1) * TAU;
    const py = hash01(seed, stampIndex * 3 + 2) * TAU;
    const pz = hash01(seed, stampIndex * 3 + 3) * TAU;

    const reach = r * (1 + noiseAmp) + blend + cpuBand;
    const box = boxOf(cx - reach, cy - reach, cz - reach, cx + reach, cy + reach, cz + reach);
    const freq = NOISE_FREQ / r;
    const noiseCut = cpuBand + r * noiseAmp;
    const colorReach = band + h;
    // Lower frequency than the surface lumps and a much smaller amplitude: the
    // wobble has to WANDER across a whole join, not jitter along it, or it reads
    // as a ragged edge rather than a hand-worked one.
    const seamFreq = freq * 0.55;
    const seamWobble = Number.isFinite(options.seamWobble) ? q6(options.seamWobble) : SEAM_WOBBLE;
    let voxels = 0;

    captureBox(box);

    const rowCut = (r + noiseCut) * (r + noiseCut);
    for (let k = box.k0; k <= box.k1; k++) {
      const z = WC[k] - cz;
      for (let j = box.j0; j <= box.j1; j++) {
        const y = WC[j] - cy;
        const yz = y * y + z * z;
        // Whole row is outside the ball's reach and the field there is already
        // saturated: skip without touching a single voxel.
        if (yz > rowCut && !active) continue;
        let n = idx(box.i0, j, k);
        for (let i = box.i0; i <= box.i1; i++, n++) {
          const x = WC[i] - cx;
          const len = Math.sqrt(x * x + yz);
          let dBall = len - r;
          if (dBall > noiseCut) { if (dist[n] >= cpuBand) continue; }
          else dBall -= noiseAmp * r * noiseWave(x * freq, y * freq, z * freq, px, py, pz);
          const dOld = dist[n];
          if (dBall >= cpuBand && dOld >= cpuBand) continue;
          const raw = smoothMin(dOld, dBall, blend);
          const dNew = raw < -cpuBand ? -cpuBand : raw > cpuBand ? cpuBand : raw;
          dist[n] = dNew;
          voxels++;

          if (dNew < colorReach) {
            const c = n * 3;
            // The nearer surface owns the voxel; the crossover blends over one
            // voxel so the seam antialiases without ever becoming a gradient.
            //
            // SEAM WOBBLE. A mathematically exact boundary between two colours
            // is the single loudest "this is not clay" tell — at two balls it
            // passes as a turned edge, but at a dozen the straight arcs tile the
            // body into a beach ball. lobes-three.js solves this in the shader
            // with a noise offset on the ownership test; here it is baked in at
            // stamp time instead, on the same wave the surface displacement
            // uses, which means the wobble is MATERIAL: a later pull drags the
            // wobbly boundary along with the clay rather than leaving a fixed
            // pattern hanging in space for the colour to slide under.
            const wobble = seamWobble * r * noiseWave(x * seamFreq, y * seamFreq, z * seamFreq, py, pz, px);
            const w = clamp(0.5 + (dOld - dBall + wobble) / (2 * h), 0, 1);
            if (!(color[c] || color[c + 1] || color[c + 2])) {
              color[c] = rgb[0]; color[c + 1] = rgb[1]; color[c + 2] = rgb[2];
            } else {
              color[c] = (color[c] * (1 - w) + rgb[0] * w) | 0;
              color[c + 1] = (color[c + 1] * (1 - w) + rgb[1] * w) | 0;
              color[c + 2] = (color[c + 2] * (1 - w) + rgb[2] * w) | 0;
            }
          }
        }
      }
    }

    groundCut(box);
    redistance(box, 2);
    extendColor(box, 2);
    growActive(box);
    markRegion(box);
    volumeTarget = volume();
    invalidateBase();

    // Already quantised above, so no rounding here — these ARE the numbers the
    // loop ran with. `k` is an opaque caller tag (the game writes 'ball' on the
    // stamps that came from the tray, because the Decorate gate counts those
    // and must not count a scripted stamp a legacy save was converted into).
    // Non-default noise parameters ride along so a replay cannot silently
    // substitute the defaults.
    const op = { t: 's', x: cx, y: cy, z: cz, r, c: rgbHex(rgb) };
    if (options.tag) op.k = String(options.tag);
    if (noiseAmp !== NOISE_AMP) op.n = noiseAmp;
    if (seamWobble !== SEAM_WOBBLE) op.w = seamWobble;
    opLog.push(op);
    stats.ops++; stats.stamps++;
    stats.lastOp = 'stamp';
    stats.lastOpVoxels = voxels;
    stats.lastOpBricks = boxBricks(box);
    stats.lastOpMs = now() - t0;

    // THE CLAY TAKES THE WEIGHT. A ball that landed on top of existing clay
    // presses it down; one that landed on the table does not. compress() logs
    // its own op, so a replay re-runs the SQUASH RATHER THAN RE-DERIVING IT —
    // which is what keeps an old save that predates compression replaying to
    // exactly the shape it was saved as. See replay().
    if (options.compress) {
      const foot = r * COMPRESS_FOOTPRINT;
      const squash = compressionFor(cx, cy, cz, r, foot);
      if (squash >= COMPRESS_MIN) {
        const stampMs = stats.lastOpMs;
        compress(cx, cz, foot, squash);
        stats.lastOp = 'stamp+compress';
        stats.lastOpMs += stampMs;
      }
    }
    return stats.lastOpMs;
  }

  // -------------------------------------------------------------------------
  // pull — local material advection
  // -------------------------------------------------------------------------

  /**
   * Displace the field's CONTENTS — distance and colour together — along `dir`
   * within a falloff around `from`. This is the operation the 2026-07 research
   * said an analytic SDF could not do, and it is the reason a stored field is a
   * different animal: there is no primitive to re-parameterise, only material to
   * move.
   *
   * Implemented as backward semi-Lagrangian advection. For each destination
   * voxel p we ask "what was at p - w(p)*dir before?" and copy it. Backward is
   * the right direction: it fills every destination exactly once with no gaps,
   * where a forward scatter would leave holes wherever the map stretches.
   *
   * The colour rides along with no special case at all. That is the whole point
   * — drag through a two-colour boundary and the boundary is dragged, because
   * colour is a property of the material at a place, not a label on an object.
   */
  function pull(from, dir, brushRadius, options = {}) {
    const t0 = now();
    const fx = q6(from.x ?? from[0] ?? 0);
    const fy = q6(from.y ?? from[1] ?? 0);
    const fz = q6(from.z ?? from[2] ?? 0);
    let dx = dir.x ?? dir[0] ?? 0;
    let dy = dir.y ?? dir[1] ?? 0;
    let dz = dir.z ?? dir[2] ?? 0;
    const brush = q6(Math.max(h * 2, Number(brushRadius) || 0.25));

    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (mag < 1e-6) return 0;
    const cap = brush * PULL_STEP_CAP;
    if (mag > cap) { const s = cap / mag; dx *= s; dy *= s; dz *= s; }

    // THE CLAY RUNS OUT NEAR A FACE, it does not hit a wall.
    //
    // Each component of the step is allowed to close at most CEILING_YIELD of
    // whatever room the brush's leading edge has left in that direction. So the
    // gap to the limit goes 1, 1/2, 1/4, ... : a child dragging upward feels the
    // clay give less and less and never finds an edge, and no amount of dragging
    // can put material against a face for the boundary to shear. Only the
    // component pointing AT the limit is attenuated, so a sideways drag near the
    // lid still works normally — the clay stops rising, not moving.
    //
    // Quantised AFTER this, because these are the numbers that run. That also
    // makes the guard idempotent on its own output: a logged step is already
    // within its room, so replaying it recomputes the same limit and changes
    // nothing. An op log therefore replays identically whether or not a ceiling
    // is set, which is what lets an old save keep its shape. See replay().
    if (!replayingLegacy) {
      const lid = ceilingY();
      dx = yieldToward(dx, fx, brush, -faceLimit, faceLimit);
      dy = yieldToward(dy, fy, brush, groundY === null ? -faceLimit : -Infinity, lid);
      dz = yieldToward(dz, fz, brush, -faceLimit, faceLimit);
    }
    dx = q6(dx); dy = q6(dy); dz = q6(dz);
    const step = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (step < 1e-9) return 0;

    // TWO boxes, deliberately. The falloff is evaluated at the DESTINATION, so
    // nothing outside a brush radius of `from` is ever written — that is the
    // repair box, and it is the one every sweep pays for. The backward map
    // reads up to `step` further away, so the snapshot needs a wider box. Using
    // one box for both (the obvious thing) made every pull pay the repair cost
    // over 2.5x the voxels it had actually touched.
    const dstReach = brush + 2 * h;
    const box = boxOf(fx - dstReach, fy - dstReach, fz - dstReach, fx + dstReach, fy + dstReach, fz + dstReach);
    const srcReach = brush + step + 2 * h;
    const src = boxOf(fx - srcReach, fy - srcReach, fz - srcReach, fx + srcReach, fy + srcReach, fz + srcReach);

    // Revert capture covers the WRITE box only. The wider `src` box is read,
    // never written, so capturing it would save bricks that cannot change.
    captureBox(box);

    // Snapshot the source: backward advection reads positions that later writes
    // would clobber.
    const bw = src.i1 - src.i0 + 1;
    const bh = src.j1 - src.j0 + 1;
    const bd = src.k1 - src.k0 + 1;
    const srcD = new Float32Array(bw * bh * bd);
    const srcC = new Uint8Array(bw * bh * bd * 3);
    for (let k = 0; k < bd; k++) {
      for (let j = 0; j < bh; j++) {
        let n = idx(src.i0, src.j0 + j, src.k0 + k);
        let m = (k * bh + j) * bw;
        for (let i = 0; i < bw; i++, n++, m++) {
          srcD[m] = dist[n];
          srcC[m * 3] = color[n * 3];
          srcC[m * 3 + 1] = color[n * 3 + 1];
          srcC[m * 3 + 2] = color[n * 3 + 2];
        }
      }
    }

    const volBefore = regionVolume(box);
    const inv = 1 / brush;
    let voxels = 0;

    for (let k = box.k0; k <= box.k1; k++) {
      const z = WC[k];
      const rz = z - fz;
      for (let j = box.j0; j <= box.j1; j++) {
        const y = WC[j];
        const ry = y - fy;
        const ryz = ry * ry + rz * rz;
        let n = idx(box.i0, j, k);
        for (let i = box.i0; i <= box.i1; i++, n++) {
          const x = WC[i];
          const rx = x - fx;
          const r = Math.sqrt(rx * rx + ryz) * inv;
          if (r >= 1) continue;
          // Palm-and-fingers falloff: exactly 1 across the inner PULL_CORE of
          // the brush, then smoothstep to 0 at the edge, with zero derivative
          // at BOTH ends of the ring — so moved material shears into untouched
          // material instead of stepping off a cliff at the outside, and the
          // palm meets the fingers without a crease at the inside.
          //
          // The plateau is what keeps a pulled front round: see PULL_CORE.
          const s = r <= PULL_CORE ? 1 : (1 - r) * CORE_INV;
          const w = s * s * (3 - 2 * s);
          if (w <= 1e-4) continue;

          // Backward map, read out of the snapshot in local box coordinates.
          const a = vc(x - dx * w) - src.i0;
          const b = vc(y - dy * w) - src.j0;
          const c = vc(z - dz * w) - src.k0;
          const ai = clamp(Math.floor(a), 0, bw - 1);
          const bj = clamp(Math.floor(b), 0, bh - 1);
          const ck = clamp(Math.floor(c), 0, bd - 1);
          const ai1 = ai + 1 < bw ? ai + 1 : ai;
          const bj1 = bj + 1 < bh ? bj + 1 : bj;
          const ck1 = ck + 1 < bd ? ck + 1 : ck;
          const tx = clamp(a - ai, 0, 1);
          const ty = clamp(b - bj, 0, 1);
          const tz = clamp(c - ck, 0, 1);
          const q000 = (ck * bh + bj) * bw + ai;
          const q100 = (ck * bh + bj) * bw + ai1;
          const q010 = (ck * bh + bj1) * bw + ai;
          const q110 = (ck * bh + bj1) * bw + ai1;
          const q001 = (ck1 * bh + bj) * bw + ai;
          const q101 = (ck1 * bh + bj) * bw + ai1;
          const q011 = (ck1 * bh + bj1) * bw + ai;
          const q111 = (ck1 * bh + bj1) * bw + ai1;

          const p0 = srcD[q000] + (srcD[q100] - srcD[q000]) * tx;
          const p1 = srcD[q010] + (srcD[q110] - srcD[q010]) * tx;
          const p2 = srcD[q001] + (srcD[q101] - srcD[q001]) * tx;
          const p3 = srcD[q011] + (srcD[q111] - srcD[q011]) * tx;
          const e0 = p0 + (p1 - p0) * ty;
          const e1 = p2 + (p3 - p2) * ty;
          const dv = e0 + (e1 - e0) * tz;
          dist[n] = dv < -cpuBand ? -cpuBand : dv > cpuBand ? cpuBand : dv;

          const cn = n * 3;
          for (let ch = 0; ch < 3; ch++) {
            const g0 = srcC[q000 * 3 + ch] + (srcC[q100 * 3 + ch] - srcC[q000 * 3 + ch]) * tx;
            const g1 = srcC[q010 * 3 + ch] + (srcC[q110 * 3 + ch] - srcC[q010 * 3 + ch]) * tx;
            const g2 = srcC[q001 * 3 + ch] + (srcC[q101 * 3 + ch] - srcC[q001 * 3 + ch]) * tx;
            const g3 = srcC[q011 * 3 + ch] + (srcC[q111 * 3 + ch] - srcC[q011 * 3 + ch]) * tx;
            const f0 = g0 + (g1 - g0) * ty;
            const f1 = g2 + (g3 - g2) * ty;
            color[cn + ch] = (f0 + (f1 - f0) * tz) | 0;
          }
          voxels++;
        }
      }
    }

    if (options.ground !== false) groundCut(box);
    redistance(box, 2);
    if (options.conserve !== false) renormalizeRegion(box, volBefore);
    extendColor(box, 2);
    growActive(box);
    markRegion(box);
    invalidateBase();

    const op = { t: 'p', x: fx, y: fy, z: fz, dx, dy, dz, b: brush };
    if (options.ground === false) op.g = 0;
    if (options.conserve === false) op.v = 0;
    opLog.push(op);
    stats.ops++; stats.pulls++;
    stats.lastOp = 'pull';
    stats.lastOpVoxels = voxels;
    stats.lastOpBricks = boxBricks(box);
    stats.lastOpMs = now() - t0;
    return stats.lastOpMs;
  }

  // -------------------------------------------------------------------------
  // compress — the clay takes the weight
  // -------------------------------------------------------------------------

  /**
   * Squash a standing column of clay under a load newly placed on top of it.
   *
   * THE OWNER'S WORDS ARE THE CONTRACT: "some of the weight should compress
   * down and flatten down at the base." When a ball lands on top of a creature,
   * the honest response is not to rotate anything — the balance solve already
   * refuses to, because nothing is out of balance — it is for the column under
   * the new weight to shorten a little and for the clay it displaces to spread
   * out where the body meets the table.
   *
   * It is an ADVECTION, not a new kind of operation. The map is
   *
   *     srcY = ground + (y - ground) / (1 - s·w)
   *     srcR = R / (1 + a·w·(1 - u)²)
   *
   * — a vertical squash toward the table and a lateral bulge that is strongest
   * at the bottom and dies out by the top, both faded off by the same
   * palm-and-fingers falloff `pull` uses so the compressed column shears
   * smoothly into the clay around it instead of stepping off a cliff. Running it
   * through the same backward semi-Lagrangian machinery means it inherits
   * everything that was already proved about pull: colour rides along with the
   * material, the volume is renormalised rather than approximated, and the op
   * log replays it exactly.
   *
   * VOLUME IS REDISTRIBUTED, NEVER DESTROYED. `renormalizeRegion` restores the
   * region's volume to what it was before the squash, so `a` is not doing
   * conservation arithmetic — it only decides WHERE the displaced clay goes,
   * and the owner asked for the base.
   *
   * @param {number} cx    column axis x
   * @param {number} cz    column axis z
   * @param {number} R     footprint radius
   * @param {number} s     fraction of the column's height to squash out
   */
  function compress(cx, cz, R, s) {
    const t0 = now();
    if (groundY === null || !active) return 0;
    const axisX = q6(cx);
    const axisZ = q6(cz);
    const foot = q6(Math.max(h * 2, Number(R) || 0));
    const squash = q6(clamp(Number(s) || 0, 0, COMPRESS_MAX));
    if (squash < COMPRESS_MIN || foot <= 0) return 0;

    // How tall the loaded column actually is, measured from the field rather
    // than passed in: the top of whatever material stands inside the footprint.
    // Derived from state the replay reproduces exactly, so it needs no op field.
    const probe = boxOf(axisX - foot, groundY, axisZ - foot, axisX + foot, size / 2, axisZ + foot);
    let topY = -Infinity;
    for (let j = probe.j1; j >= probe.j0; j--) {
      for (let k = probe.k0; k <= probe.k1; k++) {
        let n = idx(probe.i0, j, k);
        for (let i = probe.i0; i <= probe.i1; i++, n++) {
          if (dist[n] < 0) { topY = WC[j]; break; }
        }
        if (topY > -Infinity) break;
      }
      if (topY > -Infinity) break;
    }
    const colHeight = topY - groundY;
    if (!(colHeight > h * 4)) return 0; // nothing tall enough to squash

    const spread = squash * COMPRESS_SPREAD;
    const invCol = 1 / colHeight;
    const inv = 1 / foot;

    // Destination: the footprint from the table to the top of the column.
    const box = boxOf(axisX - foot - 2 * h, groundY - 2 * h, axisZ - foot - 2 * h,
      axisX + foot + 2 * h, topY + 2 * h, axisZ + foot + 2 * h);
    // Source reaches HIGHER than the destination (a squash reads from above)
    // and no further out laterally (it reads from nearer the axis), but the
    // box is kept square for the same index arithmetic.
    const lift = colHeight * (squash / (1 - squash)) + 2 * h;
    const src = boxOf(axisX - foot - 2 * h, groundY - 2 * h, axisZ - foot - 2 * h,
      axisX + foot + 2 * h, topY + lift, axisZ + foot + 2 * h);

    captureBox(box);

    const bw = src.i1 - src.i0 + 1;
    const bh = src.j1 - src.j0 + 1;
    const bd = src.k1 - src.k0 + 1;
    const srcD = new Float32Array(bw * bh * bd);
    const srcC = new Uint8Array(bw * bh * bd * 3);
    for (let k = 0; k < bd; k++) {
      for (let j = 0; j < bh; j++) {
        let n = idx(src.i0, src.j0 + j, src.k0 + k);
        let m = (k * bh + j) * bw;
        for (let i = 0; i < bw; i++, n++, m++) {
          srcD[m] = dist[n];
          srcC[m * 3] = color[n * 3];
          srcC[m * 3 + 1] = color[n * 3 + 1];
          srcC[m * 3 + 2] = color[n * 3 + 2];
        }
      }
    }

    const volBefore = regionVolume(box);
    let voxels = 0;

    for (let k = box.k0; k <= box.k1; k++) {
      const z = WC[k];
      const rz = z - axisZ;
      for (let j = box.j0; j <= box.j1; j++) {
        const y = WC[j];
        const hy = y - groundY;
        if (hy < -h) continue;
        const u = clamp(hy * invCol, 0, 1);
        const taper = (1 - u) * (1 - u);
        for (let i = box.i0; i <= box.i1; i++) {
          const x = WC[i];
          const rx = x - axisX;
          const rho = Math.sqrt(rx * rx + rz * rz) * inv;
          if (rho >= 1) continue;
          const s01 = rho <= PULL_CORE ? 1 : (1 - rho) * CORE_INV;
          const w = s01 * s01 * (3 - 2 * s01);
          if (w <= 1e-4) continue;

          // THE SQUASH LIVES AT THE BASE. `drop` is the total height this
          // column loses here; it is taken out of the bottom COMPRESS_ZONE of
          // the column on a smoothstep, and everything above that simply
          // translates down by the whole of it. Smoothstep rather than a
          // straight ramp because it has zero derivative at BOTH ends, so the
          // squashed region meets the table and meets the rigid part above it
          // without a crease in the surface at either join.
          const drop = squash * colHeight * w;
          const zone = Math.max(COMPRESS_ZONE * colHeight - drop, h);
          const t = clamp(hy / zone, 0, 1);
          const ease = t * t * (3 - 2 * t);
          const aw = spread * w * taper;
          const sy = groundY + hy + drop * ease;
          const lateral = 1 / (1 + aw);
          const sx = axisX + rx * lateral;
          const sz = axisZ + rz * lateral;

          // AN IDENTITY MAP NEEDS NO RESAMPLE. The falloff means most of this
          // cylinder barely moves — out near the footprint edge w is almost
          // zero, and above the squash zone the lateral taper is too — and
          // trilinearly re-reading a voxel in order to write back what was
          // already there costs four lerps and three colour channels to
          // accomplish nothing. Worse than nothing: every resample rounds the
          // surface a little, so the untouched rim of every compression was
          // paying blur for no motion. Measured over a twelve-ball build:
          // skipping under a twentieth of a voxel of displacement took the op
          // from 28.6ms mean to 19.1ms, and stopped it blurring the rim.
          const moveY = drop * ease;
          const moveR = Math.abs(rx * (1 - lateral)) + Math.abs(rz * (1 - lateral));
          if (moveY + moveR < h * 0.05) continue;

          const a = vc(sx) - src.i0;
          const b = vc(sy) - src.j0;
          const c = vc(sz) - src.k0;
          const ai = clamp(Math.floor(a), 0, bw - 1);
          const bj = clamp(Math.floor(b), 0, bh - 1);
          const ck = clamp(Math.floor(c), 0, bd - 1);
          const ai1 = ai + 1 < bw ? ai + 1 : ai;
          const bj1 = bj + 1 < bh ? bj + 1 : bj;
          const ck1 = ck + 1 < bd ? ck + 1 : ck;
          const tx = clamp(a - ai, 0, 1);
          const ty = clamp(b - bj, 0, 1);
          const tz = clamp(c - ck, 0, 1);
          const q000 = (ck * bh + bj) * bw + ai;
          const q100 = (ck * bh + bj) * bw + ai1;
          const q010 = (ck * bh + bj1) * bw + ai;
          const q110 = (ck * bh + bj1) * bw + ai1;
          const q001 = (ck1 * bh + bj) * bw + ai;
          const q101 = (ck1 * bh + bj) * bw + ai1;
          const q011 = (ck1 * bh + bj1) * bw + ai;
          const q111 = (ck1 * bh + bj1) * bw + ai1;

          const p0 = srcD[q000] + (srcD[q100] - srcD[q000]) * tx;
          const p1 = srcD[q010] + (srcD[q110] - srcD[q010]) * tx;
          const p2 = srcD[q001] + (srcD[q101] - srcD[q001]) * tx;
          const p3 = srcD[q011] + (srcD[q111] - srcD[q011]) * tx;
          const e0 = p0 + (p1 - p0) * ty;
          const e1 = p2 + (p3 - p2) * ty;
          const dv = e0 + (e1 - e0) * tz;
          const n = idx(i, j, k);
          dist[n] = dv < -cpuBand ? -cpuBand : dv > cpuBand ? cpuBand : dv;

          const cn = n * 3;
          for (let ch = 0; ch < 3; ch++) {
            const g0 = srcC[q000 * 3 + ch] + (srcC[q100 * 3 + ch] - srcC[q000 * 3 + ch]) * tx;
            const g1 = srcC[q010 * 3 + ch] + (srcC[q110 * 3 + ch] - srcC[q010 * 3 + ch]) * tx;
            const g2 = srcC[q001 * 3 + ch] + (srcC[q101 * 3 + ch] - srcC[q001 * 3 + ch]) * tx;
            const g3 = srcC[q011 * 3 + ch] + (srcC[q111 * 3 + ch] - srcC[q011 * 3 + ch]) * tx;
            const f0 = g0 + (g1 - g0) * ty;
            const f1 = g2 + (g3 - g2) * ty;
            color[cn + ch] = (f0 + (f1 - f0) * tz) | 0;
          }
          voxels++;
        }
      }
    }

    groundCut(box);
    redistance(box, 2);
    renormalizeRegion(box, volBefore);
    extendColor(box, 2);
    growActive(box);
    markRegion(box);
    volumeTarget = volume();
    invalidateBase();

    opLog.push({ t: 'c', x: axisX, z: axisZ, r: foot, s: squash });
    stats.ops++; stats.compressions++;
    stats.lastOp = 'compress';
    stats.lastOpVoxels = voxels;
    stats.lastOpBricks = boxBricks(box);
    stats.lastOpMs = now() - t0;
    return stats.lastOpMs;
  }

  /**
   * How hard a ball of radius `r` landing at (cx, cy, cz) presses on what is
   * already under it — or 0 when it is not landing on clay at all.
   *
   * DIMINISHING BY CONSTRUCTION. The squash is the load's share of the column
   * that carries it, `V_load / (V_load + V_column)`. Stamp the same ball onto
   * the same spot again and the column is bigger, so the share is smaller, so
   * the squash is smaller — the body stiffens as it thickens. That is why a
   * long session cannot quietly flatten a deliberate tall build, and it needs no
   * counter or history to be true.
   */
  function compressionFor(cx, cy, cz, r, foot) {
    if (groundY === null || !active) return 0;
    // Landing on the TABLE is not landing on clay: the table does not squash,
    // and the ground cut has already given that ball its flat contact patch.
    if (cy - r <= groundY + CONTACT_BAND_VOXELS * h) return 0;
    // Is there anything directly underneath to press on?
    if (sampleDistanceAt(cx, cy - r * 0.9, cz) >= 0) return 0;
    const col = boxOf(cx - foot, groundY, cz - foot, cx + foot, cy - r * 0.5, cz + foot);
    const colVolume = regionVolume(col);
    if (!(colVolume > 0)) return 0;
    const load = (4 / 3) * Math.PI * r * r * r;
    return Math.min(COMPRESS_MAX, COMPRESS_GAIN * (load / (load + colVolume)));
  }

  // -------------------------------------------------------------------------
  // Gravity
  // -------------------------------------------------------------------------

  /**
   * Principal axes of the material, from the mass-weighted covariance over the
   * active box. Largest variance = the loaf's long axis; smallest = the axis it
   * wants pointing at the ceiling.
   */
  function principalAxes() {
    if (!active) return null;
    const cut = h * 0.5;
    // ONE pass over the active box, accumulating raw moments; the covariance
    // falls out by subtracting the centroid's outer product afterwards. The
    // two-pass form (centroid, then covariance) is the textbook one and it cost
    // exactly twice as much for the same answer.
    let m = 0; let sx = 0; let sy = 0; let sz = 0;
    let xx = 0; let yy = 0; let zz = 0; let xy = 0; let xz = 0; let yz = 0;
    for (let k = active.k0; k <= active.k1; k++) {
      const z = WC[k];
      for (let j = active.j0; j <= active.j1; j++) {
        const y = WC[j];
        let n = idx(active.i0, j, k);
        for (let i = active.i0; i <= active.i1; i++, n++) {
          const d = dist[n];
          if (d >= cut) continue;
          const o = d <= -cut ? 1 : 0.5 - d / h;
          const x = WC[i];
          m += o; sx += o * x; sy += o * y; sz += o * z;
          xx += o * x * x; yy += o * y * y; zz += o * z * z;
          xy += o * x * y; xz += o * x * z; yz += o * y * z;
        }
      }
    }
    if (m <= 0) return null;
    const inv = 1 / m;
    const cx = sx * inv; const cy = sy * inv; const cz = sz * inv;
    const { vectors, values } = jacobiEigen3([
      [xx * inv - cx * cx, xy * inv - cx * cy, xz * inv - cx * cz],
      [xy * inv - cx * cy, yy * inv - cy * cy, yz * inv - cy * cz],
      [xz * inv - cx * cz, yz * inv - cy * cz, zz * inv - cz * cz],
    ]);
    const order = [0, 1, 2].sort((a, b) => values[b] - values[a]);
    return {
      center: [cx, cy, cz],
      mass: m * h * h * h,
      axes: order.map((o) => vectors.map((row) => row[o])),
      values: order.map((o) => values[o]),
      // The x-y block on its own — the mass as the camera projects it. This is
      // the ONLY part settlePlan is allowed to look at; see the note there.
      planeCovariance: [xx * inv - cx * cx, xy * inv - cx * cy, yy * inv - cy * cy],
    };
  }

  /**
   * The interval of x over which the body actually touches the table.
   *
   * This is the SUPPORT POLYGON, reduced to one dimension because the settle is
   * lateral-only (see settlePlan). Only material inside a thin contact band
   * above the ground counts: what is holding the creature up is the footprint
   * it stands on, not the widest point of its silhouette. A mushroom with a
   * fat cap and a thin stalk has a stalk-wide support, which is exactly why it
   * falls over and a cone does not.
   *
   * Voxels are counted at better-than-half occupancy rather than at the zero
   * crossing, so the fuzzy one-voxel shell around every surface does not report
   * a foot a voxel wider than the clay really has.
   *
   * @returns {{min:number, max:number, mass:number}|null} null when there is no
   *   table, no material, or nothing of the body is touching down.
   */
  function supportSpan() {
    if (!active || groundY === null) return null;
    const top = groundY + CONTACT_BAND_VOXELS * h;
    let min = Infinity; let max = -Infinity; let mass = 0;
    for (let j = active.j0; j <= active.j1; j++) {
      const y = WC[j];
      if (y < groundY - h || y > top) continue;
      for (let k = active.k0; k <= active.k1; k++) {
        let n = idx(active.i0, j, k);
        for (let i = active.i0; i <= active.i1; i++, n++) {
          if (dist[n] >= -h * 0.5) continue;
          const x = WC[i];
          if (x < min) min = x;
          if (x > max) max = x;
          mass += 1;
        }
      }
    }
    return mass > 0 ? { min, max, mass } : null;
  }

  /**
   * The rigid transform that would put this field at rest on the table, without
   * applying anything. The lab page animates the renderer through this pose and
   * only then calls settleRest() to bake it — see the resample-blur note there.
   *
   * BALANCE IS CENTRE OF MASS AGAINST SUPPORT, NOT SHAPE AGAINST VERTICAL.
   *
   * This used to derive the lean from the in-plane covariance: it found the long
   * axis of the silhouette and rotated that onto the horizon. That is a correct
   * answer to a question gravity never asks. Measured on the shipping build, a
   * wide three-ball body reported a 0.9-degree plan; stamping ONE ball on top of
   * it — dead centre, centre of mass moving three ten-thousandths of a world
   * unit inside a base spanning +/-0.41 — swung the plan to 89.4 degrees,
   * because the silhouette's aspect ratio had just crossed 1 and its long axis
   * flipped from horizontal to vertical. The settle then executed that: the
   * creature was knocked flat (width/height 2.05 afterwards) and slid a third of
   * a world unit sideways. That is the owner's report exactly — "it seems to
   * lean when I put something on top even though it was more stable before, and
   * that lean doesn't make physical sense." It did not make physical sense
   * because it was not physics.
   *
   * A body topples when its centre of mass passes OUTSIDE the ground it stands
   * on, and never before. So: take the COM, take the support interval, and ask
   * whether one is over the other. A creature stacked a mile high stays put as
   * long as it is stacked straight, no matter what its silhouette looks like;
   * an overhung loaf goes over even if it is short and round.
   *
   * LATERAL ONLY, still. The toy is presented face-on through an orthographic
   * camera pointed down -z, and the owner's rule follows from that: a leaning
   * creature tips left or right and that is all it ever does. It must never
   * pitch toward or away from the viewer, because a rotation about x is very
   * nearly invisible in that projection — the child sees no topple, only their
   * creature quietly changing shape — and it must never yaw about y for the
   * same reason. Posing the solve in x alone is what makes "no depth rotation"
   * structural rather than a clamp bolted on afterwards: there is no term here
   * that could have asked for one.
   *
   * @returns {{quat:number[], pivot:number[], drop:number, angle:number,
   *            balance:object|null}|null}
   */
  /**
   * THE PRE-v6 SETTLE, KEPT VERBATIM AND CALLED ONLY BY A REPLAY.
   *
   * This is the shape-based solve the balance rewrite replaced: it finds the
   * long axis of the in-plane covariance and rotates it onto the horizon. It is
   * wrong — see settlePlan() for the measurements — and it is still here because
   * a 'g' op in a v5 save was BAKED BY IT. Re-running such an op through the new
   * physics would load a child's saved creature in a different pose from the one
   * they saved, and a toy whose whole promise is that nothing you made gets
   * taken away does not get to do that.
   *
   * Nothing live ever reaches this. It runs only for ops inside the legacy
   * prefix, and every op authored from v6 on uses the real balance solve.
   */
  function legacySettlePlan() {
    const pa = principalAxes();
    if (!pa) return null;
    const [cxx, cxy, cyy] = pa.planeCovariance;
    const halfDiff = (cxx - cyy) / 2;
    const mean = (cxx + cyy) / 2;
    const spread = Math.hypot(halfDiff, cxy);
    const anisotropy = mean > 1e-12 ? spread / mean : 0;
    let angle = 0;
    if (anisotropy > 0.02) angle = -0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const quat = Math.abs(angle) > 1e-4
      ? [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]
      : [0, 0, 0, 1];
    const low = lowestMaterialY(quat, pa.center);
    const drop = groundY === null || low === null ? 0 : groundY - low;
    return { quat, pivot: pa.center, drop, angle: Math.abs(angle), balance: null, legacy: true };
  }

  function settlePlan() {
    if (replayingLegacy) return legacySettlePlan();
    const pa = principalAxes();
    if (!pa) return null;

    let angle = 0;
    let balance = null;
    const span = supportSpan();
    // No table, or nothing touching it: you cannot topple in mid-air. The drop
    // below seats the body first and the NEXT plan judges the balance, which is
    // also the order the real thing happens in.
    if (span) {
      const mid = (span.min + span.max) / 2;
      // A one-voxel foot has no half-width to divide by; floor it at a voxel so
      // the overhang ratio stays finite for a body balanced on a point.
      const half = Math.max((span.max - span.min) / 2, h);
      const comX = pa.center[0];
      const lever = pa.center[1] - groundY;
      // 0 = centred over the foot, +/-1 = right above its edge, beyond that the
      // body is past tipping. The tolerance is what stops a creature that sits
      // marginally over its own edge from twitching every settle.
      const overhang = (comX - mid) / half;
      balance = {
        comX, comY: pa.center[1], supportMin: span.min, supportMax: span.max, overhang,
        toppling: Math.abs(overhang) > 1 + TOPPLE_TOLERANCE && lever > h,
      };
      if (balance.toppling) {
        // Pivot on the edge it is going over and ask how far past that edge the
        // centre of mass has swung, as an angle seen from the contact point.
        // That angle IS the rotation that would bring the COM back over the
        // support — the smallest correction that fixes the actual problem,
        // rather than a lay-down to the horizon.
        const edge = overhang > 0 ? span.max : span.min;
        const phi = Math.atan2(comX - edge, lever);
        const drive = Math.sign(phi) * Math.max(Math.abs(phi) * TOPPLE_GAIN, TOPPLE_MIN_STEP);
        // Damped and capped: one settle takes a bite out of the imbalance, the
        // next re-measures. A body that is properly overhung therefore ROLLS
        // over across several settles — which is what falling looks like — and
        // stops the moment its COM is back inside its foot, because the very
        // next plan reports zero. Convergent by construction, so the fixed
        // point survives.
        angle = -clamp(drive, -TOPPLE_MAX_STEP, TOPPLE_MAX_STEP);
      }
    }

    // Pure +z. Written out rather than built from an axis-angle helper so that
    // "the x and y components are zero" is a fact of the source.
    const quat = Math.abs(angle) > 1e-4
      ? [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]
      : [0, 0, 0, 1];
    // Where the rotated material's lowest point would land.
    const low = lowestMaterialY(quat, pa.center);
    const drop = groundY === null || low === null ? 0 : groundY - low;
    return { quat, pivot: pa.center, drop, angle: Math.abs(angle), balance };
  }

  /**
   * One step toward gravitational rest.
   *
   * Two things happen. (1) The whole field's contents TIP SIDEWAYS — an
   * elongated loaf released standing on one end lies down along the horizon,
   * which is what clay does and which no per-primitive settle can express for a
   * welded mass. Sideways and nothing else: the rotation is about the view axis
   * only, so the creature never pitches toward or away from the child. See
   * settlePlan() for why depth is not gravity's business here. (2) The mass
   * drops until its lowest material touches the table. Both are folded into ONE
   * backward resample.
   *
   * THE RESAMPLE-BLUR TRICK. Rotating a sampled field costs a trilinear
   * resample, which blurs. Doing that once per animation frame would smear a
   * surface into pudding over a one-second settle. So a settle sequence keeps a
   * pristine snapshot from before it started and resamples THAT by the
   * accumulated total transform each time. Blur is therefore O(1) per settle
   * sequence, not O(frames) — the field is never resampled from an already
   * resampled field. Any edit (stamp or pull) drops the snapshot, and the next
   * settle takes a fresh one.
   *
   * @param {object} [options]
   * @param {number} [options.rate]   fraction of the remaining angle per call
   * @param {boolean} [options.relax] run the small "taking its set" smoothing
   */
  function settleRest(options = {}) {
    const t0 = now();
    const rate = q6(clamp(Number.isFinite(options.rate) ? options.rate : 1, 0.02, 1));
    const relax = options.relax !== false;
    if (!active) return { done: true, angle: 0, drop: 0 };

    // A settle rotates and drops EVERYTHING, so an open gesture has to capture
    // the whole grid to stay revertible. In practice a settle always runs after
    // the release that commits the gesture, so this costs nothing; it is here
    // so that "revert is bit-exact" is a property of the module rather than a
    // property of how the game happens to call it.
    if (gesture) captureBox(fullBox());

    if (!baseDist) {
      baseDist = dist.slice();
      baseColor = color.slice();
      baseBox = { ...active };
      settleQ = [0, 0, 0, 1];
      settleShift = [0, 0, 0];
      settlePivot = null;
    }

    const plan = settlePlan();
    if (!plan) { stats.lastOpMs = now() - t0; return { done: true, angle: 0, drop: 0 }; }
    if (!settlePivot) settlePivot = plan.pivot;

    // Scale this call's move by `rate`, then accumulate onto the base-relative
    // transform and resample from the pristine base — never from `dist`.
    const before = volume();
    const stepQ = slerpIdentity(plan.quat, rate);
    settleQ = quatMul(stepQ, settleQ);
    settleShift[1] += plan.drop * rate;
    resampleFromBase(settleQ, settlePivot, settleShift);
    resampleGenerations++;
    // A rigid move cannot change the amount of clay, but a trilinear resample
    // can and does (it rounds a surface a little at every voxel). Renormalise
    // to the volume the body had before the move, or a settle animation becomes
    // a slow leak.
    renormalizeRegion(active, before);

    if (relax) relaxRegion(active, 0.10, 0);

    markAll();
    stats.ops++; stats.settles++;
    stats.lastOp = 'settle';
    stats.lastOpBricks = bcount;
    stats.lastOpVoxels = boxVoxels(active);
    stats.lastOpMs = now() - t0;
    opLog.push({ t: 'g', r: rate });
    // At rest = under two thirds of a degree off level and less than a voxel
    // above the table. Tighter than that is chasing the relax's own sub-voxel
    // noise: the relax re-shapes the surface a fraction of a voxel each call,
    // so the next call's plan always finds a small new drop and a settle
    // animation would never stop.
    return { done: plan.angle <= 0.011 && Math.abs(plan.drop) <= h * 0.8, angle: plan.angle, drop: plan.drop };
  }

  /**
   * Lowest world y at which material exists, optionally under a hypothetical
   * rotation about `pivot` (so settlePlan can report the drop without moving
   * anything).
   *
   * ONLY the surface shell (-h < d <= 0) is scanned, and this is not an
   * optimisation — it is a correctness fix. Scanning every interior voxel and
   * offsetting by its own signed distance reports a point |d| below the deepest
   * voxel, which for a thick loaf is most of its radius. The settle then
   * "dropped" the body that far into the table every call, the ground cut ate
   * the difference, and the creature lost ~1.5% of its volume per settle
   * forever. Inside the shell the offset is at most one voxel and points the
   * right way.
   */
  function lowestMaterialY(quat, pivot) {
    if (!active) return null;
    const m = quat && (quat[0] || quat[1] || quat[2]) ? quatMatrix(quat) : null;
    const [px, py, pz] = pivot || [0, 0, 0];
    let lowest = Infinity;
    for (let k = active.k0; k <= active.k1; k++) {
      const z0 = WC[k];
      for (let j = active.j0; j <= active.j1; j++) {
        const y0 = WC[j];
        let n = idx(active.i0, j, k);
        for (let i = active.i0; i <= active.i1; i++, n++) {
          const d = dist[n];
          if (d > 0 || d <= -h) continue;
          let y = y0;
          if (m) {
            const x = WC[i] - px; const yy = y0 - py; const zz = z0 - pz;
            y = m[1] * x + m[4] * yy + m[7] * zz + py;
          }
          const yEdge = y + d;
          if (yEdge < lowest) lowest = yEdge;
        }
      }
    }
    return lowest === Infinity ? null : lowest;
  }

  /**
   * Rigid resample of the pristine base into `dist`/`color`. Rotation and
   * translation are FUSED into a single backward map — doing them as two passes
   * would cost two trilinear resamples and therefore twice the blur, which is
   * exactly the quality question this experiment is asked to measure.
   */
  function resampleFromBase(q, pivot, shift) {
    const m = quatMatrix(q);
    // Backward map: src = R^T (p - pivot - shift) + pivot. R is stored
    // column-major, so R^T row-major is (m0,m1,m2 / m3,m4,m5 / m6,m7,m8).
    const [px, py, pz] = pivot;
    const [sx, sy, sz] = shift;

    // Destination box = the base box's world AABB, rotated and shifted.
    const dest = transformedBox(baseBox, q, pivot, shift);
    const clear = unionBox(active, dest);
    for (let k = clear.k0; k <= clear.k1; k++) {
      for (let j = clear.j0; j <= clear.j1; j++) {
        let n = idx(clear.i0, j, k);
        for (let i = clear.i0; i <= clear.i1; i++, n++) {
          dist[n] = cpuBand;
          color[n * 3] = 0; color[n * 3 + 1] = 0; color[n * 3 + 2] = 0;
        }
      }
    }

    const tmp = [0, 0, 0];
    const colorReach = band + h;
    for (let k = dest.k0; k <= dest.k1; k++) {
      const z = WC[k] - pz - sz;
      for (let j = dest.j0; j <= dest.j1; j++) {
        const y = WC[j] - py - sy;
        let n = idx(dest.i0, j, k);
        for (let i = dest.i0; i <= dest.i1; i++, n++) {
          const x = WC[i] - px - sx;
          const ux = m[0] * x + m[1] * y + m[2] * z + px;
          const uy = m[3] * x + m[4] * y + m[5] * z + py;
          const uz = m[6] * x + m[7] * y + m[8] * z + pz;
          const d = sampleDistanceAt(ux, uy, uz, baseDist);
          dist[n] = d;
          if (d < colorReach) {
            sampleColorAt(ux, uy, uz, tmp, baseColor);
            color[n * 3] = tmp[0] | 0;
            color[n * 3 + 1] = tmp[1] | 0;
            color[n * 3 + 2] = tmp[2] | 0;
          }
        }
      }
    }
    active = { ...dest };
    if (groundY !== null) groundCut(dest);
    redistance(dest, 1);
  }

  /** World AABB of `box`, transformed, back to a padded voxel box. */
  function transformedBox(box, q, pivot, shift) {
    const m = quatMatrix(q);
    const [px, py, pz] = pivot;
    const [sx, sy, sz] = shift;
    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    for (let c = 0; c < 8; c++) {
      const x = (c & 1 ? WC[box.i1] : WC[box.i0]) - px;
      const y = (c & 2 ? WC[box.j1] : WC[box.j0]) - py;
      const z = (c & 4 ? WC[box.k1] : WC[box.k0]) - pz;
      const rx = m[0] * x + m[3] * y + m[6] * z + px + sx;
      const ry = m[1] * x + m[4] * y + m[7] * z + py + sy;
      const rz = m[2] * x + m[5] * y + m[8] * z + pz + sz;
      if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
      if (rz < minZ) minZ = rz; if (rz > maxZ) maxZ = rz;
    }
    const pad = 2 * h;
    return boxOf(minX - pad, minY - pad, minZ - pad, maxX + pad, maxY + pad, maxZ + pad);
  }

  function unionBox(a, b) {
    if (!a) return { ...b };
    return {
      i0: Math.min(a.i0, b.i0), j0: Math.min(a.j0, b.j0), k0: Math.min(a.k0, b.k0),
      i1: Math.max(a.i1, b.i1), j1: Math.max(a.j1, b.j1), k1: Math.max(a.k1, b.k1),
    };
  }

  // -------------------------------------------------------------------------
  // simplify / relax
  // -------------------------------------------------------------------------

  /**
   * Laplacian relax of the distance field (and, optionally, the colour) inside
   * the band. Because the field IS one blob, this is the entire implementation
   * of "simplify the model": there is no primitive list to merge, no welded
   * children to reconcile, no identity to collapse. Smoothing the numbers IS
   * smoothing the clay.
   *
   * Volume is renormalised afterwards, so smoothing does not shrink the
   * creature — the classic Laplacian failure where a sculpture melts away under
   * repeated passes.
   */
  function relaxRegion(box, strength = 0.2, colorStrength = strength) {
    const s = clamp(strength, 0, 0.6);
    if (s <= 0 || !box || box.i1 < box.i0) return;
    const before = regionVolume(box);
    const i0 = Math.max(1, box.i0); const i1 = Math.min(res - 2, box.i1);
    const j0 = Math.max(1, box.j0); const j1 = Math.min(res - 2, box.j1);
    const k0 = Math.max(1, box.k0); const k1 = Math.min(res - 2, box.k1);
    if (i1 < i0 || j1 < j0 || k1 < k0) return;

    const bw = i1 - i0 + 1; const bh = j1 - j0 + 1; const bd = k1 - k0 + 1;
    const outD = new Float32Array(bw * bh * bd);
    const lo = -cpuBand + h; const hi = cpuBand - h;
    for (let k = k0; k <= k1; k++) {
      for (let j = j0; j <= j1; j++) {
        let n = idx(i0, j, k);
        let m = ((k - k0) * bh + (j - j0)) * bw;
        for (let i = i0; i <= i1; i++, n++, m++) {
          const d = dist[n];
          if (d <= lo || d >= hi) { outD[m] = d; continue; }
          const avg = (dist[n - 1] + dist[n + 1] + dist[n - stride] + dist[n + stride]
            + dist[n - slab] + dist[n + slab]) / 6;
          outD[m] = d + (avg - d) * s;
        }
      }
    }
    for (let k = k0; k <= k1; k++) {
      for (let j = j0; j <= j1; j++) {
        let n = idx(i0, j, k);
        let m = ((k - k0) * bh + (j - j0)) * bw;
        for (let i = i0; i <= i1; i++, n++, m++) dist[n] = outD[m];
      }
    }

    const cs = clamp(colorStrength, 0, 0.6);
    if (cs > 0) {
      const outC = new Uint8Array(bw * bh * bd * 3);
      for (let k = k0; k <= k1; k++) {
        for (let j = j0; j <= j1; j++) {
          let n = idx(i0, j, k);
          let m = ((k - k0) * bh + (j - j0)) * bw;
          for (let i = i0; i <= i1; i++, n++, m++) {
            for (let ch = 0; ch < 3; ch++) {
              const cur = color[n * 3 + ch];
              if (dist[n] > band) { outC[m * 3 + ch] = cur; continue; }
              const avg = (color[(n - 1) * 3 + ch] + color[(n + 1) * 3 + ch]
                + color[(n - stride) * 3 + ch] + color[(n + stride) * 3 + ch]
                + color[(n - slab) * 3 + ch] + color[(n + slab) * 3 + ch]) / 6;
              outC[m * 3 + ch] = (cur + (avg - cur) * cs) | 0;
            }
          }
        }
      }
      for (let k = k0; k <= k1; k++) {
        for (let j = j0; j <= j1; j++) {
          let n = idx(i0, j, k);
          let m = ((k - k0) * bh + (j - j0)) * bw;
          for (let i = i0; i <= i1; i++, n++, m++) {
            color[n * 3] = outC[m * 3];
            color[n * 3 + 1] = outC[m * 3 + 1];
            color[n * 3 + 2] = outC[m * 3 + 2];
          }
        }
      }
    }

    if (groundY !== null) groundCut(box);
    renormalizeRegion(box, before);
    extendColor(box, 1);
  }

  function simplify(strength = 0.25) {
    const t0 = now();
    const s = q6(strength);
    if (gesture) captureBox(fullBox()); // see settleRest
    if (active) relaxRegion(active, s, s);
    markAll();
    invalidateBase();
    opLog.push({ t: 'x', s });
    stats.ops++; stats.simplifies++;
    stats.lastOp = 'simplify';
    stats.lastOpBricks = bcount;
    stats.lastOpMs = now() - t0;
    return stats.lastOpMs;
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  /** Sphere-trace the CPU field. Used for picking (where did the finger land?). */
  function raycast(originVec, dirVec, maxDist = size * 2.2) {
    const ox = originVec.x ?? originVec[0];
    const oy = originVec.y ?? originVec[1];
    const oz = originVec.z ?? originVec[2];
    let dx = dirVec.x ?? dirVec[0];
    let dy = dirVec.y ?? dirVec[1];
    let dz = dirVec.z ?? dirVec[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    let t = 0;
    const eps = h * 0.3;
    for (let i = 0; i < 512 && t < maxDist; i++) {
      const x = ox + dx * t; const y = oy + dy * t; const z = oz + dz * t;
      const d = sampleDistanceAt(x, y, z);
      if (d < eps) return { hit: true, x, y, z, t };
      t += Math.max(d * 0.85, h * 0.4);
    }
    return { hit: false, x: 0, y: 0, z: 0, t };
  }

  /** World AABB of the material, or null when the field is empty. */
  function bounds(pad = 0) {
    if (!active) return null;
    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    for (let k = active.k0; k <= active.k1; k++) {
      for (let j = active.j0; j <= active.j1; j++) {
        let n = idx(active.i0, j, k);
        for (let i = active.i0; i <= active.i1; i++, n++) {
          if (dist[n] >= 0) continue;
          const x = WC[i]; const y = WC[j]; const z = WC[k];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
      }
    }
    if (minX === Infinity) return null;
    const p = pad + h;
    return {
      minX: minX - p, minY: minY - p, minZ: minZ - p,
      maxX: maxX + p, maxY: maxY + p, maxZ: maxZ + p,
      width: maxX - minX + 2 * p, height: maxY - minY + 2 * p, depth: maxZ - minZ + 2 * p,
    };
  }

  /**
   * How the material's colour is distributed across a set of query colours, and
   * how much of it has stopped being any of them. This exists only so the tests
   * can ask the question the owner cares about — "can you still get the green
   * ball back?" — and get a number back instead of an opinion.
   *
   * A voxel counts as MIXED when its distance to the nearest query colour
   * exceeds a fifth of the closest spacing between two query colours: i.e. it
   * has drifted a fifth of the way to being a different colour. That threshold
   * is relative to the palette, so it means the same thing for a green/orange
   * pair as for two near-identical blues.
   */
  function colorCensus(queries) {
    const qs = queries.map(parseColor);
    let minSep = Infinity;
    for (let a = 0; a < qs.length; a++) {
      for (let b = a + 1; b < qs.length; b++) {
        const sep = Math.hypot(qs[a][0] - qs[b][0], qs[a][1] - qs[b][1], qs[a][2] - qs[b][2]);
        if (sep < minSep) minSep = sep;
      }
    }
    if (!Number.isFinite(minSep)) minSep = 255;
    const mixThreshold = minSep * 0.2;
    const counts = new Array(qs.length).fill(0);
    let material = 0; let mixed = 0;
    const box = activeBox();
    for (let k = box.k0; k <= box.k1; k++) {
      for (let j = box.j0; j <= box.j1; j++) {
        let n = idx(box.i0, j, k);
        for (let i = box.i0; i <= box.i1; i++, n++) {
          if (dist[n] >= 0) continue;
          material++;
          const r = color[n * 3]; const g = color[n * 3 + 1]; const b = color[n * 3 + 2];
          let best = 0; let bestD = Infinity;
          for (let q = 0; q < qs.length; q++) {
            const dr = r - qs[q][0]; const dg = g - qs[q][1]; const db = b - qs[q][2];
            const dd = dr * dr + dg * dg + db * db;
            if (dd < bestD) { bestD = dd; best = q; }
          }
          counts[best]++;
          if (Math.sqrt(bestD) > mixThreshold) mixed++;
        }
      }
    }
    return {
      material, mixed,
      mixedFraction: material ? mixed / material : 0,
      counts,
      fractions: counts.map((c) => (material ? c / material : 0)),
    };
  }

  // -------------------------------------------------------------------------
  // Dirty bricks / upload plumbing
  // -------------------------------------------------------------------------

  function dirtyBricks() {
    const out = [];
    for (let bk = 0; bk < bres; bk++) {
      for (let bj = 0; bj < bres; bj++) {
        for (let bi = 0; bi < bres; bi++) {
          if (!dirty[(bk * bres + bj) * bres + bi]) continue;
          const i0 = bi * BRICK; const j0 = bj * BRICK; const k0 = bk * BRICK;
          out.push({
            bi, bj, bk, i0, j0, k0,
            w: Math.min(BRICK, res - i0),
            h: Math.min(BRICK, res - j0),
            d: Math.min(BRICK, res - k0),
          });
        }
      }
    }
    return out;
  }

  /**
   * The single voxel box containing every dirty brick, or null when nothing is
   * dirty. Snapped to brick boundaries so the caller can reason in bricks.
   *
   * The renderer wants this, not the brick list, and the reason is a measured
   * one: uploading 64 individual 8^3 bricks through the graphics API cost 13.5
   * ms per drag frame on this machine — not because 128 KB is a lot of data (it
   * is 8 MB/s at 60 Hz, nothing) but because each sub-upload costs a texture
   * bind, three pixelStorei calls and several synchronous glGetParameter round
   * trips. The same bytes as ONE region upload cost a fraction of a millisecond.
   * A drag's dirty bricks are contiguous anyway, so the bounding box wastes
   * almost nothing.
   */
  function dirtyBox() {
    if (dirtyCount === 0) return null;
    let bi0 = bres; let bj0 = bres; let bk0 = bres;
    let bi1 = -1; let bj1 = -1; let bk1 = -1;
    for (let bk = 0; bk < bres; bk++) {
      for (let bj = 0; bj < bres; bj++) {
        for (let bi = 0; bi < bres; bi++) {
          if (!dirty[(bk * bres + bj) * bres + bi]) continue;
          if (bi < bi0) bi0 = bi; if (bi > bi1) bi1 = bi;
          if (bj < bj0) bj0 = bj; if (bj > bj1) bj1 = bj;
          if (bk < bk0) bk0 = bk; if (bk > bk1) bk1 = bk;
        }
      }
    }
    if (bi1 < 0) return null;
    const i0 = bi0 * BRICK; const j0 = bj0 * BRICK; const k0 = bk0 * BRICK;
    return {
      i0, j0, k0,
      w: Math.min((bi1 + 1) * BRICK, res) - i0,
      h: Math.min((bj1 + 1) * BRICK, res) - j0,
      d: Math.min((bk1 + 1) * BRICK, res) - k0,
      bricks: dirtyCount,
    };
  }

  function clearDirty() { dirty.fill(0); dirtyCount = 0; }

  /**
   * Pack a brick into the RGBA8 layout the 3-D texture wants: RGB = colour,
   * A = signed distance encoded over +/-BAND. ONE texture, ONE fetch, and the
   * hardware's trilinear filter blends colour and distance in the same
   * operation — which is why colour smearing costs the renderer literally
   * nothing.
   */
  function packBrick(brick, out) {
    return packBox(brick, out);
  }

  /** Same layout, for any {i0,j0,k0,w,h,d} sub-box — see dirtyBox(). */
  function packBox(brick, out) {
    const need = brick.w * brick.h * brick.d * 4;
    const buf = out && out.length >= need ? out : new Uint8Array(need);
    let m = 0;
    for (let k = 0; k < brick.d; k++) {
      for (let j = 0; j < brick.h; j++) {
        let n = idx(brick.i0, brick.j0 + j, brick.k0 + k);
        for (let i = 0; i < brick.w; i++, n++, m += 4) {
          buf[m] = color[n * 3];
          buf[m + 1] = color[n * 3 + 1];
          buf[m + 2] = color[n * 3 + 2];
          const e = clamp((dist[n] / band) * 0.5 + 0.5, 0, 1);
          buf[m + 3] = (e * 255 + 0.5) | 0;
        }
      }
    }
    return buf;
  }

  /** The whole grid in the same RGBA8 layout, for the initial texImage3D. */
  function packAll(out) {
    const buf = out && out.length >= total * 4 ? out : new Uint8Array(total * 4);
    for (let n = 0, m = 0; n < total; n++, m += 4) {
      buf[m] = color[n * 3];
      buf[m + 1] = color[n * 3 + 1];
      buf[m + 2] = color[n * 3 + 2];
      const e = clamp((dist[n] / band) * 0.5 + 0.5, 0, 1);
      buf[m + 3] = (e * 255 + 0.5) | 0;
    }
    return buf;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  const ops = () => opLog.map((o) => ({ ...o }));

  function reset() {
    dist.fill(cpuBand);
    color.fill(0);
    opLog.length = 0;
    volumeTarget = 0;
    resampleGenerations = 0;
    active = null;
    // An open gesture cannot survive the field it was capturing being thrown
    // away, and a stale capture flag would make the NEXT gesture's revert write
    // back bricks it never saved.
    if (gesture) { for (const b of gesture.bricks) captured[b] = 0; gesture = null; }
    invalidateBase();
    markAll();
    stats.ops = 0; stats.stamps = 0; stats.pulls = 0; stats.settles = 0; stats.simplifies = 0;
    stats.compressions = 0;
    // An empty field has no history, so it has no legacy prefix. replay() sets
    // the incoming document's count immediately after calling this.
    legacyOps = 0;
    replayingLegacy = false;
  }

  /** Deep copy of the raw grid — the "snapshot" arm of the save comparison. */
  function snapshot() {
    return { res, size, seed, dist: dist.slice(), color: color.slice(), ops: ops(), active: active ? { ...active } : null };
  }

  function restore(snap) {
    if (!snap || snap.res !== res) return false;
    dist.set(snap.dist);
    color.set(snap.color);
    opLog.length = 0;
    if (snap.ops) for (const o of snap.ops) opLog.push({ ...o });
    active = snap.active ? { ...snap.active } : fullBox();
    volumeTarget = volume();
    invalidateBase();
    markAll();
    return true;
  }

  /**
   * Replay an op log onto a reset field.
   *
   * With quantise-then-execute (see q6) this is byte-exact against the field
   * the log came from, for ANY inputs rather than only 6-decimal ones — which
   * is what lets a ~200-byte op log be the save format and the shelf card be
   * rasterised from a replay. Every optional field an op can carry is
   * forwarded; a replay that quietly substituted a default would be a
   * different creature wearing the same file.
   *
   * @param {Array} list
   * @param {object} [options]
   * @param {number} [options.limit] stop after this many ops (partial restore)
   */
  function replay(list, options = {}) {
    const legacyCount = Number.isFinite(options.legacyOps) ? options.legacyOps : legacyOps;
    reset();
    legacyOps = legacyCount;
    const limit = Number.isFinite(options.limit) ? options.limit : Infinity;
    let n = 0;
    for (const o of list) {
      if (n >= limit) break;
      // THE SHIM. Ops before this line were authored under the pre-v6 rules and
      // are re-run under them: no domain guard on stamps or pulls, and the old
      // shape-based settle. Everything after is today's clay. See DOC_VERSION.
      replayingLegacy = n < legacyCount;
      n += 1;
      if (o.t === 's') {
        const opts = {};
        if (o.k) opts.tag = o.k;
        if (Number.isFinite(o.n)) opts.noiseAmp = o.n;
        if (Number.isFinite(o.w)) opts.seamWobble = o.w;
        stampBall({ x: o.x, y: o.y, z: o.z }, o.r, o.c, opts);
      } else if (o.t === 'p') {
        const opts = {};
        if (o.g === 0) opts.ground = false;
        if (o.v === 0) opts.conserve = false;
        pull({ x: o.x, y: o.y, z: o.z }, { x: o.dx, y: o.dy, z: o.dz }, o.b, opts);
      } else if (o.t === 'c') {
        // Replayed LITERALLY, with the squash that ran live rather than one
        // re-derived from the field. Both would agree — the derivation reads
        // only state a replay reproduces — but logging the number is what makes
        // that a fact of the file instead of a property of the code, and it is
        // why tuning COMPRESS_GAIN later cannot reshape a saved creature.
        compress(o.x, o.z, o.r, o.s);
      } else if (o.t === 'x') simplify(o.s);
      else if (o.t === 'g') settleRest({ rate: o.r ?? 1 });
    }
    replayingLegacy = false;
    return n;
  }

  // -------------------------------------------------------------------------
  // SHIPPING ADDITION 4 — the save document
  //
  // §12.8 measured the three candidates: an op log is 194 bytes for a twelve-op
  // creature against 34,825 gzipped for the grid and 2,048,000 raw. It is also
  // the only one that survives a resolution change — a creature saved at 80^3
  // and replayed at 96^3 is simply a better-looking version of the same
  // creature — and, with quantise-then-execute, the only one that is exact.
  //
  // The GROUND rides the envelope rather than the log because it is a property
  // of the STAGE, not of the creature: it is applied before the replay so the
  // ground cut lands where it landed live, and a creature carried to a
  // differently-shaped stage keeps its own flat bottom.
  // -------------------------------------------------------------------------

  /**
   * @param {object} [extra] merged into the envelope (the game adds its own
   *   counters and its stage metadata here)
   */
  function toDocument(extra = {}) {
    const doc = {
      format: DOC_FORMAT,
      version: DOC_VERSION,
      seed,
      res,
      size: r6(size),
      ops: ops(),
    };
    if (groundY !== null) doc.ground = r6(groundY);
    // Absent means "no lid", exactly as an absent ground means "no table". That
    // is what makes this backward compatible in BOTH directions: a v5 file
    // written before ceilings existed loads with none and replays bit-exact,
    // and an older reader handed this file ignores the key and still replays it
    // bit-exact, because every op in the log was already clamped when it ran.
    if (ceiling !== null) doc.ceiling = r6(ceiling);
    // Carried forward so a creature that began life before v6 keeps replaying
    // its old ops under the old rules however many times it is re-saved. A
    // creature made today writes nothing here.
    if (legacyOps > 0) doc.legacyOps = legacyOps;
    return { ...doc, ...extra };
  }

  /**
   * Load a v5 document into THIS field. Returns false rather than throwing on
   * anything it does not recognise — a corrupt localStorage entry must lose one
   * shelf card, never the whole shelf.
   *
   * The seed cannot be changed after construction (it is baked into every
   * stamp's noise phase), so a document whose seed differs from this field's is
   * refused here; callers restoring an arbitrary save build the field with
   * `createFieldFromDocument` instead.
   */
  function fromDocument(doc) {
    if (!doc || doc.format !== DOC_FORMAT) return false;
    if (!Array.isArray(doc.ops)) return false;
    const docSeed = finiteOrNull(doc.seed);
    if (docSeed !== null && (docSeed | 0) !== seed) return false;
    setGround(finiteOrNull(doc.ground));
    setCeiling(finiteOrNull(doc.ceiling));
    replay(doc.ops, { legacyOps: legacyPrefixOf(doc) });
    return true;
  }

  // -------------------------------------------------------------------------

  return {
    // geometry
    res, size, h, origin, band, cpuBand, voxelCount: total,
    brickRes: bres, brickCount: bcount, brickSize: BRICK,
    seed,
    ground: () => groundY,
    setGround,
    ceiling: () => ceiling,
    effectiveCeiling: ceilingY,
    faceLimit,
    setCeiling,
    // raw state (tests and the renderer read these directly)
    dist, color,
    // ops
    stampBall, pull, compress, settleRest, settlePlan, supportSpan, simplify, reset,
    relax: (s) => relaxRegion(active, s, s),
    // revertible gestures
    beginGesture, commitGesture, revertGesture,
    gestureOpen: () => gesture !== null,
    // query
    volume, volumeTarget: () => volumeTarget, bounds, raycast, colorCensus,
    principalAxes, activeBox,
    sampleDistance: (x, y, z) => sampleDistanceAt(x, y, z),
    sampleColor: (x, y, z) => sampleColorAt(x, y, z),
    /**
     * The noise phases the NEXT stamp will use. The renderer draws a falling
     * tray ball as an analytic sphere wearing exactly these lumps, so the ball
     * does not change shape at the instant it welds.
     */
    nextStampPhase: () => stampPhase(seed, stats.stamps),
    // upload
    dirtyBricks, dirtyBox, clearDirty, packBrick, packBox, packAll,
    dirtyCount: () => dirtyCount,
    // persistence
    ops, replay, snapshot, restore, toDocument, fromDocument,
    opCount: () => opLog.length,
    /** How many stamps carried `tag` — the game's ball count, from the log. */
    countStamps: (tag) => opLog.reduce((n, o) => n + (o.t === 's' && (tag === undefined || o.k === tag) ? 1 : 0), 0),
    // introspection
    stats: () => ({ ...stats, dirtyBricks: dirtyCount, resampleGenerations, activeVoxels: boxVoxels(activeBox()) }),
    memory: () => {
      const baseBytes = baseDist ? baseDist.byteLength + baseColor.byteLength : 0;
      const captureBytes = captureDist ? captureDist.byteLength + captureColor.byteLength : 0;
      return {
        distBytes: dist.byteLength,
        colorBytes: color.byteLength,
        textureBytes: total * 4,
        baseBytes,
        captureBytes,
        total: dist.byteLength + color.byteLength + total * 4 + baseBytes + captureBytes,
      };
    },
  };
}

/**
 * Build a field from a v5 document, using the document's own seed and grid.
 *
 * `opts` wins over the document for `res` — replaying a saved creature at a
 * finer grid is legal and produces a better-looking version of the same
 * creature (§12.8), which is what makes the save format outlive a resolution
 * decision. Everything else comes from the file.
 *
 * @returns {object|null} the field, or null if the document is unusable
 */
export function createFieldFromDocument(doc, opts = {}) {
  if (!doc || doc.format !== DOC_FORMAT || !Array.isArray(doc.ops)) return null;
  const seed = finiteOrNull(doc.seed);
  const field = createClayField({
    seed: seed === null ? undefined : seed,
    res: opts.res || doc.res || undefined,
    size: opts.size || doc.size || undefined,
    // finiteOrNull, NOT Number.isFinite(Number(...)) — see its comment. An
    // absent ground means "no table", and reading it as a table at y = 0 cuts
    // away every creature ever saved before ground planes existed.
    ground: finiteOrNull(doc.ground),
    // Same reading, same reason: absent means the file was written before lids
    // existed, so it replays without one and comes back the shape it was saved
    // as. The game sets the live stage's lid AFTER the replay, so new work is
    // guarded without any old op being retroactively clamped.
    ceiling: finiteOrNull(doc.ceiling),
  });
  field.replay(doc.ops, { legacyOps: legacyPrefixOf(doc) });
  return field;
}

// ---------------------------------------------------------------------------
// Tiny linear algebra
// ---------------------------------------------------------------------------

function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Fraction `t` of the rotation `q`, measured from identity. */
function slerpIdentity(q, t) {
  if (t >= 1) return q.slice();
  const w = clamp(q[3], -1, 1);
  const angle = 2 * Math.acos(w);
  if (angle < 1e-6) return [0, 0, 0, 1];
  const s = Math.sqrt(Math.max(1 - w * w, 1e-12));
  const ax = q[0] / s; const ay = q[1] / s; const az = q[2] / s;
  const half = (angle * t) / 2;
  const sh = Math.sin(half);
  return [ax * sh, ay * sh, az * sh, Math.cos(half)];
}

/** Column-major 3x3 from a quaternion (m0..m2 = first column). */
function quatMatrix(q) {
  const [x, y, z, w] = q;
  const n = Math.hypot(x, y, z, w) || 1;
  const X = x / n; const Y = y / n; const Z = z / n; const W = w / n;
  return [
    1 - 2 * (Y * Y + Z * Z), 2 * (X * Y + Z * W), 2 * (X * Z - Y * W),
    2 * (X * Y - Z * W), 1 - 2 * (X * X + Z * Z), 2 * (Y * Z + X * W),
    2 * (X * Z + Y * W), 2 * (Y * Z - X * W), 1 - 2 * (X * X + Y * Y),
  ];
}

/** Jacobi eigendecomposition of a symmetric 3x3. Deterministic. */
function jacobiEigen3(input) {
  const a = [input[0].slice(), input[1].slice(), input[2].slice()];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-20) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-22) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p]; const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k]; const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p]; const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { vectors: v, values: [a[0][0], a[1][1], a[2][2]] };
}
