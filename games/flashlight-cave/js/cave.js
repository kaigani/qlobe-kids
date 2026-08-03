// cave.js — the play field's substrate: the Pixi bootstrap, the ONE art↔screen
// transform, the render pump, the font gate, and the jittered letter lattice.
//
// Everything the game authors — letter positions, beam centre, beam radius, hit
// circles, the picture-mode ledge — is written in ART SPACE (config.art.space,
// 1600 × 1200). One cover-fit transform maps art space to the screen
// (game-design.md §4.2), and it is applied ONCE, to the container that holds the
// plate and the spotlight. So the spotlight itself is created at art size and
// every coordinate that crosses a module boundary is art space. A resize
// recomputes the transform and nothing else.
//
// THREE THINGS HERE ARE NOT OBVIOUS AND ARE LOAD-BEARING:
//
// 1. `antialias: false`. This game does NOT call stage.js:createStage(), which
//    hard-codes `antialias: true`. MSAA is the entire cost of the veil — measured
//    on an Intel UHD 630 at 1180×683 CSS / dpr 2, a 10 s scripted drag runs at
//    40 fps median 32.4 ms with MSAA and 60 fps median 16.7 ms without it, at
//    every quality (see the header of shared/js/stage/spotlight.js). Nothing in
//    spotlight.js depends on MSAA: the five quads join seamlessly either way.
//    Everything else here mirrors createStage exactly, including the dpr-2 cap.
//
// 2. The render pump (§4.1). The Pixi ticker is stopped and frames are requested,
//    so an idle reveal screen costs zero GPU. But shared/js/stage/tween.js and
//    shared/js/stage/particles.js each run their OWN requestAnimationFrame loop
//    and never call app.render() — they mutate display-object properties and
//    assume something else is drawing. With the ticker stopped, an untracked
//    tween therefore runs to completion invisibly. `track()` wraps every animation
//    so the pump keeps drawing for exactly as long as something is moving.
//
// 3. The visible-art clamp. Cover-fit on a 4:3 plate crops the sides hard in
//    portrait: at 834 × 1194 only art x ∈ [381, 1219] is on screen, which is
//    inside the authored playable band x ∈ [220, 1380]. So the lattice is chosen
//    against the *visible* band, not the authored one. See chooseGrid().

import { loadPixi } from '../../../shared/js/stage/stage.js';
import { createSpotlight } from '../../../shared/js/stage/spotlight.js';
import { shuffle } from '../../../shared/js/rng.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** '#0a1436' → 0x0a1436. Numbers pass through. */
export function hex(v, fallback = 0x000000) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v[0] === '#') return parseInt(v.slice(1), 16);
  return fallback;
}

// ---------------------------------------------------------------------------
// The transform (§4.2). Pure maths, no Pixi — the no-WebGL fallback screen
// (§3.5) uses the very same object to position its DOM letters, which is why it
// is a free function rather than a method on the cave.
// ---------------------------------------------------------------------------

/**
 * @param {{w:number,h:number}} space authored art size
 * @returns {object} cover-fit transform; call update(w,h) on every resize.
 */
export function createTransform(space) {
  let viewW = 1;
  let viewH = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  const t = {
    space,
    get scale() { return scale; },
    get offsetX() { return offsetX; },
    get offsetY() { return offsetY; },
    get viewW() { return viewW; },
    get viewH() { return viewH; },

    update(w, h) {
      viewW = Math.max(1, w);
      viewH = Math.max(1, h);
      scale = Math.max(viewW / space.w, viewH / space.h);
      offsetX = (viewW - space.w * scale) / 2;
      offsetY = (viewH - space.h * scale) / 2;
      return t;
    },

    toScreen(x, y) { return { x: x * scale + offsetX, y: y * scale + offsetY }; },
    toArt(x, y) { return { x: (x - offsetX) / scale, y: (y - offsetY) / scale }; },
    toScreenLen(n) { return n * scale; },
    toArtLen(n) { return n / scale; },

    /** The slice of art space actually on screen, in art coords. */
    visibleArt() {
      return {
        x0: clamp(-offsetX / scale, 0, space.w),
        y0: clamp(-offsetY / scale, 0, space.h),
        x1: clamp((viewW - offsetX) / scale, 0, space.w),
        y1: clamp((viewH - offsetY) / scale, 0, space.h),
      };
    },
  };
  return t.update(window.innerWidth, window.innerHeight);
}

