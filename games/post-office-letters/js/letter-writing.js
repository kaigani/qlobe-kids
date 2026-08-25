// Canvas-only lowercase tracing controller. Coordinates are always 0..1 so
// the letter recipes stay independent from a particular postcard layout.

const MAX_DPR = 2;
const STEP = 0.012;
const JUMP = 0.125;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (value) => Array.isArray(value) ? { x: +value[0], y: +value[1] } : { x: +value.x, y: +value.y };

function densePath(path) {
  const input = (path || []).map(point).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (input.length < 2) return input;
  const result = [input[0]];
  for (let i = 1; i < input.length; i += 1) {
    const a = input[i - 1]; const b = input[i];
    const count = Math.max(1, Math.ceil(distance(a, b) / STEP));
    for (let j = 1; j <= count; j += 1) result.push({ x: a.x + (b.x - a.x) * (j / count), y: a.y + (b.y - a.y) * (j / count) });
  }
  return result;
}

function safeCall(fn, payload) { if (typeof fn === 'function') fn(payload); }

/**
 * Ordered, forgiving letter tracing for a single canvas.
 * strokes is an array of polylines; each point can be {x,y} or [x,y].
 */
export function createLetterWriter({ canvas, reducedMotion = false, tolerance = 0.11, onProgress, onStrokeComplete, onLetterComplete, onNudge } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('createLetterWriter needs a canvas.');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new TypeError('The tracing canvas needs a 2D context.');
  const state = { id: null, color: '#e85a72', strokes: [], stroke: 0, sample: 0, drawing: false, completed: [], ink: [], last: null, bad: 0, demoUntil: 0, rect: null, dpr: 1, destroyed: false };
  let raf = 0;

  function rect() { return canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.clientWidth || 1, height: canvas.clientHeight || 1 }; }
  function current() { return state.strokes[state.stroke] || []; }
  function tick() { return (globalThis.performance && performance.now) ? performance.now() : Date.now(); }
  function schedule() { if (!raf && !state.destroyed && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(() => { raf = 0; render(); if (!reducedMotion && state.demoUntil > tick()) schedule(); }); }
  function drawPath(path, width, color, dash = []) {
    if (!path.length) return;
    ctx.beginPath(); ctx.setLineDash(dash); ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
    ctx.moveTo(path[0].x * state.rect.width, path[0].y * state.rect.height);
    for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x * state.rect.width, path[i].y * state.rect.height);
    ctx.stroke(); ctx.setLineDash([]);
  }
  function render() {
    if (state.destroyed || !state.rect) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.scale(state.dpr, state.dpr);
    // Completed strokes are deliberately calmer than the active, inviting line.
    state.completed.forEach((path) => drawPath(path, 12, state.color));
    const path = current();
    if (path.length) {
      drawPath(path, 7, 'rgba(91, 67, 105, .24)', [10, 11]);
      const start = path[0];
      ctx.beginPath(); ctx.fillStyle = state.color; ctx.arc(start.x * state.rect.width, start.y * state.rect.height, 10, 0, Math.PI * 2); ctx.fill();
      if (state.demoUntil > tick()) {
        const amount = reducedMotion ? path.length : Math.max(2, Math.floor(path.length * (1 - (state.demoUntil - tick()) / 1100)));
        drawPath(path.slice(0, amount), 12, 'rgba(255,255,255,.8)');
      }
    }
    if (state.ink.length > 1) drawPath(state.ink, 12, state.color);
    ctx.restore();
  }
  function publish() { safeCall(onProgress, { id: state.id, stroke: state.stroke, completed: state.completed.length, total: state.strokes.length, progress: state.strokes.length ? (state.completed.length + (state.sample / Math.max(1, current().length - 1))) / state.strokes.length : 0 }); }
  function abandon(reason) { if (!state.drawing && !state.ink.length) return; state.drawing = false; state.sample = 0; state.ink = []; state.last = null; state.bad += 1; safeCall(onNudge, { id: state.id, stroke: state.stroke, reason }); render(); }
  function finishStroke() {
    state.completed.push(current().slice()); state.stroke += 1; state.sample = 0; state.drawing = false; state.ink = []; state.last = null;
    safeCall(onStrokeComplete, { id: state.id, stroke: state.stroke - 1, completed: state.completed.length, total: state.strokes.length });
    if (state.stroke >= state.strokes.length) safeCall(onLetterComplete, { id: state.id, strokes: state.strokes.length });
    publish(); render();
  }
  // Each accepted event may advance only a few densely sampled points. This is
  // what prevents a finger tap at an endpoint from skipping the whole letter.
  function follow(p) {
    const path = current();
    if (!state.drawing || !path.length) return false;
    if (state.last && distance(state.last, p) > JUMP) { abandon('jump'); return false; }
    const from = state.sample;
    const to = Math.min(path.length - 1, from + 10);
    let best = from; let bestD = Infinity;
    for (let i = from; i <= to; i += 1) { const d = distance(p, path[i]); if (d < bestD) { best = i; bestD = d; } }
    if (bestD > tolerance) { abandon('off-path'); return false; }
    state.sample = Math.max(state.sample, best); state.last = p; state.ink.push(p); publish();
    if (state.sample >= path.length - 2) finishStroke(); else render();
    return true;
  }
  function pointerDown(value) {
    const p = point(value); const path = current();
    if (state.destroyed || !path.length || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    if (distance(p, path[0]) > tolerance) { state.bad += 1; safeCall(onNudge, { id: state.id, stroke: state.stroke, reason: 'start' }); render(); return false; }
    state.drawing = true; state.sample = 0; state.ink = [p]; state.last = p; publish(); render(); return true;
  }
  function pointerMove(value) { return follow(point(value)); }
  function pointerUp() { if (!state.drawing) return false; if (state.stroke < state.strokes.length) abandon('lift'); return true; }
  function eventPoint(event) { const r = rect(); return { x: clamp((event.clientX - r.left) / Math.max(1, r.width), 0, 1), y: clamp((event.clientY - r.top) / Math.max(1, r.height), 0, 1) }; }
  const down = (e) => { if (pointerDown(eventPoint(e))) { canvas.setPointerCapture?.(e.pointerId); e.preventDefault?.(); } };
  const move = (e) => { if (state.drawing) { pointerMove(eventPoint(e)); e.preventDefault?.(); } };
  const up = (e) => { if (state.drawing) pointerUp(); canvas.releasePointerCapture?.(e.pointerId); };
  const cancel = () => pointerUp();
  canvas.style && (canvas.style.touchAction = 'none');
  canvas.addEventListener?.('pointerdown', down); canvas.addEventListener?.('pointermove', move); canvas.addEventListener?.('pointerup', up); canvas.addEventListener?.('pointercancel', cancel);
  globalThis.window?.addEventListener?.('pointerup', up); globalThis.window?.addEventListener?.('pointercancel', cancel); globalThis.window?.addEventListener?.('blur', cancel);
  function resize() { state.rect = rect(); state.dpr = Math.min(MAX_DPR, globalThis.window?.devicePixelRatio || 1); const w = Math.max(1, Math.round(state.rect.width * state.dpr)); const h = Math.max(1, Math.round(state.rect.height * state.dpr)); if (canvas.width !== w) canvas.width = w; if (canvas.height !== h) canvas.height = h; render(); return { width: w, height: h, dpr: state.dpr }; }
  function setLetter({ id, strokes, color } = {}) { state.id = id || null; state.color = color || '#e85a72'; state.strokes = (strokes || []).map(densePath).filter((p) => p.length > 1); reset(); return getState(); }
  function reset() { state.stroke = 0; state.sample = 0; state.drawing = false; state.completed = []; state.ink = []; state.last = null; state.bad = 0; state.demoUntil = 0; render(); }
  function model() { if (!current().length) return null; state.demoUntil = tick() + (reducedMotion ? 400 : 1100); render(); schedule(); return { id: state.id, stroke: state.stroke, path: current().map(({ x, y }) => ({ x, y })) }; }
  function debugTrace() { return { id: state.id, activeStroke: state.stroke, activeSample: state.sample, completed: state.completed.length, total: state.strokes.length, drawing: state.drawing, badInputs: state.bad, ink: state.ink.map(({ x, y }) => ({ x, y })) }; }
  function getState() { return { id: state.id, stroke: state.stroke, completed: state.completed.length, total: state.strokes.length, complete: state.stroke >= state.strokes.length && state.strokes.length > 0, drawing: state.drawing, badInputs: state.bad }; }
  function destroy() { state.destroyed = true; if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); canvas.removeEventListener?.('pointerdown', down); canvas.removeEventListener?.('pointermove', move); canvas.removeEventListener?.('pointerup', up); canvas.removeEventListener?.('pointercancel', cancel); globalThis.window?.removeEventListener?.('pointerup', up); globalThis.window?.removeEventListener?.('pointercancel', cancel); globalThis.window?.removeEventListener?.('blur', cancel); }
  resize();
  return { setLetter, pointerDown, pointerMove, pointerUp, model, debugTrace, getState, resize, reset, destroy };
}
