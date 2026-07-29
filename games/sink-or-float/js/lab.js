// lab.js — the glass jar: a Pixi stage wrapping shared/js/stage/water.js.
//
// Everything game-specific about the water lives here (jar geometry, the object
// sprites, the client↔stage coordinate bridge). water.js itself stays
// game-agnostic — it only ever sees a rectangle and circular bodies.
//
// Layer order is the whole trick that makes an object read as SUBMERGED:
//
//   jar.png  →  deep-water base  →  object sprites  →  water wash + splash
//            →  jar.png again, faint, as front glass  →  sparkles
//
// The base and the wash are the SAME body of water painted in two coats. A
// single opaque coat under the objects would leave them sitting on top of the
// water like stickers; a single translucent coat over them would have to be so
// dark to look like water at all that it turned every object to mud. Splitting
// it — a saturated coat beneath, a light wash above — gives the water its
// colour AND gives each object a wet film over it. Both coats are cut off by
// the same wavy surface line, so a floater's dry half stays dry.
//
// Colours are sampled from the plates themselves (see config theme.water) so
// the code-drawn water and the painted water in splash.webp / journal.png read
// as the same jar of water.

import { createStage } from '../../../shared/js/stage/stage.js';
import { createWater } from '../../../shared/js/stage/water.js';
import * as particles from '../../../shared/js/stage/particles.js';
import * as art from './art.js';

const hex = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const n = parseInt(value.replace('#', ''), 16);
  return Number.isFinite(n) ? n : fallback;
};
const num = (value, fallback) => (typeof value === 'number' ? value : fallback);

/** Blend two packed RGB colours; k = 0 keeps `a`, k = 1 gives `b`. */
const mix = (a, b, k) => {
  const ch = (shift) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * k) & 255;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

// Where the water lives inside jar.png (538×768), measured off the plate with
// a pixel probe rather than by eye: the glass body runs full width from y≈256
// to y≈640, the INNER faces of the walls sit at x≈54 and x≈484, the painted
// inner floor is an ellipse whose widest point is y≈630 and whose lowest point
// is y≈686. Fractions, so the numbers survive a re-export at any resolution.
const JAR_ART = {
  aspect: 538 / 768,
  // The inner faces of the glass, exactly. The water body is drawn to these and
  // its pigment is feathered out over the last few per cent (see waterWash), so
  // the wash dies away into the painted wall instead of ending on a ruled line.
  left: 0.100,
  right: 0.900,
  waterTop: 0.335,  // fill level — below the shoulder, above the label line
  floor: 0.893,     // lowest point of the painted inner floor (686/768)
  belly: 0.820,     // where that floor ellipse is at its widest (630/768)
};

/**
 * Bake a watercolour wash to fill the water with.
 *
 * A flat Graphics fill is the tell that gives a code-drawn game away: it is
 * perfectly even, and nothing else on the screen is — every plate here is
 * pigment pooling unevenly on paper. So the water gets painted the same way,
 * once, into a canvas: a top-lit vertical gradient, then a couple of dozen soft
 * blooms of neighbouring blues and teals, then a whisper of paper grain. It is
 * ~40 lines and no bytes on the wire, and it is the difference between "water
 * in a jar" and "a blue rectangle".
 */