// ---------------------------------------------------------------------------
// Letter placement (§4.3) — a jittered lattice, not free random. Free random
// overlaps a pair about one round in six.
// ---------------------------------------------------------------------------

/**
 * The band letters may occupy: the authored playable band, intersected with the
 * part of art space the viewport actually shows, inset so a whole letter fits.
 */
export function safeBand(config, transform) {
  const band = config.layout.playableBand;
  const cap = config.layout.letterCapHeight || 170;
  // Horizontal inset is the WIDE case, not the average one: W and M draw about
  // 0.75 × cap either side of their centre, so an inset of cap/2 (or even of the
  // 110 hit radius) leaves them clipped by the viewport edge — which portrait
  // cover-fit hits every round, because it crops art x to [381, 1219].
  const insetX = Math.max(config.layout.hitRadius || 110, cap * 0.8);
  const insetY = Math.max(config.layout.hitRadius || 110, cap * 0.62);
  const v = transform.visibleArt();
  // §4.3 reserves the HUD as art-space bands (top 0–260, bottom 1000–1200), and
  // that only works on a 4:3 viewport. Cover-fit on 1180 × 820 puts art y 1000
  // at 705 css with only 115 css px of screen below it — not enough for the
  // 148 px centre-bottom play button, which then lands on the bottom row of
  // letters. The HUD is screen-space furniture, so its reserve is measured in
  // screen px and converted, not authored in art px.
  const hud = config.layout.hudReserveCss || { top: 125, bottom: 235 };
  const resTop = transform.toArtLen(hud.top) + cap * 0.62;
  const resBottom = transform.toArtLen(hud.bottom) + cap * 0.62;
  const x0 = Math.max(band.x[0], v.x0 + insetX);
  const x1 = Math.min(band.x[1], v.x1 - insetX);
  const y0 = Math.max(band.y[0], v.y0 + insetY, v.y0 + resTop);
  const y1 = Math.min(band.y[1], v.y1 - insetY, v.y1 - resBottom);
  // A viewport so extreme that the band inverts still has to yield something
  // playable — fall back to the centre of whatever is visible.
  if (x1 <= x0 || y1 <= y0) {
    const cx = (v.x0 + v.x1) / 2;
    const cy = (v.y0 + v.y1) / 2;
    const hw = Math.max(40, (v.x1 - v.x0) / 2 - insetX);
    const hh = Math.max(40, (v.y1 - v.y0) / 2 - insetY);
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
  }
  return { x0, x1, y0, y1 };
}

/**
 * Where the picture-mode prompt object sits (§3.2). It is authored at art y 190
 * — above `playableBand` and inside §4.3's top HUD reserve — which reads fine on
 * a 4:3 viewport but is cropped clean off the top by cover-fit on a wide, short
 * window. Letters get exactly this treatment from safeBand(); the ledge was the
 * one element that never went through an equivalent, so it walked off screen.
 *
 * Clamped against what the viewport actually shows, clear of the HUD furniture,
 * and re-evaluated on resize — never against the authored band, because the
 * ledge is a prompt and deliberately sits ABOVE where the letters hide.
 */
export function ledgeSpot(config, transform) {
  const led = config.pictureLedge || { x: 800, y: 190, heightArt: 280 };
  const half = (led.heightArt || 280) / 2;
  const hud = config.layout.hudReserveCss || { top: 125, bottom: 235 };
  const v = transform.visibleArt();
  const x0 = v.x0 + half;
  const x1 = v.x1 - half;
  const y0 = v.y0 + transform.toArtLen(hud.top) + half;
  const y1 = v.y1 - transform.toArtLen(hud.bottom) - half;
  return {
    x: x1 > x0 ? clamp(led.x, x0, x1) : (v.x0 + v.x1) / 2,
    y: y1 > y0 ? clamp(led.y, y0, y1) : (v.y0 + v.y1) / 2,
    height: led.heightArt,
  };
}

