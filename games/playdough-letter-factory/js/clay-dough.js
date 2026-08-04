// clay-dough.js — the DOM glue between the playdough factory's screens and
// the shared clay solver/renderer. This is the ONLY file in the game that
// imports `shared/js/clay/heightfield.js` or `heightfield-canvas.js`, or
// knows what a `<canvas>` or a pointer event is; the field-space tuning it
// drives lives in the sibling `dough-field.js`, which imports nothing so it
// can be exercised deterministically under node (see that file's header).
//
// Each factory below owns one canvas, one HeightfieldClay, one ClayRenderer,
// and a ResizeObserver, and renders strictly on demand — per
// docs/interaction-patterns.md #12, there is no always-on rAF loop anywhere
// in this file. `renderer.requestDraw()` is the entry point for
// high-frequency pointer paths; `renderer.draw(true)` is called once after
// construction, a resize, or a colour change, matching the renderer's own
// "force a reshade" contract. The one bounded animation — the settle after a
// roll release — runs at most a handful of frames and stops itself; see
// `runBoundedSettle` below.

import { HeightfieldClay } from '../../../shared/js/clay/heightfield.js';
import { ClayRenderer } from '../../../shared/js/clay/heightfield-canvas.js';
import * as dough from './dough-field.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// At most this many settle frames after a roll release. Each frame is one
// relax pass plus one draw; the loop always stops itself, never rescheduling
// once its budget is spent.
const SETTLE_FRAMES = 6;

// MediaQueryList.matches is always live, so reading it fresh at the moment a
// settle is requested already "honours changes" to the OS setting with no
// extra bookkeeping needed between calls.
function prefersReducedMotion() {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// A tiny scheduler shared by any factory that needs a bounded post-gesture
// settle (currently just roll). `run(settleOnce)` cancels any settle already
// in flight, then either does one synchronous relax+draw (reduced motion) or
// steps `settleOnce` + a draw for up to SETTLE_FRAMES real animation frames.
function createBoundedSettle(getRenderer) {
  let handle = null;

  function cancel() {
    if (handle !== null) {
      cancelAnimationFrame(handle);
      handle = null;
    }
  }

  function run(settleOnce) {
    cancel();
    const renderer = getRenderer();
    if (prefersReducedMotion()) {
      settleOnce();
      renderer.draw(true);
      return;
    }
    let remaining = SETTLE_FRAMES;
    const step = () => {
      handle = null;
      if (remaining <= 0) return;
      remaining -= 1;
      settleOnce();
      renderer.draw();
      if (remaining > 0) handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
  }

  return { run, cancel };
}

// Shared scaffolding for all three factories: the canvas, the field, the
// renderer, the resize plumbing, and the client->field mapping. Each factory
// below layers its own edit verbs and its own public method names on top;
// `setColor`/`metrics`/`resize`/`destroy` are identical everywhere, so they
// live here once instead of three times.
function createClayBase(mount, role, fieldSize, resetField, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = `clay-canvas ${role}-canvas`;
  mount.append(canvas);

  const field = new HeightfieldClay(fieldSize.width, fieldSize.height);
  resetField(field);

  // Transparent on purpose: the game's cream tray art shows through, and the
  // renderer's own contact shadow is what grounds the dough on it.
  const renderer = new ClayRenderer(canvas, field, {
    color: options.color,
    background: null,
  });

  let destroyed = false;

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return;
    renderer.resize();
  });
  resizeObserver.observe(mount);
  // The ResizeObserver's first callback is asynchronous; paint once now so
  // the dough is visible immediately rather than on the mount's next resize.
  renderer.resize();
  renderer.draw(true);

  const settle = createBoundedSettle(() => renderer);

  // Uses the canvas's live rect (not a cached one) so this stays correct
  // across resize and orientation change; a zero-size rect (mid-layout,
  // display:none) falls back to a 1px divisor instead of producing NaN, and
  // the result is always clamped into valid field cells either way.
  function toFieldPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    const fx = ((clientX - rect.left) / w) * field.width;
    const fy = ((clientY - rect.top) / h) * field.height;
    return {
      x: clamp(fx, 0, field.width - 1),
      y: clamp(fy, 0, field.height - 1),
    };
  }

  function setColor(hex) {
    if (destroyed) return;
    renderer.setColor(hex);
    renderer.draw(true);
  }

  function metrics() {
    if (destroyed) return { revision: 0, volume: 0, peak: 0, spreadX: 0, spreadY: 0, renders: 0 };
    return { ...dough.fieldMetrics(field), renders: renderer.renders };
  }

  function resize() {
    if (destroyed) return;
    renderer.resize();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    settle.cancel();
    resizeObserver.disconnect();
    renderer.destroy();
    canvas.remove();
  }

  return {
    canvas,
    field,
    renderer,
    settle,
    toFieldPoint,
    setColor,
    metrics,
    resize,
    destroy,
    isDestroyed: () => destroyed,
  };
}

/**
 * Owns the rolling-pin zone's dough. Mounts its own `<canvas class="clay-canvas
 * roll-canvas">` into `mount`.
 * @param {HTMLElement} mount the roll zone element the canvas is appended into.
 * @param {{color?: string}} [options]
 */
