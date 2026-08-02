// magnifier-lens.js — a paper magnifying glass the child drags across a scene.
//
// A COMPANION TO hotspot-scene.js, NOT A FORK
// The lens takes a live scene and renders a SECOND, magnified copy of that
// scene's world inside a circular clip. It never reads the scene's internals
// and it never recomputes the art <-> screen transform: `scene.scale`,
// `scene.toScreen()`, `scene.toArt()` and `scene.visibleArt()` are the only
// geometry it is allowed to know, exactly as a consuming game is. That is the
// whole reason this is a separate file: hotspot-scene.js stays byte-identical
// and gains a second consumer instead of a second responsibility.
//
// WHAT THIS MODULE OWNS
//   - the circular clipped viewport and the magnified duplicate world inside it
//   - the drag: window-level pointer handling that can never strand the glass
//   - "the child held still over something" (dwell), reported as a sprite id
//   - resync on scene reflow, prefers-reduced-motion, the glint sheen
//
// WHAT THE GAME OWNS (deliberately NOT in here)
//   - what a bug IS, what finding one means, voice, sfx, scoring, the HUD
//   - the reveal itself. The lens only says "you dwelled on `id`".
//
// THE REVEAL HAND-OFF (the contract that keeps the two modules apart)
// A hidden object exists ONLY in the lens world until it is found. On dwell the
// game runs:
//     lens.markFound(id)           // it stops arming the dwell…
//     hotspot.setSprite(idleUrl)   // …and appears in the base world too
//     hotspot.setEnabled(true)
//     hotspot.pop()
// From that instant the object belongs to hotspot-scene.js and every tap on it
// is ordinary hotspot logic.
//
// THE LENS OWNS A POINTER SURFACE, AND FORWARDS EVERY TAP IT CATCHES
// (revised — the original contract read "THE LENS NEVER HANDLES A TAP: its root
// is pointer-events:none and the single invisible grip button is the only
// pointer target it owns".) That was true and it was also why the glass could
// only be dragged by a small button on its handle: anything larger would have
// eaten the tap on the bug the child had just found underneath it.
//
// The drag surface now covers the ring, the glass and the handle — roughly the
// frame sprite's opaque bounds — and the tap is given back by disambiguation
// rather than by staying out of the way:
//
//   pointerdown anywhere on the surface  -> start TRACKING (nothing moves yet)
//   moved past `dragSlopPx` (12 css px)  -> it is a DRAG; the same window-level
//                                           machinery and the same applyCentre
//                                           as before take over
//   pointerup still inside the slop      -> it is a TAP; the lens goes
//                                           pointer-events:none for one
//                                           `document.elementFromPoint` and
//                                           clicks whatever was underneath
//
// The forward uses `el.click()`, NOT a synthesized pointerup, and that choice is
// load-bearing. shared/js/tap.js runs its action on `pointerup` over the element
// and eats the browser's own click for 700 ms afterwards; the click path is what
// it keeps for keyboard and assistive tech. A synthetic `click()` on an element
// this press never touched with a pointer therefore fires the action EXACTLY
// ONCE — a synthesized pointerdown/pointerup pair would fire it once on the
// pointerup and risk a second time on the browser's compatibility click.
// The browser's own click for this press targets the SURFACE (the common
// ancestor of the down and the up), never the element underneath, so there is
// no second delivery from that direction either.
//
// What is lost: the underlying control's pointerdown `feedback` (hotspot-scene
// uses it for the press-down scale). A tap through the glass acts, and does not
// depress. That is the price of the larger drag surface and it is worth it.
//
// WHY `markFound` AND NOT `hideSprite`. The glass is OPAQUE — it paints its own
// magnified copy of the world — so anything in the base scene underneath it is
// covered. A found object that was removed from the magnified world therefore
// VANISHED at the exact moment the child found it, and only reappeared when the
// glass moved on. Leaving it in the lens world and merely retiring it as a
// dwell candidate is both the honest thing (a magnifier shows the thing it is
// held over, larger) and the kind one: the child sees what they found, at 1.6x,
// for as long as they hold the glass there. `hideSprite` is still exported for
// a game that genuinely wants an object to leave the glass.
//
// ZERO PER-FRAME LAYOUT
// Sizes (the glass, the world, every sprite box, the frame, the grip) are
// written once per resync — i.e. when the scene reflows — and never during a
// drag. A pointer move writes exactly two `transform` strings, both
// `translate3d`, one on the lens and one on the inner world. Nothing is read
// back from the DOM while a finger is down. No `filter`, no `backdrop-filter`:
// that is the thing that kills an old iPad.
//
// THE MAGNIFICATION, IN ONE LINE
// The inner world is the plate drawn at `art · scale · zoom`. Offsetting it by
// `R - centre·scale·zoom` puts the art point under the glass centre exactly AT
// the glass centre — so the glass magnifies in place rather than sliding the
// world sideways as it moves.
//
// NO ASSETS, NO CSS FILE, NO DEPENDENCIES AT ALL
// Every URL the module touches is one the caller passed in
// (interaction-patterns.md #10). Its styles are one `<style id="ml-style">`
// injected at module scope; games override by specificity. It imports nothing —
// not even tap.js. The surface is a DRAG handle that happens to forward taps it
// decides are not drags, and it forwards them by clicking the real control,
// which already has whatever press path its own game gave it. Importing tap.js
// would mean owning a second one.

// --- module constants --------------------------------------------------------

/** Above every hotspot (1000+i) and below a hotspot bubble (5000). */
const LENS_Z = 4000;

/** Defaults. Everything here is overridable per lens; config.json owns the
 *  shipped values (`lens` block) and the P6 polish pass is what tunes them. */