/** The rect the beam centre is clamped to: authored clamp ∩ visible, ∪ the band. */
export function beamClampRect(config, transform) {
  const c = config.layout.beamClamp;
  const v = transform.visibleArt();
  const band = safeBand(config, transform);
  return {
    x0: Math.min(Math.max(c.x[0], v.x0), band.x0),
    x1: Math.max(Math.min(c.x[1], v.x1), band.x1),
    y0: Math.min(Math.max(c.y[0], v.y0), band.y0),
    y1: Math.max(Math.min(c.y[1], v.y1), band.y1),
  };
}

/**
 * The lattice cells — the alcoves a letter can nest in. `config.nests` (the
 * authored 4 × 2) is used whenever every nest falls inside the safe band, which
 * is every landscape viewport. Portrait cover-fit crops the outer columns off
 * screen entirely, so there a grid that fits the band is derived instead, chosen
 * to maximise the smallest gap between neighbours.
 */
export function chooseGrid(band, config, need) {
  // The authored alcoves: config.nests, one per lattice cell. (They are exactly
  // layout.columns × layout.rows, which is the fallback if a config drops them.)
  const nests = (config.nests && config.nests.length)
    ? config.nests.map((n) => ({ x: n.x, y: n.y, id: n.id }))
    : config.layout.rows.flatMap((y) => config.layout.columns.map((x) => ({ x, y })));
  if (nests.every((c) => c.x >= band.x0 && c.x <= band.x1 && c.y >= band.y0 && c.y <= band.y1)) {
    return nests;
  }

  const w = band.x1 - band.x0;
  const h = band.y1 - band.y0;
  const want = Math.max(need, 6);
  let best = null;
  for (const [nc, nr] of [[4, 2], [3, 3], [2, 4], [3, 2], [2, 3], [2, 2], [1, 6]]) {
    if (nc * nr < want) continue;
    const gap = Math.min(nc > 1 ? w / (nc - 1) : Infinity, nr > 1 ? h / (nr - 1) : Infinity);
    if (!best || gap > best.gap) best = { nc, nr, gap };
  }
  if (!best) best = { nc: 2, nr: 3 };
  const cells = [];
  for (let r = 0; r < best.nr; r++) {
    for (let c = 0; c < best.nc; c++) {
      cells.push({
        x: best.nc === 1 ? (band.x0 + band.x1) / 2 : band.x0 + (w * c) / (best.nc - 1),
        y: best.nr === 1 ? (band.y0 + band.y1) / 2 : band.y0 + (h * r) / (best.nr - 1),
      });
    }
  }
  return cells;
}

/**
 * Pick `n` positions in art space.
 * @param {number} n how many letters this round wants
 * @param {() => number} rng seeded by QLOBE_DEBUG.seed(), so a run is reproducible
 * @returns {{x:number,y:number}[]}
 */
export function layoutLetters(n, rng, config, transform) {
  const L = config.layout;
  const band = safeBand(config, transform);
  const cells = chooseGrid(band, config, n);
  const jx = L.cellJitter?.x ?? 45;
  const jy = L.cellJitter?.y ?? 55;
  const minSep = L.minSeparation ?? 235;
  const tries = L.maxJitterAttempts ?? 12;

  const pickCells = () => shuffle(cells, rng).slice(0, Math.min(n, cells.length));

  const chosen = pickCells();
  const fit = (p) => ({
    x: clamp(p.x, band.x0, band.x1),
    y: clamp(p.y, band.y0, band.y1),
  });

  for (let attempt = 0; attempt < tries; attempt++) {
    const pts = chosen.map((c) => fit({
      x: c.x + (rng() * 2 - 1) * jx,
      y: c.y + (rng() * 2 - 1) * jy,
    }));
    let ok = true;
    for (let i = 0; ok && i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < minSep) { ok = false; break; }
      }
    }
    if (ok) return pts;
  }
  // 13th attempt: un-jittered cell centres, which are always the furthest apart
  // this grid can put them.
  return chosen.map(fit);
}

