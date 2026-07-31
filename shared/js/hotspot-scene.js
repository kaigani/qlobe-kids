// hotspot-scene.js — a fixed art plate with tappable objects on it.
//
// A room is painted at a fixed authoring size (1600 x 1200 for Rhyming
// Detective) and a handful of objects sit at authored positions inside it. The
// child taps an object. That is the whole interaction, and it is the same
// interaction in a study, a kitchen, a bedroom, an I-spy street or any future
// look-and-find game — so the plumbing lives here once, not in each game.
//
// WHAT THIS MODULE OWNS
//   - the ONE art <-> screen transform (cover-fit, GDD 2.2). Nothing else in a
//     consuming game may recompute it; games read it back through toScreen /
//     toArt / visibleArt.
//   - reflow on resize and orientation change (ResizeObserver on the mount)
//   - hit inflation to a CSS-px floor, so a 150 art-px pea is still a 96 CSS-px
//     target on a phone-sized crop
//   - HUD keep-out: the game hands over the live screen rects of its HUD and
//     the scene translates hotspots out from under them
//   - prefers-reduced-motion, module-wide, with an explicit override
//   - bubble geometry (side choice, tail, flip-at-the-edge)
//   - <button> semantics: the hit box IS the button, the sprite is an inert
//     child <img>
//
// WHAT THE GAME OWNS (deliberately NOT in here)
//   - which object is the right answer, and what that means
//   - voice, sfx, audio unlock, the HUD, the celebration, all content
//   - WHEN a hotspot changes state. The module owns what each state looks like.
//
// THE HIT BOX IS THE BUTTON
// The obvious build is a <button> wrapping a sprite and padding the sprite to
// reach the minimum target size. That makes the visible art and the hit area
// two things that can disagree, and they disagree exactly when the crop is
// tightest — i.e. on the smallest device, where it matters most. Here the
// button is sized to max(sprite + 2*hitPad, minHit / scale) art px, centred on
// the authored centre, and the sprite is a pointer-events:none <img> centred
// inside it. So `getTargets().rect` IS the tappable rect, QA can assert it
// directly, and inflating a target can never move or resize the art.
//
// x AND y ARE THE CENTRE
// Every art-space coordinate this module accepts for a hotspot is the object's
// CENTRE, not its top-left. The zone table a game authors against gives centres;
// top-left would silently offset every object by half its size. Stated here,
// once, because it is the single most likely coordinate bug.
//
// NO ASSETS, NO CSS FILE, NO DEPENDENCIES BUT tap.js
// Every URL the module touches is one the caller passed in, so it is drop-in
// for any game with no path audit (interaction-patterns.md #10). Its styles are
// one <style id="hs-style"> injected at module scope; games override by
// specificity. Its only import is shared/js/tap.js, which owns the single press
// path (action on pointerup over the element; pointercancel never succeeds).
//
// ANIMATION IS rAF, NOT CSS KEYFRAMES
// Press-down scale, state scale, pulse, pop, wiggle and flyTo all want to
// address the same element's transform at the same time — a child can tap a
// pulsing object that is already lit. CSS animations would fight over one
// `transform` property and the last writer would win, visibly. So each hotspot
// keeps its transform factors as numbers (state x press x anim, plus rotation)
// and every tween writes one composed string. The cost is a few rAF callbacks
// per tap; the benefit is that no two beats of the choreography can clobber
// each other.

import { onTap } from './tap.js';

// --- module constants --------------------------------------------------------

/** §4.7: the visible-art thresholds that separate the two layouts. Advisory. */
const COMPACT_MIN_ART_W = 1300;
const COMPACT_MIN_ART_H = 950;

/** Gap in CSS px between a hotspot's hit box and its bubble. */
const BUBBLE_GAP = 14;
/** Tail square edge in CSS px (rotated 45deg, so it reads ~22px wide). */
const TAIL = 22;

const STATES = ['idle', 'lit', 'found', 'declined'];

/** §5.5 — the module owns the visuals, the game owns when. */
const STATE_FILTER = {
  idle: 'drop-shadow(0 6px 14px rgba(11,26,58,.28))',
  lit: 'drop-shadow(0 0 22px #ffd24a) drop-shadow(0 0 44px rgba(255,196,74,.6))',
  found: 'saturate(.35)',
  declined: 'drop-shadow(0 0 18px rgba(120,130,150,.85))',
};
const STATE_OPACITY = { idle: 1, lit: 1, found: 0.5, declined: 0.9 };
const STATE_SCALE = { idle: 1, lit: 1.03, found: 1, declined: 1 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// --- easing ------------------------------------------------------------------
// The GDD names CSS cubic-beziers; a Newton solve reproduces them exactly in JS
// so the rAF tweens and any CSS transition in game code agree on the feel.

function cubicBezier(x1, y1, x2, y2) {
  const ax = 1 - 3 * x2 + 3 * x1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const fy = (t) => ((ay * t + by) * t + cy) * t;
  const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = fx(t) - x;
      if (Math.abs(err) < 1e-5) break;
      const d = dfx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return fy(clamp(t, 0, 1));
  };
}

const EASE_OUT = cubicBezier(0, 0, 0.58, 1);
const EASE_IN_OUT = cubicBezier(0.42, 0, 0.58, 1);
const BACK_OUT = cubicBezier(0.34, 1.56, 0.64, 1);   // §9.2 pop / settle curve
const FLY = cubicBezier(0.45, 0, 0.15, 1);           // §9.3 flight curve
const LINEAR = (t) => t;

/**
 * One rAF tween. `onFrame(v)` runs every frame with the eased 0..1 value and
 * once more with exactly 1 at the end. Cancelling RESOLVES — never rejects —
 * leaving the written values wherever the superseding animation puts them,
 * which is the promise contract of §5.3.
 *
 * @returns {{promise: Promise<void>, cancel: () => void, done: boolean}}
 */