export function createRollDough(mount, options = {}) {
  const base = createClayBase(mount, 'roll', dough.ROLL_FIELD, dough.resetRollDough, options);
  // Seeded by begin(), consumed and re-seeded by moveTo(); null between a
  // release() and the next begin() so a stray moveTo() before a fresh press
  // can't smear from a stale position.
  let previousFieldX = null;

  function begin(clientX, clientY) {
    if (base.isDestroyed()) return;
    previousFieldX = base.toFieldPoint(clientX, clientY).x;
  }

  function moveTo(clientX, clientY) {
    if (base.isDestroyed()) return;
    const point = base.toFieldPoint(clientX, clientY);
    if (previousFieldX === null) {
      // First sample after begin() only seeds the tracked position — a
      // rollPass needs two points, and this is the first one.
      previousFieldX = point.x;
      return;
    }
    const changed = dough.rollPass(base.field, previousFieldX, point.x);
    previousFieldX = point.x;
    if (changed) base.renderer?.requestDraw();
  }

  function release() {
    if (base.isDestroyed()) return;
    previousFieldX = null;
    base.settle.run(() => dough.settleRoll(base.field));
  }

  function reset() {
    if (base.isDestroyed()) return;
    previousFieldX = null;
    base.settle.cancel();
    dough.resetRollDough(base.field);
    base.renderer.draw(true);
  }

  return {
    canvas: base.canvas,
    begin,
    moveTo,
    release,
    reset,
    setColor: base.setColor,
    metrics: base.metrics,
    resize: base.resize,
    destroy: base.destroy,
  };
}

/**
 * Owns the tracing tray's pressed sheet. Mounts its own `<canvas
 * class="clay-canvas trace-canvas">` into `mount`. `carve()` is a pure
 * observer of the SVG trace layer's own credited-stroke decision — it never
 * influences whether a stroke counts, only how the dough looks afterward.
 * @param {HTMLElement} mount the trace tray element the canvas is appended into.
 * @param {{color?: string}} [options]
 */
export function createTraceDough(mount, options = {}) {
  const base = createClayBase(mount, 'trace', dough.TRACE_FIELD, dough.resetTraceSlab, options);

  function carve(clientPoints) {
    if (base.isDestroyed() || !clientPoints || clientPoints.length === 0) return;
    const fieldPoints = clientPoints.map((point) => base.toFieldPoint(point.x, point.y));
    const changed = dough.carveGroove(base.field, fieldPoints);
    if (changed) base.renderer?.requestDraw();
  }

  function reset() {
    if (base.isDestroyed()) return;
    dough.resetTraceSlab(base.field);
    base.renderer.draw(true);
  }

  return {
    canvas: base.canvas,
    carve,
    reset,
    setColor: base.setColor,
    metrics: base.metrics,
    resize: base.resize,
    destroy: base.destroy,
  };
}

/**
 * Owns the free-play tray's dough sheet: squeezed rope drags plus letter/star
 * stamps. Mounts its own `<canvas class="clay-canvas free-canvas">` into
 * `mount`.
 * @param {HTMLElement} mount the free tray element the canvas is appended into.
 * @param {{color?: string}} [options]
 */
export function createFreeDough(mount, options = {}) {
  const base = createClayBase(mount, 'free', dough.FREE_FIELD, dough.resetFreeSheet, options);
  let lastPoint = null;
  let stampCount = 0;

  function beginRope(clientX, clientY) {
    if (base.isDestroyed()) return;
    const point = base.toFieldPoint(clientX, clientY);
    lastPoint = point;
    // A tap-and-release with no drag still squeezes out a small dab — a
    // single-point path behaves like one dome, same as depositPath's own tap
    // contract.
    const changed = dough.depositRope(base.field, [point]);
    if (changed) base.renderer?.requestDraw();
  }

  function extendRope(clientX, clientY) {
    if (base.isDestroyed() || !lastPoint) return;
    const point = base.toFieldPoint(clientX, clientY);
    // Only the new segment is deposited — re-depositing the whole path on
    // every move would be O(n^2) on a long squiggle.
    const changed = dough.depositRope(base.field, [lastPoint, point]);
    lastPoint = point;
    if (changed) base.renderer?.requestDraw();
  }

  function endRope() {
    if (base.isDestroyed()) return;
    lastPoint = null;
  }

  function stamp(mark) {
    if (base.isDestroyed()) return;
    const changed = dough.stampGlyph(base.field, mark, stampCount);
    stampCount += 1;
    if (changed) base.renderer?.requestDraw();
  }

  function clear() {
    if (base.isDestroyed()) return;
    lastPoint = null;
    stampCount = 0;
    dough.resetFreeSheet(base.field);
    base.renderer.draw(true);
  }

  return {
    canvas: base.canvas,
    beginRope,
    extendRope,
    endRope,
    stamp,
    clear,
    setColor: base.setColor,
    metrics: base.metrics,
    resize: base.resize,
    destroy: base.destroy,
  };
}
