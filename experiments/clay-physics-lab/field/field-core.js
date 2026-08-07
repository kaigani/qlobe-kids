// field-core.js — a STORED signed-distance + colour field for clay.
//
// WHY THIS EXISTS
// The engine this experiment grew out of (shared/js/clay/lobes.js, since
// deleted — superseded by shared/js/clay/field.js) was a blended union of
// analytic primitives. The blend was beautiful and the seams were loved, but every lobe
// keeps an identity: it stays in a list, it stays draggable, and a child can
// lever a welded mass back apart because "the green ball" is still a row in an
// array. The product owner asked for the opposite — "the green clay should now
// be a part of the whole and behave accordingly, not have an atomic identity."
//
// This module is the other representation. There is exactly ONE object here: a
// 3-D grid of (signed distance, colour). A stamp writes into it. A pull moves
// its contents. After the write there is no record of what wrote it. Nothing in
// this file can answer the question "where is the green ball" because the field
// does not store balls — it stores clay.
//
// NO DEPENDENCIES. Runs unchanged in node (field-test.mjs imports it through a
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
 * A pull step may not displace material further than this fraction of the
 * brush radius. Semi-Lagrangian backward advection with a per-voxel falloff is
 * only well behaved while the warp stays close to invertible; past roughly a
 * third of the brush the map folds and the material tears. Pointer drags
 * naturally arrive as many small steps, so the cap costs nothing in feel — it
 * just means a fast flick becomes several advections instead of one bad one.
 */
export const PULL_STEP_CAP = 0.34;

const EPS = 1e-9;
const TAU = 6.283185307179586;