// ---------------------------------------------------------------------------
// Reveal-object sprites — the white-box fix
//
// shared/assets/objects/ USED to be a mixed bag: 69 of the 78 reveal sprites
// this game uses were indexed PNGs with a tRNS alpha, and 9 (cat, dog, hat,
// jam, jet, nut, pig, van, yak) were truecolour RGB with NO alpha channel at
// all, compositing onto the dark cave as a hard white rectangle. Stage 6
// (see ASSETS.md "Shared-asset repair") re-exported 7 of those 9 with real
// alpha via qwen-image-layered and shipped them into shared/assets/objects/
// directly (approved shared/ edit, logged there) — dog, hat, jam, jet, nut,
// pig, and yak now carry real alpha same as the other 69.
//
// TWO STILL DON'T: cat and van exhausted the full 3-seed retry ladder
// (42/1337/9001) and never produced a usable cutout — cat came back
// near-blank every time (alpha maxing out at 2-3/255) and van came back as
// an unrelated small dark blob, not a redraw of the van at all. Both ship
// unmodified, truecolour RGB, no alpha — so this flood-fill fallback stays
// in place for exactly those two. It is self-detecting (see the corner check
// below), so it costs nothing on sprites that already have alpha. As of the
// cat/van re-export it does no work at all on the current library — all 78
// letter-object sprites now carry real alpha. It is kept as a safety net,
// not as dead code: raw art gets dropped into this repo opaque fairly often,
// and a white box on a dark background is a silent, ugly failure.
//
// The fix: flood-fill the near-white background inwards from the border and
// knock it out. A flood fill, not a threshold — the whale's belly and the
// yak's horns are near-white too, and a plain threshold would eat holes in
// the middle of the art. Interior whites are never reached from the border.
// Sprites that already carry alpha are returned untouched.
// ---------------------------------------------------------------------------

const WHITE_MIN = 228;      // a pixel this bright on every channel is background
const objectImages = new Map();

/** @returns {HTMLCanvasElement|HTMLImageElement} the source to make a texture from */
export function keyWhiteBackground(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return img;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  let d;
  try { d = ctx.getImageData(0, 0, w, h); } catch { return img; }
  const p = d.data;
  const bg = (i) => p[i] >= WHITE_MIN && p[i + 1] >= WHITE_MIN && p[i + 2] >= WHITE_MIN && p[i + 3] > 8;
  // Already authored with a transparent border? Leave it exactly as it is.
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  if (!corners.every((i) => p[i + 3] > 250 && bg(i))) return img;

  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const k = y * w + x;
    if (seen[k]) return;
    seen[k] = 1;
    if (bg(k * 4)) stack.push(k);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const k = stack.pop();
    p[k * 4 + 3] = 0;
    const x = k % w;
    const y = (k - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  // One feather pass: the anti-aliased rim the fill could not reach is still
  // white-ish, and a hard cut leaves a bright halo on a dark background.
  const out = new Uint8ClampedArray(p);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (p[k * 4 + 3] === 0) continue;
      const open = (x > 0 && p[(k - 1) * 4 + 3] === 0)
        || (x < w - 1 && p[(k + 1) * 4 + 3] === 0)
        || (y > 0 && p[(k - w) * 4 + 3] === 0)
        || (y < h - 1 && p[(k + w) * 4 + 3] === 0);
      if (open) out[k * 4 + 3] = 96;
    }
  }
  d.data.set(out);
  ctx.putImageData(d, 0, 0);
  return c;
}

