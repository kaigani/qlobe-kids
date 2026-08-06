/**
 * Small, dependency-free pointer gesture controller for DOM games.
 *
 * It deliberately owns pointer lifetime and slop only. A game supplies the
 * path projection and decides what a progress value means (stops, commits,
 * art, audio, and state all remain game concerns).
 */

/** @param {unknown} value @param {number} fallback */
function number(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

/** @param {number} value */
function unit(value) {
  return Math.max(0, Math.min(1, number(value)));
}

/** @param {object} value */
function xy(value = {}) {
  return {
    x: number(value.x, number(value.clientX)),
    y: number(value.y, number(value.clientY)),
  };
}

/** @param {{ x: number, y: number }} point */
function copyPoint(point) {
  return { x: point.x, y: point.y };
}

/**
 * Project a point onto a finite line segment.
 *
 * @param {{x?: number, y?: number, clientX?: number, clientY?: number}} point
 * @param {{x?: number, y?: number}} start
 * @param {{x?: number, y?: number}} end
 * @returns {{progress: number, point: {x: number, y: number}, projectedPoint: {x: number, y: number}, distance: number}}
 */
export function projectPointToSegment(point, start, end) {
  const p = xy(point);
  const a = xy(start);
  const b = xy(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared > 0
    ? unit(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)
    : 0;
  const projectedPoint = { x: a.x + dx * progress, y: a.y + dy * progress };
  return {
    progress,
    point: copyPoint(projectedPoint),
    projectedPoint,
    distance: Math.hypot(p.x - projectedPoint.x, p.y - projectedPoint.y),
  };
}

/**
 * Project a point onto a polyline, reporting normalized *arc length* rather
 * than a segment-relative fraction. Empty and fully degenerate paths resolve
 * to progress 0 without producing NaN.
 *
 * @param {{x?: number, y?: number, clientX?: number, clientY?: number}} point
 * @param {Array<{x?: number, y?: number}>} points
 * @returns {{progress: number, point: {x: number, y: number}, projectedPoint: {x: number, y: number}, segmentIndex: number, distance: number}}
 */
export function projectPointToPolyline(point, points) {
  const p = xy(point);
  const path = Array.isArray(points) ? points.map(xy) : [];
  if (!path.length) {
    const projectedPoint = { x: 0, y: 0 };
    return { progress: 0, point: copyPoint(projectedPoint), projectedPoint, segmentIndex: -1, distance: Math.hypot(p.x, p.y) };
  }
  if (path.length === 1) {
    const projectedPoint = copyPoint(path[0]);
    return { progress: 0, point: copyPoint(projectedPoint), projectedPoint, segmentIndex: 0, distance: Math.hypot(p.x - projectedPoint.x, p.y - projectedPoint.y) };
  }

  const lengths = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const length = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    lengths.push(length);
    total += length;
  }

  let best = null;
  let travelled = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const result = projectPointToSegment(p, path[i], path[i + 1]);
    // First winner makes ties deterministic, including zero-length segments.
    if (!best || result.distance < best.result.distance) best = { result, index: i, before: travelled };
    travelled += lengths[i];
  }
  const result = best.result;
  const progress = total > 0 ? unit((best.before + result.progress * lengths[best.index]) / total) : 0;
  return {
    progress,
    point: copyPoint(result.point),
    projectedPoint: copyPoint(result.point),
    segmentIndex: best.index,
    distance: result.distance,
  };
}

/**
 * Return the normalized stop nearest to a normalized progress value. Invalid
 * stops are ignored; an empty list falls back to the clamped progress.
 *
 * @param {number} progress
 * @param {number[]} stops
 * @returns {number}
 */
export function nearestStop(progress, stops) {
  const value = unit(progress);
  const candidates = Array.isArray(stops)
    ? stops.filter(Number.isFinite).map(unit)
    : [];
  if (!candidates.length) return value;
  let nearest = candidates[0];
  let distance = Math.abs(value - nearest);
  for (let i = 1; i < candidates.length; i += 1) {
    const nextDistance = Math.abs(value - candidates[i]);
    if (nextDistance < distance) {
      nearest = candidates[i];
      distance = nextDistance;
    }
  }
  return nearest;
}

