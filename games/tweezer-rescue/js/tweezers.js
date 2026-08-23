// tweezers.js — the clay tweezer tool: two arm sprites pivoting around a
// shared hinge, window-level pointer lifecycle, velocity-driven pendulum
// wobble on the carried critter, and the ghost demonstration used by the
// idle-nudge ladder.
//
// Coordinate model
// ----------------
// The tool container's local origin is the TIPS' meeting point. The container
// is translated to (pointerX, pointerY - lift) and rotated by angleDeg (~-35°)
// so the body extends up-right and the tips sit at/above the touch point
// (finger occlusion). Each arm <img> is placed so its authored hinge pixel
// (assets/sprites/tweezers.json `pivot`, defensively defaulted) lands at local
// (tipLen, 0); closing rotates the top arm by -c and the bottom by +c around
// that hinge — continuous, never a two-frame swap. Authored art is the OPEN
// pose; `c` = openDeg - currentOpen.
//
// Pendulum wobble (tuned at tablet size, at peak motion):
//   target angle = clamp(-vx * VEL_TO_DEG, ±MAX_SWING)   vx in px/s, smoothed
//   spring:  acc = (target - ang) * SPRING - vel * DAMP   (underdamped, ~0.37)
// A brisk 400 px/s drag reads as ~18°, capped at 22°, with visible overshoot
// when the finger stops. Under prefers-reduced-motion the wobble is held at 0.
//
// pointercancel and window blur are CANCELS (critter returns), never drops.
// One active drag; secondary pointers feed the pinch enhancement only.
//
// Carried-critter anchor (B1/M3 fix)
// -----------------------------------
// The carried critter used to hang at a FIXED offset from the pointer,
// captured once at grab time (wherever inside the critter the child happened
// to touch) — unrelated to where the tweezer tips actually render, which is
// why the tips could visually stab through or float away from the critter's
// body. Instead of hand-deriving the tip screen position from the hinge/
// rotation matrices (error-prone), two zero-size marker elements
// (`.tw-tip-marker`) are planted as children of each arm image at its
// authored `tipTop`/`tipBottom` pixel (tweezers.json). Every carried frame,
// their real `getBoundingClientRect()` gives the browser's own, always-
// correct screen position for that exact pixel — through the container
// translate/rotate AND the arm's own squeeze rotation, with no matrix math
// of ours to get wrong. The critter is anchored to the midpoint of those two
// points (pendulum wobble still swings it, rotated about the pointer, same
// as before); its render size is fit to the live tip-to-tip span so the
// tips read as touching its edges with a sliver of gap, never burying
// inside it. A soft CSS ellipse shadow rides the same anchor as a second,
// non-color "this one is picked up" cue (M3) — fx, not an illustrated
// object, same convention as `.tw-spark`.

const DEFAULT_META = {
  canvas: { w: 1100, h: 360 },
  pivot: { x: 980, y: 180 },
  tip: { x: 60, y: 180 },
  tipTop: { x: 60, y: 140 },
  tipBottom: { x: 60, y: 220 },
};

const MAX_SWING = 22;        // deg — pendulum cap, big enough to read on iPad
const VEL_TO_DEG = 0.045;    // deg per px/s of horizontal finger velocity
const SPRING = 90;           // 1/s^2
const DAMP = 7;              // 1/s  (damping ratio ≈ 0.37 — visible overshoot)
const VEL_TAU = 80;          // ms — velocity smoothing time constant
const LIFT = 12;             // css px the tips ride above the touch point
const HIDE_AFTER = 1600;     // ms without pointer activity before tool fades
const SQUEEZE_MS = 120;      // open→closed tween
const PINCH_GRAB_DEG = 4;    // pinch closing past this grabs
const PINCH_OPEN_DEG = 10;   // pinch opening past this releases
const CARRY_FIT = 1.24;      // target: critter's max dimension = tip span * this
const CARRY_MIN_SCALE = 0.65; // never shrink a carried critter below this (art-director floor: keep the held critter clearly "the same" critter)
const CARRY_MAX_SCALE = 1.05; // never blow it up past a hair over natural size

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/** merge a point defensively over a fallback — used for the meta json, which
 * may be missing entirely, missing a field, or (placeholder-era) absent. */
