// A forgiving, ordered uppercase-letter tracer. Recipes and ink are normalized
// to 0..1 so rotations and viewport resizes never erase a child's progress.

const MAX_DPR = 2;
const SAMPLE_STEP = 0.008;
const MAX_EVENT_JUMP = 0.24;
const SEARCH_AHEAD = 36;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const asPoint = (value) => Array.isArray(value)
  ? { x: Number(value[0]), y: Number(value[1]) }
  : { x: Number(value?.x), y: Number(value?.y) };

function densify(path) {
  const source = (path || []).map(asPoint).filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
  if (source.length < 2) return source;
  const dense = [source[0]];
  for (let index = 1; index < source.length; index += 1) {
    const from = source[index - 1];
    const to = source[index];
    const count = Math.max(1, Math.ceil(distance(from, to) / SAMPLE_STEP));
    for (let step = 1; step <= count; step += 1) {
      const t = step / count;
      dense.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  }
  return dense;
}

function safeCall(fn, value) {
  if (typeof fn === 'function') {
    try { fn(value); } catch (error) { console.warn('[secret-message-copy] trace callback failed', error); }
  }
}

export const LETTER_STROKES = Object.freeze({
  S: [
    [[.73, .19], [.62, .11], [.43, .10], [.27, .17], [.20, .30], [.28, .42], [.48, .48], [.66, .55], [.76, .68], [.70, .82], [.53, .91], [.32, .89], [.19, .80]],
  ],
  U: [
    [[.22, .13], [.22, .59], [.25, .75], [.36, .87], [.50, .91], [.64, .87], [.75, .75], [.78, .59], [.78, .13]],
  ],
  N: [
    [[.23, .88], [.23, .13]],
    [[.23, .13], [.77, .88]],
    [[.77, .88], [.77, .13]],
  ],
  C: [
    [[.76, .25], [.67, .15], [.52, .10], [.36, .14], [.24, .25], [.18, .43], [.19, .63], [.28, .79], [.42, .89], [.59, .89], [.73, .80]],
  ],
  A: [
    [[.18, .88], [.48, .12]],
    [[.48, .12], [.80, .88]],
    [[.30, .60], [.68, .60]],
  ],
  T: [
    [[.18, .14], [.82, .14]],
    [[.50, .14], [.50, .89]],
  ],
  M: [
    [[.15, .88], [.15, .14], [.49, .59], [.83, .14], [.83, .88]],
  ],
  P: [
    [[.23, .89], [.23, .13]],
    [[.23, .14], [.51, .13], [.69, .19], [.77, .32], [.72, .46], [.60, .54], [.23, .54]],
  ],
  O: [
    [[.51, .10], [.36, .12], [.24, .23], [.18, .41], [.19, .63], [.29, .81], [.43, .90], [.59, .88], [.72, .76], [.80, .57], [.78, .35], [.68, .18], [.51, .10]],
  ],
  W: [
    [[.12, .15], [.27, .88], [.50, .49], [.72, .88], [.88, .15]],
  ],
  L: [
    [[.24, .13], [.24, .87], [.80, .87]],
  ],
});

/** Create one canvas tracer. Every accepted pointer moves through this object. */
export function createLetterTracer({
  canvas,
  reducedMotion = false,
  tolerance = .12,
  completionThreshold = .94,
  onProgress,
  onStrokeComplete,
  onLetterComplete,
  onNudge,
} = {}) {
  if (!canvas?.getContext) throw new TypeError('createLetterTracer needs a canvas element.');
  const context = canvas.getContext('2d');
  if (!context) throw new TypeError('Secret Message Copy needs a 2D canvas context.');

  const state = {
    id: null,
    strokes: [],
    stroke: 0,
    sample: 0,
    completed: [],
    ink: [],
    drawing: false,
    pointerId: null,
    last: null,
    badInputs: 0,
    rect: null,
    dpr: 1,
    demoStarted: 0,
    demoUntil: 0,
    destroyed: false,
  };

  let animationFrame = 0;

  const now = () => globalThis.performance?.now?.() || Date.now();
  const bounds = () => canvas.getBoundingClientRect?.() || {
    left: 0,
    top: 0,
    width: canvas.clientWidth || 1,
    height: canvas.clientHeight || 1,
  };
  const activePath = () => state.strokes[state.stroke] || [];
  const expectedPoint = () => activePath()[Math.min(state.sample, Math.max(0, activePath().length - 1))] || null;

  function eventPoint(event) {
    const rect = bounds();
    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    };
  }

  function drawPath(points, width, color, dash = []) {
    if (!points?.length || !state.rect) return;
    context.beginPath();
    context.setLineDash(dash);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = width;
    context.strokeStyle = color;
    context.moveTo(points[0].x * state.rect.width, points[0].y * state.rect.height);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x * state.rect.width, points[index].y * state.rect.height);
    }
    context.stroke();
    context.setLineDash([]);
  }

  function drawStart(point, active = true) {
    if (!point || !state.rect) return;
    const x = point.x * state.rect.width;
    const y = point.y * state.rect.height;
    const pulse = reducedMotion ? 0 : Math.sin(now() / 210) * 2;
    context.save();
    context.shadowColor = 'rgba(255, 197, 44, .9)';
    context.shadowBlur = active ? 13 + pulse : 5;
    context.fillStyle = active ? '#f7bd2e' : '#173e63';
    context.beginPath();
    context.arc(x, y, 11 + pulse * .35, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function render() {
    if (state.destroyed || !state.rect) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(state.dpr, state.dpr);

    for (let index = 0; index < state.strokes.length; index += 1) {
      const path = state.strokes[index];
      if (index < state.stroke) drawPath(path, 17, 'rgba(24, 71, 100, .95)');
      else drawPath(path, 8, index === state.stroke ? 'rgba(38, 92, 122, .48)' : 'rgba(38, 92, 122, .24)', [5, 15]);
    }

    const current = activePath();
    if (current.length && state.stroke < state.strokes.length) drawStart(expectedPoint() || current[0], true);
    if (state.ink.length > 1) drawPath(state.ink, 18, 'rgba(28, 67, 98, .98)');

    if (state.demoUntil > now() && current.length) {
      const duration = Math.max(1, state.demoUntil - state.demoStarted);
      const amount = reducedMotion ? .42 : clamp((now() - state.demoStarted) / duration, 0, 1);
      drawPath(current.slice(0, Math.max(2, Math.ceil(current.length * amount))), 18, 'rgba(247, 189, 46, .92)');
    }
    context.restore();

    if (!reducedMotion && (state.demoUntil > now() || (!state.drawing && state.stroke < state.strokes.length))) scheduleRender();
  }

  function scheduleRender() {
    if (animationFrame || state.destroyed || typeof requestAnimationFrame !== 'function') return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0;
      render();
    });
  }

  function getState() {
    const path = activePath();
    const strokeProgress = path.length ? state.sample / Math.max(1, path.length - 1) : 0;
    return {
      id: state.id,
      stroke: state.stroke,
      strokes: state.strokes.length,
      sample: state.sample,
      strokeProgress,
      progress: state.strokes.length ? Math.min(1, (state.stroke + strokeProgress) / state.strokes.length) : 0,
      complete: state.strokes.length > 0 && state.stroke >= state.strokes.length,
      drawing: state.drawing,
      pointerId: state.pointerId,
      badInputs: state.badInputs,
    };
  }

  function publish() {
    safeCall(onProgress, getState());
  }

  function cancelPointer({ nudge = false, reason = 'cancel' } = {}) {
    if (!state.drawing && state.pointerId === null) return false;
    state.drawing = false;
    state.pointerId = null;
    state.last = null;
    if (nudge) {
      state.badInputs += 1;
      safeCall(onNudge, { ...getState(), reason });
    }
    publish();
    render();
    return true;
  }

  function finishStroke() {
    const finishedIndex = state.stroke;
    state.completed.push(activePath().slice());
    state.stroke += 1;
    state.sample = 0;
    state.ink = [];
    state.drawing = false;
    state.pointerId = null;
    state.last = null;
    safeCall(onStrokeComplete, { ...getState(), finishedStroke: finishedIndex });
    publish();
    render();
    if (state.stroke >= state.strokes.length && state.strokes.length) safeCall(onLetterComplete, { ...getState(), complete: true });
  }

  function pointerDown(value, pointerId = 'debug-trace') {
    const point = asPoint(value);
    const expected = expectedPoint();
    if (state.destroyed || state.drawing || !expected || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (distance(point, expected) > tolerance * 1.25) {
      state.badInputs += 1;
      safeCall(onNudge, { ...getState(), reason: 'start' });
      render();
      return false;
    }
    state.drawing = true;
    state.pointerId = pointerId;
    state.last = point;
    if (!state.ink.length) state.ink.push(point);
    else if (distance(state.ink.at(-1), point) > .015) state.ink.push(point);
    publish();
    render();
    return true;
  }

  function pointerMove(value, pointerId = 'debug-trace') {
    const point = asPoint(value);
    const path = activePath();
    if (!state.drawing || !path.length || (pointerId !== state.pointerId && pointerId !== 'debug-trace')) return false;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (state.last && distance(state.last, point) > MAX_EVENT_JUMP) {
      cancelPointer({ nudge: true, reason: 'jump' });
      return false;
    }

    let bestIndex = state.sample;
    let bestDistance = Infinity;
    const end = Math.min(path.length - 1, state.sample + SEARCH_AHEAD);
    for (let index = Math.max(0, state.sample - 2); index <= end; index += 1) {
      const candidateDistance = distance(point, path[index]);
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance;
        bestIndex = index;
      }
    }
    if (bestDistance > tolerance) {
      cancelPointer({ nudge: true, reason: 'off-path' });
      return false;
    }

    state.sample = Math.max(state.sample, bestIndex);
    state.last = point;
    state.ink.push(point);
    publish();
    const fraction = state.sample / Math.max(1, path.length - 1);
    if (fraction >= completionThreshold && distance(point, path.at(-1)) <= tolerance * 1.35) finishStroke();
    else render();
    return true;
  }

  function pointerUp(pointerId = state.pointerId) {
    if (!state.drawing || (pointerId !== state.pointerId && pointerId !== 'debug-trace')) return false;
    // Lifting is allowed. The golden dot moves to the saved point so a young
    // child can continue a long stroke without losing earned progress.
    return cancelPointer({ nudge: false, reason: 'lift' });
  }

  const onPointerDown = (event) => {
    if (event.isPrimary === false) return;
    if (!pointerDown(eventPoint(event), event.pointerId)) return;
    event.preventDefault();
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* capture is an enhancement */ }
  };
  const onPointerMove = (event) => {
    if (!state.drawing || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    pointerMove(eventPoint(event), event.pointerId);
  };
  const onPointerUp = (event) => {
    if (event.pointerId !== state.pointerId) return;
    pointerUp(event.pointerId);
    try { canvas.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
  };
  const onPointerCancel = (event) => {
    if (event.pointerId !== state.pointerId) return;
    cancelPointer({ nudge: false, reason: 'cancel' });
    try { canvas.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
  };
  const onBlur = () => cancelPointer({ nudge: false, reason: 'blur' });

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('blur', onBlur);

  function setLetter({ id, strokes = LETTER_STROKES[id], color } = {}) {
    state.id = String(id || '').toUpperCase() || null;
    state.strokes = (strokes || []).map(densify).filter((path) => path.length > 1);
    state.stroke = 0;
    state.sample = 0;
    state.completed = [];
    state.ink = [];
    state.drawing = false;
    state.pointerId = null;
    state.last = null;
    state.badInputs = 0;
    canvas.dataset.ink = color || 'navy';
    publish();
    render();
    return getState();
  }

  function resize() {
    state.rect = bounds();
    state.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(state.rect.width * state.dpr));
    const height = Math.max(1, Math.round(state.rect.height * state.dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    render();
    return { width, height, dpr: state.dpr };
  }

  function model() {
    const path = activePath();
    if (!path.length) return null;
    state.demoStarted = now();
    state.demoUntil = state.demoStarted + (reducedMotion ? 320 : 1150);
    render();
    return { id: state.id, stroke: state.stroke, path: path.map(({ x, y }) => ({ x, y })) };
  }

  function activeScreenPath() {
    const path = activePath();
    const rect = bounds();
    return path.slice(Math.max(0, state.sample - 1)).map(({ x, y }) => ({
      x: rect.left + x * rect.width,
      y: rect.top + y * rect.height,
    }));
  }

  function traceCurrentStroke() {
    const path = activePath();
    if (!path.length) return false;
    const startAt = Math.max(0, state.sample);
    pointerDown(path[startAt], 'debug-trace');
    for (let index = startAt + 1; index < path.length; index += 1) pointerMove(path[index], 'debug-trace');
    if (state.drawing) pointerUp('debug-trace');
    return getState();
  }

  function traceLetter() {
    let guard = 0;
    while (state.stroke < state.strokes.length && guard < 12) {
      traceCurrentStroke();
      guard += 1;
    }
    return getState();
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('blur', onBlur);
  }

  resize();
  return {
    setLetter,
    pointerDown,
    pointerMove,
    pointerUp,
    cancel: onBlur,
    model,
    resize,
    activeScreenPath,
    traceCurrentStroke,
    traceLetter,
    getState,
    destroy,
  };
}
