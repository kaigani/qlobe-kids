// spotlight.js — a soft-edged beam of light over a darkened scene, for Stage v2.
//
// The child drags a light around a dark room; things are only visible — and only
// *tappable* — where the light falls. This module owns the compositing and the
// "is that lit?" question; the game owns what lives in the light.
//
// HOW IT WORKS (and why it isn't a mask)
// A Pixi v8 mask renders the masked container into a RenderTexture sized to its
// global bounds — fullscreen — then runs a MaskFilter pass: ~+6M fragments/frame
// at dpr 2, plus a texture allocation on every resize. A custom shader would need
// both GLSL and WGSL in a repo with no build step. So neither is used.
//
// Instead the darkness is a translucent veil with a hole punched through it by
// GEOMETRY — five tinted quads:
//
//   +---------------------------------+
//   |            veilTop              |
//   +------+------------------+-------+   hole = one baked texture whose alpha
//   | veil |   hole sprite    | veil  |     ramps 0 at the centre -> 1 at the
//   | Left |  (alpha 0 -> 1)  | Right |     border, so it joins the strips
//   |      |                  |       |     invisibly
//   +------+------------------+-------+
//   |           veilBottom            |   all five share veilColor/veilAlpha
//   +---------------------------------+     -> they read as one sheet
//
// plus one additive warm glow sprite inside the hole. Moving the beam is four
// rect writes. Zero render textures, zero filters, zero masks, zero shaders. The
// four strips share Texture.WHITE and batch into a single draw call.
//
// Because the veil is *translucent*, the dark scene and the lit scene are the
// same art: the veil cools the outside, the glow warms the inside. One plate.
//
// Layer order:  z1 scene (darkened) -> z2 veil x5 -> z3 glow -> z4 above.
// The game's background plate goes UNDER .view; letters/props go in .scene;
// the flashlight and particle bursts go in .above.
//
// This module loads no assets. Both textures are baked from a 2-D canvas
// createRadialGradient (identical on the WebGL and WebGPU renderers, unlike
// Graphics gradients) and cached at module scope, shared by every instance.
//
// PERFORMANCE — READ THIS BEFORE MOUNTING A SPOTLIGHT
// The veil is fillrate work, not geometry work: it covers the whole canvas in
// alpha-blended fragments every frame. MSAA multiplies that by the sample count,
// and MSAA is the ONLY thing that costs anything here. Measured on an Intel UHD
// 630 at 2360x1366 (1180x683 CSS, dpr 2), 10 s scripted drag:
//
//   antialias: true   ->  40 fps, median 32.4 ms   (drops every other frame)
//   antialias: false  ->  60 fps, median 16.7 ms, p95 17.6 ms   at EVERY quality
//
// Halving the resolution fixes it too, but costs sharpness everywhere. So a game
// mounting a spotlight should init its Pixi Application with `antialias: false`
// and keep full resolution. Note that createStage() in stage.js hard-codes
// `antialias: true` — a game that needs the veil at 60 fps has to init its own
// Application (see spotlight.test.html, which does exactly that and exposes
// ?aa=0 / ?res=1 so the tradeoff can be re-measured on a real tablet).
// Nothing in this module depends on MSAA; the quad joins are seamless with it
// off (per pixel-centre rasterization) and on (per-sample resolve).

import { ease } from './tween.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- the ramp ---------------------------------------------------------------
// INNER/EDGE are fractions of the hole texture's HALF-size. The sprite is drawn
// at size = 2 * radius / EDGE, so the requested radius lands exactly on EDGE and
// the outer 6% of the sprite is fully opaque — that opaque border is what makes
// the join with the strips seamless. INNER is where the falloff begins.
const INNER = 0.42;
const EDGE = 0.94;

const HOLE_SIZE = { high: 512, low: 256, flat: 256 };
const GLOW_SIZE = 256;
// px the strips reach INTO the hole box. MEASURED, not assumed: any overlap at
// all composites two veilAlpha quads on top of each other (0.9 over 0.9 = 0.99),
// which draws a visible DARK hairline along all four joins — worse than the gap
// it was meant to prevent. And there is no gap to prevent: abutting quads are
// resolved per-sample under MSAA (antialias: true in stage.js) and by the
// pixel-centre fill rule without it, so neither path leaves an uncovered pixel
// at a fractional-dpr boundary. Keep this at 0; see spotlight.test.html.
const OVERLAP = 0;