function readPoint(obj, fallback) {
  return {
    x: Number.isFinite(Number(obj?.x)) ? Number(obj.x) : fallback.x,
    y: Number.isFinite(Number(obj?.y)) ? Number(obj.y) : fallback.y,
  };
}

/**
 * @param {object} opts
 * @param {Element} opts.layer        mount for the tool (fixed, full-viewport)
 * @param {string} opts.topSrc
 * @param {string} opts.bottomSrc
 * @param {string} [opts.metaUrl]     hinge metadata json (may not exist yet)
 * @param {number} [opts.angleDeg]
 * @param {number} [opts.openDeg]
 * @param {number} [opts.closedDeg]
 * @param {() => number} opts.getDisplayLength  css px tool length (scene-scaled)
 * @param {() => boolean} opts.canStart         false = ignore pointerdown
 * @param {(x:number, y:number) => object|null} opts.pick  critter handle or null;
 *   handle: { id, el, cx, cy } with cx/cy the critter centre in client px
 * @param {(handle) => void} opts.onGrab
 * @param {(handle, x:number, y:number) => void} opts.onRelease  game decides drop/return
 * @param {(handle) => void} opts.onCancel      critter floats back, silently
 * @param {() => boolean} opts.reducedMotion
 */
export function createTweezers(opts) {
  const {
    layer, topSrc, bottomSrc, metaUrl,
    angleDeg = -35, openDeg = 13, closedDeg = 1.5,
    getDisplayLength, canStart, pick, onGrab, onRelease, onCancel,
    reducedMotion = () => false,
  } = opts;

  let meta = DEFAULT_META;

  // ---- DOM -----------------------------------------------------------------
  // Each arm is a plain positioned <div> (armTop/armBottom below) — NOT the
  // <img> itself — because <img> is a replaced element with no content
  // model: a child appended into an <img> never gets laid out (its
  // getBoundingClientRect() is permanently 0,0,0,0). The div carries the
  // placement/rotation math exactly as before; the sprite <img> and the tip
  // marker are its two ordinary children.
  const tool = document.createElement('div');
  tool.className = 'tw-tool';
  function makeArm(cls, src) {
    const wrap = document.createElement('div');
    wrap.className = `tw-arm ${cls}`;
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.draggable = false;
    // Zero-size marker planted at the authored tip pixel of this arm — see
    // "Carried-critter anchor" above. getBoundingClientRect() on it each
    // frame gives the true, browser-computed screen position of that pixel.
    const marker = document.createElement('i');
    marker.className = 'tw-tip-marker';
    wrap.append(img, marker);
    return { wrap, marker };
  }
  const top = makeArm('tw-arm-top', topSrc);
  const bottom = makeArm('tw-arm-bottom', bottomSrc);
  const armTop = top.wrap;
  const armBottom = bottom.wrap;
  const tipMarkerTop = top.marker;
  const tipMarkerBottom = bottom.marker;
  tool.append(armBottom, armTop);
  layer.append(tool);

  // ---- geometry ------------------------------------------------------------
  let armScale = 0.4;
  let tipLen = 300;

  function layout() {
    const len = Math.max(120, Number(getDisplayLength()) || 320);
    armScale = len / meta.canvas.w;
    tipLen = Math.max(40, (meta.pivot.x - meta.tip.x) * armScale);
    for (const arm of [armTop, armBottom]) {
      arm.style.width = `${meta.canvas.w * armScale}px`;
      arm.style.height = `${meta.canvas.h * armScale}px`;
      arm.style.left = `${tipLen - meta.pivot.x * armScale}px`;
      arm.style.top = `${-meta.pivot.y * armScale}px`;
      arm.style.transformOrigin = `${meta.pivot.x * armScale}px ${meta.pivot.y * armScale}px`;
    }
    tipMarkerTop.style.left = `${meta.tipTop.x * armScale}px`;
    tipMarkerTop.style.top = `${meta.tipTop.y * armScale}px`;
    tipMarkerBottom.style.left = `${meta.tipBottom.x * armScale}px`;
    tipMarkerBottom.style.top = `${meta.tipBottom.y * armScale}px`;
  }

  // Hinge metadata is produced alongside the arm art and MAY not exist yet —
  // merge defensively over the defaults and never let a 404 break the tool.
  const metaReady = (async () => {
    if (!metaUrl) return;
    try {
      const res = await fetch(metaUrl);
      if (!res.ok) return;
      const json = await res.json();
      meta = {
        canvas: {
          w: Number(json?.canvas?.w) > 0 ? Number(json.canvas.w) : DEFAULT_META.canvas.w,
          h: Number(json?.canvas?.h) > 0 ? Number(json.canvas.h) : DEFAULT_META.canvas.h,
        },
        pivot: {
          x: Number.isFinite(Number(json?.pivot?.x)) ? Number(json.pivot.x) : DEFAULT_META.pivot.x,
          y: Number.isFinite(Number(json?.pivot?.y)) ? Number(json.pivot.y) : DEFAULT_META.pivot.y,
        },
        tip: {
          x: Number.isFinite(Number(json?.tip?.x)) ? Number(json.tip.x) : DEFAULT_META.tip.x,
          y: Number.isFinite(Number(json?.tip?.y)) ? Number(json.tip.y) : DEFAULT_META.tip.y,
        },
        // Real assets ship tipTop/tipBottom (the two separate pincer points),
        // not a single generic "tip" — fall back to the legacy singular
        // field, then the default, so an older/placeholder meta still works.
        tipTop: readPoint(json?.tipTop ?? json?.tip, DEFAULT_META.tipTop),
        tipBottom: readPoint(json?.tipBottom ?? json?.tip, DEFAULT_META.tipBottom),
      };
    } catch { /* placeholder-era: defaults are fine */ }
    layout();
  })();
  layout();

  // ---- state ---------------------------------------------------------------
  let activeId = null;          // the one drag pointer
  let px = -9999;
  let py = -9999;
  let lastMoveAt = 0;
  let vx = 0;                   // smoothed px/s
  let vy = 0;
  let open = openDeg;           // current half-angle
  let openTarget = openDeg;
  let pinchOpen = null;         // pinch-mapped opening (overrides tween), or null
  let visible = false;
  let carried = null;           // { handle, natW, natH, shadowEl }
  let wobble = { ang: 0, vel: 0 };
  let rafId = null;
  let lastFrame = 0;
  let disposed = false;
  let demoState = null;         // ghost demonstration timeline

  const secondary = new Map(); // pointerId -> {x, y} for the pinch enhancement

  // ---- render loop ---------------------------------------------------------
  function frame(now) {
    rafId = null;
    const dt = clamp((now - (lastFrame || now)) / 1000, 0.001, 0.05);
    lastFrame = now;

    // velocity decays toward 0 when the finger holds still
    const sinceMove = now - lastMoveAt;
    if (sinceMove > 90) {
      const k = Math.exp(-(sinceMove - 90) / 140);
      vx *= k; vy *= k;
    }

    // arm opening: pinch override, else tween toward target
    if (pinchOpen != null) {
      open += (pinchOpen - open) * clamp(dt * 30, 0, 1);
    } else {
      const rate = (openDeg - closedDeg) / (SQUEEZE_MS / 1000);
      if (open < openTarget) open = Math.min(openTarget, open + rate * dt);
      else if (open > openTarget) open = Math.max(openTarget, open - rate * dt);
    }
    const c = openDeg - open;
    armTop.style.transform = `rotate(${-c}deg)`;
    armBottom.style.transform = `rotate(${c}deg)`;

    // pendulum wobble
    if (reducedMotion()) {
      wobble.ang = 0; wobble.vel = 0;
    } else {
      const target = clamp(-vx * VEL_TO_DEG, -MAX_SWING, MAX_SWING);
      const acc = (target - wobble.ang) * SPRING - wobble.vel * DAMP;
      wobble.vel += acc * dt;
      wobble.ang += wobble.vel * dt;
      wobble.ang = clamp(wobble.ang, -55, 55);
    }

    // tool placement (tips at the pointer, lifted)
    tool.style.transform = `translate(${px}px, ${py - LIFT}px) rotate(${angleDeg}deg)`;

    // carried critter is anchored to the real, DOM-measured tip midpoint
    // (see "Carried-critter anchor" above), then swung by the pendulum
    // wobble as a rotation about the pointer, same as the old fixed-offset
    // scheme — only the offset itself is now correct instead of guessed.
    if (carried) {
      const rt = tipMarkerTop.getBoundingClientRect();
      const rb = tipMarkerBottom.getBoundingClientRect();
      const tipMidX = (rt.left + rb.left) / 2;
      const tipMidY = (rt.top + rb.top) / 2;
      const tipSpan = Math.hypot(rt.left - rb.left, rt.top - rb.top);

      const rad = (wobble.ang * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = tipMidX - px;
      const dy = tipMidY - (py - LIFT);
      const ox = dx * cos - dy * sin;
      const oy = dx * sin + dy * cos;
      const anchorX = px + ox;
      const anchorY = py - LIFT + oy;

      // scale-to-fit: keep the critter's largest dimension close to the
      // live tip span so the tips read as touching its edges with a sliver
      // of gap — never stabbing through, never shrunk to nothing.
      const natMax = Math.max(carried.natW, carried.natH) || 1;
      const fitScale = clamp((tipSpan * CARRY_FIT) / natMax, CARRY_MIN_SCALE, CARRY_MAX_SCALE);

      const el = carried.handle.el;
      el.style.transform = `translate(${anchorX}px, ${anchorY}px) translate(-50%, -50%) rotate(${wobble.ang}deg) scale(${fitScale})`;

      updateCarryShadow(carried, anchorX, anchorY, fitScale);
    }
    if (demoState) demoState.tick(now);

    const idle = !carried && !demoState && activeId === null && (now - lastMoveAt) > HIDE_AFTER;
    if (idle && visible) setVisible(false);
    if (visible || carried || demoState) schedule();
  }

  function schedule() {
    if (rafId == null && !disposed) rafId = requestAnimationFrame(frame);
  }

  function setVisible(on) {
    visible = on;
    tool.classList.toggle('is-visible', on);
    if (on) { lastFrame = 0; schedule(); }
  }

  // ---- carry shadow (M3: a non-color "this one is picked up" cue) ----------
  // Lazily created in the carried critter's own layer (fly-layer, via its
  // parentNode) and inserted just before it so it paints underneath. Runs
  // identically under prefers-reduced-motion — no wobble/arc dependency —
  // which is what keeps the cue consistent between the two render paths.
  function updateCarryShadow(c, anchorX, anchorY, scale) {
    if (!c.shadowEl) {
      const el = c.handle.el;
      const shadow = document.createElement('div');
      shadow.className = 'tw-carry-shadow';
      if (el.parentNode) el.parentNode.insertBefore(shadow, el);
      c.shadowEl = shadow;
    }
    const w = c.natW * scale * 0.62;
    const h = Math.max(8, w * 0.32);
    // Dropped clear of the body's bottom edge (not tucked underneath it,
    // where it would be fully hidden behind the critter's own silhouette).
    const dropY = anchorY + (c.natH * scale) * 0.66;
    c.shadowEl.style.width = `${w}px`;
    c.shadowEl.style.height = `${h}px`;
    c.shadowEl.style.transform = `translate(${anchorX}px, ${dropY}px) translate(-50%, -50%)`;
  }

  function removeCarryShadow(c) {
    if (c && c.shadowEl && c.shadowEl.parentNode) c.shadowEl.parentNode.removeChild(c.shadowEl);
    if (c) c.shadowEl = null;
  }

  // ---- pointer velocity ----------------------------------------------------
  function feedPoint(x, y, now) {
    const dt = Math.max(1, now - lastMoveAt);
    if (lastMoveAt && dt < 400) {
      const ivx = ((x - px) / dt) * 1000;
      const ivy = ((y - py) / dt) * 1000;
      const k = 1 - Math.exp(-dt / VEL_TAU);
      vx += (ivx - vx) * k;
      vy += (ivy - vy) * k;
    }
    px = x; py = y;
    lastMoveAt = now;
  }

  // ---- the REAL handlers ---------------------------------------------------
  // QLOBE_DEBUG's grabAt/dragTo/dropAt route through these exact functions.

  function down(x, y, pointerId = '__debug') {
    if (disposed) return false;
    cancelDemo();
    if (!canStart()) return false;
    if (activeId !== null) return false;         // one active drag, ever
    activeId = pointerId;
    feedPoint(x, y, performance.now());
    setVisible(true);
    openTarget = closedDeg;                       // squeeze
    const handle = pick(x, y);
    if (handle) {
      const rect = handle.el.getBoundingClientRect();  // natural (resting) size, pre-carry
      carried = { handle, natW: rect.width || 1, natH: rect.height || 1, shadowEl: null };
      wobble.vel += (Math.random() - 0.5) * 60;   // little life on pick-up
      try { onGrab(handle); } catch { /* game feedback must not break the drag */ }
    }
    schedule();
    return !!handle;
  }

  function move(x, y, pointerId = '__debug') {
    if (secondary.has(pointerId)) { secondary.set(pointerId, { x, y }); updatePinch(); return; }
    if (activeId !== null && pointerId !== activeId) return;
    feedPoint(x, y, performance.now());
    if (activeId === null) setVisible(true);      // hover: tool follows the finger
    updatePinch();
    schedule();
  }

  function up(x, y, pointerId = '__debug') {
    if (secondary.delete(pointerId)) { if (secondary.size === 0) pinchOpen = null; return; }
    if (pointerId !== activeId) return;
    activeId = null;
    pinchOpen = null;
    secondary.clear();
    openTarget = openDeg;                         // arms open
    feedPoint(x, y, performance.now());
    if (carried) {
      const { handle } = carried;
      removeCarryShadow(carried);
      carried = null;
      try { onRelease(handle, x, y); } catch { /* never strand a critter */ }
    }
    schedule();
  }

  function cancel(pointerId = '__debug') {
    if (secondary.delete(pointerId)) { if (secondary.size === 0) pinchOpen = null; return; }
    if (pointerId !== activeId) return;
    activeId = null;
    pinchOpen = null;
    secondary.clear();
    openTarget = openDeg;
    if (carried) {
      const { handle } = carried;
      removeCarryShadow(carried);
      carried = null;
      try { onCancel(handle); } catch { /* ignore */ }
    }
    schedule();
  }

  // ---- pinch enhancement ---------------------------------------------------
  // While the primary press is down, a second finger's distance maps to the
  // arm opening: closing past PINCH_GRAB_DEG grabs, opening past
  // PINCH_OPEN_DEG releases. The single-pointer path stays fully sufficient.
  function updatePinch() {
    if (activeId === null || secondary.size === 0) return;
    const other = secondary.values().next().value;
    const dist = Math.hypot(other.x - px, other.y - py);
    // 60px apart = closed, 240px apart = fully open
    const mapped = clamp(((dist - 60) / 180) * (openDeg - closedDeg) + closedDeg, closedDeg, openDeg);
    pinchOpen = mapped;
    if (!carried && mapped <= PINCH_GRAB_DEG) {
      const handle = pick(px, py);
      if (handle) {
        const rect = handle.el.getBoundingClientRect();
        carried = { handle, natW: rect.width || 1, natH: rect.height || 1, shadowEl: null };
        try { onGrab(handle); } catch { /* ignore */ }
      }
    } else if (carried && mapped >= PINCH_OPEN_DEG) {
      const { handle } = carried;
      removeCarryShadow(carried);
      carried = null;
      pinchOpen = null;
      try { onRelease(handle, px, py); } catch { /* ignore */ }
    }
  }

  // ---- window listeners ----------------------------------------------------
  function onPointerDown(e) {
    if (e.isPrimary === false) {
      // second finger: pinch input while the primary press is live
      if (activeId !== null) secondary.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    // Let buttons and cards take their own taps.
    if (e.target.closest && e.target.closest('button, a')) return;
    down(e.clientX, e.clientY, e.pointerId);
  }
  function onPointerMove(e) { move(e.clientX, e.clientY, e.pointerId); }
  function onPointerUp(e) { up(e.clientX, e.clientY, e.pointerId); }
  function onPointerCancel(e) { cancel(e.pointerId); }
  function onBlur() { if (activeId !== null) cancel(activeId); }

  let attached = false;
  function attach() {
    if (attached || disposed) return;
    attached = true;
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('blur', onBlur);
  }
  function detach() {
    if (!attached) return;
    attached = false;
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('blur', onBlur);
    if (activeId !== null) cancel(activeId);
    setVisible(false);
  }

  // ---- ghost demonstration (idle-nudge rung 2) ------------------------------
  // Drives the tool along press → squeeze → carry → open with a translucent
  // ghost critter. Pure theatre: game state never changes. Any real
  // pointerdown cancels it.
  function demo({ fromX, fromY, toX, toY, ghostEl }) {
    cancelDemo();
    if (disposed) return Promise.resolve();
    setVisible(true);
    const t0 = performance.now();
    const APPROACH = 700;
    const SQUEEZE = 260;
    const CARRY = 1400;
    const OPEN = 320;
    const startX = fromX + 140;
    const startY = fromY + 120;
    let resolveDone;
    const done = new Promise((r) => { resolveDone = r; });

    demoState = {
      ghostEl,
      tick(now) {
        const t = now - t0;
        if (t < APPROACH) {
          const p = ease(t / APPROACH);
          px = startX + (fromX - startX) * p;
          py = startY + (fromY - startY) * p;
          openTarget = openDeg;
        } else if (t < APPROACH + SQUEEZE) {
          px = fromX; py = fromY;
          openTarget = closedDeg;
          if (ghostEl && !ghostEl.classList.contains('is-on')) ghostEl.classList.add('is-on');
        } else if (t < APPROACH + SQUEEZE + CARRY) {
          const p = ease((t - APPROACH - SQUEEZE) / CARRY);
          // gentle arc between the two anchors
          px = fromX + (toX - fromX) * p;
          py = fromY + (toY - fromY) * p - Math.sin(p * Math.PI) * 90;
          if (ghostEl) ghostEl.style.transform = `translate(${px}px, ${py + 26}px) translate(-50%, -50%)`;
        } else if (t < APPROACH + SQUEEZE + CARRY + OPEN) {
          px = toX; py = toY;
          openTarget = openDeg;
          if (ghostEl) ghostEl.style.transform = `translate(${toX}px, ${toY + 26}px) translate(-50%, -50%)`;
        } else {
          cancelDemo();
        }
        lastMoveAt = now; // keep the tool visible for the duration
      },
      finish() {
        if (ghostEl && ghostEl.parentNode) ghostEl.parentNode.removeChild(ghostEl);
        resolveDone();
      },
    };
    schedule();
    return done;
  }

  function cancelDemo() {
    if (!demoState) return;
    const d = demoState;
    demoState = null;
    openTarget = activeId === null ? openDeg : closedDeg;
    try { d.finish(); } catch { /* ignore */ }
  }

  function ease(p) { return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2; }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelDemo();
    detach();
    if (rafId != null) cancelAnimationFrame(rafId);
    tool.remove();
  }

  return {
    attach,
    detach,
    layout,
    metaReady,
    demo,
    cancelDemo,
    dispose,
    // the real handlers — QLOBE_DEBUG routes through these
    down,
    move,
    up,
    cancel,
    get carrying() { return carried ? carried.handle : null; },
    get carryPoint() { return { x: px, y: py - LIFT }; },
    get wobbleDeg() { return wobble.ang; },
    get openHalfDeg() { return open; },
  };
}
