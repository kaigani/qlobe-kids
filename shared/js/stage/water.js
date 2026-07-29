// water.js — a reusable 2D water simulation for the Stage v2 (PixiJS) kit.
//
// Game-agnostic on purpose: it knows about a rectangle of water, a spring
// surface, and circular buoyancy bodies. It knows nothing about objects,
// rounds, jars or journals — the consumer parents the body sprites wherever it
// likes (typically BEHIND this module's fill graphic, so the translucent water
// paints over a submerged object and it reads as "under water").
//
// Import rules (shared/js/engines/README.md): stage-kit only. This module
// imports nothing at all — Pixi arrives as `opts.PIXI` (or `window.PIXI`, which
// `stage.js:loadPixi()` installs), so there is no second Pixi instance and no
// network call of its own.
//
// Physics notes (the honest version, because a science game depends on it):
//   Water density is 1. A body of density d, with submerged fraction s, feels
//   a = g · (1 − s/d). So a floater (d < 1) is in equilibrium exactly when
//   s = d — an apple at 0.85 rides deep, a leaf at 0.10 sits on top — and a
//   sinker (d > 1) fully submerged feels a = g · (1 − 1/d), which is bigger for
//   denser objects, so a coin (6.0) falls faster than a seashell (2.2) without
//   anyone hard-coding a "speed". Drag turns that into a terminal velocity:
//   a quadratic term (the honest model for a bluff body in water) sets how fast
//   a sinker falls, and a linear term derived from each floater's own buoyancy
//   spring (see dampFor) brings its bob to rest in about a second whatever its
//   density or size. Every floater in the 0.10–0.95 range settles in 1.3–3.0s.
//
// Usage:
//   const water = createWater(waterLayer, { PIXI, x, y, width, height });
//   water.addBody(sprite, { density: 0.25, radius: 40 });
//   app.ticker.add((t) => water.update(t.deltaMS / 1000));

const DEFAULTS = {
  columns: 44,          // spring columns across the surface
  tension: 0.028,       // surface spring constant (per fixed step)
  damping: 0.035,       // surface velocity damping (per fixed step)
  spread: 0.09,         // neighbour propagation
  gravity: 1500,        // px / s²
  dragLinear: 0.9,      // baseline LINEAR drag while submerged (1/s)
  dragQuad: 0.005,      // QUADRATIC drag while submerged (1/px) — sets terminal speed
  bobDamp: 0.72,        // damping ratio applied to a floater's buoyancy spring
  dragLateral: 3.4,     // sideways drag while submerged (1/s)
  dragAir: 0.25,        // linear drag in air (1/s)
  buoyancyCap: 2.6,     // max upward acceleration, in g
  wallBounce: 0.3,
  floorBounce: 0.18,
  color: 0x59a9d8,      // watercolour blue
  alpha: 0.62,
  surfaceColor: 0xc6e8f8,
  surfaceAlpha: 0.92,
  surfaceWidth: 4,
  swell: 2.4,           // idle micro-swell amplitude (px)
  maxBodies: 8,
  maxParticles: 96,
  splashColor: 0xdff2fb,
  bubbleColor: 0xf2fbff,
  settleStill: 0.34,    // seconds of stillness before a body reports settled
  crossfadeMs: 420,     // reduced-motion glide-to-rest duration
  // Optional shape hook. Water is a rectangle to the physics, but the VESSEL it
  // sits in rarely is — a jar has a rounded base and glass walls the liquid has
  // to tuck inside. Rather than teach this module about jars, the consumer may
  // hand it a tracer: `(g, rect, surfaceAt) => void`, which must lay down one
  // closed path for the body of water (the surface curve included). Null keeps
  // the plain rectangle.
  tracePath: null,
  // In-air rotation guard. A body that entered the water spinning and was then
  // picked up and dropped again re-enters at whatever angle it had, and an
  // object seen edge-on mid-fall is unrecognisable. Above the surface the
  // rotation eases back inside ±airRotCap radians and the wobble is damped;
  // once submerged the full range resumes. 0 = off (the historical behaviour).
  airRotCap: 0,
  airRotEase: 6,        // 1/s — how briskly a mid-air tilt returns to the cap
  airSpinDamp: 4,       // 1/s — extra spin damping while airborne
};