const QUALITY_RANK = { flat: 0, low: 1, high: 2 };
const FLAT_VEIL_ALPHA = 0.45;
const FLAT_RADIUS_K = 0.6;   // x the larger screen edge — "ugly but playable"

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Hermite smoothstep, clamped. */
function smoothstep(a, b, t) {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Veil opacity at `u`, a distance expressed as a fraction of the hole texture's
 * half-size. 0 (clear) inside INNER, 1 (full veil) from EDGE outward.
 * The baked texture and illumination() BOTH go through this, which is what makes
 * hit-testing agree with what the child's eye sees.
 */
function veilRamp(u, inner) {
  return smoothstep(inner, EDGE, u);
}

// --- baked textures (module-level cache, shared across instances) ------------
// ~2 MB VRAM once per page for the 512² hole + 256² glow, regardless of how many
// spotlights exist. Baked lazily so importing the module costs nothing.

const holeCache = new Map();   // `${size}|${inner}` -> PIXI.Texture
const glowCache = new Map();   // size -> PIXI.Texture

/** Radial gradient with `steps` stops sampled from `fn(u) -> alpha`. */
function bakeRadial(size, fn) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    grad.addColorStop(u, `rgba(255,255,255,${fn(u).toFixed(4)})`);
  }
  // Canvas paints everything beyond the gradient's outer radius with the LAST
  // stop, so the corners outside the inscribed circle inherit it — for the hole
  // that is alpha 1, i.e. solid veil, exactly what the strips need to meet.
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function holeTexture(PIXI, size, inner) {
  const key = `${size}|${inner}`;
  let tex = holeCache.get(key);
  if (!tex) {
    tex = PIXI.Texture.from(bakeRadial(size, (u) => veilRamp(u, inner)));
    holeCache.set(key, tex);
  }
  return tex;
}

function glowTexture(PIXI, size) {
  let tex = glowCache.get(size);
  if (!tex) {
    // Falls to zero well before the veil border, so the additive pass can never
    // draw a bright ring against the strips.
    tex = PIXI.Texture.from(bakeRadial(size, (u) => Math.pow(1 - u, 2.2)));
    glowCache.set(size, tex);
  }
  return tex;
}

/**
 * Create a spotlight.
 *
 * @param {object} PIXI            the Pixi namespace (same convention as particles.js)
 * @param {object}  opts
 * @param {number}  opts.width     view width in the coordinate space you address the beam in
 * @param {number}  opts.height    view height
 * @param {number} [opts.radius=220]      beam radius — the distance at which light reaches zero
 * @param {number} [opts.veilColor=0x0a1436]
 * @param {number} [opts.veilAlpha=0.9]   how dark the unlit world is
 * @param {number} [opts.glowColor=0xffc46b]
 * @param {number} [opts.glowAlpha=0.34]  strength of the additive warm centre
 * @param {string} [opts.quality='high']  'high' | 'low' | 'flat'
 * @param {number} [opts.inner=0.42]      where falloff begins, as a fraction of the
 *                                        radius/EDGE half-size. Larger = harder edge,
 *                                        bigger fully-bright core.
 * @returns {Spotlight}
 */