function waterWash(w, h, top, deep, bowl = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(w));
  canvas.height = Math.max(8, Math.round(h));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const rgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const [tr, tg, tb] = rgb(top);
  const [dr, dg, db] = rgb(deep);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgb(${tr},${tg},${tb})`);
  grad.addColorStop(0.5, `rgb(${(tr + dr) >> 1},${(tg + dg) >> 1},${(tb + db) >> 1})`);
  grad.addColorStop(1, `rgb(${dr},${dg},${db})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Pigment blooms. Deterministic (no Math.random) so two jars painted at the
  // same size are identical and a resize never "re-shuffles" the water.
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) >>> 0);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 38; i += 1) {
    const cx = rnd() * W;
    const cy = rnd() * H;
    const r = (0.12 + rnd() * 0.36) * Math.max(W, H);
    // Two pigments, the way a wash actually dries: a pale sunlit pooling and a
    // colder settling. Alternating them is what keeps the water from reading as
    // one printed colour.
    // Weighted toward the cold settling pigment, and kept light-handed: blooms
    // this size at high alpha average each other out and flatten the whole
    // top-to-floor gradient back into one printed colour, which is the exact
    // failure they exist to prevent.
    const tint = rnd() < 0.42 ? [200, 234, 232] : [38, 96, 130];
    const a = 0.055 + rnd() * 0.125;
    const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    blob.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},${a})`);
    blob.addColorStop(0.62, `rgba(${tint[0]},${tint[1]},${tint[2]},${a * 0.45})`);
    blob.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},0)`);
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Light streaks. The painted jar in splash.webp has pale strokes running down
  // through the water where the sun gets in; three or four of them, drawn as
  // long soft ellipses, are what stop the wash from reading as fog.
  for (let i = 0; i < 5; i += 1) {
    const cx = (0.12 + rnd() * 0.76) * W;
    const cy = (0.1 + rnd() * 0.7) * H;
    const rx = (0.04 + rnd() * 0.07) * W;
    const ry = (0.16 + rnd() * 0.3) * H;
    const a = 0.05 + rnd() * 0.08;
    const streak = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1);
    streak.addColorStop(0, `rgba(233,248,250,${a})`);
    streak.addColorStop(1, 'rgba(233,248,250,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rnd() - 0.5) * 0.5);
    ctx.scale(rx, ry);
    ctx.fillStyle = streak;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Paper grain — the same tooth the gouache plates are painted on.
  for (let i = 0; i < Math.round(W * H * 0.0016); i += 1) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(40,90,110,0.045)';
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }

  // Baked-in specks of settled light. Static and free — the drifting motes are
  // drawn live on top (see sparkG); these are the ones that never move.
  for (let i = 0; i < 26; i += 1) {
    const r = 0.8 + rnd() * 1.9;
    ctx.fillStyle = `rgba(240,252,254,${0.1 + rnd() * 0.16})`;
    ctx.beginPath();
    ctx.arc(rnd() * W, (0.06 + rnd() * 0.9) * H, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Feather the pigment out at the walls and the base. The Graphics mask that
  // reveals this wash is a hard stencil — if the wash still had full alpha where
  // that stencil ends, the water would meet the glass on a ruled line, which is
  // the single thing that made it read as a slab. Erasing a soft ramp into the
  // texture instead means the last visible pigment is already fading.
  ctx.globalCompositeOperation = 'destination-out';
  const side = Math.max(3, W * 0.075);
  for (const dir of [0, 1]) {
    const g = ctx.createLinearGradient(dir ? W : 0, 0, dir ? W - side : side, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.92)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(dir ? W - side : 0, 0, side, H);
  }
  if (bowl > 1) {
    // The base is a shallow ellipse (the jar's painted inner floor seen in
    // perspective), so the feather has to follow that arc rather than a ruled
    // band — otherwise the deepest water, dead centre, gets erased.
    const step = Math.max(1.6, bowl * 0.09);
    for (let i = 1; i <= 6; i += 1) {
      ctx.beginPath();
      ctx.ellipse(W / 2, H - bowl, W / 2, bowl, 0, 0, Math.PI);
      ctx.lineWidth = step * i * 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.stroke();
    }
  } else {
    const foot = Math.max(6, H * 0.05);
    const gb = ctx.createLinearGradient(0, H, 0, H - foot);
    gb.addColorStop(0, 'rgba(0,0,0,0.8)');
    gb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gb;
    ctx.fillRect(0, H - foot, W, foot);
  }

  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/**
 * @param {HTMLElement} mountEl a sized element the canvas fills
 * @param {object} opts { theme, reducedMotion }
 */
export async function createLab(mountEl, opts = {}) {
  const theme = opts.theme || {};
  const tint = theme.water || {};
  const stage = await createStage(mountEl);
  const { PIXI, app } = stage;

  // Every plate the jar needs is warmed BEFORE the first frame: an object has
  // to appear the instant the child lets go of it, so nothing in the drop path
  // is allowed to be async.
  await art.preload(PIXI, [theme.jar, ...(opts.artRefs || [])]);
  const jarTex = art.isLive() ? art.texture(theme.jar) : null;

  const jarBack = new PIXI.Container();
  const bodyLayer = new PIXI.Container();
  const waterLayer = new PIXI.Container();
  const jarFront = new PIXI.Container();
  const fxLayer = new PIXI.Container();
  stage.root.addChild(jarBack, bodyLayer, waterLayer, jarFront, fxLayer);

  const backG = new PIXI.Graphics();   // code-drawn jar (placeholder mode only)
  const baseG = new PIXI.Graphics();   // live water shape — masks the wash
  const sparkG = new PIXI.Graphics();  // specks of light drifting in the water
  const surfG = new PIXI.Graphics();   // meniscus: the lit band at the water line
  const frontG = new PIXI.Graphics();  // code-drawn glass (placeholder mode only)
  // Pixi gives a mask to exactly ONE target — assigning the same Graphics to a
  // second one silently drops the first. Two clips, one shape (the jar's
  // interior), for the two things that must not spill out of the glass.
  const clipA = new PIXI.Graphics();
  const clipB = new PIXI.Graphics();
  jarBack.addChild(backG);
  // First child of the water layer: the motes hang IN the water, so the film
  // water.js paints on top of them washes over them too.
  waterLayer.addChild(sparkG);

  // jar.png twice: solid behind everything, then a whisper of it back over the
  // water so the painted rim and highlights sit in FRONT of the liquid and the
  // jar actually contains it. 0.11 alpha is the whole glass effect — any more
  // and the water goes milky, any less and the jar reads as a hole.
  const jarSprite = jarTex ? new PIXI.Sprite(jarTex) : null;
  const glassSprite = jarTex ? new PIXI.Sprite(jarTex) : null;
  if (jarSprite) {
    jarBack.addChildAt(jarSprite, 0);
    glassSprite.alpha = num(tint.glassAlpha, 0.11);
    jarFront.addChild(glassSprite);
  }
  jarFront.addChild(surfG, frontG);
  stage.root.addChild(clipA, clipB);
  waterLayer.mask = clipA;   // water.js's own wash + every splash droplet
  surfG.mask = clipB;

  let reduced = !!opts.reducedMotion;
  // How big a thing in the jar reads next to the same thing on the shelf. One
  // dial rather than 18 tuned scales, because the answer differs by MODE, not by
  // object: a single test object wants to fill the glass, eight in the
  // playground want to fit in it.
  let bodyScale = num(opts.bodyScale, 1.5);
  let geom = jarGeometry(app.screen.width, app.screen.height);

  const baseColor = hex(tint.baseColor, 0x5b9cb4);
  const baseAlpha = num(tint.baseAlpha, 0.9);
  const surfaceColor = hex(tint.surfaceColor, 0xdcf0f2);
  let washTex = null;   // the baked watercolour, rebuilt on every layout change

  const water = createWater(waterLayer, {
    PIXI,
    x: geom.water.x,
    y: geom.water.y,
    width: geom.water.w,
    height: geom.water.h,
    color: hex(tint.color, 0x8ec6d2),
    alpha: num(tint.alpha, 0.34),
    surfaceColor: hex(tint.surfaceColor, 0xdcf0f2),
    surfaceAlpha: num(tint.surfaceAlpha, 0.9),
    splashColor: hex(tint.splashColor, 0xe8f6f8),
    bubbleColor: hex(tint.bubbleColor, 0xf4fcfd),
    reducedMotion: reduced,
    maxBodies: 8,
    // The film over the objects is the same body of water as the wash beneath
    // them, so it is cut to the same jar-fitted outline.
    tracePath: (g, r, surfaceFn) => waterPath(g, r, (x) => surfaceFn(x) + waveAt(x, r)),
    // ~20°: enough tumble to feel dropped, not enough to turn a spoon into a
    // sliver on the way down.
    airRotCap: 0.35,
  });

  // The under-coat is the baked wash, shown through a mask cut to the live
  // water shape — so the painted pigment stays put in the jar while the surface
  // it is seen through ripples. (Filling a Graphics with the texture directly
  // would tie the pigment to the wave and make the water look like it was
  // sliding around inside the glass.)
  const washSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
  washSprite.alpha = baseAlpha;
  jarBack.addChild(washSprite, baseG);
  washSprite.mask = baseG;

  function rebuildWash() {
    const r = water.rect;
    const next = PIXI.Texture.from(waterWash(
      Math.round(r.w), Math.round(r.h),
      // Mixed FAR stronger than the colour we want on screen, and deliberately
      // so. This pigment is seen through three near-white coats in a row — the
      // 0.63 base alpha over the painted glass, then the film over the objects,
      // then jar.png again as front glass — which together throw away about
      // two thirds of its depth. Sample the plate's water, mix to match it, and
      // what you get is fog; these are the numbers that ARRIVE at the plate's
      // colour after the stack.
      mix(baseColor, 0xffffff, 0.02),   // sunlit, just under the surface
      mix(baseColor, 0x003350, 0.45),   // the deep end, down by the floor
      geom.bowl,
    ));
    if (washTex) washTex.destroy(true);
    washTex = next;
    washSprite.texture = washTex;
    washSprite.width = r.w;
    washSprite.height = r.h;
    washSprite.position.set(r.x, r.y);
  }

  /**
   * Trace the live water body: the wavy surface on top, straight down the inner
   * faces of the glass, then around the ellipse of the jar's painted inner
   * floor. That last arc is the whole difference between "a jar with water in
   * it" and "a rectangle parked in front of a jar" — a real base is seen in
   * perspective, so its edge is an ellipse, never a pair of corners.
   *
   * Shared by three things that must agree to the pixel: the mask that reveals
   * the baked wash, the translucent film water.js paints over the objects (it
   * gets this as its `tracePath`), and the clip that keeps splash droplets in
   * the jar. `top` lets that last one start at the neck instead of the surface.
   */
  /**
   * The painted wobble in the waterline — a fixed, hand-drawn wave laid on top
   * of whatever the physics surface is doing. The plates' waterlines are never
   * level (see journal.png), and a dead-straight one is the tell that the water
   * is a rectangle; the sim's own swell is only ±2px and stops entirely under
   * reduced motion, so it cannot carry that on its own. Normalised across the
   * jar, so it looks identical at every size, and NOT fed back into the physics:
   * buoyancy still solves against the true surface.
   */
  function waveAt(x, r) {
    const amp = Math.max(1.6, Math.min(6, r.h * 0.015));
    const u = (x - r.x) / Math.max(1, r.w);
    return amp * (0.62 * Math.sin(u * 7.4 + 0.6) + 0.38 * Math.sin(u * 13.1 + 2.2));
  }

  function waterPath(g, r, surfaceFn, top) {
    const fy = r.y + r.h;
    const bowl = Math.max(1, Math.min(geom.bowl, r.h * 0.5));
    const cols = 26;
    if (top === undefined) {
      g.moveTo(r.x, surfaceFn(r.x));
      for (let i = 1; i < cols; i += 1) {
        const x = r.x + (r.w * i) / (cols - 1);
        g.lineTo(x, surfaceFn(x));
      }
    } else {
      g.moveTo(r.x, top);
      g.lineTo(r.x + r.w, top);
    }
    g.lineTo(r.x + r.w, fy - bowl);
    const cx = r.x + r.w / 2;
    const rx = r.w / 2;
    const arc = 20;
    for (let i = 1; i <= arc; i += 1) {
      const a = (Math.PI * i) / arc;
      g.lineTo(cx + rx * Math.cos(a), (fy - bowl) + bowl * Math.sin(a));
    }
    g.closePath();
  }

  /**
   * Redrawn every frame against the SAME surface curve water.js just rendered:
   * the mask that reveals the wash, plus the meniscus — the lit band of water
   * hanging under the surface line, which is the thing your eye actually reads
   * as "this is a liquid with a top" rather than "this is a filled shape".
   */
  function drawBase() {
    const r = water.rect;
    // The wash, the film and the waterline all trace the SAME painted surface —
    // the sim's curve plus the hand-drawn wave — so they can never come apart.
    const surf = (x) => water.surfaceAt(x) + waveAt(x, r);
    baseG.clear();
    waterPath(baseG, r, surf);
    baseG.fill(0xffffff);

    // The waterline. In the journal plate it is the strongest mark in the whole
    // painting — a wavy white-blue stroke you read before you read anything
    // else — so the live one is built the same way: a lit band hanging under the
    // surface, a bright wavy stroke ON it, and a soft echo just below.
    surfG.clear();
    const band = Math.max(3, r.h * 0.034);
    const cols = 30;
    // Three strokes at three lengths, each stopping shorter than the last. That
    // is what a brush does when it lifts, and it is why the line reads as
    // painted rather than as a rule drawn across the glass.
    const run = (g, pad, dy) => {
      const x0 = r.x + r.w * pad;
      const w = r.w * (1 - pad * 2);
      g.moveTo(x0, surf(x0) + dy);
      for (let i = 1; i < cols; i += 1) {
        const x = x0 + (w * i) / (cols - 1);
        g.lineTo(x, surf(x) + dy);
      }
    };

    const pad = 0.045;
    const x0 = r.x + r.w * pad;
    const bw = r.w * (1 - pad * 2);
    run(surfG, pad, 0);
    for (let i = cols - 1; i >= 0; i -= 1) {
      const x = x0 + (bw * i) / (cols - 1);
      surfG.lineTo(x, surf(x) + band);
    }
    surfG.closePath();
    surfG.fill({ color: surfaceColor, alpha: 0.46 });

    run(surfG, pad, 0);
    surfG.stroke({
      width: Math.max(2.5, r.h * 0.013), color: 0xffffff, alpha: 0.9, cap: 'round', join: 'round',
    });
    run(surfG, 0.12, band * 0.42);
    surfG.stroke({
      width: Math.max(1.5, r.h * 0.007), color: 0xffffff, alpha: 0.34, cap: 'round', join: 'round',
    });
    run(surfG, 0.2, band * 0.95);
    surfG.stroke({
      width: Math.max(1.5, r.h * 0.006), color: 0x63b2cc, alpha: 0.42, cap: 'round', join: 'round',
    });
  }

  // ------------------------------------------------------------- light motes
  //
  // A dozen specks of light hanging in the water, drifting up at about a
  // finger's width every four seconds. Pooled into ONE Graphics — no display
  // object per speck — and frozen (drawn once, never stepped) under reduced
  // motion, where they become part of the still painting instead of animation.
  const MOTES = 14;
  const motes = [];
  for (let i = 0; i < MOTES; i += 1) {
    motes.push({ u: (i * 0.61803) % 1, v: (i * 0.32) % 1, r: 1.3 + (i % 4) * 0.75, a: 0.16 + (i % 5) * 0.05 });
  }

  function drawMotes(dt) {
    const r = water.rect;
    sparkG.clear();
    for (const m of motes) {
      if (!reduced && dt) {
        m.v -= dt * (0.012 + m.r * 0.004);
        if (m.v < 0) { m.v += 1; m.u = (m.u + 0.37) % 1; }
      }
      const x = r.x + r.w * (0.08 + m.u * 0.84);
      const y = r.y + r.h * (0.06 + m.v * 0.88);
      if (y < water.surfaceAt(x) + 6) continue;
      sparkG.circle(x, y, m.r * 2.1).fill({ color: 0xeafaff, alpha: m.a * 0.28 });
      sparkG.circle(x, y, m.r).fill({ color: 0xf6feff, alpha: m.a });
    }
  }

  /** @type {Array<{id,obj,sprite,inWater,lifted}>} */
  const items = [];
  const settleCbs = new Set();
  water.onSettle((sprite) => {
    const item = items.find((entry) => entry.sprite === sprite);
    if (!item) return;
    item.settled = true;
    settleCbs.forEach((cb) => { try { cb(item); } catch { /* never break the sim */ } });
  });

  function jarGeometry(w, h) {
    const pad = Math.max(6, Math.min(w, h) * 0.03);
    const availH = Math.max(120, h - pad * 2);
    const availW = Math.max(90, w - pad * 2);
    // The painted jar has a fixed shape: fit it, never squash it. (The code-
    // drawn placeholder jar is a rounded rect and doesn't care, but sharing one
    // path keeps the two modes laid out identically.)
    const aspect = jarTex ? JAR_ART.aspect : 0.82;
    let jarH = availH;
    let jarW = jarH * aspect;
    if (jarW > availW) { jarW = availW; jarH = jarW / aspect; }
    const x = Math.round((w - jarW) / 2);
    const y = Math.round(h - pad - jarH);
    const wall = Math.max(5, jarW * 0.038);

    const inset = jarTex
      ? JAR_ART
      : {
        left: wall / jarW,
        right: 1 - wall / jarW,
        waterTop: 0.19,
        floor: 1 - wall / jarH,
        belly: 1 - wall / jarH - 0.05,
      };
    const wx = x + jarW * inset.left;
    const ww = jarW * (inset.right - inset.left);
    const wy = Math.round(y + jarH * inset.waterTop);
    return {
      x, y, w: jarW, h: jarH, wall,
      water: { x: wx, y: wy, w: ww, h: (y + jarH * inset.floor) - wy },
      // The rise of the base ellipse: how far above the floor's lowest point the
      // painted inner floor meets the glass wall. Everything that has to sit
      // inside the jar — the wash, the film, the splash clip — curves on it.
      bowl: Math.max(2, jarH * (inset.floor - inset.belly)),
      neckTop: y + jarH * 0.12,
    };
  }

  function baseRadius() {
    return Math.max(16, geom.w * 0.115 * bodyScale);
  }

  function drawJar() {
    const { x, y, w, h, wall } = geom;

    // The interior clip: water.js's own wash and every splash droplet live
    // inside it, so nothing can spill past the jar's rounded base or rain on
    // the porch table. (The baked wash has its own, tighter mask — the live
    // water shape itself; see waterPath.)
    const wr = geom.water;
    for (const clip of [clipA, clipB]) {
      clip.clear();
      waterPath(clip, wr, null, geom.neckTop);
      clip.fill(0xffffff);
    }

    if (jarSprite) {
      for (const sprite of [jarSprite, glassSprite]) {
        sprite.width = w;
        sprite.height = h;
        sprite.position.set(x, y);
      }
      backG.clear();
      frontG.clear();
      return;
    }

    const r = Math.min(w, h) * 0.13;
    const glass = hex(tint.glass, 0xeaf6fb);

    backG.clear();
    // the jar's own body, seen through the front glass later
    backG.roundRect(x, y, w, h, r).fill({ color: glass, alpha: 0.55 });
    // a soft floor shade so a sinker has something to land on visually
    backG.roundRect(x + wall, y + h - wall * 2.6, w - wall * 2, wall * 2.2, wall)
      .fill({ color: 0xbcd8e6, alpha: 0.55 });

    frontG.clear();
    // outer glass edge + rim, drawn OVER the water so the jar contains it
    frontG.roundRect(x, y, w, h, r)
      .stroke({ width: wall, color: 0xffffff, alpha: 0.5, alignment: 0.5 });
    frontG.roundRect(x, y, w, h, r)
      .stroke({ width: Math.max(2, wall * 0.34), color: 0x7fa9c2, alpha: 0.75, alignment: 0.5 });
    frontG.roundRect(x - wall * 0.55, y - wall * 0.5, w + wall * 1.1, wall * 1.9, wall)
      .fill({ color: 0xffffff, alpha: 0.72 })
      .stroke({ width: Math.max(2, wall * 0.3), color: 0x7fa9c2, alpha: 0.6 });
    // two soft vertical streaks = "this is glass" without an art file
    frontG.roundRect(x + w * 0.13, y + h * 0.14, Math.max(4, w * 0.05), h * 0.5, w * 0.05)
      .fill({ color: 0xffffff, alpha: 0.34 });
    frontG.roundRect(x + w * 0.24, y + h * 0.18, Math.max(3, w * 0.025), h * 0.24, w * 0.03)
      .fill({ color: 0xffffff, alpha: 0.26 });
  }

  function applyLayout() {
    geom = jarGeometry(app.screen.width, app.screen.height);
    drawJar();
    water.resize({ x: geom.water.x, y: geom.water.y, width: geom.water.w, height: geom.water.h });
    rebuildWash();
    const r = baseRadius();
    for (const item of items) {
      const radius = r * (item.obj.scale || 1);
      item.radius = radius;
      sizeSprite(item.sprite, radius, item.obj);
      const body = water.bodyFor(item.sprite);
      if (body) body.radius = radius;
    }
    drawBase();
  }

  function sizeSprite(sprite, radius, obj) {
    // Placeholder chips are square cards with ~12% padding, so the drawn circle
    // and the physics circle agree on the object's edge. Real cutouts are
    // trimmed and rarely square (a spoon is 4:1), so they are fitted by their
    // LONG axis — the collider stays the circle the physics wants, and a long
    // thin thing still looks long and thin in the water.
    const real = obj && art.isRealTexture(obj.art);
    const box = radius * 2 * (real ? 1.12 : 1.16);
    const tex = sprite.texture;
    const tw = (tex && tex.width) || 1;
    const th = (tex && tex.height) || 1;
    if (tw >= th) { sprite.width = box; sprite.height = box * (th / tw); }
    else { sprite.height = box; sprite.width = box * (tw / th); }
  }

  stage.onResize(applyLayout);

  // The canvas host is MOVED between screens rather than rebuilt (a fresh
  // WebGL context per visit would exhaust the browser's context budget in one
  // sitting). Pixi's own resizeTo only listens on window, so a host that
  // changes size because it was re-parented — or because the portrait journal
  // drawer opened — needs this observer to notice.
  let ro = null;
  function refit() {
    if (!mountEl.clientWidth || !mountEl.clientHeight) return;
    app.resize();
    applyLayout();
  }
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => refit());
    ro.observe(mountEl);
  }

  app.ticker.add((ticker) => {
    const dt = (ticker.deltaMS !== undefined ? ticker.deltaMS : ticker) / 1000;
    water.update(dt);
    drawBase();
    drawMotes(Math.min(0.05, dt));
  });

  // ------------------------------------------------------------- coordinates

  function toStage(clientX, clientY) {
    const rect = app.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function toClient(stageX, stageY) {
    const rect = app.canvas.getBoundingClientRect();
    return { x: stageX + rect.left, y: stageY + rect.top };
  }

  /** Is this client point over the water (i.e. a legal place to let go)? */
  function overWater(clientX, clientY) {
    const p = toStage(clientX, clientY);
    const wr = geom.water;
    return p.x >= geom.x - geom.wall && p.x <= geom.x + geom.w + geom.wall
      && p.y >= geom.y - geom.h * 0.35 && p.y <= wr.y + wr.h;
  }

  function dropPoint(clientX, clientY) {
    const p = toStage(clientX, clientY);
    const wr = geom.water;
    return {
      x: Math.min(Math.max(p.x, wr.x + 12), wr.x + wr.w - 12),
      y: Math.min(p.y, wr.y - 8),
    };
  }

  // ------------------------------------------------------------------ items

  function count() { return items.length; }

  /**
   * Put `obj` into the jar, falling from the given client point (or from above
   * the jar's centre when no point is given). Returns the item handle, or null
   * when the jar is already at its body cap.
   */
  function addObject(obj, clientX, clientY, { vy = 0 } = {}) {
    if (items.length >= 8) return null;
    const radius = baseRadius() * (obj.scale || 1);
    const sprite = new PIXI.Sprite(art.objectTexture(PIXI, obj, theme));
    sprite.anchor.set(0.5);
    sizeSprite(sprite, radius, obj);
    // No release point (a debug drop, or a tap the caller didn't localise):
    // fan successive objects out across the jar rather than stacking them all
    // on the centre line. Under reduced motion nothing ever moves them apart
    // afterwards, so a centred default builds a totem pole.
    const wr = geom.water;
    const fan = items.length
      ? (items.length % 2 ? 1 : -1) * Math.ceil(items.length / 2) * wr.w * 0.17
      : 0;
    const spot = clientX === undefined
      ? {
        x: Math.min(Math.max(geom.x + geom.w / 2 + fan, wr.x + radius), wr.x + wr.w - radius),
        y: geom.water.y - geom.h * 0.16,
      }
      : dropPoint(clientX, clientY);
    // The release point is often the focus slot, which sits ABOVE the canvas —
    // so an unclamped spawn starts the object at a negative y and the child
    // watches a horizontal sliver of it fall past the top edge. Keep the whole
    // sprite on the canvas from frame one.
    const half = sprite.height / 2;
    sprite.position.set(spot.x, Math.max(spot.y, half + 2));
    bodyLayer.addChild(sprite);
    const item = { id: obj.id, obj, sprite, radius, settled: false, lifted: false };
    const body = water.addBody(sprite, { density: obj.density, radius, vy });
    if (!body) { sprite.destroy(); return null; }
    items.push(item);
    return item;
  }

  /** Take an item out of the simulation so a finger can carry it. */
  function lift(item) {
    if (!item || item.lifted) return;
    water.removeBody(item.sprite);
    item.lifted = true;
    item.settled = false;
    bodyLayer.setChildIndex(item.sprite, bodyLayer.children.length - 1);
    item.sprite.scale.set(item.sprite.scale.x * 1.08, item.sprite.scale.y * 1.08);
  }

  function moveLifted(item, clientX, clientY) {
    if (!item || !item.lifted) return;
    const p = toStage(clientX, clientY);
    item.sprite.position.set(p.x, p.y);
  }

  /**
   * Hand a lifted item straight back to the simulation exactly where it is.
   * This is the path for "the child touched a floating thing and let go without
   * moving it" — the object must carry on bobbing, not teleport to the surface
   * and not sit frozen outside the physics forever.
   */
  function releaseInPlace(item) {
    if (!item || !item.lifted) return false;
    sizeSprite(item.sprite, item.radius, item.obj);
    item.lifted = false;
    const wr = geom.water;
    item.sprite.position.set(
      Math.min(Math.max(item.sprite.x, wr.x + item.radius), wr.x + wr.w - item.radius),
      item.sprite.y,
    );
    water.addBody(item.sprite, { density: item.obj.density, radius: item.radius });
    return true;
  }

  /** Is this item's sprite currently anywhere inside the jar? */
  function insideJar(item) {
    if (!item) return false;
    return item.sprite.x > geom.x - geom.wall && item.sprite.x < geom.x + geom.w + geom.wall
      && item.sprite.y < geom.y + geom.h;
  }

  /** Put a lifted item back into the water; returns false if it was let go outside. */
  function dropLifted(item, clientX, clientY) {
    if (!item) return false;
    sizeSprite(item.sprite, item.radius, item.obj);
    if (!overWater(clientX, clientY)) return false;
    const spot = dropPoint(clientX, clientY);
    item.sprite.position.set(spot.x, spot.y);
    item.lifted = false;
    water.addBody(item.sprite, { density: item.obj.density, radius: item.radius, vy: 60 });
    return true;
  }

  function removeItem(item) {
    if (!item) return;
    water.removeBody(item.sprite);
    const i = items.indexOf(item);
    if (i >= 0) items.splice(i, 1);
    if (!item.sprite.destroyed) item.sprite.destroy();
  }

  function clear() {
    for (const item of items.slice()) removeItem(item);
  }

  /** Topmost item whose circle contains this client point. */
  function itemAt(clientX, clientY) {
    const p = toStage(clientX, clientY);
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const dx = p.x - item.sprite.x;
      const dy = p.y - item.sprite.y;
      if (dx * dx + dy * dy <= (item.radius * 1.2) ** 2) return item;
    }
    return null;
  }

  function celebrate(item) {
    if (reduced) return Promise.resolve();
    const at = item ? { x: item.sprite.x, y: item.sprite.y } : { x: geom.x + geom.w / 2, y: geom.water.y };
    return particles.sparkle(PIXI, fxLayer, at.x, at.y, 0xffd75e);
  }

  function confetti() {
    if (reduced) return Promise.resolve();
    return particles.burst(PIXI, fxLayer, geom.x + geom.w / 2, geom.y + geom.h * 0.3, { count: 30 });
  }

  function setReducedMotion(on) {
    reduced = !!on;
    water.setReducedMotion(reduced);
  }

  /** How big things in the jar read. Applies to what is already floating too. */
  function setBodyScale(k) {
    const next = Math.max(0.4, Math.min(2.4, Number(k) || 1));
    if (next === bodyScale) return bodyScale;
    bodyScale = next;
    applyLayout();
    return bodyScale;
  }

  return {
    stage,
    get canvas() { return app.canvas; },
    get geometry() { return { ...geom }; },
    get items() { return items.slice(); },
    count,
    addObject,
    lift,
    moveLifted,
    dropLifted,
    releaseInPlace,
    insideJar,
    removeItem,
    clear,
    itemAt,
    overWater,
    toStage,
    toClient,
    celebrate,
    confetti,
    setBodyScale,
    get bodyScale() { return bodyScale; },
    onSettle(cb) { settleCbs.add(cb); return () => settleCbs.delete(cb); },
    settleNow() {
      // A lifted item is outside the simulation, so settleNow would silently
      // skip it and leave one object hanging. Reclaim first, then settle.
      for (const item of items) if (item.lifted) releaseInPlace(item);
      water.settleNow();
      drawBase();
    },
    disturb(clientX, v) { water.disturb(toStage(clientX, 0).x, v); },
    setReducedMotion,
    relayout: applyLayout,
    refit,
    state() {
      const w = water.state();
      return {
        ...w,
        jar: { x: Math.round(geom.x), y: Math.round(geom.y), w: Math.round(geom.w), h: Math.round(geom.h) },
        items: items.map((item) => ({
          id: item.id,
          density: item.obj.density,
          truth: item.obj.truth,
          settled: item.settled,
          lifted: item.lifted,
          x: Math.round(item.sprite.x),
          y: Math.round(item.sprite.y),
        })),
      };
    },
    destroy() {
      clear();
      settleCbs.clear();
      if (ro) ro.disconnect();
      water.destroy();
      washSprite.mask = null;
      waterLayer.mask = null;
      surfG.mask = null;
      for (const g of [clipA, clipB, baseG, surfG, sparkG]) if (!g.destroyed) g.destroy();
      if (washTex) { washTex.destroy(true); washTex = null; }
      stage.destroy();
    },
  };
}