/** Load a shared object sprite, keyed. Cached per URL; never rejects. */
export function loadObjectImage(url) {
  if (!url) return Promise.resolve(null);
  if (objectImages.has(url)) return objectImages.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = async () => {
      // decode() BEFORE the caller builds a texture from this node. An <img>
      // that has fired onload may still be undecoded, and Pixi cannot upload an
      // undecoded image — it silently defers to some later frame. This game
      // renders on demand (app.ticker is stopped), so "some later frame" may
      // never come: in picture mode nothing moves until the child first touches
      // the screen, and the prompt object stayed invisible until they did.
      // The keyed path never hit this because ctx.drawImage() forces a decode;
      // only sprites that already carry alpha pass straight through as an <img>.
      try { if (img.decode) await img.decode(); } catch { /* fall through */ }
      try { resolve(keyWhiteBackground(img)); } catch { resolve(img); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  objectImages.set(url, p);
  return p;
}

/** The same source as a data URL, for the no-WebGL screen's plain `<img>`s. */
export async function objectImageSrc(url) {
  const node = await loadObjectImage(url);
  if (!node) return url;
  return node.toDataURL ? node.toDataURL('image/png') : node.src;
}

// ---------------------------------------------------------------------------
// The cave itself
// ---------------------------------------------------------------------------

/** Bake the Text atlas only once the real font is resolvable (§4.4's trap). */
export async function ensureFont(spec = '600 120px Fredoka') {
  if (!document.fonts || !document.fonts.load) return false;
  try {
    await Promise.race([
      document.fonts.load(spec),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch { /* a missing font is a look bug, never a crash */ }
  return document.fonts.check ? document.fonts.check(spec) : false;
}

/**
 * Boot the play field. Rejects when WebGL is unavailable — main.js catches that
 * and mounts the static screen of §3.5.
 *
 * @param {HTMLElement} host the `.fc-stage` div
 * @param {object} config config.json
 * @param {{onContextLost?: () => void}} [hooks]
 */
export async function createCave(host, config, { onContextLost } = {}) {
  const space = config.art?.space || { w: 1600, h: 1200 };
  const PIXI = await loadPixi();

  const app = new PIXI.Application();
  try {
    // NOTE the two deliberate omissions from createStage's option set:
    //   autoStart: false — the pump below is the only thing that draws.
    //   no `resizeTo` yet — Pixi's ResizePlugin renders a frame from its own rAF
    //     as soon as it is attached, and it does so DURING init(). On a renderer
    //     that initialises but cannot actually draw that throws before any of our
    //     code runs. Attach it after the sanity render below has proved the
    //     renderer works.
    await app.init({
      width: host.clientWidth || window.innerWidth,
      height: host.clientHeight || window.innerHeight,
      backgroundAlpha: 0,
      antialias: false,                                 // ← see the header
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      autoStart: false,
    });
    app.ticker.stop();
    // A renderer can init and still be unable to draw (a refused or already-lost
    // context). One render now turns that into the honest §3.5 static screen
    // instead of a black canvas the child stares at.
    if (typeof app.render === 'function') app.render();
    host.appendChild(app.canvas);
    app.resizeTo = host;
  } catch (err) {
    try { app.destroy(true, { children: true, texture: false }); } catch { /* ignore */ }
    throw err;
  }
  app.canvas.style.touchAction = 'none';
  app.canvas.style.display = 'block';

  await ensureFont(`600 120px ${config.fontFamily || 'Fredoka'}`);

  // --- the render pump (§4.1) ----------------------------------------------
  let needsRender = false;
  let activeAnimations = 0;
  let pumpRaf = 0;
  let destroyed = false;

  function frame() {
    pumpRaf = 0;
    if (destroyed) return;
    const draw = needsRender || activeAnimations > 0;
    needsRender = false;
    if (draw) {
      if (typeof app.render === 'function') app.render();
      else app.renderer.render({ container: app.stage });
    }
    if (activeAnimations > 0 || needsRender) pumpRaf = requestAnimationFrame(frame);
  }
  function requestRender() {
    if (destroyed) return;
    needsRender = true;
    if (!pumpRaf) pumpRaf = requestAnimationFrame(frame);
  }
  /** Keep drawing for exactly as long as `p` is running. */
  function track(p) {
    activeAnimations += 1;
    requestRender();
    const done = () => {
      activeAnimations -= 1;
      requestRender();
    };
    return Promise.resolve(p).then(
      (v) => { done(); return v; },
      (e) => { done(); throw e; },
    );
  }

  // --- the scene graph (§4.1's layer stack) --------------------------------
  const transform = createTransform(space);
  const artRoot = new PIXI.Container();          // everything below is art space
  app.stage.addChild(artRoot);

  const spotlight = createSpotlight(PIXI, {
    width: space.w,
    height: space.h,
    radius: config.rounds?.[0]?.radius ?? 230,
    veilColor: hex(config.spotlight?.veilColor, 0x0a1436),
    veilAlpha: config.spotlight?.veilAlpha ?? 0.9,
    glowColor: hex(config.spotlight?.glowColor, 0xffc46b),
    glowAlpha: config.spotlight?.glowAlpha ?? 0.34,
    inner: 0.55,     // §6.3 — the illumination numbers are stated for 0.55
  });

  // z0 plate, under the veil. Evenly lit art; all darkness is the runtime layer.
  const plate = new PIXI.Sprite(PIXI.Texture.EMPTY);
  plate.width = space.w;
  plate.height = space.h;
  artRoot.addChild(plate, spotlight.view);

  // The flashlight rides the beam. Decoration — never a control (§6.1).
  const torch = new PIXI.Sprite(PIXI.Texture.EMPTY);
  torch.anchor.set(0.5);
  torch.eventMode = 'none';
  torch.visible = false;
  spotlight.above.addChild(torch);

  function applyTransform() {
    transform.update(app.screen.width, app.screen.height);
    artRoot.scale.set(transform.scale);
    artRoot.position.set(transform.offsetX, transform.offsetY);
  }
  applyTransform();

  // --- the flashlight's ride ------------------------------------------------
  let lastBeam = { x: spotlight.x, y: spotlight.y };
  let torchAngle = 0;
  function placeTorch() {
    if (!torch.texture || torch.texture === PIXI.Texture.EMPTY) return;
    const R = spotlight.radius;
    // Decoration, not a control (§6.1) — sized so it explains where the light
    // comes from without becoming the thing the child looks at. Capped, because
    // the reveal widens the beam to 1.9 R and the end screen to 1400.
    const h = Math.min(R * 0.62, space.h * 0.12);
    const k = h / (torch.texture.height || 1);
    // The torch normally rides to the RIGHT of and below the beam, so it has to
    // point up-LEFT — back into the light it is casting. The source art points
    // up-RIGHT (barrel lower-left, lens upper-right), so the DEFAULT case is the
    // mirrored one; only near the right edge, where the torch swings over to the
    // beam's left instead, does it use the art as drawn. This pairing was
    // inverted and the lamp faced away from its own beam (caught on iPad).
    const leftOfBeam = spotlight.x > space.w * 0.72;
    const facing = leftOfBeam ? 1 : -1;   // +1 = art as drawn (points right)
    torch.scale.set(facing * k, k);
    torch.position.set(spotlight.x + (leftOfBeam ? -0.78 : 0.78) * R, spotlight.y + 0.62 * R);
    const dx = spotlight.x - lastBeam.x;
    const dy = spotlight.y - lastBeam.y;
    const speed = Math.hypot(dx, dy);
    if (speed > 0.6) {
      const want = clamp(Math.atan2(dy, dx) * 0.22, -0.314, 0.314);   // ±18°
      torchAngle += (want - torchAngle) * 0.25;
    } else {
      torchAngle *= 0.9;
    }
    torch.rotation = facing * torchAngle;
    torch.visible = true;
    lastBeam = { x: spotlight.x, y: spotlight.y };
  }

  spotlight.onChange(() => { placeTorch(); requestRender(); });

  // --- resize ---------------------------------------------------------------
  const resizeCbs = new Set();
  const onResize = () => {
    applyTransform();
    requestRender();
    for (const cb of resizeCbs) { try { cb(); } catch { /* never break resize */ } }
  };
  app.renderer.on('resize', onResize);

  // §3.6 / §4.1: createStage installs a visibilitychange handler that restarts
  // the ticker. This game does not use createStage, but it installs its own
  // handler anyway — belt and braces, and it is where the one catch-up render
  // belongs.
  const onVisible = () => {
    if (document.hidden) return;
    app.ticker.stop();
    requestRender();
    for (const cb of visibleCbs) { try { cb(); } catch { /* ignore */ } }
  };
  const visibleCbs = new Set();
  document.addEventListener('visibilitychange', onVisible);

  const onLost = (e) => {
    e.preventDefault();
    if (onContextLost) onContextLost();
  };
  app.canvas.addEventListener('webglcontextlost', onLost);

  // --- texture loading (document-relative, per §12.1) -----------------------
  async function loadTexture(url) {
    if (!url) return null;
    try {
      const tex = await PIXI.Assets.load(url);
      requestRender();
      return tex;
    } catch {
      return null;                   // a missing plate is a look bug, not a crash
    }
  }

  /**
   * A shared reveal/ledge object sprite. NOT PIXI.Assets.load: these go through
   * keyWhiteBackground() first (see the note above), so they are built from a
   * canvas rather than fetched by the asset loader.
   */
  const objectTextures = new Map();
  function loadObjectTexture(url) {
    if (!url) return Promise.resolve(null);
    if (objectTextures.has(url)) return objectTextures.get(url);
    const p = loadObjectImage(url).then((src) => {
      if (!src || destroyed) return null;
      const tex = PIXI.Texture.from(src);
      // Several renders, deliberately: the first frame that draws a sprite using
      // this texture performs the GPU upload and draws before the pixels are
      // resident, so at least one more frame must follow. An on-demand renderer
      // gets no free repaints, so schedule them. Caller-side animation (see
      // game.js showLedge) is the primary guarantee; this is the safety net for
      // any caller that draws an object into an otherwise-still scene.
      requestRender();
      let n = 0;
      const settle = () => {
        if (destroyed || n++ > 2) return;
        requestRender();
        requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
      return tex;
    }).catch(() => null);
    objectTextures.set(url, p);
    return p;
  }

  const plateTex = await loadTexture(config.art?.play);
  if (plateTex) {
    plate.texture = plateTex;
    plate.width = space.w;
    plate.height = space.h;
  }
  loadTexture(config.art?.flashlight).then((tex) => {
    if (!tex || destroyed) return;
    torch.texture = tex;
    placeTorch();
    requestRender();
  });

  requestRender();

  return {
    PIXI,
    app,
    space,
    transform,
    spotlight,
    scene: spotlight.scene,
    above: spotlight.above,
    requestRender,
    track,
    loadTexture,
    loadObjectTexture,

    /** Art-space band letters may occupy right now. */
    band: () => safeBand(config, transform),
    /** Art-space rect the beam centre is clamped to right now. */
    clampRect: () => beamClampRect(config, transform),
    /** Art-space spot the picture-mode ledge object sits at right now. */
    ledgeSpot: () => ledgeSpot(config, transform),
    /**
     * The flashlight's art position and facing. `facesRight` is which way the
     * lamp points after mirroring; the invariant a gate can assert is that it
     * always points back toward the beam it is casting.
     */
    torchState: () => (torch.visible
      ? { x: torch.x, y: torch.y, facesRight: torch.scale.x > 0, beamX: spotlight.x, beamY: spotlight.y }
      : null),
    /** N jittered lattice positions in art space. */
    layout: (n, rng) => layoutLetters(n, rng, config, transform),

    onResize(cb) { resizeCbs.add(cb); return () => resizeCbs.delete(cb); },
    onVisible(cb) { visibleCbs.add(cb); return () => visibleCbs.delete(cb); },

    metrics: () => spotlight.metrics(),

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (pumpRaf) { cancelAnimationFrame(pumpRaf); pumpRaf = 0; }
      document.removeEventListener('visibilitychange', onVisible);
      app.canvas.removeEventListener('webglcontextlost', onLost);
      resizeCbs.clear();
      visibleCbs.clear();
      try { app.renderer.off('resize', onResize); } catch { /* ignore */ }
      try { spotlight.destroy(); } catch { /* ignore */ }
      try { app.destroy(true, { children: true, texture: false }); } catch { /* ignore */ }
    },
  };
}