export function createSpotlight(PIXI, {
  width, height, radius = 220,
  veilColor = 0x0a1436, veilAlpha = 0.9,
  glowColor = 0xffc46b, glowAlpha = 0.34,
  quality = 'high',
  inner = INNER,
} = {}) {
  let w = width;
  let h = height;
  let quality_ = quality;
  let veilColor_ = veilColor;
  let veilAlpha_ = veilAlpha;
  let glowColor_ = glowColor;
  let glowAlpha_ = glowAlpha;

  // current beam, in the same coordinate space as width/height
  const beam = { x: w / 2, y: h / 2, r: radius };

  const view = new PIXI.Container();
  const scene = new PIXI.Container();       // z1 — darkened by the veil
  const veil = new PIXI.Container();        // z2 — four strips + the hole
  const above = new PIXI.Container();       // z4 — never darkened

  const strips = ['top', 'bottom', 'left', 'right'].map(() => {
    const s = new PIXI.Sprite(PIXI.Texture.WHITE);
    veil.addChild(s);
    return s;
  });
  const [stripTop, stripBottom, stripLeft, stripRight] = strips;

  const hole = new PIXI.Sprite(holeTexture(PIXI, HOLE_SIZE[quality_], inner));
  hole.anchor.set(0.5);
  veil.addChild(hole);

  const glow = new PIXI.Sprite(glowTexture(PIXI, GLOW_SIZE));   // z3
  glow.anchor.set(0.5);
  glow.blendMode = 'add';

  view.addChild(scene, veil, glow, above);
  // The lighting layers must never eat the game's pointer events. Only the
  // lighting is opted out — scene/above stay hit-testable for the game.
  veil.eventMode = 'none';
  glow.eventMode = 'none';

  /** id -> { x, y, r, obj, lit } — flat coords, so a target is hit-testable
   *  before it has a sprite (and QA can register synthetic ones). */
  const targets = new Map();
  const changeCbs = new Set();

  // --- effective values (quality 'flat' overrides the requested ones) --------
  const effRadius = () => (quality_ === 'flat' ? Math.max(w, h) * FLAT_RADIUS_K : beam.r);
  const effVeilAlpha = () => (quality_ === 'flat' ? FLAT_VEIL_ALPHA : veilAlpha_);

  // --- compositing ----------------------------------------------------------

  function setRect(sprite, x, y, rw, rh) {
    const on = rw > 0 && rh > 0;
    sprite.visible = on;
    if (!on) return;
    sprite.position.set(x, y);
    sprite.width = rw;
    sprite.height = rh;
  }

  /** Re-place the five quads + the glow for the current beam. Four rect writes. */
  function layout() {
    const R = effRadius();
    const hs = R / EDGE;                       // half-size of the hole sprite
    const a = effVeilAlpha();

    hole.texture = holeTexture(PIXI, HOLE_SIZE[quality_], inner);
    hole.position.set(beam.x, beam.y);
    hole.width = hole.height = hs * 2;
    hole.tint = veilColor_;
    hole.alpha = a;

    glow.visible = quality_ === 'high' && glowAlpha_ > 0;
    if (glow.visible) {
      glow.position.set(beam.x, beam.y);
      glow.width = glow.height = hs * 2;
      glow.tint = glowColor_;
      glow.alpha = glowAlpha_;
    }

    // The hole box, clipped to the view. The strips fill everything outside it
    // and abut it exactly (see OVERLAP). Any of them can collapse to zero when
    // the beam runs off an edge; setRect hides those.
    const t = clamp(beam.y - hs, 0, h);
    const b = clamp(beam.y + hs, 0, h);
    const l = clamp(beam.x - hs, 0, w);
    const r = clamp(beam.x + hs, 0, w);
    const band = Math.max(0, b - t);

    setRect(stripTop, 0, 0, w, t > 0 ? t + OVERLAP : 0);
    setRect(stripBottom, 0, b - OVERLAP, w, b < h ? h - b + OVERLAP : 0);
    setRect(stripLeft, 0, t, l > 0 ? l + OVERLAP : 0, band);
    setRect(stripRight, r - OVERLAP, t, r < w ? w - r + OVERLAP : 0, band);

    for (const s of strips) { s.tint = veilColor_; s.alpha = a; }
  }

  /** Light at a point, 0 (dark) .. 1 (full beam). Mirrors the baked ramp exactly. */
  function illumination(x, y) {
    const R = effRadius();
    if (R <= 0) return 0;
    const d = Math.hypot(x - beam.x, y - beam.y);
    return 1 - veilRamp((d * EDGE) / R, inner);
  }

  /** Layout, recompute every target's litness, then notify. The one write path. */
  function sync() {
    layout();
    const R = effRadius();
    for (const t of targets.values()) {
      const d = Math.hypot(t.x - beam.x, t.y - beam.y) - t.r;   // nearest point on the target
      t.lit = R > 0 ? 1 - veilRamp((Math.max(0, d) * EDGE) / R, inner) : 0;
    }
    for (const cb of changeCbs) cb(api);
  }

  // --- animation ------------------------------------------------------------
  // Position and radius animate on independent slots, so setting the round's
  // radius never cancels a drag. A second call on the same slot cancels the
  // first, which resolves it in place (same contract as tween.js's .cancel()).
  // Reduced motion snaps, exactly like tween.js.

  const slots = { pos: null, rad: null };

  function cancelSlot(name) {
    const a = slots[name];
    if (!a) return;
    cancelAnimationFrame(a.raf);
    slots[name] = null;
    a.resolve();
  }

  function animate(name, to, ms, easing) {
    cancelSlot(name);
    if (!(ms > 0) || reduced) {
      for (const k in to) beam[k] = to[k];
      sync();
      return Promise.resolve();
    }
    const from = {};
    for (const k in to) from[k] = beam[k];
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const a = slots[name];
        if (!a || a.step !== step) return;      // cancelled by a newer call
        const p = Math.min(1, (now - start) / ms);
        const e = easing(p);
        for (const k in to) beam[k] = from[k] + (to[k] - from[k]) * e;
        sync();
        if (p >= 1) { slots[name] = null; resolve(); }
        else a.raf = requestAnimationFrame(step);
      };
      slots[name] = { step, resolve, raf: requestAnimationFrame(step) };
    });
  }

  // --- performance monitor --------------------------------------------------
  // A rolling 90-frame ring of presented-frame intervals. Sampling on rAF (not
  // app.ticker) means it still works when a game runs app.ticker.stop() and
  // renders on demand — which is the intended pattern here.

  const FRAMES = 90;
  const samples = new Float64Array(FRAMES);
  let sampleN = 0;
  let sampleLast = 0;
  let perfRaf = 0;
  let autoOpts = null;

  function meanMs() {
    const n = Math.min(sampleN, FRAMES);
    if (!n) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += samples[i];
    return sum / n;
  }

  function perfTick(now) {
    if (sampleLast) samples[sampleN++ % FRAMES] = now - sampleLast;
    sampleLast = now;
    if (autoOpts && sampleN >= FRAMES) {
      const m = meanMs();
      if (m > autoOpts.flatMs) demote('flat');
      else if (m > autoOpts.warnMs) demote('low');
    }
    perfRaf = requestAnimationFrame(perfTick);
  }

  function startPerf() {
    if (!perfRaf) { sampleLast = 0; perfRaf = requestAnimationFrame(perfTick); }
  }

  /** Demote only — never promotes back, so quality can't oscillate mid-game. */
  function demote(q) {
    if (QUALITY_RANK[q] >= QUALITY_RANK[quality_]) return;
    setQuality(q);
    sampleN = 0;                 // re-measure from scratch after the change
    sampleLast = 0;
  }

  function setQuality(q) {
    if (!(q in QUALITY_RANK) || q === quality_) return;
    quality_ = q;
    sync();
  }

  // --- public API -----------------------------------------------------------

  /** @typedef {ReturnType<typeof createSpotlight>} Spotlight */
  const api = {
    /** @type {PIXI.Container} add ONCE to the stage; owns z1..z4. */
    view,
    /** @type {PIXI.Container} z1 — letters/props here; the veil darkens them. */
    scene,
    /** @type {PIXI.Container} z4 — flashlight, bursts; never darkened. */
    above,

    /** @returns {number} beam centre x */
    get x() { return beam.x; },
    /** @returns {number} beam centre y */
    get y() { return beam.y; },
    /** @returns {number} the radius actually in force (quality 'flat' overrides it) */
    get radius() { return effRadius(); },
    /** @returns {string} 'high' | 'low' | 'flat' */
    get quality() { return quality_; },

    /**
     * Resize the lit area. Call from the stage's resize handler.
     * @param {number} nw @param {number} nh
     */
    setSize(nw, nh) { w = nw; h = nh; sync(); },

    /**
     * Move the beam. ms 0 (or reduced motion) snaps. A new call cancels any
     * in-flight move, resolving it where it stopped.
     * @param {number} x @param {number} y
     * @param {{ms?:number, easing?:(t:number)=>number}} [opts]
     * @returns {Promise<void>}
     */
    moveTo(x, y, { ms = 0, easing = ease.outCubic } = {}) {
      return animate('pos', { x, y }, ms, easing);
    },

    /**
     * Change the beam radius. Independent of moveTo — a round-start resize will
     * not interrupt a drag.
     * @param {number} r
     * @param {{ms?:number, easing?:(t:number)=>number}} [opts]
     * @returns {Promise<void>}
     */
    setRadius(r, { ms = 0, easing = ease.outCubic } = {}) {
      return animate('rad', { r: Math.max(0, r) }, ms, easing);
    },

    /**
     * Light at an arbitrary point, mirroring the baked ramp exactly.
     * @param {number} x @param {number} y @returns {number} 0..1
     */
    illumination,

    /**
     * Register a hit-testable target. Flat coords — no sprite required, so a
     * target is testable before it is drawn (and QA can register synthetic ones).
     * Re-registering the same id updates it.
     * @param {string} id
     * @param {{x:number, y:number, r?:number, obj?:any}} spec
     *        `r` is the target's own radius; litness is sampled at the point on
     *        that circle nearest the beam (r 0 = sampled at the centre).
     *        `obj` is carried for the game's convenience; never written to.
     */
    register(id, { x, y, r = 0, obj = null }) {
      targets.set(id, { x, y, r, obj, lit: 0 });
      sync();
    },

    /** @param {string} id */
    unregister(id) { if (targets.delete(id)) sync(); },

    /** Drop every target (round teardown). */
    clearTargets() { targets.clear(); sync(); },

    /**
     * How lit a registered target is, as of the last sync — the same value
     * onChange subscribers were handed.
     * @param {string} id @returns {number} 0..1 (0 if unknown)
     */
    litness(id) { const t = targets.get(id); return t ? t.lit : 0; },

    /**
     * @param {string} id @param {number} [t=0.35] threshold
     * @returns {boolean}
     */
    isLit(id, t = 0.35) { return api.litness(id) >= t; },

    /**
     * Every target at or above the threshold, brightest first.
     * @param {number} [t=0.35] @returns {string[]}
     */
    litTargets(t = 0.35) {
      return [...targets.entries()]
        .filter(([, v]) => v.lit >= t)
        .sort((a, b) => b[1].lit - a[1].lit)
        .map(([id]) => id);
    },

    /**
     * The ONLY reactive surface — fires after every move/resize/registration,
     * AFTER litness has been recomputed. Games drive letter glow from here and
     * never poll a ticker.
     * @param {(s:Spotlight)=>void} cb @returns {()=>void} disposer
     */
    onChange(cb) { changeCbs.add(cb); return () => changeCbs.delete(cb); },

    /**
     * 'high' full effect · 'low' drops the additive glow and halves the hole
     * texture to 256 · 'flat' veilAlpha 0.45 + a large fixed radius + no glow.
     *
     * Manual and unrestricted — this is the knob, autoQuality is the governor
     * (only IT refuses to promote). 'flat' is the never-fails floor: the beam
     * is wider than the view, so illumination() is high nearly everywhere and
     * every target reads as lit. That is deliberate — the "you can only tap
     * what you can see" rule degrades, but the child can still finish. A game
     * whose scoring depends on that rule should check `.quality`.
     * @param {'high'|'low'|'flat'} q
     */
    setQuality,

    /**
     * Recolour the veil live (dusk vs midnight). Extra to the core contract;
     * the test harness's sliders need it and lighting variants will too.
     * @param {{color?:number, alpha?:number}} opts
     */
    setVeil({ color, alpha } = {}) {
      if (color !== undefined) veilColor_ = color;
      if (alpha !== undefined) veilAlpha_ = alpha;
      sync();
    },

    /**
     * Recolour the additive centre. Same rationale as setVeil.
     * @param {{color?:number, alpha?:number}} opts
     */
    setGlow({ color, alpha } = {}) {
      if (color !== undefined) glowColor_ = color;
      if (alpha !== undefined) glowAlpha_ = alpha;
      sync();
    },

    /**
     * Rolling frame stats. The monitor starts on the first call (or on
     * autoQuality) and costs one empty rAF.
     * @returns {{fps:number, ms:number, quality:string, draws:number}}
     *          `ms` is the mean presented-frame interval over the last 90 frames;
     *          `draws` is the batched draw calls the spotlight's OWN layers add
     *          (the four strips batch into one) — not the whole scene's.
     */
    metrics() {
      startPerf();
      const ms = meanMs();
      const stripDraws = strips.some((s) => s.visible) ? 1 : 0;
      return {
        fps: ms > 0 ? Math.round(1000 / ms) : 0,
        ms: Math.round(ms * 100) / 100,
        quality: quality_,
        draws: stripDraws + 1 + (glow.visible ? 1 : 0),
      };
    },

    /**
     * Watch the frame rate and step the quality ladder down when the device
     * can't keep up. DEMOTES ONLY — it never promotes back, so a device that
     * briefly recovers can't oscillate between looks mid-round.
     * @param {object} [app] the Pixi Application. Accepted for symmetry with the
     *        rest of the stage API; sampling is done on rAF so this works even
     *        when a game has called app.ticker.stop() and renders on demand.
     * @param {{warnMs?:number, flatMs?:number}} [opts]
     * @returns {()=>void} disposer
     */
    autoQuality(app, { warnMs = 18, flatMs = 30 } = {}) {
      autoOpts = { warnMs, flatMs };
      sampleN = 0;
      startPerf();
      return () => { autoOpts = null; };
    },

    /** Tear down. Leaves the module-level baked textures alone — they're shared. */
    destroy() {
      cancelSlot('pos');
      cancelSlot('rad');
      if (perfRaf) { cancelAnimationFrame(perfRaf); perfRaf = 0; }
      autoOpts = null;
      changeCbs.clear();
      targets.clear();
      view.destroy({ children: true, texture: false });
    },
  };

  sync();
  return api;
}