// ---------------------------------------------------------------------------
// Small maths helpers (no imports, remember)
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

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
function noiseWave(x, y, z, px, py, pz) {
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
const rgbHex = (rgb) => `#${((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1)}`;
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
  const groundY = opts.ground === null ? null : Number.isFinite(opts.ground) ? opts.ground : GROUND_Y;
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
    ops: 0, stamps: 0, pulls: 0, settles: 0, simplifies: 0,
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
    const cx = center.x ?? center[0] ?? 0;
    const cy = center.y ?? center[1] ?? 0;
    const cz = center.z ?? center[2] ?? 0;
    const r = Math.max(h * 2, Number(radius) || 0.3);
    const rgb = parseColor(colorInput);
    const blend = Number.isFinite(options.blend) ? options.blend : r * 0.30;
    const noiseAmp = Number.isFinite(options.noiseAmp) ? options.noiseAmp : NOISE_AMP;

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
    const seamWobble = Number.isFinite(options.seamWobble) ? options.seamWobble : SEAM_WOBBLE;
    let voxels = 0;

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

    opLog.push({ t: 's', x: r6(cx), y: r6(cy), z: r6(cz), r: r6(r), c: rgbHex(rgb) });
    stats.ops++; stats.stamps++;
    stats.lastOp = 'stamp';
    stats.lastOpVoxels = voxels;
    stats.lastOpBricks = boxBricks(box);
    stats.lastOpMs = now() - t0;
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
    const fx = from.x ?? from[0] ?? 0;
    const fy = from.y ?? from[1] ?? 0;
    const fz = from.z ?? from[2] ?? 0;
    let dx = dir.x ?? dir[0] ?? 0;
    let dy = dir.y ?? dir[1] ?? 0;
    let dz = dir.z ?? dir[2] ?? 0;
    const brush = Math.max(h * 2, Number(brushRadius) || 0.25);

    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (mag < 1e-6) return 0;
    const cap = brush * PULL_STEP_CAP;
    if (mag > cap) { const s = cap / mag; dx *= s; dy *= s; dz *= s; }
    const step = Math.sqrt(dx * dx + dy * dy + dz * dz);

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
          // Smoothstep falloff: 1 under the fingertip, 0 at the brush edge,
          // with zero derivative at both ends so moved material shears into
          // untouched material instead of stepping off a cliff.
          const s = 1 - r;
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

    opLog.push({ t: 'p', x: r6(fx), y: r6(fy), z: r6(fz), dx: r6(dx), dy: r6(dy), dz: r6(dz), b: r6(brush) });
    stats.ops++; stats.pulls++;
    stats.lastOp = 'pull';
    stats.lastOpVoxels = voxels;
    stats.lastOpBricks = boxBricks(box);
    stats.lastOpMs = now() - t0;
    return stats.lastOpMs;
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
    };
  }

  /**
   * The rigid transform that would put this field at rest on the table, without
   * applying anything. The lab page animates the renderer through this pose and
   * only then calls settleRest() to bake it — see the resample-blur note there.
   *
   * @returns {{quat:number[], pivot:number[], drop:number, angle:number}|null}
   */
  function settlePlan() {
    const pa = principalAxes();
    if (!pa) return null;
    // Shortest principal axis -> +y: an elongated loaf lies down on its belly.
    const up = pa.axes[2];
    const sign = up[1] < 0 ? -1 : 1;
    const ux = up[0] * sign; const uy = up[1] * sign; const uz = up[2] * sign;
    const ax = -uz; const ay = 0; const az = ux;   // cross(u, +y)
    const axisLen = Math.hypot(ax, ay, az);
    const angle = Math.atan2(axisLen, clamp(uy, -1, 1));
    let quat = [0, 0, 0, 1];
    if (axisLen > 1e-6 && angle > 1e-4) {
      const s = Math.sin(angle / 2) / axisLen;
      quat = [ax * s, ay * s, az * s, Math.cos(angle / 2)];
    }
    // Where the rotated material's lowest point would land.
    const low = lowestMaterialY(quat, pa.center);
    const drop = groundY === null || low === null ? 0 : groundY - low;
    return { quat, pivot: pa.center, drop, angle };
  }

  /**
   * One step toward gravitational rest.
   *
   * Two things happen. (1) The whole field's contents rotate so the shortest
   * principal axis points up — an elongated loaf released on its edge lies down
   * on its belly, which is what clay does and which no per-primitive settle can
   * express for a welded mass. (2) The mass drops until its lowest material
   * touches the table. Both are folded into ONE backward resample.
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
    const rate = clamp(Number.isFinite(options.rate) ? options.rate : 1, 0.02, 1);
    const relax = options.relax !== false;
    if (!active) return { done: true, angle: 0, drop: 0 };

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
    opLog.push({ t: 'g', r: r6(rate) });
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
    if (active) relaxRegion(active, strength, strength);
    markAll();
    invalidateBase();
    opLog.push({ t: 'x', s: r6(strength) });
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
    invalidateBase();
    markAll();
    stats.ops = 0; stats.stamps = 0; stats.pulls = 0; stats.settles = 0; stats.simplifies = 0;
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

  /** Replay an op log onto a reset field. The "ops" arm of the comparison. */
  function replay(list) {
    reset();
    for (const o of list) {
      if (o.t === 's') stampBall({ x: o.x, y: o.y, z: o.z }, o.r, o.c);
      else if (o.t === 'p') pull({ x: o.x, y: o.y, z: o.z }, { x: o.dx, y: o.dy, z: o.dz }, o.b);
      else if (o.t === 'x') simplify(o.s);
      else if (o.t === 'g') settleRest({ rate: o.r ?? 1 });
    }
  }

  // -------------------------------------------------------------------------

  return {
    // geometry
    res, size, h, origin, band, cpuBand, voxelCount: total,
    brickRes: bres, brickCount: bcount, brickSize: BRICK,
    ground: () => groundY,
    // raw state (tests and the renderer read these directly)
    dist, color,
    // ops
    stampBall, pull, settleRest, settlePlan, simplify, reset,
    relax: (s) => relaxRegion(active, s, s),
    // query
    volume, volumeTarget: () => volumeTarget, bounds, raycast, colorCensus,
    principalAxes, activeBox,
    sampleDistance: (x, y, z) => sampleDistanceAt(x, y, z),
    sampleColor: (x, y, z) => sampleColorAt(x, y, z),
    // upload
    dirtyBricks, dirtyBox, clearDirty, packBrick, packBox, packAll,
    dirtyCount: () => dirtyCount,
    // persistence
    ops, replay, snapshot, restore,
    // introspection
    stats: () => ({ ...stats, dirtyBricks: dirtyCount, resampleGenerations, activeVoxels: boxVoxels(activeBox()) }),
    memory: () => {
      const baseBytes = baseDist ? baseDist.byteLength + baseColor.byteLength : 0;
      return {
        distBytes: dist.byteLength,
        colorBytes: color.byteLength,
        textureBytes: total * 4,
        baseBytes,
        total: dist.byteLength + color.byteLength + total * 4 + baseBytes,
      };
    },
  };
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