/**
 * Create a constrained DOM pointer controller.
 *
 * @param {object} options
 * @param {number} [options.slop=10] pixels required before a press is a drag.
 * @param {(id: unknown, meta: object) => unknown} [options.getHandle] resolves
 *   a game handle at the beginning of a manipulator stream.
 * @param {(id: unknown, meta: object, event: PointerEvent) => boolean} [options.canStart]
 * @param {(point: {x:number,y:number}, active: object) => (number|{progress?: number, point?: object, projectedPoint?: object, distance?: number, segmentIndex?: number})} [options.project]
 * @param {(active: object, event: PointerEvent|null) => void} [options.onStart]
 * @param {(active: object, event: PointerEvent|null) => void} [options.onProgress]
 * @param {(active: object, event: PointerEvent|null) => void} [options.onRelease]
 * @param {(active: object, event: PointerEvent|null) => void} [options.onTap]
 * @param {(active: object, reason: string) => void} [options.onCancel]
 * @param {(support: object|null, active: object|null, event: PointerEvent|null) => void} [options.onSupportChange]
 * @returns {{begin: Function, beginSupport: Function, cancel: Function, detach: Function, debugProgress: Function, debugSupport: Function, readonly active: object|null, readonly support: object|null}}
 */
export function createConstrainedGestureDom({
  slop = 10,
  getHandle = (id) => id,
  canStart = () => true,
  project = () => 0,
  onStart = () => {},
  onProgress = () => {},
  onRelease = () => {},
  onTap = () => {},
  onCancel = () => {},
  onSupportChange = () => {},
} = {}) {
  const slopPx = Math.max(0, number(slop, 10));
  let active = null;
  let support = null;
  let listening = false;
  let detached = false;

  const snapshot = (value) => value ? JSON.parse(JSON.stringify(value)) : null;
  const safely = (callback, ...args) => {
    try { callback(...args); return true; } catch { return false; }
  };
  const prevent = (event) => {
    if (event?.cancelable) event.preventDefault();
  };
  const ensureListeners = () => {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up, { passive: false });
    window.addEventListener('pointercancel', pointerCancel, { passive: false });
    window.addEventListener('blur', blur);
    document?.addEventListener?.('visibilitychange', visibility);
  };
  const removeListeners = () => {
    if (!listening || typeof window === 'undefined') return;
    listening = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', pointerCancel);
    window.removeEventListener('blur', blur);
    document?.removeEventListener?.('visibilitychange', visibility);
  };
  const maybeRemoveListeners = () => { if (!active && !support) removeListeners(); };
  // Callbacks receive the live record, including the non-enumerable `handle`.
  // The public getters below instead return a JSON-safe copy of that record.
  const announceSupport = (event = null) => safely(onSupportChange, support, active, event);
  const stopSupport = (event = null) => {
    if (!support) return false;
    support = null;
    announceSupport(event);
    maybeRemoveListeners();
    return true;
  };
  const finishActive = (mode, event = null, reason = mode) => {
    if (!active) return false;
    const final = active;
    active = null;
    if (mode === 'release') safely(onRelease, final, event);
    else if (mode === 'tap') safely(onTap, final, event);
    else safely(onCancel, final, reason);
    maybeRemoveListeners();
    return true;
  };
  const eventPoint = (event) => xy(event);
  const currentProgress = (event, debugMeta = null) => {
    const point = eventPoint(event);
    let projected;
    try { projected = project(point, active); } catch { return false; }
    const result = typeof projected === 'number' ? { progress: projected } : (projected || {});
    active.progress = unit(result.progress);
    active.point = xy(result.projectedPoint || result.point || point);
    active.distance = Number.isFinite(result.distance) ? result.distance : undefined;
    active.segmentIndex = Number.isInteger(result.segmentIndex) ? result.segmentIndex : undefined;
    active.meta = { ...active.meta, ...(debugMeta || {}) };
    return safely(onProgress, active, event || null);
  };

  function move(event) {
    if (active && event.pointerId === active.pointerId) {
      prevent(event);
      active.lastPoint = eventPoint(event);
      if (!active.dragged && Math.hypot(active.lastPoint.x - active.startPoint.x, active.lastPoint.y - active.startPoint.y) >= slopPx) active.dragged = true;
      if (active.dragged && !currentProgress(event)) finishActive('cancel', null, 'callback-error');
      return;
    }
    if (support && event.pointerId === support.pointerId) {
      prevent(event);
      support.point = eventPoint(event);
      if (!announceSupport(event)) stopSupport(null);
    }
  }
  function up(event) {
    if (active && event.pointerId === active.pointerId) {
      prevent(event);
      active.lastPoint = eventPoint(event);
      if (active.dragged && !currentProgress(event)) {
        finishActive('cancel', null, 'callback-error');
        return;
      }
      finishActive(active.dragged ? 'release' : 'tap', event);
    } else if (support && event.pointerId === support.pointerId) {
      prevent(event);
      stopSupport(event);
    }
  }
  function pointerCancel(event) {
    if (active && event.pointerId === active.pointerId) {
      prevent(event);
      finishActive('cancel', null, 'pointercancel');
    } else if (support && event.pointerId === support.pointerId) {
      prevent(event);
      stopSupport(event);
    }
  }
  function blur() { cancel('blur'); }
  function visibility() { if (document?.visibilityState === 'hidden') cancel('visibility'); }

  /** Start the sole manipulator pointer stream. @returns {boolean} */
  function begin(event, id, meta = {}) {
    if (detached || active || !event || !Number.isFinite(event.pointerId) || event.pointerId === support?.pointerId) return false;
    let allowed = false;
    try { allowed = canStart(id, meta, event) !== false; } catch { return false; }
    if (!allowed) return false;
    let handle;
    try { handle = getHandle(id, meta); } catch { return false; }
    if (handle == null) return false;
    prevent(event);
    const startPoint = eventPoint(event);
    active = { id, pointerId: event.pointerId, meta: { ...meta }, startPoint, lastPoint: copyPoint(startPoint), point: copyPoint(startPoint), progress: 0, dragged: false };
    // A handle may be an Element or a rich game object. Keeping it hidden from
    // enumeration lets callback users access it while `controller.active`
    // remains serializable for diagnostics.
    Object.defineProperty(active, 'handle', { value: handle, enumerable: false });
    ensureListeners();
    const source = event.currentTarget || event.target;
    try { source?.setPointerCapture?.(event.pointerId); } catch { /* capture is best-effort */ }
    if (!safely(onStart, active, event)) finishActive('cancel', null, 'callback-error');
    return !!active;
  }

  /** Start the optional second (support) pointer stream. @returns {boolean} */
  function beginSupport(event, meta = {}) {
    if (detached || support || !event || !Number.isFinite(event.pointerId) || event.pointerId === active?.pointerId) return false;
    prevent(event);
    support = { pointerId: event.pointerId, point: eventPoint(event), meta: { ...meta } };
    ensureListeners();
    const source = event.currentTarget || event.target;
    try { source?.setPointerCapture?.(event.pointerId); } catch { /* capture is best-effort */ }
    if (!announceSupport(event)) stopSupport(null);
    return !!support;
  }

  /** Cancel active and support streams without release/commit. */
  function cancel(reason = 'cancel') {
    const hadActive = finishActive('cancel', null, reason);
    stopSupport(null);
    return hadActive;
  }

  /** Cancel streams and permanently detach this controller's global listeners. */
  function detach() {
    if (detached) return;
    cancel('detach');
    detached = true;
    removeListeners();
  }

  /** Invoke the normal progress callback without dispatching a DOM event. */
  function debugProgress(value, meta = {}) {
    if (active) {
      active.dragged = true;
      active.progress = unit(value);
      active.meta = { ...active.meta, ...meta };
      return safely(onProgress, active, null);
    }
    const debug = { id: null, handle: null, pointerId: null, meta: { ...meta }, startPoint: null, lastPoint: null, point: null, progress: unit(value), dragged: true, debug: true };
    return safely(onProgress, debug, null);
  }

  /** Invoke the normal support callback without dispatching a DOM event. */
  function debugSupport(on, meta = {}) {
    support = on ? { pointerId: null, point: null, meta: { ...meta }, debug: true } : null;
    return announceSupport(null);
  }

  return {
    begin,
    beginSupport,
    cancel,
    detach,
    debugProgress,
    debugSupport,
    get active() { return snapshot(active); },
    get support() { return snapshot(support); },
  };
}