const D = {
  zoom: 1.6,
  glassD: 320,          // ART px — diameter of the transparent glass hole
  gripOffset: 44,       // ART px — glass centre -> grip centre, down the handle
  gripMinCssPx: 140,    // the invisible drag button never gets smaller
  gripSize: 0.8,        // …and is otherwise this fraction of the glass
  dwellMs: 600,
  dwellRadiusArt: 150,
  glintMs: 900,
  frameScale: 1.9,      // frame box edge / glassD
  frameAnchorX: 0.42,   // where the glass hole sits inside the frame box, 0..1
  frameAnchorY: 0.38,
  gripDirX: 0.7,        // the authored handle leaves the ring down-and-right
  gripDirY: 0.7,
  disabledOpacity: 0.55,
  // The drag surface, as multiples of `glassD`. Defaults measured off the
  // shipped bug-hotel magnifier (assets/props/magnifier.webp): the paper ring
  // is fully opaque out to 0.72·glassD from the glass centre and the handle tip
  // is ~1.53·glassD along `gripDir`. A game whose lens art is a different shape
  // overrides them; nothing here has to be exact, because a tap that lands on
  // the surface is forwarded to whatever is underneath either way.
  dragSlopPx: 12,       // CSS px of travel that turns a press into a drag
  dragRing: 1.46,       // surface circle DIAMETER / glassD
  dragHandleLen: 1.58,  // glass centre -> surface bar tip / glassD
  dragHandleW: 0.36,    // surface bar width / glassD
  dragHandleMinPx: 56,  // …and the bar is never thinner than a fingertip
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Normalise a DOMRect or `{x,y,width,height}` to `{x,y,w,h}`. */
function normRect(r) {
  if (!r) return null;
  const x = Number(r.x ?? r.left);
  const y = Number(r.y ?? r.top);
  const w = Number(r.w ?? r.width);
  const h = Number(r.h ?? r.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (!(w > 0) || !(h > 0)) return null;
  return { x, y, w, h };
}

function overlapArea(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

// --- styles (injected once, at module scope) ---------------------------------

const STYLE_ID = 'ml-style';
const CSS = `
.ml-lens{position:absolute;left:0;top:0;pointer-events:none;z-index:${LENS_Z};
  will-change:transform;transform:translate3d(0,0,0);
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;
  transition:opacity 180ms ease}
.ml-lens[hidden]{display:none}
.ml-glass{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:50%;
  overflow:hidden;background:#efe6d2;
  box-shadow:0 0 0 9px #f6efdd,0 0 0 13px #cbb994,0 14px 30px rgba(40,32,18,.34);
  -webkit-transform:translateZ(0);transform:translateZ(0)}
/* Once the authored frame is on screen the CSS stand-in ring must go: the paper
   ring is art, and two rings read as a mistake. The soft cast shadow stays. */
.ml-lens.has-frame > .ml-glass{box-shadow:0 12px 26px rgba(40,32,18,.30)}
.ml-world{position:absolute;left:0;top:0;will-change:transform;
  transform:translate3d(0,0,0);pointer-events:none}
.ml-world-bg{position:absolute;left:0;top:0;display:block;pointer-events:none;
  -webkit-user-drag:none;user-select:none}
.ml-world-sprite{position:absolute;left:0;top:0;display:block;pointer-events:none;
  object-fit:contain;-webkit-user-drag:none;will-change:opacity}
.ml-frame{position:absolute;left:0;top:0;display:block;pointer-events:none;
  object-fit:contain;-webkit-user-drag:none;z-index:2}
.ml-sheen{position:absolute;left:0;top:0;width:46%;height:200%;z-index:1;
  pointer-events:none;opacity:0;will-change:transform,opacity;
  background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.62) 50%,rgba(255,255,255,0) 100%)}
/* The drag surface. The CONTAINER is pointer-events:none and carries the
   listener; its three children are the hit shapes, so the union is exactly
   "ring + glass" ∪ "handle" ∪ "the legacy grip" and the empty corners of the
   frame box stay tappable in the ordinary way. */
.ml-surface{position:absolute;left:0;top:0;width:100%;height:100%;
  pointer-events:none;z-index:3;touch-action:none}
.ml-surface > *{position:absolute;left:0;top:0;margin:0;padding:0;border:0;
  background:transparent;color:transparent;font:inherit;appearance:none;
  -webkit-appearance:none;pointer-events:auto;cursor:grab;touch-action:none;
  -webkit-tap-highlight-color:transparent}
.ml-lens.is-dragging .ml-surface > *{cursor:grabbing}
/* One frame with the whole lens transparent to hit-testing: what
   document.elementFromPoint needs to see the control under the glass. */
.ml-lens.ml-pass,.ml-lens.ml-pass *{pointer-events:none !important}
.ml-lens.is-inert .ml-surface > *{pointer-events:none;cursor:default}
.ml-surface-ring{border-radius:50%}
.ml-surface-handle{transform-origin:0 50%}
.ml-grip:disabled{pointer-events:none;cursor:default}
.ml-grip:focus{outline:none}
.ml-grip:focus-visible{outline:4px solid #ffd24a;outline-offset:-6px;border-radius:50%}
`;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * @typedef {object} LensSprite
 * @property {string} id           stable id; what `onDwell` reports
 * @property {?string} url         image URL, or null for a registered-but-unpainted spot
 * @property {number} x            ART px — the sprite's CENTRE, as everywhere else
 * @property {number} y            ART px — the sprite's CENTRE
 * @property {number} w            ART px — drawn width
 * @property {number} h            ART px — drawn height
 * @property {boolean} [visible=true]
 */

/**
 * Create a magnifier over an existing hotspot scene.
 *
 * The lens mounts INSIDE `scene.el`, so it shares the scene's coordinate space
 * and rides its reflow for free. It is created parked at `start` (or the art
 * centre), enabled, and empty — call `setBackground()` and `setSprites()` to
 * fill the magnified world.
 *
 * @param {object}  scene                 a live `createScene()` result
 * @param {object}  [opts]
 * @param {number}  [opts.zoom=1.6]              magnification inside the glass
 * @param {number}  [opts.glassD=320]            ART px diameter of the glass hole
 * @param {number}  [opts.gripOffset=44]         ART px, glass centre -> grip centre
 * @param {{x:number,y:number}} [opts.gripDir]   handle direction, default down-right
 * @param {number}  [opts.gripMinCssPx=140]      CSS-px floor for the drag button
 * @param {number}  [opts.gripSize=0.8]          drag button edge / glass diameter
 * @param {boolean} [opts.clampGrip=true]        keep the glass clear of the finger
 *        when the press lands on the ring or the handle (a press ON the glass
 *        is never corrected — see the drag section)
 * @param {number}  [opts.dragSlopPx=12]         travel that turns a press into a drag
 * @param {number}  [opts.dragRing=1.46]         drag-surface circle diameter / glassD
 * @param {number}  [opts.dragHandleLen=1.58]    glass centre -> surface bar tip / glassD
 * @param {number}  [opts.dragHandleW=0.36]      surface bar width / glassD
 * @param {number}  [opts.dragHandleMinPx=56]    …and its CSS-px floor
 * @param {string|{url:string,scale:number,anchor:{x:number,y:number}}} [opts.frame]
 *        authored ring+handle cutout with a TRUE ALPHA glass hole. `scale` is
 *        the frame box edge as a multiple of `glassD`; `anchor` is where the
 *        glass hole sits inside that box, as 0..1 fractions.
 * @param {?string} [opts.background=null]        first plate for the glass
 * @param {LensSprite[]} [opts.sprites=[]]        the hidden world
 * @param {{x:number,y:number}} [opts.start]      first parked centre, ART px
 * @param {number}  [opts.dwellMs=600]
 * @param {number}  [opts.dwellRadiusArt=150]
 * @param {number}  [opts.glintMs=900]
 * @param {boolean} [opts.clampToView=true]       keep the glass over the plate
 * @param {?boolean}[opts.reducedMotion=null]     null = live-track the media query
 * @param {boolean} [opts.enabled=true]
 * @param {string}  [opts.className='']
 * @param {string}  [opts.ariaLabel='magnifying glass']
 * @returns {object} the lens
 */
export function createLens(scene, opts = {}) {
  if (!scene || !scene.el || typeof scene.toArt !== 'function' ||
      typeof scene.toScreen !== 'function' || typeof scene.visibleArt !== 'function') {
    throw new TypeError('createLens: scene must be a shared/js/hotspot-scene.js scene');
  }

  injectStyle();

  const artW = num(scene.artW, 1600);
  const artH = num(scene.artH, 1200);

  // --- options ---------------------------------------------------------------
  let zoom = Math.max(1, num(opts.zoom, D.zoom));
  let glassD = Math.max(24, num(opts.glassD, D.glassD));
  let gripOffset = num(opts.gripOffset, D.gripOffset);
  const gripDir = (() => {
    const gx = num(opts.gripDir && opts.gripDir.x, D.gripDirX);
    const gy = num(opts.gripDir && opts.gripDir.y, D.gripDirY);
    const len = Math.hypot(gx, gy) || 1;
    return { x: gx / len, y: gy / len };
  })();
  const gripMinCssPx = Math.max(44, num(opts.gripMinCssPx, D.gripMinCssPx));
  // The grip is sized from the GLASS, not from the sprite, so it scales with
  // the play field. Keep it small enough that `gripOffset` can hold it clear of
  // the glass centre: a button that contains the centre eats the tap on
  // whatever the child has just found there.
  const gripSize = clamp(num(opts.gripSize, D.gripSize), 0.2, 2);
  const clampGrip = opts.clampGrip !== false;
  const clampToView = opts.clampToView !== false;
  // The drag surface (see the header). `drag*` may also arrive inside the
  // `frame` block, because they are measurements OF the frame sprite and a
  // config that already carries `frame.scale` / `frame.anchor` is the honest
  // place to keep them.
  const dragOpt = (opts.drag && typeof opts.drag === 'object') ? opts.drag : {};
  const pickDrag = (key, fallback) => {
    const raw = opts[key] ?? dragOpt[key] ?? (opts.frame && typeof opts.frame === 'object' ? opts.frame[key] : undefined);
    return num(raw, fallback);
  };
  const dragSlopPx = Math.max(0, pickDrag('dragSlopPx', D.dragSlopPx));
  const dragRing = Math.max(1, pickDrag('dragRing', D.dragRing));
  const dragHandleLen = Math.max(0, pickDrag('dragHandleLen', D.dragHandleLen));
  const dragHandleW = Math.max(0, pickDrag('dragHandleW', D.dragHandleW));
  const dragHandleMinPx = Math.max(0, pickDrag('dragHandleMinPx', D.dragHandleMinPx));
  let glintMs = Math.max(0, num(opts.glintMs, D.glintMs));
  let dwellMs = Math.max(0, num(opts.dwellMs, D.dwellMs));
  let dwellRadiusArt = Math.max(1, num(opts.dwellRadiusArt, D.dwellRadiusArt));

  // `frame` is the name in the design doc; `ring` (the plan's working name) and
  // `sprite` (what config.json's `lens` block calls it) are accepted aliases so
  // a consumer cannot silently end up with no frame because of a naming slip.
  const frameRaw = opts.frame ?? opts.ring ?? opts.sprite ?? null;
  const frameOpt = typeof frameRaw === 'string' ? { url: frameRaw } : (frameRaw || {});
  let frameUrl = frameOpt.url || null;
  const frameScale = Math.max(1, num(frameOpt.scale, D.frameScale));
  const frameAnchor = {
    x: clamp(num(frameOpt.anchor && frameOpt.anchor.x, D.frameAnchorX), 0, 1),
    y: clamp(num(frameOpt.anchor && frameOpt.anchor.y, D.frameAnchorY), 0, 1),
  };

  // --- state -----------------------------------------------------------------
  let destroyed = false;
  let enabled = opts.enabled !== false;
  let visible = true;
  let scale = num(scene.scale, 1) || 1;
  let originX = 0;              // art (0,0) in mount-local CSS px
  let originY = 0;
  let glassPx = glassD * scale; // glass diameter in CSS px
  let cx = num(opts.start && opts.start.x, artW / 2);
  let cy = num(opts.start && opts.start.y, artH / 2);
  let reserveFn = null;

  const sprites = new Map();    // id -> { id, url, x, y, w, h, visible, img }
  const moveSubs = [];
  const dwellSubs = [];

  // --- DOM -------------------------------------------------------------------
  const mount = scene.el;

  // NOTE: no `aria-hidden` on the root. It contains the grip <button>, and
  // aria-hidden over a focusable descendant is the classic way to hand a
  // keyboard or switch user a control their screen reader refuses to name.
  // The decorative layers carry it instead.
  const lensEl = document.createElement('div');
  lensEl.className = 'ml-lens' + (opts.className ? ' ' + opts.className : '');

  const glassEl = document.createElement('div');
  glassEl.className = 'ml-glass';
  glassEl.setAttribute('aria-hidden', 'true');

  const worldEl = document.createElement('div');
  worldEl.className = 'ml-world';

  const bgImg = document.createElement('img');
  bgImg.className = 'ml-world-bg';
  bgImg.alt = '';
  bgImg.draggable = false;
  bgImg.decoding = 'async';
  bgImg.style.visibility = 'hidden';

  const sheenEl = document.createElement('div');
  sheenEl.className = 'ml-sheen';

  const frameImg = document.createElement('img');
  frameImg.className = 'ml-frame';
  frameImg.alt = '';
  frameImg.setAttribute('aria-hidden', 'true');
  frameImg.draggable = false;
  frameImg.decoding = 'async';
  frameImg.style.visibility = 'hidden';

  const gripEl = document.createElement('button');
  gripEl.type = 'button';
  gripEl.className = 'ml-grip';
  gripEl.setAttribute('aria-label', String(opts.ariaLabel ?? 'magnifying glass'));

  // NOTE: no `aria-hidden` here either — `surfaceEl` contains `gripEl`, which is
  // the lens's one focusable control.
  const surfaceEl = document.createElement('div');
  surfaceEl.className = 'ml-surface';

  const ringEl = document.createElement('div');
  ringEl.className = 'ml-surface-ring';

  const handleEl = document.createElement('div');
  handleEl.className = 'ml-surface-handle';

  worldEl.appendChild(bgImg);
  glassEl.appendChild(worldEl);
  glassEl.appendChild(sheenEl);
  lensEl.appendChild(glassEl);
  lensEl.appendChild(frameImg);
  surfaceEl.appendChild(handleEl);
  surfaceEl.appendChild(ringEl);
  surfaceEl.appendChild(gripEl);
  lensEl.appendChild(surfaceEl);
  mount.appendChild(lensEl);

  // --- reduced motion --------------------------------------------------------
  const mq = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let rmOverride = opts.reducedMotion === true || opts.reducedMotion === false ? opts.reducedMotion : null;
  let rmLive = mq ? mq.matches : false;
  const isReduced = () => (rmOverride === null ? rmLive : rmOverride);
  const onMq = (e) => { rmLive = !!e.matches; applySpriteTransition(); };
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }

  function applySpriteTransition() {
    const ms = isReduced() ? 220 : 140;
    for (const s of sprites.values()) s.img.style.transition = `opacity ${ms}ms ease`;
  }

  // --- geometry --------------------------------------------------------------

  /**
   * Re-read the ONE transform from the scene's public API. Two DOM reads, both
   * here, both off the drag path: `scene.toScreen()` is arithmetic on the
   * scene's own cached numbers, and the mount rect is the only measurement this
   * module ever takes.
   */
  function readTransform() {
    scale = num(scene.scale, 1) || 1;
    const rect = mount.getBoundingClientRect();
    const p0 = scene.toScreen(0, 0);
    originX = p0.x - rect.left;
    originY = p0.y - rect.top;
    glassPx = Math.max(2, glassD * scale);
  }

  /** All the size writes, in one place, run only on resync. */
  function layout() {
    if (destroyed) return;
    readTransform();

    lensEl.style.width = glassPx + 'px';
    lensEl.style.height = glassPx + 'px';

    const wz = scale * zoom;
    worldEl.style.width = artW * wz + 'px';
    worldEl.style.height = artH * wz + 'px';
    bgImg.style.width = artW * wz + 'px';
    bgImg.style.height = artH * wz + 'px';

    for (const s of sprites.values()) layoutSprite(s, wz);

    const fw = glassD * frameScale * scale;
    const fh = fw;
    frameImg.style.width = fw + 'px';
    frameImg.style.height = fh + 'px';
    frameImg.style.left = (glassPx / 2 - frameAnchor.x * fw) + 'px';
    frameImg.style.top = (glassPx / 2 - frameAnchor.y * fh) + 'px';

    const gs = Math.max(gripMinCssPx, glassPx * gripSize);
    gripEl.style.width = gs + 'px';
    gripEl.style.height = gs + 'px';
    gripEl.style.left = (glassPx / 2 + gripOffset * gripDir.x * scale - gs / 2) + 'px';
    gripEl.style.top = (glassPx / 2 + gripOffset * gripDir.y * scale - gs / 2) + 'px';

    // The drag surface: a circle over ring+glass, and a rounded bar out along
    // the handle. Written here, with every other size, so a pointer move still
    // costs exactly two transform strings and zero layout.
    const ringD = glassPx * dragRing;
    ringEl.style.width = ringD + 'px';
    ringEl.style.height = ringD + 'px';
    ringEl.style.left = (glassPx / 2 - ringD / 2) + 'px';
    ringEl.style.top = (glassPx / 2 - ringD / 2) + 'px';

    const hw = Math.max(dragHandleMinPx, glassPx * dragHandleW);
    const hl = glassPx * dragHandleLen;
    handleEl.style.width = hl + 'px';
    handleEl.style.height = hw + 'px';
    handleEl.style.left = (glassPx / 2) + 'px';
    handleEl.style.top = (glassPx / 2 - hw / 2) + 'px';
    handleEl.style.borderRadius = (hw / 2) + 'px';
    handleEl.style.transform = `rotate(${Math.atan2(gripDir.y, gripDir.x) * 180 / Math.PI}deg)`;

    sheenEl.style.height = glassPx * 2 + 'px';
    sheenEl.style.top = -glassPx / 2 + 'px';

    paint();
  }

  function layoutSprite(s, wz) {
    s.img.style.left = (s.x - s.w / 2) * wz + 'px';
    s.img.style.top = (s.y - s.h / 2) * wz + 'px';
    s.img.style.width = s.w * wz + 'px';
    s.img.style.height = s.h * wz + 'px';
  }

  /** The whole per-move cost: two transform strings, zero reads. */
  function paint() {
    const r = glassPx / 2;
    lensEl.style.transform =
      `translate3d(${originX + cx * scale - r}px, ${originY + cy * scale - r}px, 0)`;
    const wz = scale * zoom;
    worldEl.style.transform =
      `translate3d(${r - cx * wz}px, ${r - cy * wz}px, 0)`;
  }

  /** Keep the glass over painted plate: never let it hang off the crop. */
  function clampCentre(x, y) {
    if (!clampToView) return { x, y };
    const v = scene.visibleArt();
    const rArt = glassD / 2;
    const loX = Math.max(0, v.x) + rArt;
    const hiX = Math.min(artW, v.x + v.w) - rArt;
    const loY = Math.max(0, v.y) + rArt;
    const hiY = Math.min(artH, v.y + v.h) - rArt;
    return {
      x: loX <= hiX ? clamp(x, loX, hiX) : (loX + hiX) / 2,
      y: loY <= hiY ? clamp(y, loY, hiY) : (loY + hiY) / 2,
    };
  }

  function reserves() {
    if (!reserveFn) return null;
    try {
      const raw = reserveFn();
      if (!Array.isArray(raw)) return null;
      const list = raw.map(normRect).filter(Boolean);
      return list.length ? list : null;
    } catch { return null; }
  }

  /**
   * Nudge a PARKED lens out from under the HUD. Shortest-axis push, at most two
   * passes, and the art clamp always wins — a lens that cannot escape simply
   * stays put, which is visibly odd but never broken. Deliberately NOT applied
   * while a finger is down: nothing fights the child's own hand.
   */
  function avoidReserves(x, y) {
    const list = reserves();
    if (!list) return { x, y };
    let out = { x, y };
    for (let pass = 0; pass < 2; pass++) {
      const c = scene.toScreen(out.x, out.y);
      const box = { x: c.x - glassPx / 2, y: c.y - glassPx / 2, w: glassPx, h: glassPx };
      let worst = null;
      let worstArea = glassPx * glassPx * 0.12;
      for (const r of list) {
        const a = overlapArea(box, r);
        if (a > worstArea) { worstArea = a; worst = r; }
      }
      if (!worst) break;
      const outs = [
        { dx: -((box.x + box.w) - worst.x), dy: 0 },
        { dx: (worst.x + worst.w) - box.x, dy: 0 },
        { dx: 0, dy: -((box.y + box.h) - worst.y) },
        { dx: 0, dy: (worst.y + worst.h) - box.y },
      ];
      outs.sort((a, b) => (Math.abs(a.dx) + Math.abs(a.dy)) - (Math.abs(b.dx) + Math.abs(b.dy)));
      const best = outs[0];
      const moved = clampCentre(out.x + best.dx / scale, out.y + best.dy / scale);
      if (Math.abs(moved.x - out.x) < 0.5 && Math.abs(moved.y - out.y) < 0.5) break;
      out = moved;
    }
    return out;
  }

  /**
   * THE one place the centre ever changes — drag, moveTo, keyboard and resync
   * all land here, which is what makes `QLOBE_DEBUG.setLens()` a truthful
   * rehearsal of a real finger rather than a parallel code path.
   */
  function applyCentre(x, y, { settle = false } = {}) {
    if (destroyed) return;
    let p = clampCentre(num(x, cx), num(y, cy));
    if (settle) p = avoidReserves(p.x, p.y);
    cx = p.x;
    cy = p.y;
    paint();
    for (const cb of moveSubs.slice()) {
      try { cb({ x: cx, y: cy }); } catch (err) { console.warn('[magnifier-lens] onMove threw', err); }
    }
    updateDwell();
  }

  // --- dwell -----------------------------------------------------------------
  // "The child held the glass still over something." One candidate at a time:
  // the nearest VISIBLE sprite within `dwellRadiusArt` of the glass centre. The
  // timer starts when a candidate is acquired and is thrown away the moment the
  // candidate changes — including to `null`, which is what "the centre left the
  // radius" means. A hidden sprite is not a candidate, so a revealed object can
  // never re-arm: that is §5.2.5 falling out of the data model rather than
  // being special-cased.

  const dwell = { id: null, timer: 0, fired: false };

  function clearDwellTimer() {
    if (dwell.timer) { clearTimeout(dwell.timer); dwell.timer = 0; }
  }

  function nearestSprite() {
    let best = null;
    let bestD = dwellRadiusArt;
    for (const s of sprites.values()) {
      if (!s.visible || s.found) continue;
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d <= bestD) { bestD = d; best = s; }
    }
    return best ? { id: best.id, dist: bestD } : null;
  }

  function updateDwell() {
    if (destroyed) return;
    if (!enabled || !dwellSubs.length) {
      clearDwellTimer();
      dwell.id = null;
      dwell.fired = false;
      return;
    }
    const cand = nearestSprite();
    const id = cand ? cand.id : null;
    if (id === dwell.id) return;          // still the same target: keep counting
    clearDwellTimer();
    dwell.id = id;
    dwell.fired = false;
    if (!id) return;
    dwell.timer = setTimeout(fireDwell, dwellMs);
  }

  function fireDwell() {
    dwell.timer = 0;
    if (destroyed || !enabled || !dwell.id) return;
    if (dwell.fired) return;
    dwell.fired = true;
    const s = sprites.get(dwell.id);
    if (!s || !s.visible) return;
    const detail = { id: dwell.id, x: cx, y: cy, dist: Math.hypot(s.x - cx, s.y - cy) };
    for (const cb of dwellSubs.slice()) {
      try { cb(detail); } catch (err) { console.warn('[magnifier-lens] onDwell threw', err); }
    }
  }

  // --- drag (interaction-patterns.md #11) ------------------------------------
  // Listeners live on `window` for the lifetime of the lens and are filtered by
  // `pointerId`. Nothing is attached to the drag surface beyond `pointerdown`
  // (and the grip's own `keydown`), nothing
  // relies on `setPointerCapture` (an iPad drops capture mid-gesture), and every
  // terminal path — up, cancel, blur, tab-hidden, destroy — runs the SAME
  // `endDrag()`, which settles the lens exactly where it is and leaves it
  // draggable again. `pointercancel` is not a completed gesture; it is simply
  // another way for the finger to be gone.

  let dragId = null;
  let grabDX = 0;
  let grabDY = 0;
  let downX = 0;          // client px, for the tap/drag slop
  let downY = 0;
  let dragMoved = false;  // the slop has been crossed: this press IS a drag
  const tapThroughSubs = [];
  let lastTapThrough = null;

  function onSurfaceDown(e) {
    if (destroyed || !enabled || !visible) return;
    if (e.isPrimary === false) return;      // second finger: ignored, not ended
    if (typeof e.button === 'number' && e.button > 0) return;  // right/middle
    if (dragId !== null) return;            // single-drag lock
    dragId = e.pointerId;
    dragMoved = false;
    downX = e.clientX;
    downY = e.clientY;
    const p = scene.toArt(e.clientX, e.clientY);
    grabDX = cx - p.x;
    grabDY = cy - p.y;
    // The glass must never sit under the hand that is moving it — UNLESS the
    // hand deliberately went there. A press on the ring or the handle keeps the
    // original lift, so the old grip behaves exactly as it always did; a press
    // ON THE GLASS is the child saying "move this, from here", and correcting it
    // would make the glass jump out from under their finger at the instant they
    // touched it.
    const grabbedGlass = Math.hypot(p.x - cx, p.y - cy) <= glassD / 2;
    if (clampGrip && !grabbedGlass) {
      const lift = Math.abs(gripOffset * gripDir.y);
      if (grabDY > -lift) grabDY = -lift;
    }
    try { e.preventDefault(); } catch { /* passive listener: nothing to prevent */ }
    // NOTHING MOVES YET. Until the slop is crossed this press is still a
    // candidate tap, and a lens that lurched on contact would make every tap
    // through the glass feel like a mis-hit.
  }

  function onWinMove(e) {
    if (dragId === null || e.pointerId !== dragId) return;
    if (!dragMoved) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < dragSlopPx) return;
      dragMoved = true;
      lensEl.classList.add('is-dragging');
    }
    const p = scene.toArt(e.clientX, e.clientY);
    applyCentre(p.x + grabDX, p.y + grabDY);
  }

  function onWinUp(e) {
    if (dragId === null || e.pointerId !== dragId) return;
    const wasTap = !dragMoved;
    const x = e.clientX;
    const y = e.clientY;
    endDrag('up');
    // A press that never travelled is a TAP on whatever the glass is covering.
    if (wasTap) forwardTap(x, y);
  }

  function onWinCancel(e) {
    if (dragId === null || e.pointerId !== dragId) return;
    // `pointercancel` is not a completed gesture: it is NOT a tap either.
    endDrag('cancel');
  }

  function onWinBlur() {
    if (dragId !== null) endDrag('blur');
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden' && dragId !== null) endDrag('hidden');
  }

  /** Every ending, one function. Never throws; always leaves a usable lens. */
  function endDrag(reason) {
    dragId = null;
    dragMoved = false;
    lensEl.classList.remove('is-dragging');
    try {
      applyCentre(cx, cy, { settle: true });
    } catch (err) {
      console.warn('[magnifier-lens] settle after ' + reason + ' threw', err);
    }
  }

  /** What the glass is covering at this client point, or null. */
  function elementUnder(clientX, clientY) {
    if (typeof document === 'undefined' || !document.elementFromPoint) return null;
    lensEl.classList.add('ml-pass');
    let el = null;
    try {
      el = document.elementFromPoint(clientX, clientY);
    } catch { el = null; } finally {
      lensEl.classList.remove('ml-pass');
    }
    if (!el || lensEl.contains(el)) return null;
    // elementFromPoint can land on a decorative child (a sprite <img> inside a
    // hotspot button); the ACTIVATABLE ancestor is what a real tap would have
    // acted on.
    const hit = typeof el.closest === 'function'
      ? el.closest('button, [role="button"], a[href], input, select, textarea, [data-ml-tap]')
      : null;
    return hit || el;
  }

  /**
   * Deliver a tap to the control under the glass. `click()` and not a synthetic
   * pointer pair — see the header: it is the one path shared/js/tap.js runs
   * exactly once for a press it never saw with a pointer.
   */
  function forwardTap(clientX, clientY) {
    if (destroyed || !enabled || !visible) return null;
    const el = elementUnder(clientX, clientY);
    if (!el || typeof el.click !== 'function') return null;
    if (el.disabled) return null;
    try {
      el.click();
    } catch (err) {
      console.warn('[magnifier-lens] tap-through threw', err);
      return null;
    }
    for (const cb of tapThroughSubs.slice()) {
      try { cb({ el, x: clientX, y: clientY }); } catch (err) { console.warn('[magnifier-lens] onTapThrough threw', err); }
    }
    // hotspot-scene names its buttons with `data-id`; fall back to whatever the
    // element does carry, so the readout is useful for any consumer.
    lastTapThrough = {
      id: (el.dataset && el.dataset.id) || el.id || String(el.className || el.tagName || ''),
      at: Date.now(),
    };
    return el;
  }

  // ONE listener, on the surface CONTAINER: the ring, the handle and the legacy
  // grip button all bubble into it, so there is a single pointerdown path and a
  // press that starts on the grip and one that starts on the glass are the same
  // code from here on.
  surfaceEl.addEventListener('pointerdown', onSurfaceDown);
  window.addEventListener('pointermove', onWinMove, { passive: true });
  window.addEventListener('pointerup', onWinUp, { passive: true });
  window.addEventListener('pointercancel', onWinCancel, { passive: true });
  window.addEventListener('blur', onWinBlur);
  document.addEventListener('visibilitychange', onVisibility);

  /** Keyboard: an arrow-key nudge is the same `applyCentre`, so a child on a
   *  keyboard or switch device reaches every bug the drag reaches. */
  function onGripKey(e) {
    if (destroyed || !enabled) return;
    const step = (e.shiftKey ? 12 : 48);
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;
    e.preventDefault();
    applyCentre(cx + dx, cy + dy, { settle: true });
  }
  gripEl.addEventListener('keydown', onGripKey);

  // --- glint -----------------------------------------------------------------

  let glintRaf = 0;

  /** One sheen sweep across the glass. Resolves when it is over; a no-op that
   *  resolves immediately under reduced motion (§5.2.8). */
  function glint(ms) {
    if (glintRaf) { cancelAnimationFrame(glintRaf); glintRaf = 0; }
    sheenEl.style.opacity = '0';
    const dur = Math.max(0, num(ms, glintMs));
    if (destroyed || isReduced() || !(dur > 0)) return Promise.resolve(false);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const travel = glassPx * 1.9;
      const step = (now) => {
        if (destroyed) { glintRaf = 0; resolve(false); return; }
        const t = clamp((now - t0) / dur, 0, 1);
        sheenEl.style.transform = `translate3d(${-glassPx * 0.5 + travel * t}px, 0, 0) rotate(18deg)`;
        sheenEl.style.opacity = String(Math.sin(t * Math.PI) * 0.9);
        if (t >= 1) {
          sheenEl.style.opacity = '0';
          glintRaf = 0;
          resolve(true);
          return;
        }
        glintRaf = requestAnimationFrame(step);
      };
      glintRaf = requestAnimationFrame(step);
    });
  }

  // --- images ----------------------------------------------------------------

  let bgToken = 0;

  /** Never rejects; a plate that fails to load leaves the previous one up. */
  function setBackground(url) {
    if (destroyed) return Promise.resolve(false);
    const token = ++bgToken;
    if (url == null) {
      bgImg.removeAttribute('src');
      bgImg.style.visibility = 'hidden';
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const probe = new Image();
      probe.decoding = 'async';
      probe.onload = () => {
        if (destroyed || token !== bgToken) { resolve(false); return; }
        bgImg.src = url;
        bgImg.style.visibility = 'visible';
        resolve(true);
      };
      probe.onerror = () => resolve(false);
      probe.src = url;
    });
  }

  let frameToken = 0;

  /** The authored ring+handle. Until it loads (or if it never does) the CSS
   *  stand-in ring keeps the lens readable, which is what P3 builds against. */
  function setFrame(url) {
    if (destroyed) return Promise.resolve(false);
    const token = ++frameToken;
    frameUrl = url || null;
    if (!url) {
      frameImg.removeAttribute('src');
      frameImg.style.visibility = 'hidden';
      lensEl.classList.remove('has-frame');
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const probe = new Image();
      probe.decoding = 'async';
      probe.onload = () => {
        if (destroyed || token !== frameToken) { resolve(false); return; }
        frameImg.src = url;
        frameImg.style.visibility = 'visible';
        lensEl.classList.add('has-frame');
        resolve(true);
      };
      probe.onerror = () => resolve(false);
      probe.src = url;
    });
  }

  function clearSprites() {
    for (const s of sprites.values()) s.img.remove();
    sprites.clear();
  }

  /** Replace the whole hidden world. Bad entries are dropped with a warning
   *  rather than thrown, because a missing bug must not end the round. */
  function setSprites(list) {
    if (destroyed) return 0;
    clearSprites();
    const wz = scale * zoom;
    for (const raw of Array.isArray(list) ? list : []) {
      const id = String((raw && raw.id) ?? '');
      const x = Number(raw && raw.x);
      const y = Number(raw && raw.y);
      const w = Number(raw && raw.w);
      const h = Number(raw && raw.h);
      if (!id || ![x, y, w, h].every(Number.isFinite) || !(w > 0) || !(h > 0)) {
        console.warn('[magnifier-lens] setSprites: skipped a malformed entry', raw);
        continue;
      }
      const img = document.createElement('img');
      img.className = 'ml-world-sprite';
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      const s = {
        id, url: raw.url || null, x, y, w, h, img,
        visible: raw.visible !== false,
        found: raw.found === true,
      };
      if (s.url) img.src = s.url;
      img.style.opacity = s.visible ? '1' : '0';
      layoutSprite(s, wz);
      worldEl.appendChild(img);
      sprites.set(id, s);
    }
    applySpriteTransition();
    updateDwell();
    return sprites.size;
  }

  function setSpriteVisible(id, on) {
    const s = sprites.get(String(id));
    if (!s) return false;
    if (s.visible === !!on) return true;
    s.visible = !!on;
    s.img.style.opacity = s.visible ? '1' : '0';
    updateDwell();
    return true;
  }

  // --- enable / visibility ---------------------------------------------------

  /** A disabled lens is INERT, not merely unresponsive: the surface is large
   *  now, and a large surface that still swallowed pointers while the reward
   *  spread was open would be a dead patch of screen. */
  function applySurfaceHitting() {
    // A CLASS, not `pointer-events:none` on the container: the container is
    // already none — it is the CHILDREN that are the hit shapes, and
    // pointer-events on a parent does not switch an `auto` child off.
    lensEl.classList.toggle('is-inert', !(enabled && visible));
  }

  function setEnabled(on) {
    const next = !!on;
    if (next === enabled) return;
    enabled = next;
    gripEl.disabled = !enabled;
    applySurfaceHitting();
    lensEl.style.opacity = enabled ? '1' : String(D.disabledOpacity);
    if (!enabled && dragId !== null) endDrag('disabled');
    updateDwell();
  }

  function setVisible(on) {
    visible = !!on;
    if (!visible && dragId !== null) endDrag('hidden');
    applySurfaceHitting();
    lensEl.hidden = !visible;
  }

  // --- reflow ----------------------------------------------------------------
  // The scene owns reflow; the lens only reacts to it. Re-clamping the centre
  // afterwards is what keeps a rotated iPad from leaving the glass off-plate.

  const offReflow = typeof scene.onReflow === 'function'
    ? scene.onReflow(() => { layout(); applyCentre(cx, cy); })
    : () => {};

  // --- boot ------------------------------------------------------------------

  gripEl.disabled = !enabled;
  applySurfaceHitting();
  lensEl.style.opacity = enabled ? '1' : String(D.disabledOpacity);
  if (Array.isArray(opts.sprites) && opts.sprites.length) setSprites(opts.sprites);
  layout();
  applyCentre(cx, cy, { settle: true });
  if (opts.background) setBackground(opts.background);
  if (frameUrl) setFrame(frameUrl);

  // --- public lens -----------------------------------------------------------

  const lens = {
    /** The lens root, inside `scene.el`. Read-only in practice. */
    get el() { return lensEl; },
    /** The legacy handle button — still here, still draggable, and still the
     *  lens's one focusable control (arrow keys). QA drives real drags on it. */
    get gripEl() { return gripEl; },
    /** The whole drag surface: ring + glass + handle + the grip inside it. */
    get surfaceEl() { return surfaceEl; },
    get enabled() { return enabled; },
    get visible() { return visible; },
    get dragging() { return dragMoved; },
    /** A pointer is down on the surface — not yet known to be a drag. */
    get pressing() { return dragId !== null; },
    get zoom() { return zoom; },
    get glassD() { return glassD; },
    get reducedMotion() { return isReduced(); },

    setBackground,
    setFrame,
    setSprites,

    /** Put a sprite back into the magnified world. */
    showSprite(id) { return setSpriteVisible(id, true); },
    /** Take a sprite OUT of the magnified world. */
    hideSprite(id) { return setSpriteVisible(id, false); },
    hasSprite(id) { return sprites.has(String(id)); },

    /**
     * Retire a sprite as a dwell candidate WITHOUT removing it from the glass
     * — half of the reveal hand-off (see the header). Idempotent.
     * @param {string} id
     * @param {boolean} [on=true]
     * @returns {boolean} false when there is no such sprite
     */
    markFound(id, on = true) {
      const s = sprites.get(String(id));
      if (!s) return false;
      if (s.found === !!on) return true;
      s.found = !!on;
      updateDwell();
      return true;
    },
    isFound(id) { return Boolean(sprites.get(String(id))?.found); },

    /**
     * Swap one sprite's picture in place (a found object's happy frame), with
     * its box untouched. Returns false when there is no such sprite.
     * @param {string} id
     * @param {?string} url
     */
    setSpriteUrl(id, url) {
      const s = sprites.get(String(id));
      if (!s) return false;
      s.url = url || null;
      if (s.url) s.img.src = s.url;
      else s.img.removeAttribute('src');
      return true;
    },

    /**
     * Move the glass. THE SAME CODE PATH THE DRAG USES.
     * @param {number} artX
     * @param {number} artY
     * @param {{animate?: boolean, ms?: number, settle?: boolean}} [o]
     * @returns {Promise<void>} resolves when the glass has arrived
     */
    moveTo(artX, artY, o = {}) {
      if (destroyed) return Promise.resolve();
      const toX = num(artX, cx);
      const toY = num(artY, cy);
      const wantAnim = o.animate === true && !isReduced();
      const ms = Math.max(0, num(o.ms, 260));
      const settle = o.settle !== false;
      if (!wantAnim || !(ms > 0)) {
        applyCentre(toX, toY, { settle });
        return Promise.resolve();
      }
      const fromX = cx;
      const fromY = cy;
      const t0 = performance.now();
      return new Promise((resolve) => {
        const step = (now) => {
          if (destroyed) { resolve(); return; }
          const t = clamp((now - t0) / ms, 0, 1);
          const e = 1 - Math.pow(1 - t, 3);
          applyCentre(fromX + (toX - fromX) * e, fromY + (toY - fromY) * e,
            { settle: t >= 1 && settle });
          if (t >= 1) { resolve(); return; }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },

    /** `{ x, y }` in ART px — the point the glass is magnifying. */
    getCentre() { return { x: cx, y: cy }; },

    /** @param {(c: {x:number,y:number}) => void} cb @returns {() => void} */
    onMove(cb) {
      if (typeof cb !== 'function') return () => {};
      moveSubs.push(cb);
      return () => { const i = moveSubs.indexOf(cb); if (i >= 0) moveSubs.splice(i, 1); };
    },

    /**
     * Fires once when the glass centre stays within `radiusArt` of a VISIBLE
     * registered sprite for `ms`. Re-arms only when the centre leaves that
     * sprite's radius; never re-arms for a sprite that has been hidden.
     *
     * `opts` is lens-wide (last writer wins), so `QLOBE_DEBUG.fastTimer` can
     * drop `ms` to 60 without re-registering anything.
     *
     * @param {(d: {id:string, x:number, y:number, dist:number}) => void} cb
     * @param {{radiusArt?: number, ms?: number}} [o]
     * @returns {() => void}
     */
    onDwell(cb, o) {
      if (o) lens.setDwell(o);
      if (typeof cb !== 'function') return () => {};
      dwellSubs.push(cb);
      updateDwell();
      return () => {
        const i = dwellSubs.indexOf(cb);
        if (i >= 0) dwellSubs.splice(i, 1);
        updateDwell();
      };
    },

    /**
     * Fires after a tap on the lens surface has been forwarded to the control
     * underneath. Reporting only — the action has already run.
     * @param {(d: {el: Element, x: number, y: number}) => void} cb
     * @returns {() => void}
     */
    onTapThrough(cb) {
      if (typeof cb !== 'function') return () => {};
      tapThroughSubs.push(cb);
      return () => { const i = tapThroughSubs.indexOf(cb); if (i >= 0) tapThroughSubs.splice(i, 1); };
    },

    /** Re-tune the dwell without touching subscribers (QLOBE_DEBUG.fastTimer). */
    setDwell({ radiusArt, ms } = {}) {
      if (Number.isFinite(Number(radiusArt)) && Number(radiusArt) > 0) dwellRadiusArt = Number(radiusArt);
      if (Number.isFinite(Number(ms)) && Number(ms) >= 0) dwellMs = Number(ms);
      clearDwellTimer();
      dwell.id = null;
      dwell.fired = false;
      updateDwell();
      return { radiusArt: dwellRadiusArt, ms: dwellMs };
    },

    setEnabled,
    setVisible,

    /** Screen rects the parked lens may not sit under (same shape as
     *  `scene.setReserve`). Not enforced while a finger is down. */
    setReserve(fn) {
      reserveFn = typeof fn === 'function' ? fn : null;
      if (!destroyed && dragId === null) applyCentre(cx, cy, { settle: true });
    },

    glint,

    /** Re-read the transform and rewrite every size. Wired to `scene.onReflow`
     *  already; public because a game that resizes its own mount can be ahead
     *  of the observer by a frame. */
    resync() { if (!destroyed) { layout(); applyCentre(cx, cy); } },

    /** One flat snapshot for QLOBE_DEBUG / qa.mjs. */
    getState() {
      return {
        x: cx, y: cy, scale, glassPx, zoom,
        enabled, visible,
        /** A press is being TRACKED (it may still turn out to be a tap). */
        pressing: dragId !== null,
        /** The slop has been crossed: the glass is really being dragged. */
        dragging: dragMoved,
        slopPx: dragSlopPx,
        lastTapThrough,
        reducedMotion: isReduced(),
        dwell: { id: dwell.id, fired: dwell.fired, ms: dwellMs, radiusArt: dwellRadiusArt },
        sprites: [...sprites.values()].map((s) => ({
          id: s.id, x: s.x, y: s.y, visible: s.visible, found: Boolean(s.found),
        })),
      };
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (dragId !== null) { dragId = null; dragMoved = false; lensEl.classList.remove('is-dragging'); }
      clearDwellTimer();
      if (glintRaf) { cancelAnimationFrame(glintRaf); glintRaf = 0; }
      surfaceEl.removeEventListener('pointerdown', onSurfaceDown);
      gripEl.removeEventListener('keydown', onGripKey);
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointercancel', onWinCancel);
      window.removeEventListener('blur', onWinBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', onMq);
        else if (mq.removeListener) mq.removeListener(onMq);
      }
      try { offReflow(); } catch { /* the scene may already be gone */ }
      moveSubs.length = 0;
      dwellSubs.length = 0;
      tapThroughSubs.length = 0;
      clearSprites();
      lensEl.remove();
    },
  };

  return lens;
}