const STEP = 1 / 60;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const outCubic = (t) => 1 + Math.pow(t - 1, 3);

/**
 * @param {object} container a PIXI.Container the water fill + particles live in
 * @param {object} opts see DEFAULTS, plus { PIXI, x, y, width, height, reducedMotion }
 */
export function createWater(container, opts = {}) {
  const PIXI = opts.PIXI || (typeof window !== 'undefined' ? window.PIXI : null);
  if (!PIXI) throw new Error('[water] PixiJS not loaded — pass opts.PIXI or load stage.js first');

  const cfg = { ...DEFAULTS, ...opts };
  let rect = {
    x: opts.x || 0,
    y: opts.y || 0,
    w: opts.width || 300,
    h: opts.height || 300,
  };
  let reduced = opts.reducedMotion !== undefined
    ? !!opts.reducedMotion
    : (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const n = Math.max(8, cfg.columns | 0);
  const hgt = new Float32Array(n);   // offset from the rest line, +down
  const vel = new Float32Array(n);
  const lD = new Float32Array(n);
  const rD = new Float32Array(n);

  const fill = new PIXI.Graphics();
  const fx = new PIXI.Graphics();
  container.addChild(fill);
  container.addChild(fx);

  const bodies = [];
  const settleCbs = new Set();
  const splashCbs = new Set();

  // Pooled particles: one flat array, reused forever, drawn into ONE Graphics.
  // No per-frame allocation and no per-particle display object, which is what
  // keeps eight bodies + their bubble trails inside an iPad frame budget.
  const parts = [];
  for (let i = 0; i < cfg.maxParticles; i++) {
    parts.push({ on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, r: 1, life: 0, max: 1 });
  }
  let partCursor = 0;

  let time = 0;
  let accum = 0;
  let destroyed = false;

  // ---------------------------------------------------------------- geometry

  const colX = (i) => rect.x + (rect.w * i) / (n - 1);
  const floorY = () => rect.y + rect.h;

  function swellAt(x, t) {
    if (reduced || cfg.swell <= 0) return 0;
    return cfg.swell * (0.62 * Math.sin(x * 0.013 + t * 1.25) + 0.38 * Math.sin(x * 0.023 - t * 0.83));
  }

  /** Water surface Y at a world x (includes waves + idle swell). */
  function surfaceAt(x) {
    const f = clamp(((x - rect.x) / Math.max(1, rect.w)) * (n - 1), 0, n - 1);
    const i = Math.floor(f);
    const j = Math.min(n - 1, i + 1);
    const k = f - i;
    return rect.y + hgt[i] * (1 - k) + hgt[j] * k + swellAt(x, time);
  }

  /** Surface Y ignoring waves and swell — where things come to rest. */
  const restSurface = () => rect.y;

  /**
   * A floater is a spring: displace it by dy and the extra submersion pushes
   * back with ω² = g / (2·r·d). Damping it by a fixed constant therefore has a
   * completely different effect on a leaf (stiff, ω ≈ 14) than on an apple
   * (soft, ω ≈ 4) — which is why a single `drag` number made the leaf bounce
   * for five seconds while the apple looked dead. Deriving the linear term
   * from the body's OWN spring makes every floater settle in about the same
   * time regardless of density or size. A sinker has no restoring spring, so
   * it just takes the baseline and lets quadratic drag set its terminal speed.
   */
  function dampFor(b) {
    if (!b.floats) return cfg.dragLinear;
    const omega = Math.sqrt(cfg.gravity / (2 * b.radius * b.density));
    return Math.max(cfg.dragLinear, 2 * cfg.bobDamp * omega);
  }

  function restingY(b) {
    // s = (y + r − surface) / 2r  ⇒  y = surface + r(2d − 1) for a floater.
    if (b.density < 1) return restSurface() + b.radius * (2 * b.density - 1);
    return floorY() - b.radius;
  }

  // ---------------------------------------------------------------- surface

  function stepSurface() {
    for (let i = 0; i < n; i++) {
      const a = -cfg.tension * hgt[i] - cfg.damping * vel[i];
      vel[i] += a;
      hgt[i] += vel[i];
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        if (i > 0) { lD[i] = cfg.spread * (hgt[i] - hgt[i - 1]); vel[i - 1] += lD[i]; }
        if (i < n - 1) { rD[i] = cfg.spread * (hgt[i] - hgt[i + 1]); vel[i + 1] += rD[i]; }
      }
      for (let i = 0; i < n; i++) {
        if (i > 0) hgt[i - 1] += lD[i];
        if (i < n - 1) hgt[i + 1] += rD[i];
      }
    }
  }

  /**
   * Poke the surface at world x with impact speed v (px/s). Positive v pushes
   * the surface down (something landing); negative lifts it.
   */
  function disturb(x, v) {
    if (reduced) return;
    const peak = clamp(v * 0.004, -3.2, 3.2);
    if (!peak) return;
    const f = clamp(((x - rect.x) / Math.max(1, rect.w)) * (n - 1), 0, n - 1);
    const c = Math.round(f);
    for (let d = -3; d <= 3; d++) {
      const i = c + d;
      if (i < 0 || i >= n) continue;
      vel[i] += peak * (1 - Math.abs(d) / 4);
    }
  }

  // -------------------------------------------------------------- particles

  function spawnParticle(kind, x, y, vx, vy, r, life) {
    if (reduced) return;
    let p = null;
    for (let i = 0; i < parts.length; i++) {
      const c = parts[(partCursor + i) % parts.length];
      if (!c.on) { p = c; partCursor = (partCursor + i + 1) % parts.length; break; }
    }
    if (!p) { p = parts[partCursor]; partCursor = (partCursor + 1) % parts.length; }
    p.on = true; p.kind = kind;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.r = r; p.life = life; p.max = life;
  }

  function stepParticles(dt) {
    for (const p of parts) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (p.kind === 0) {            // droplet: ballistic, dies at the surface
        p.vy += cfg.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vy > 0 && p.y > surfaceAt(p.x)) { p.on = false; disturb(p.x, p.vy * 0.25); }
      } else {                        // bubble: rises, pops at the surface
        p.vy += -260 * dt;
        p.vx += Math.sin((time + p.max) * 6) * 12 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < surfaceAt(p.x)) { p.on = false; disturb(p.x, -30); }
      }
    }
  }

  function splash(x, y, impact) {
    disturb(x, impact);
    const count = clamp(Math.round(impact / 90), 2, 12);
    for (let i = 0; i < count; i++) {
      const dir = i % 2 ? 1 : -1;
      const spread = 40 + Math.random() * 150;
      spawnParticle(
        0, x + dir * (4 + Math.random() * 10), y,
        dir * spread, -(120 + Math.random() * clamp(impact * 0.5, 90, 420)),
        2 + Math.random() * 3, 0.5 + Math.random() * 0.5,
      );
    }
    splashCbs.forEach((cb) => { try { cb(x, y, impact); } catch { /* never break the sim */ } });
  }

  // ------------------------------------------------------------------ bodies

  /**
   * Track `sprite` as a buoyancy body. The sprite keeps its own parent — this
   * module only writes sprite.x / sprite.y / sprite.rotation (and alpha in
   * reduced-motion mode).
   */
  function addBody(sprite, { density = 1, radius = 30, vx = 0, vy = 0, x, y } = {}) {
    if (!sprite || destroyed) return null;
    if (bodies.length >= cfg.maxBodies) return null;
    const b = {
      sprite,
      density: Math.max(0.01, density),
      radius: Math.max(2, radius),
      x: x !== undefined ? x : sprite.x,
      y: y !== undefined ? y : sprite.y,
      vx, vy,
      rot: sprite.rotation || 0,
      spin: 0,
      phase: Math.random() * Math.PI * 2,
      submerged: 0,
      wet: false,
      still: 0,
      settled: false,
      bubbleAt: 0,
      cf: null,
    };
    b.floats = b.density < 1;
    if (reduced) {
      b.cf = { t: 0, x0: b.x, y0: b.y, x1: clamp(b.x, rect.x + b.radius, rect.x + rect.w - b.radius), y1: restingY(b) };
    }
    bodies.push(b);
    sprite.x = b.x;
    sprite.y = b.y;
    return b;
  }

  function removeBody(sprite) {
    const i = bodies.findIndex((b) => b.sprite === sprite);
    if (i >= 0) bodies.splice(i, 1);
    return i >= 0;
  }

  function markSettled(b) {
    if (b.settled) return;
    b.settled = true;
    const info = {
      floats: b.floats,
      density: b.density,
      submerged: b.submerged,
      x: b.x,
      y: b.y,
      restY: restingY(b),
    };
    settleCbs.forEach((cb) => { try { cb(b.sprite, info); } catch { /* never break the sim */ } });
  }

  function stepBody(b, dt) {
    const live = b.sprite && !b.sprite.destroyed;
    if (b.cf) {                                   // reduced motion: glide to rest
      b.cf.t += dt;
      const k = clamp(b.cf.t / (cfg.crossfadeMs / 1000), 0, 1);
      const e = outCubic(k);
      b.x = b.cf.x0 + (b.cf.x1 - b.cf.x0) * e;
      b.y = b.cf.y0 + (b.cf.y1 - b.cf.y0) * e;
      b.vx = 0; b.vy = 0;
      if (live) b.sprite.alpha = 1 - 0.45 * Math.sin(k * Math.PI);
      b.submerged = b.floats ? b.density : 1;
      if (k >= 1) { b.cf = null; b.wet = true; if (live) b.sprite.alpha = 1; markSettled(b); }
      return;
    }
    // Reduced motion: once a body is at rest it stays exactly at rest. No bob,
    // no wobble, no drift — the resting pose is the whole animation.
    if (reduced && b.settled) { b.vx = 0; b.vy = 0; return; }

    const surf = surfaceAt(b.x);
    const sub = clamp((b.y + b.radius - surf) / (2 * b.radius), 0, 1);
    b.submerged = sub;

    if (!b.wet && sub > 0.02) {
      b.wet = true;
      if (b.vy > 40) splash(b.x, surf, b.vy);
      b.spin += (Math.random() - 0.5) * 1.2;
    }

    // Buoyancy, capped. Uncapped, a leaf (d = 0.10) fully dunked feels 9g
    // upward and trampolines out of the jar for five seconds before it settles
    // — honest to the formula, useless to a five-year-old waiting for an
    // answer. The cap only bites during the entry transient; equilibrium
    // (s = d) is untouched, so the taught fact is still exactly right.
    let a = cfg.gravity * (1 - sub / b.density);
    if (a < 0) a = Math.max(a, -cfg.gravity * cfg.buoyancyCap);
    // Linear + quadratic drag. The linear term is what brings a bob to rest;
    // the quadratic term is what makes sink speed spread SENSIBLY across the
    // density range. With linear drag alone, terminal speed is proportional to
    // (1 − 1/d), so a coin falls 6.4x faster than an egg: either the egg takes
    // ten seconds or the coin is a blur. Quadratic drag makes it sqrt of that
    // ratio — egg ≈ 150 px/s, coin ≈ 440 px/s — which is also the more honest
    // model for a bluff body in water.
    if (sub > 0) {
      // recomputed per step, not cached: a consumer may resize a body's radius
      // on layout change, and a stale damping constant is invisible until a
      // rotated tablet starts bouncing its floaters.
      const lin = dampFor(b) * (0.35 + 0.65 * sub);
      const quad = cfg.dragQuad * sub;
      a -= b.vy * (lin + quad * Math.abs(b.vy));
    } else {
      a -= b.vy * cfg.dragAir;
    }
    b.vy += a * dt;
    b.vx -= b.vx * (sub > 0 ? cfg.dragLateral : cfg.dragAir) * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // walls
    const lo = rect.x + b.radius;
    const hi = rect.x + rect.w - b.radius;
    if (b.x < lo) { b.x = lo; b.vx = Math.abs(b.vx) * cfg.wallBounce; }
    else if (b.x > hi) { b.x = hi; b.vx = -Math.abs(b.vx) * cfg.wallBounce; }

    // floor — soft landing
    const fl = floorY() - b.radius;
    if (b.y > fl) {
      b.y = fl;
      if (b.vy > 0) b.vy = -b.vy * cfg.floorBounce;
      if (Math.abs(b.vy) < 26) b.vy = 0;
      b.spin *= 0.7;
    }

    // bubble trail while a sinker descends
    if (!b.floats && sub > 0.85 && b.vy > 35) {
      b.bubbleAt -= dt;
      if (b.bubbleAt <= 0) {
        b.bubbleAt = 0.09;
        spawnParticle(1, b.x + (Math.random() - 0.5) * b.radius, b.y - b.radius * 0.3,
          (Math.random() - 0.5) * 20, -30 - Math.random() * 40,
          2 + Math.random() * 2.5, 0.9 + Math.random() * 0.6);
      }
    }

    // gentle rotation wobble
    b.rot += b.spin * dt;
    b.spin -= b.spin * 2.2 * dt;
    if (sub > 0.05 && !reduced) b.rot += Math.sin(time * 1.35 + b.phase) * 0.16 * dt;
    b.rot *= 0.999;
    // Airborne: ease back toward level so the thing falling is still readable
    // as itself. Eased, not snapped — a hard clamp reads as a glitch.
    if (cfg.airRotCap > 0 && sub <= 0.02) {
      const cap = cfg.airRotCap;
      const want = clamp(b.rot, -cap, cap);
      b.rot += (want - b.rot) * clamp(cfg.airRotEase * dt, 0, 1);
      b.spin -= b.spin * clamp(cfg.airSpinDamp * dt, 0, 1);
    }

    // moving water nudges a floater sideways a little (surface slope)
    if (b.floats && sub > 0.05 && !reduced) {
      const slope = (surfaceAt(b.x + 6) - surfaceAt(b.x - 6)) / 12;
      b.vx -= slope * 90 * dt * cfg.gravity * 0.001;
    }

    const still = Math.abs(b.vy) < 7 && Math.abs(b.vx) < 7 && sub > 0.02;
    b.still = still ? b.still + dt : 0;
    if (!b.settled && b.still > cfg.settleStill) markSettled(b);
  }

  function separate() {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a.cf) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b.cf) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        a.vx -= nx * 12; b.vx += nx * 12;
        a.still = 0; b.still = 0;
        keepInside(a); keepInside(b);
      }
    }
  }

  /**
   * Shove a body back inside the water body's walls and floor.
   *
   * stepBody already does this every step, so during normal play a separation
   * overshoot is corrected on the next frame and nobody sees it. Under reduced
   * motion there IS no next step — a settled body is frozen by design — so a
   * pile-up (drop several things on the same spot) pushed bodies out through
   * the glass and left them there, sitting on the table. The top is bounded
   * loosely: a light floater legitimately rides most of its own diameter above
   * the surface, and clamping to the waterline would sink it.
   */
  function keepInside(b) {
    b.x = clamp(b.x, rect.x + b.radius, rect.x + rect.w - b.radius);
    b.y = clamp(b.y, rect.y - b.radius * 2.4, floorY() - b.radius);
  }

  // ------------------------------------------------------------------ render

  function draw() {
    if (destroyed) return;
    const fy = floorY();
    fill.clear();
    if (typeof cfg.tracePath === 'function') {
      cfg.tracePath(fill, { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, surfaceAt);
    } else {
      fill.moveTo(rect.x, fy);
      for (let i = 0; i < n; i++) fill.lineTo(colX(i), surfaceAt(colX(i)));
      fill.lineTo(rect.x + rect.w, fy);
      fill.closePath();
    }
    fill.fill({ color: cfg.color, alpha: cfg.alpha });

    fill.moveTo(rect.x, surfaceAt(rect.x));
    for (let i = 1; i < n; i++) fill.lineTo(colX(i), surfaceAt(colX(i)));
    fill.stroke({ width: cfg.surfaceWidth, color: cfg.surfaceColor, alpha: cfg.surfaceAlpha, cap: 'round', join: 'round' });

    fx.clear();
    if (reduced) return;
    for (const p of parts) {
      if (!p.on) continue;
      const k = clamp(p.life / p.max, 0, 1);
      if (p.kind === 0) {
        fx.circle(p.x, p.y, p.r).fill({ color: cfg.splashColor, alpha: 0.15 + 0.75 * k });
      } else {
        fx.circle(p.x, p.y, p.r).stroke({ width: 1.5, color: cfg.bubbleColor, alpha: 0.2 + 0.6 * k });
      }
    }
  }

  function syncSprites() {
    for (const b of bodies) {
      if (!b.sprite || b.sprite.destroyed) continue;
      b.sprite.x = b.x;
      b.sprite.y = b.y;
      b.sprite.rotation = b.rot;
    }
  }

  // ------------------------------------------------------------------- API

  function update(dt) {
    if (destroyed) return;
    const d = clamp(Number(dt) || 0, 0, 0.05);
    time += d;
    accum += d;
    // Fixed timestep, always. A "catch-up" variable step for short frames was
    // tried and removed: it advanced bodies by `d` AND then again by the whole
    // accumulated STEP on the next frame, so a 120Hz display ran the physics
    // ~1.5x fast and floaters overshot their equilibrium. On a fast display the
    // sim simply steps every other frame, which is what a fixed step is for.
    let steps = 0;
    while (accum >= STEP && steps < 4) {
      accum -= STEP;
      steps++;
      if (!reduced) stepSurface();
      for (const b of bodies) stepBody(b, STEP);
      if (bodies.length > 1) separate();
      stepParticles(STEP);
    }
    if (steps === 4) accum = 0;   // long stall (tab switch): drop the backlog
    syncSprites();
    draw();
  }

  function settleNow() {
    hgt.fill(0); vel.fill(0);
    for (const p of parts) p.on = false;
    for (const b of bodies) {
      b.cf = null;
      b.x = clamp(b.x, rect.x + b.radius, rect.x + rect.w - b.radius);
      b.y = restingY(b);
      b.vx = 0; b.vy = 0; b.spin = 0; b.rot = 0;
      b.wet = true;
      b.submerged = b.floats ? b.density : 1;
      if (b.sprite && !b.sprite.destroyed) b.sprite.alpha = 1;
      markSettled(b);
    }
    syncSprites();
    draw();
  }

  function setReducedMotion(on) {
    const next = !!on;
    if (next === reduced) return reduced;
    reduced = next;
    if (reduced) settleNow();
    return reduced;
  }

  function resize(next = {}) {
    rect = {
      x: next.x !== undefined ? next.x : rect.x,
      y: next.y !== undefined ? next.y : rect.y,
      w: next.width !== undefined ? next.width : rect.w,
      h: next.height !== undefined ? next.height : rect.h,
    };
    for (const b of bodies) {
      b.x = clamp(b.x, rect.x + b.radius, rect.x + rect.w - b.radius);
      if (b.settled) b.y = restingY(b);
      else b.y = clamp(b.y, rect.y - rect.h, floorY() - b.radius);
    }
    syncSprites();
    draw();
    return { ...rect };
  }

  /** Serializable snapshot for QA / debug hooks. */
  function state() {
    const surface = [];
    for (let i = 0; i < n; i++) surface.push(Math.round((surfaceAt(colX(i)) - rect.y) * 100) / 100);
    return {
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) },
      reducedMotion: reduced,
      // `calm` means "the disturbance has died down", measured on the SPRING
      // columns only. Measuring the rendered surface instead would fold in the
      // idle micro-swell, which never stops, so calm would read false forever
      // and a QA gate written against it could never pass.
      calm: hgt.every((v) => Math.abs(v) < 0.6),
      columns: n,
      surface,
      particles: parts.reduce((sum, p) => sum + (p.on ? 1 : 0), 0),
      bodies: bodies.map((b) => ({
        density: b.density,
        radius: Math.round(b.radius),
        x: Math.round(b.x),
        y: Math.round(b.y),
        vy: Math.round(b.vy),
        submerged: Math.round(b.submerged * 1000) / 1000,
        floats: b.floats,
        settled: b.settled,
      })),
    };
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    bodies.length = 0;
    settleCbs.clear();
    splashCbs.clear();
    for (const p of parts) p.on = false;
    if (!fill.destroyed) fill.destroy();
    if (!fx.destroyed) fx.destroy();
  }

  draw();

  return {
    addBody,
    removeBody,
    disturb,
    update,
    onSettle(cb) { settleCbs.add(cb); return () => settleCbs.delete(cb); },
    onSplash(cb) { splashCbs.add(cb); return () => splashCbs.delete(cb); },
    setReducedMotion,
    settleNow,
    destroy,
    // extras (the API above is the floor, per the engines README)
    resize,
    state,
    surfaceAt,
    restingY,
    get rect() { return { ...rect }; },
    get bodyCount() { return bodies.length; },
    get reducedMotion() { return reduced; },
    bodyFor(sprite) { return bodies.find((b) => b.sprite === sprite) || null; },
    fillLayer: fill,
    fxLayer: fx,
  };
}