function tween(ms, onFrame, ease = LINEAR) {
  const h = { done: false, cancel: null, promise: null };
  h.promise = new Promise((resolve) => {
    if (!(ms > 0)) {
      h.done = true;
      try { onFrame(1); } catch { /* a frame must never break the promise */ }
      h.cancel = () => {};
      resolve();
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const t = clamp((now - t0) / ms, 0, 1);
      try { onFrame(ease(t)); } catch { /* keep going; still resolves */ }
      if (t >= 1) { h.done = true; resolve(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    h.cancel = () => {
      if (h.done) return;
      h.done = true;
      cancelAnimationFrame(raf);
      resolve();
    };
  });
  return h;
}

/** A promise that is already settled — what every inert / reduced path returns. */
const settled = () => Promise.resolve();

// --- styles (injected once, at module scope) ---------------------------------

const STYLE_ID = 'hs-style';
const CSS = `
.hs-root{position:absolute;inset:0;overflow:visible;touch-action:none;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.hs-bg{position:absolute;left:0;top:0;display:block;pointer-events:none;z-index:0;
  -webkit-user-drag:none;user-select:none}
.hs-hotspot{position:absolute;left:0;top:0;margin:0;padding:0;border:0;
  background:transparent;appearance:none;-webkit-appearance:none;
  touch-action:manipulation;cursor:pointer;will-change:transform;
  display:block;color:inherit;font:inherit;-webkit-tap-highlight-color:transparent}
.hs-hotspot:focus{outline:none}
.hs-hotspot:focus-visible{outline:4px solid #ffd24a;outline-offset:3px;border-radius:12px}
.hs-hotspot.is-found{pointer-events:none}
.hs-sprite{position:absolute;left:0;top:0;display:block;pointer-events:none;
  object-fit:contain;-webkit-user-drag:none;will-change:transform,filter,opacity}
.hs-bubble{position:absolute;left:0;top:0;box-sizing:border-box;z-index:5000;
  min-width:132px;padding:14px 28px;border-radius:26px;border:5px solid #dfe8f5;
  background:#fffdf6;color:#123a6b;pointer-events:none;
  font-family:'Fredoka','Fredoka One','Arial Rounded MT Bold',system-ui,sans-serif;
  font-weight:600;font-size:44px;line-height:1.15;text-align:center;white-space:nowrap;
  will-change:transform,opacity;filter:drop-shadow(0 8px 18px rgba(11,26,58,.22))}
.hs-bubble.is-hit{pointer-events:auto;cursor:pointer}
.hs-bubble-tail{position:absolute;width:${TAIL}px;height:${TAIL}px;box-sizing:border-box;
  background:#fffdf6;border:5px solid #dfe8f5;border-top:0;border-left:0;
  transform:rotate(45deg);pointer-events:none}
.hs-bubble.tone-neutral{background:#fffdf6;color:#123a6b;border-color:#dfe8f5}
.hs-bubble.tone-neutral>.hs-bubble-tail{background:#fffdf6;border-color:#dfe8f5}
.hs-bubble.tone-yes{background:#eaf9e0;color:#3c7a1e;border-color:#7ac043}
.hs-bubble.tone-yes>.hs-bubble-tail{background:#eaf9e0;border-color:#7ac043}
.hs-bubble.tone-no{background:#f0f1f4;color:#5a657a;border-color:#c6ccd8}
.hs-bubble.tone-no>.hs-bubble-tail{background:#f0f1f4;border-color:#c6ccd8}
.hs-bubble-body{display:block}
.hs-bubble svg{display:block;margin:0 auto;width:52px;height:52px}
`;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** The `glyph: 'sound'` mark — three arcs, drawn inline so nothing is fetched. */
const SOUND_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
  '<g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round">' +
  '<path d="M21.7 22.8 A12 12 0 0 1 21.7 41.2"/>' +
  '<path d="M27.5 15.9 A21 21 0 0 1 27.5 48.1"/>' +
  '<path d="M33.3 9 A30 30 0 0 1 33.3 55"/>' +
  '</g></svg>';

/**
 * Overlap area of two screen rects, each `{x, y, w, h}`.
 */
function overlapArea(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? { ox, oy, area: ox * oy } : { ox: 0, oy: 0, area: 0 };
}

/**
 * Smallest distance `box` must travel along the unit direction `dir` for its
 * overlap with `r` to fall to `limit` or below.
 *
 * Solved by bisection rather than algebraically, because the obvious closed
 * form (`newOverlap = oldOverlap - distance`) is WRONG whenever the reserve
 * rect is narrower than the hotspot on the escape axis: the overlap then does
 * not start shrinking until the hotspot's trailing edge crosses into the
 * reserve, and the algebraic answer under-translates — leaving a hotspot
 * visibly still half-buried under the HUD. Overlap is monotone in `d` along a
 * fixed direction, so 24 halvings land within a fraction of a pixel of exact
 * and cannot be fooled by containment.
 */
function escapeDistance(box, r, limit, dx, dy) {
  const full = dx !== 0
    ? (dx > 0 ? (r.x + r.w) - box.x : (box.x + box.w) - r.x)
    : (dy > 0 ? (r.y + r.h) - box.y : (box.y + box.h) - r.y);
  if (!(full > 0)) return 0;
  let lo = 0;
  let hi = full;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const moved = { x: box.x + dx * mid, y: box.y + dy * mid, w: box.w, h: box.h };
    if (overlapArea(moved, r).area <= limit) hi = mid; else lo = mid;
  }
  return hi;
}

/** Normalise a DOMRect or `{x,y,width,height}` to `{x,y,w,h}`. */
function normRect(r) {
  if (!r) return null;
  const x = Number(r.x ?? r.left);
  const y = Number(r.y ?? r.top);
  const w = Number(r.w ?? r.width);
  const h = Number(r.h ?? r.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { x, y, w, h };
}

/**
 * Create a hotspot scene inside `mountEl`.
 *
 * @param {HTMLElement} mountEl        a positioned element the scene may fill
 * @param {object}   opts
 * @param {number}   opts.artW         authoring width, > 0 (required)
 * @param {number}   opts.artH         authoring height, > 0 (required)
 * @param {?string} [opts.background=null]     first plate, or null for none
 * @param {number}  [opts.minHit=96]           CSS-px floor for every hit box
 * @param {number}  [opts.bubbleMinHit=0]      CSS-px floor for bubbles; 0 = inert
 * @param {?boolean}[opts.reducedMotion=null]  null = live-track the media query
 * @param {string}  [opts.ariaLabel='']        label for the role="group" root
 * @param {string}  [opts.className='']        extra class on the root
 * @returns {object} the scene
 */
export function createScene(mountEl, {
  artW,
  artH,
  background = null,
  minHit = 96,
  bubbleMinHit = 0,
  reducedMotion = null,
  ariaLabel = '',
  className = '',
} = {}) {
  if (!mountEl || typeof mountEl.appendChild !== 'function') {
    throw new TypeError('createScene: mountEl must be an element');
  }
  if (!(Number(artW) > 0) || !(Number(artH) > 0)) {
    throw new TypeError('createScene: artW and artH must be numbers > 0');
  }
  artW = Number(artW);
  artH = Number(artH);

  injectStyle();

  // --- root ------------------------------------------------------------------
  const root = document.createElement('div');
  root.className = 'hs-root' + (className ? ' ' + className : '');
  root.setAttribute('role', 'group');
  if (ariaLabel) root.setAttribute('aria-label', ariaLabel);
  mountEl.appendChild(root);

  // --- transform state -------------------------------------------------------
  let scale = 1;
  let offsetX = 0;          // art rect origin, in root-local CSS px
  let offsetY = 0;
  let viewW = 0;
  let viewH = 0;
  let originX = 0;          // root's own viewport origin, so "screen" == client px
  let originY = 0;
  let destroyed = false;

  // --- reduced motion --------------------------------------------------------
  const mq = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let rmOverride = reducedMotion === true || reducedMotion === false ? reducedMotion : null;
  let rmLive = mq ? mq.matches : false;
  const isReduced = () => (rmOverride === null ? rmLive : rmOverride);
  const onMq = (e) => { rmLive = !!e.matches; if (rmOverride === null) reflow(); };
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }

  // --- collections -----------------------------------------------------------
  const spots = new Map();      // id -> record
  let order = 0;                // monotonic tiebreaker for equal z
  const tapSubs = [];
  const reflowSubs = [];
  let reserveFn = null;
  let sceneEnabled = true;

  // --- background ------------------------------------------------------------
  let bgEl = null;
  let bgToken = 0;

  function layoutBg(el) {
    if (!el) return;
    el.style.left = offsetX + 'px';
    el.style.top = offsetY + 'px';
    el.style.width = artW * scale + 'px';
    el.style.height = artH * scale + 'px';
  }

  // --- transform -------------------------------------------------------------

  function measure() {
    const r = root.getBoundingClientRect();
    originX = r.left;
    originY = r.top;
    viewW = root.clientWidth || Math.round(r.width) || 0;
    viewH = root.clientHeight || Math.round(r.height) || 0;
    scale = viewW > 0 && viewH > 0 ? Math.max(viewW / artW, viewH / artH) : 1;
    offsetX = (viewW - artW * scale) / 2;
    offsetY = (viewH - artH * scale) / 2;
  }

  /** ART -> root-local CSS px. */
  const localX = (x) => offsetX + x * scale;
  const localY = (y) => offsetY + y * scale;

  function visibleArt() {
    const w = scale > 0 ? viewW / scale : artW;
    const h = scale > 0 ? viewH / scale : artH;
    const x = -offsetX / (scale || 1);
    const y = -offsetY / (scale || 1);
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }

  function layoutHint() {
    const v = visibleArt();
    return (v.w >= COMPACT_MIN_ART_W && v.h >= COMPACT_MIN_ART_H) ? 'wide' : 'compact';
  }

  // --- per-hotspot rendering -------------------------------------------------

  /** Compose the button transform from its independent factors. */
  function paintTransform(hs) {
    const s = hs.sState * hs.sPress * hs.sAnim;
    hs.el.style.transform = `scale(${s})` + (hs.rot ? ` rotate(${hs.rot}deg)` : '');
  }

  function paintOpacity(hs) {
    hs.img.style.opacity = String(hs.oState * hs.oPress * hs.oAnim);
  }

  function paintFilter(hs) {
    hs.img.style.filter = STATE_FILTER[hs.state] || 'none';
  }

  /** The transient pulse halo lives on the BUTTON, so it can never fight the
   *  state filter on the sprite. Alpha 0 clears it entirely. */
  function paintHalo(hs, a) {
    hs.el.style.filter = a > 0
      ? `drop-shadow(0 0 22px rgba(255,210,74,${a.toFixed(3)}))` +
        ` drop-shadow(0 0 44px rgba(255,196,74,${(a * 0.7).toFixed(3)}))`
      : '';
  }

  function paintFly(hs) {
    const f = hs.fly;
    hs.img.style.transform = f
      ? `translate(${f.x}px, ${f.y}px) scale(${f.s})`
      : '';
  }

  /** Position one hotspot's button, sprite and bubble for the current transform. */
  function layoutSpot(hs, reserves) {
    const minArt = minHit / (scale || 1);
    const hitW = Math.max(hs.art.w + 2 * hs.hitPad, minArt);
    const hitH = Math.max(hs.art.h + 2 * hs.hitPad, minArt);
    const sw = hitW * scale;
    const sh = hitH * scale;

    // viewport-space centre, before keep-out
    let cx = originX + localX(hs.art.x);
    let cy = originY + localY(hs.art.y);

    if (reserves && reserves.length) {
      const limit = sw * sh * 0.25;
      /** Worst overlap against ANY reserve, for a candidate centre. */
      const worstAt = (px, py) => {
        const b = { x: px - sw / 2, y: py - sh / 2, w: sw, h: sh };
        let m = 0;
        for (const r of reserves) m = Math.max(m, overlapArea(b, r).area);
        return m;
      };
      /** Keep the whole hit box inside the visible art rect (== the mount box
       *  on screen). A hit box wider than the view can't be clamped on that
       *  axis, so it isn't. */
      const clampX = (v) => (sw <= viewW ? clamp(v, originX + sw / 2, originX + viewW - sw / 2) : v);
      const clampY = (v) => (sh <= viewH ? clamp(v, originY + sh / 2, originY + viewH - sh / 2) : v);

      // Up to four passes: escaping one HUD box can slide a hotspot into
      // another. Four is plenty for any sane HUD, and the no-movement break
      // below terminates the loop regardless.
      for (let pass = 0; pass < 4; pass++) {
        const box = { x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh };
        let worst = null;
        let worstArea = limit;
        for (const r of reserves) {
          const o = overlapArea(box, r).area;
          if (o > worstArea) { worstArea = o; worst = r; }
        }
        if (!worst) break;

        // The four escapes, each SCORED AFTER THE CLAMP. Scoring before it is
        // the trap: under a full-width HUD banner the shortest escape is
        // straight up, off the top of the screen, and the clamp then puts the
        // hotspot right back under the banner — every pass, forever, leaving it
        // buried. Preferring the shortest escape that actually survives the
        // clamp is still "translate along the shorter escape axis"; it just
        // refuses an axis the module already knows is a no-op.
        let best = null;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const dist = escapeDistance(box, worst, limit, dx, dy);
          const nx = clampX(cx + dx * dist);
          const ny = clampY(cy + dy * dist);
          const after = worstAt(nx, ny);
          const cand = { nx, ny, dist, after, clears: after <= limit + 0.5 };
          if (!best) { best = cand; }
          else if (cand.clears !== best.clears) { if (cand.clears) best = cand; }
          else if (cand.clears) { if (cand.dist < best.dist) best = cand; }
          else if (cand.after < best.after - 0.5) best = cand;
        }
        if (!best) break;
        if (Math.abs(best.nx - cx) < 0.01 && Math.abs(best.ny - cy) < 0.01) break;
        cx = best.nx;
        cy = best.ny;
      }
    }

    hs.hit = { x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh };   // viewport px

    hs.el.style.left = (hs.hit.x - originX) + 'px';
    hs.el.style.top = (hs.hit.y - originY) + 'px';
    hs.el.style.width = sw + 'px';
    hs.el.style.height = sh + 'px';

    const iw = hs.art.w * scale;
    const ih = hs.art.h * scale;
    hs.img.style.left = (sw - iw) / 2 + 'px';
    hs.img.style.top = (sh - ih) / 2 + 'px';
    hs.img.style.width = iw + 'px';
    hs.img.style.height = ih + 'px';

    if (hs.bubble) layoutBubble(hs, reserves);
  }

  // --- bubbles ---------------------------------------------------------------

  /**
   * §5.6: the tail always points at the hotspot centre; `auto` prefers top,
   * then bottom, then the wider horizontal side, and flips at the viewport edge
   * or any reserve rect. Re-evaluated on every reflow, which is why this runs
   * from layoutSpot rather than from bubble().
   */
  function layoutBubble(hs, reserves) {
    const b = hs.bubble;
    const bw = b.el.offsetWidth;
    const bh = b.el.offsetHeight;
    const cx = hs.hit.x + hs.hit.w / 2;
    const cy = hs.hit.y + hs.hit.h / 2;
    const halfW = hs.hit.w / 2;
    const halfH = hs.hit.h / 2;

    const boxFor = (side) => {
      if (side === 'top') return { x: cx - bw / 2, y: cy - halfH - BUBBLE_GAP - bh, w: bw, h: bh };
      if (side === 'bottom') return { x: cx - bw / 2, y: cy + halfH + BUBBLE_GAP, w: bw, h: bh };
      if (side === 'left') return { x: cx - halfW - BUBBLE_GAP - bw, y: cy - bh / 2, w: bw, h: bh };
      return { x: cx + halfW + BUBBLE_GAP, y: cy - bh / 2, w: bw, h: bh };
    };
    const fits = (side) => {
      const r = boxFor(side);
      if (r.x < originX || r.y < originY ||
          r.x + r.w > originX + viewW || r.y + r.h > originY + viewH) return false;
      if (reserves) for (const rr of reserves) if (overlapArea(r, rr).area > 0) return false;
      return true;
    };

    let side = b.wantSide;
    if (side === 'auto') {
      const horiz = cx > originX + viewW / 2 ? 'left' : 'right';
      side = ['top', 'bottom', horiz, horiz === 'left' ? 'right' : 'left'].find(fits) || 'top';
    }
    b.side = side;
    b.el.classList.remove('side-top', 'side-bottom', 'side-left', 'side-right');
    b.el.classList.add('side-' + side);

    let box = boxFor(side);
    // Never let a bubble leave the viewport, even on the side it was forced to.
    if (side === 'top' || side === 'bottom') {
      box.x = clamp(box.x, originX + 4, originX + Math.max(4, viewW - bw - 4));
    } else {
      box.y = clamp(box.y, originY + 4, originY + Math.max(4, viewH - bh - 4));
    }
    b.el.style.left = (box.x - originX) + 'px';
    b.el.style.top = (box.y - originY) + 'px';
    b.home = { x: box.x - originX, y: box.y - originY };

    // tail: centred on the hotspot centre along the shared edge
    const t = b.tail.style;
    const half = TAIL / 2;
    if (side === 'top') {
      t.left = clamp(cx - box.x - half, 10, Math.max(10, bw - TAIL - 10)) + 'px';
      t.top = (bh - half - 3) + 'px';
      t.transform = 'rotate(45deg)';
    } else if (side === 'bottom') {
      t.left = clamp(cx - box.x - half, 10, Math.max(10, bw - TAIL - 10)) + 'px';
      t.top = (-half + 3) + 'px';
      t.transform = 'rotate(225deg)';
    } else if (side === 'left') {
      t.top = clamp(cy - box.y - half, 10, Math.max(10, bh - TAIL - 10)) + 'px';
      t.left = (bw - half - 3) + 'px';
      t.transform = 'rotate(-45deg)';
    } else {
      t.top = clamp(cy - box.y - half, 10, Math.max(10, bh - TAIL - 10)) + 'px';
      t.left = (-half + 3) + 'px';
      t.transform = 'rotate(135deg)';
    }
  }

  function bubbleTransform(b) {
    const p = b.pos || { x: 0, y: 0 };
    return `translate(${p.x}px, ${p.y}px) scale(${b.scale})`;
  }

  function removeBubble(hs) {
    const b = hs.bubble;
    if (!b) return;
    if (b.tween) b.tween.cancel();
    if (b.tapOff) b.tapOff();
    b.el.remove();
    hs.bubble = null;
  }

  // --- reflow ----------------------------------------------------------------

  let reflowQueued = false;
  let inReflow = false;

  function reflow() {
    if (destroyed || inReflow) return;
    inReflow = true;
    reflowQueued = false;
    measure();
    layoutBg(bgEl);

    let reserves = null;
    if (reserveFn) {
      try {
        const raw = reserveFn();
        if (Array.isArray(raw)) {
          reserves = raw.map(normRect).filter(Boolean);
          if (!reserves.length) reserves = null;
        }
      } catch { reserves = null; }
    }

    for (const hs of spots.values()) layoutSpot(hs, reserves);

    const info = {
      scale, offsetX, offsetY, viewW, viewH,
      visibleArt: visibleArt(), layoutHint: layoutHint(),
    };
    // Callbacks run with the guard still up: a game that calls reflow() (or
    // rects(), which can trigger one) from inside its own onReflow must not be
    // able to start an unbounded recursion on a five-year-old's tablet.
    try {
      for (const cb of reflowSubs.slice()) {
        try { cb(info); } catch (err) { console.warn('[hotspot-scene] onReflow threw', err); }
      }
    } finally { inReflow = false; }
  }

  function queueReflow() {
    if (destroyed || reflowQueued) return;
    reflowQueued = true;
    requestAnimationFrame(() => { if (reflowQueued) reflow(); });
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(queueReflow) : null;
  if (ro) ro.observe(mountEl);
  const onWinResize = () => queueReflow();
  window.addEventListener('resize', onWinResize);
  window.addEventListener('orientationchange', onWinResize);

  // --- press feedback --------------------------------------------------------
  // §9.1: down to 0.94 over 80 ms on pointerdown; back to 1 over 180 ms on
  // release, cancel OR pointer-leaves-and-lifts. Under reduced motion it is an
  // opacity dip instead, because the beat still has to read as "I heard you".

  function pressDown(hs) {
    if (hs.pressTween) hs.pressTween.cancel();
    if (isReduced()) {
      const from = hs.oPress;
      hs.pressTween = tween(90, (v) => {
        hs.oPress = from + (0.8 - from) * v;
        paintOpacity(hs);
      }, EASE_OUT);
    } else {
      const from = hs.sPress;
      hs.pressTween = tween(80, (v) => {
        hs.sPress = from + (0.94 - from) * v;
        paintTransform(hs);
      }, EASE_OUT);
    }
  }

  function pressUp(hs) {
    if (hs.pressTween) hs.pressTween.cancel();
    if (isReduced()) {
      const from = hs.oPress;
      hs.pressTween = tween(90, (v) => {
        hs.oPress = from + (1 - from) * v;
        paintOpacity(hs);
      }, EASE_OUT);
    } else {
      const from = hs.sPress;
      hs.pressTween = tween(180, (v) => {
        hs.sPress = from + (1 - from) * v;
        paintTransform(hs);
      }, BACK_OUT);
    }
  }

  function fireTap(hs, ev) {
    if (destroyed || !hs.alive) return;
    if (!sceneEnabled || !hs.enabled || hs.state === 'found') return;
    for (const cb of tapSubs.slice()) {
      try { cb(hs.id, hs.handle, ev); } catch (err) { console.warn('[hotspot-scene] onTap threw', err); }
    }
  }

  // --- hotspots --------------------------------------------------------------

  function applyEnabled(hs) {
    const on = sceneEnabled && hs.enabled;
    hs.el.disabled = !on;
    if (hs.enabled) hs.el.removeAttribute('aria-disabled');
    else hs.el.setAttribute('aria-disabled', 'true');
    if (hs.state === 'found') hs.el.setAttribute('aria-disabled', 'true');
  }

  function applyState(hs, instant) {
    for (const s of STATES) hs.el.classList.toggle('is-' + s, hs.state === s);
    const reduced = isReduced() || instant;
    hs.img.style.transition = reduced ? 'none' : 'filter 180ms ease, opacity 180ms ease';
    paintFilter(hs);
    hs.oState = STATE_OPACITY[hs.state];
    paintOpacity(hs);
    const target = STATE_SCALE[hs.state];
    if (hs.stateTween) hs.stateTween.cancel();
    if (reduced) {
      hs.sState = target;
      paintTransform(hs);
    } else {
      const from = hs.sState;
      hs.stateTween = tween(180, (v) => {
        hs.sState = from + (target - from) * v;
        paintTransform(hs);
      }, EASE_OUT);
    }
    applyEnabled(hs);
  }

  /** One motion channel per hotspot: pulse/wiggle/pop/flyTo supersede each other. */
  function startMotion(hs) {
    if (hs.motion) hs.motion.cancel();
    hs.motion = null;
  }

  function sortSpots() {
    const list = [...spots.values()].sort((a, b) => (a.z - b.z) || (a.order - b.order));
    list.forEach((hs, i) => {
      hs.el.style.zIndex = String(1000 + i);
      root.appendChild(hs.el);            // DOM order == tab order == paint order
      if (hs.bubble) root.appendChild(hs.bubble.el);
    });
  }

  function makeHandle(hs) {
    const inert = () => !hs.alive || destroyed;
    return {
      get id() { return hs.id; },
      get art() { return { ...hs.art }; },
      get state() { return hs.state; },
      get el() { return hs.el; },

      setState(s) {
        if (inert()) return;
        if (!STATES.includes(s)) {
          console.warn(`[hotspot-scene] unknown state "${s}" on "${hs.id}" — ignored`);
          return;
        }
        if (s === hs.state) return;
        hs.state = s;
        applyState(hs, false);
      },

      setRect(r) {
        if (inert() || !r) return;
        if (Number.isFinite(r.x)) hs.art.x = Number(r.x);
        if (Number.isFinite(r.y)) hs.art.y = Number(r.y);
        if (Number.isFinite(r.w) && r.w > 0) hs.art.w = Number(r.w);
        if (Number.isFinite(r.h) && r.h > 0) hs.art.h = Number(r.h);
        layoutSpot(hs, currentReserves());
      },

      setSprite(url) {
        if (inert()) return Promise.resolve(false);
        return loadSprite(hs, url);
      },

      setEnabled(on) {
        if (inert()) return;
        hs.enabled = !!on;
        applyEnabled(hs);
      },

      bubble(opts) { return inert() ? settled() : showBubble(hs, opts || {}); },
      hideBubble(opts) { return inert() ? settled() : hideBubble(hs, opts || {}); },
      pulse(opts) { return inert() ? settled() : pulse(hs, opts || {}); },
      wiggle(opts) { return inert() ? settled() : wiggle(hs, opts || {}); },
      pop(opts) { return inert() ? settled() : pop(hs, opts || {}); },
      flyTo(rect, opts) { return inert() ? settled() : flyTo(hs, rect, opts || {}); },

      rect() {
        if (inert()) return { x: 0, y: 0, w: 0, h: 0 };
        return { ...hs.hit };
      },

      remove() {
        if (inert()) return;
        destroySpot(hs);
      },
    };
  }

  function currentReserves() {
    if (!reserveFn) return null;
    try {
      const raw = reserveFn();
      if (!Array.isArray(raw)) return null;
      const list = raw.map(normRect).filter(Boolean);
      return list.length ? list : null;
    } catch { return null; }
  }

  function loadSprite(hs, url) {
    if (!url) {
      hs.spriteUrl = null;
      hs.img.removeAttribute('src');
      hs.img.style.visibility = 'hidden';
      return Promise.resolve(true);
    }
    const token = ++hs.spriteToken;
    return new Promise((resolve) => {
      const probe = new Image();
      probe.decoding = 'async';
      const done = (ok) => {
        if (destroyed || !hs.alive || token !== hs.spriteToken) { resolve(false); return; }
        if (ok) {
          hs.spriteUrl = url;
          hs.img.src = url;
          hs.img.style.visibility = 'visible';
        }
        resolve(ok);
      };
      probe.onload = () => done(true);
      probe.onerror = () => done(false);
      probe.src = url;
    });
  }

  function destroySpot(hs) {
    hs.alive = false;
    if (hs.motion) hs.motion.cancel();
    if (hs.pressTween) hs.pressTween.cancel();
    if (hs.stateTween) hs.stateTween.cancel();
    removeBubble(hs);
    if (hs.tapOff) hs.tapOff();
    for (const [type, fn] of hs.listeners) hs.el.removeEventListener(type, fn);
    hs.listeners.length = 0;
    hs.el.remove();
    spots.delete(hs.id);
  }

  // --- bubble API ------------------------------------------------------------

  function showBubble(hs, { text = '', glyph = null, side = 'auto', tone = 'neutral', ms = 260 } = {}) {
    const toneName = ['neutral', 'yes', 'no'].includes(tone) ? tone : 'neutral';
    const sideName = ['auto', 'top', 'bottom', 'left', 'right'].includes(side) ? side : 'auto';
    const reduced = isReduced();
    const fresh = !hs.bubble;

    if (fresh) {
      const el = document.createElement('div');
      el.className = 'hs-bubble';
      el.setAttribute('aria-hidden', 'true');
      const body = document.createElement('span');
      body.className = 'hs-bubble-body';
      const tail = document.createElement('i');
      tail.className = 'hs-bubble-tail';
      el.appendChild(body);
      el.appendChild(tail);
      root.appendChild(el);
      hs.bubble = { el, body, tail, side: 'top', wantSide: sideName, tone: toneName, scale: 1, pos: null, tween: null, tapOff: null };
      if (bubbleMinHit > 0) {
        el.classList.add('is-hit');
        el.style.minWidth = Math.max(132, bubbleMinHit) + 'px';
        el.style.minHeight = bubbleMinHit + 'px';
        hs.bubble.tapOff = onTap(el, (ev) => fireTap(hs, ev));
      }
    }
    const b = hs.bubble;
    b.wantSide = sideName;

    const setTone = () => {
      b.el.classList.remove('tone-neutral', 'tone-yes', 'tone-no');
      b.el.classList.add('tone-' + toneName);
      b.tone = toneName;
    };
    const setContent = () => {
      if (glyph === 'sound') b.body.innerHTML = SOUND_SVG;
      else b.body.textContent = text == null ? '' : String(text);
    };

    if (b.tween) b.tween.cancel();

    if (!fresh) {
      // §5.6: a second bubble() re-uses the element and cross-fades over 120 ms.
      b.el.style.transition = reduced ? 'none' : 'background-color 120ms ease, border-color 120ms ease';
      b.tail.style.transition = b.el.style.transition;
      // The tone starts transitioning NOW, not at the content swap, so the
      // whole cross-fade — colour and text — has landed when the promise
      // resolves. §9.3 hangs the "green tint" beat on exactly this 120 ms.
      setTone();
      if (reduced) {
        setContent();
        layoutBubble(hs, currentReserves());
        b.body.style.opacity = '1';
        return settled();
      }
      b.swapped = false;
      b.tween = tween(120, (v) => {
        if (v < 0.5) {
          b.body.style.opacity = String(1 - v * 2);
        } else {
          if (!b.swapped) { b.swapped = true; setContent(); layoutBubble(hs, currentReserves()); }
          b.body.style.opacity = String((v - 0.5) * 2);
        }
      }, LINEAR);
      return b.tween.promise;
    }

    setTone();
    setContent();
    b.el.style.transition = 'none';
    b.scale = reduced ? 1 : 0.6;
    b.el.style.opacity = '0';
    layoutBubble(hs, currentReserves());
    // transform-origin at the tail, so the pop reads as growing out of the object
    const originMap = { top: 'bottom center', bottom: 'top center', left: 'right center', right: 'left center' };
    b.el.style.transformOrigin = originMap[b.side] || 'bottom center';
    b.el.style.transform = bubbleTransform(b);

    if (reduced) {
      // §5.7: 120 ms opacity fade, no scale.
      b.tween = tween(120, (v) => { b.el.style.opacity = String(v); }, EASE_OUT);
      return b.tween.promise;
    }
    // §9.2: opacity 0->1 over the first 120 ms, scale .6 -> 1.06 -> 1 over `ms`.
    const dur = ms > 0 ? ms : 260;
    b.tween = tween(dur, (v) => {
      b.el.style.opacity = String(clamp(v * (dur / 120), 0, 1));
      b.scale = 0.6 + 0.4 * v;
      b.el.style.transform = bubbleTransform(b);
    }, BACK_OUT);
    return b.tween.promise;
  }

  function hideBubble(hs, { ms = 240 } = {}) {
    const b = hs.bubble;
    if (!b) return settled();
    if (b.tween) b.tween.cancel();
    const dur = isReduced() ? 0 : ms;
    const from = parseFloat(b.el.style.opacity || '1');
    b.tween = tween(dur, (v) => { b.el.style.opacity = String(from * (1 - v)); }, EASE_OUT);
    return b.tween.promise.then(() => { if (hs.bubble === b) removeBubble(hs); });
  }

  // --- motion API ------------------------------------------------------------

  /**
   * Run `m` as the hotspot's current motion and settle its neutral values
   * afterwards — but ONLY if nothing superseded it. Without the guard, a
   * cancelled tween's cleanup would reset sAnim/rot/opacity a microtask after
   * the superseding tween started writing them, which is a visible one-frame
   * snap in exactly the case the choreography does most: tap a pulsing object.
   */
  function runMotion(hs, m, settle) {
    hs.motion = m;
    return m.promise.then(() => { if (hs.motion === m) { hs.motion = null; settle(); } });
  }

  function pulse(hs, { ms = 900, scale: peak = 1.06 } = {}) {
    startMotion(hs);
    if (isReduced()) {
      // §5.7: 300 ms halo opacity blink, no scale.
      const m = tween(300, (v) => paintHalo(hs, 0.85 * Math.sin(v * Math.PI)), LINEAR);
      return runMotion(hs, m, () => paintHalo(hs, 0));
    }
    const from = hs.sAnim;
    const m = tween(ms > 0 ? ms : 900, (v) => {
      const e = EASE_IN_OUT(Math.sin(v * Math.PI));   // 0 -> 1 -> 0
      hs.sAnim = from + (peak - from) * e;
      paintTransform(hs);
      paintHalo(hs, 0.85 * e);
    }, LINEAR);
    return runMotion(hs, m, () => {
      hs.sAnim = 1; paintTransform(hs); paintHalo(hs, 0);
    });
  }

  function wiggle(hs, { ms = 320, deg = 5 } = {}) {
    startMotion(hs);
    if (isReduced()) {
      // §5.7: 160 ms opacity dip to 0.7 and back, no rotation.
      const m = tween(160, (v) => {
        hs.oAnim = 1 - 0.3 * Math.sin(v * Math.PI);
        paintOpacity(hs);
      }, LINEAR);
      return runMotion(hs, m, () => { hs.oAnim = 1; paintOpacity(hs); });
    }
    // two cycles: 0 -> +deg -> -deg -> +deg -> -deg -> 0, ease-in-out per leg
    const keys = [0, deg, -deg, deg, -deg, 0];
    const m = tween(ms > 0 ? ms : 320, (v) => {
      const f = v * (keys.length - 1);
      const i = Math.min(keys.length - 2, Math.floor(f));
      const t = EASE_IN_OUT(f - i);
      hs.rot = keys[i] + (keys[i + 1] - keys[i]) * t;
      paintTransform(hs);
    }, LINEAR);
    return runMotion(hs, m, () => { hs.rot = 0; paintTransform(hs); });
  }

  function pop(hs, { ms = 260 } = {}) {
    startMotion(hs);
    if (isReduced()) {
      // §5.7: 120 ms opacity fade-in at full size.
      hs.sAnim = 1; paintTransform(hs);
      hs.oAnim = 0; paintOpacity(hs);
      const m = tween(120, (v) => { hs.oAnim = v; paintOpacity(hs); }, EASE_OUT);
      return runMotion(hs, m, () => { hs.oAnim = 1; paintOpacity(hs); });
    }
    const m = tween(ms > 0 ? ms : 260, (v) => {
      hs.sAnim = 0.6 + 0.4 * v;
      paintTransform(hs);
    }, BACK_OUT);
    return runMotion(hs, m, () => { hs.sAnim = 1; paintTransform(hs); });
  }

  /**
   * §5.3 / §9.3. `rect` is SCREEN px (a DOMRect works). Nothing is cloned or
   * reparented — the sprite itself travels and is snapped home on resolve — so
   * there is no stray-clone failure mode to defend against. The bubble, if any,
   * rides along and fades over the last 200 ms (§9.3), then is removed.
   */
  function flyTo(hs, rect, { ms = 620, arc = 120 } = {}) {
    const target = normRect(rect);
    startMotion(hs);
    const b = hs.bubble;

    if (!target) return settled();

    if (isReduced()) {
      // §5.7: 180 ms opacity fade at the source, no travel.
      if (b && b.tween) b.tween.cancel();
      const m = tween(180, (v) => {
        hs.oAnim = 1 - v;
        paintOpacity(hs);
        if (b) b.el.style.opacity = String(1 - v);
      }, EASE_OUT);
      return runMotion(hs, m, () => {
        hs.oAnim = 1; paintOpacity(hs);
        if (b && hs.bubble === b) removeBubble(hs);
      });
    }

    const iw = hs.art.w * scale;
    const ih = hs.art.h * scale;
    const fromX = hs.hit.x + hs.hit.w / 2;
    const fromY = hs.hit.y + hs.hit.h / 2;
    const toX = target.x + target.w / 2;
    const toY = target.y + target.h / 2;
    const endScale = iw > 0 && ih > 0
      ? Math.min(target.w / iw, target.h / ih)
      : 1;
    const dur = ms > 0 ? ms : 620;
    if (b && b.tween) b.tween.cancel();

    const m = tween(dur, (v) => {
      const x = (toX - fromX) * v;
      const y = (toY - fromY) * v - 4 * arc * v * (1 - v);   // quadratic arc
      hs.fly = { x, y, s: 1 + (endScale - 1) * v };
      paintFly(hs);
      if (b) {
        b.pos = { x, y };
        b.el.style.transform = bubbleTransform(b);
        const fadeStart = 1 - 200 / dur;
        b.el.style.opacity = v > fadeStart ? String(clamp((1 - v) / (1 - fadeStart), 0, 1)) : '1';
      }
    }, FLY);

    return runMotion(hs, m, () => {
      hs.fly = null;
      paintFly(hs);
      if (b && hs.bubble === b) removeBubble(hs);
    });
  }

  // --- public scene ----------------------------------------------------------

  const scene = {
    get el() { return root; },
    get artW() { return artW; },
    get artH() { return artH; },
    get scale() { return scale; },
    get reducedMotion() { return isReduced(); },
    get size() { return spots.size; },

    /** §5.2 — never rejects; a failed plate keeps the current one. */
    setBackground(url, { ms = 420 } = {}) {
      if (destroyed) return Promise.resolve(false);
      const token = ++bgToken;
      if (url == null) {
        if (bgEl) { bgEl.remove(); bgEl = null; }
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        const img = new Image();
        img.className = 'hs-bg';
        img.decoding = 'async';
        img.draggable = false;
        img.alt = '';
        const fail = () => resolve(false);
        img.onerror = fail;
        img.onload = () => {
          const swap = () => {
            if (destroyed || token !== bgToken) { resolve(false); return; }
            const prev = bgEl;
            bgEl = img;
            layoutBg(img);
            const instant = isReduced() || !(ms > 0) || !prev;
            img.style.opacity = instant ? '1' : '0';
            // the incoming plate goes directly on top of the outgoing one, and
            // both stay under every hotspot (z-index 0 vs 1000+)
            if (prev && prev.parentNode === root) root.insertBefore(img, prev.nextSibling);
            else root.prepend(img);
            if (instant) {
              if (prev) prev.remove();
              resolve(true);
              return;
            }
            tween(ms, (v) => { img.style.opacity = String(v); }, EASE_IN_OUT)
              .promise.then(() => { prev.remove(); resolve(true); });
          };
          if (img.decode) img.decode().then(swap, swap);
          else swap();
        };
        img.src = url;
      });
    },

    /** §5.3. A duplicate id replaces in place and returns the SAME handle. */
    addHotspot(opts = {}) {
      if (destroyed) return null;
      const id = String(opts.id ?? '');
      if (!id) { console.warn('[hotspot-scene] addHotspot needs a non-empty id'); return null; }
      const x = Number(opts.x), y = Number(opts.y);
      const w = Number(opts.w), h = Number(opts.h);
      if (![x, y, w, h].every(Number.isFinite) || !(w > 0) || !(h > 0)) {
        console.warn(`[hotspot-scene] addHotspot "${id}" needs finite x,y and positive w,h`);
        return null;
      }

      let hs = spots.get(id);
      const fresh = !hs;
      if (fresh) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'hs-hotspot';
        el.dataset.id = id;
        const img = document.createElement('img');
        img.className = 'hs-sprite';
        img.alt = '';
        img.draggable = false;
        img.decoding = 'async';
        img.style.visibility = 'hidden';
        el.appendChild(img);
        hs = {
          id, el, img, alive: true, listeners: [],
          art: { x, y, w, h }, hitPad: 0, z: 0, order: order++,
          state: 'idle', enabled: true, spriteUrl: null, spriteToken: 0,
          hit: { x: 0, y: 0, w: 0, h: 0 },
          sState: 1, sPress: 1, sAnim: 1, rot: 0,
          oState: 1, oPress: 1, oAnim: 1, fly: null,
          motion: null, pressTween: null, stateTween: null,
          bubble: null, tapOff: null, handle: null,
        };
        hs.handle = makeHandle(hs);
        hs.tapOff = onTap(el, (ev) => fireTap(hs, ev), { feedback: () => pressDown(hs) });
        const up = () => pressUp(hs);
        for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) {
          el.addEventListener(type, up);
          hs.listeners.push([type, up]);
        }
        spots.set(id, hs);
      } else {
        hs.art = { x, y, w, h };
      }

      hs.hitPad = Number.isFinite(Number(opts.hitPad)) ? Number(opts.hitPad) : (fresh ? 0 : hs.hitPad);
      if (Number.isFinite(Number(opts.z))) hs.z = Math.round(Number(opts.z));
      hs.el.setAttribute('aria-label', String(opts.alt ?? (fresh ? id : hs.el.getAttribute('aria-label') || id)));
      if ('enabled' in opts) hs.enabled = opts.enabled !== false;
      const wantState = opts.state ?? (fresh ? 'idle' : hs.state);
      hs.state = STATES.includes(wantState) ? wantState : 'idle';

      const sprite = 'sprite' in opts ? opts.sprite : (fresh ? null : hs.spriteUrl);
      if (sprite !== hs.spriteUrl || fresh) loadSprite(hs, sprite);

      applyState(hs, true);
      sortSpots();
      layoutSpot(hs, currentReserves());
      return hs.handle;
    },

    onTap(cb) {
      if (typeof cb !== 'function') return () => {};
      tapSubs.push(cb);
      return () => { const i = tapSubs.indexOf(cb); if (i >= 0) tapSubs.splice(i, 1); };
    },

    setEnabled(on) {
      sceneEnabled = !!on;
      for (const hs of spots.values()) applyEnabled(hs);
    },

    setReserve(fn) {
      reserveFn = typeof fn === 'function' ? fn : null;
      if (!destroyed) reflow();
    },

    onReflow(cb) {
      if (typeof cb !== 'function') return () => {};
      reflowSubs.push(cb);
      return () => { const i = reflowSubs.indexOf(cb); if (i >= 0) reflowSubs.splice(i, 1); };
    },

    reflow,

    toScreen(x, y) { return { x: originX + localX(x), y: originY + localY(y) }; },
    toArt(x, y) {
      return { x: (x - originX - offsetX) / (scale || 1), y: (y - originY - offsetY) / (scale || 1) };
    },
    visibleArt,
    layoutHint,

    rects() {
      measureOrigin();
      return [...spots.values()]
        .sort((a, b) => (a.z - b.z) || (a.order - b.order))
        .map((hs) => ({ id: hs.id, rect: { ...hs.hit }, state: hs.state, enabled: hs.enabled }));
    },

    get(id) { const hs = spots.get(String(id)); return hs ? hs.handle : null; },
    has(id) { return spots.has(String(id)); },

    clear() {
      for (const hs of [...spots.values()]) destroySpot(hs);
      spots.clear();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      scene.clear();
      if (bgEl) { bgEl.remove(); bgEl = null; }
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onWinResize);
      window.removeEventListener('orientationchange', onWinResize);
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', onMq);
        else if (mq.removeListener) mq.removeListener(onMq);
      }
      tapSubs.length = 0;
      reflowSubs.length = 0;
      reserveFn = null;
      root.remove();
    },
  };

  /** rects() is read by QA at arbitrary times; a scroll or a HUD-driven layout
   *  shift can move the root without resizing it, so re-read the origin (one
   *  getBoundingClientRect) and re-derive the cached hit boxes if it moved. */
  function measureOrigin() {
    if (destroyed) return;
    const r = root.getBoundingClientRect();
    if (Math.abs(r.left - originX) > 0.5 || Math.abs(r.top - originY) > 0.5) reflow();
  }

  reflow();
  if (background) scene.setBackground(background, { ms: 0 });
  return scene;
}
