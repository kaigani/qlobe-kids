// Interactive canvas controller for the Land Explorer clay tray.
//
// The board deliberately owns presentation and pointer lifecycle only. The
// semantic landform rules remain in landform-field.js, while HeightfieldClay
// owns the mutable cells and ClayRenderer owns the clay shading.

import { HeightfieldClay } from '../../../shared/js/clay/heightfield.js';
import { ClayRenderer } from '../../../shared/js/clay/heightfield-canvas.js';
import { applyLandStroke, measureLandform, resetLandform, targetMask } from './landform-field.js';

const LAND_HEIGHT = .72;
const MAX_DPR = 2;
// Matches config.json and keeps the 3:2 basin sampling dense enough that a
// finger-drawn inlet stays rounded when the field is enlarged on an iPad.
const FIELD_SIZE = Object.freeze({ width: 192, height: 128 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function makeCanvas(className, interactive = false) {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  if (interactive) {
    canvas.style.touchAction = 'none';
    canvas.setAttribute('aria-label', 'Clay landform board');
  } else {
    canvas.style.pointerEvents = 'none';
    canvas.setAttribute('aria-hidden', 'true');
  }
  return canvas;
}

function canvasScale(canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    rect,
    dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR),
  };
}

function resizeCanvas(canvas) {
  const { rect, dpr } = canvasScale(canvas);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  const changed = canvas.width !== width || canvas.height !== height;
  if (changed) {
    canvas.width = width;
    canvas.height = height;
  }
  return { rect, dpr, changed };
}

function edgeSegments(mask, width, height, callback) {
  const has = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!has(x, y)) continue;
      if (!has(x, y - 1)) callback(x, y, x + 1, y);
      if (!has(x + 1, y)) callback(x + 1, y, x + 1, y + 1);
      if (!has(x, y + 1)) callback(x + 1, y + 1, x, y + 1);
      if (!has(x - 1, y)) callback(x, y + 1, x, y);
    }
  }
}

function landMask(field) {
  const mask = new Uint8Array(field.cells.length);
  for (let index = 0; index < field.cells.length; index += 1) {
    mask[index] = field.cells[index] >= LAND_HEIGHT ? 1 : 0;
  }
  return mask;
}

function drawBoundary(context, mask, width, height, canvas, options) {
  const sx = canvas.width / width;
  const sy = canvas.height / height;
  context.save();
  context.beginPath();
  edgeSegments(mask, width, height, (x1, y1, x2, y2) => {
    const fragment = options.fragment || 0;
    const ax = x1 + (x2 - x1) * fragment;
    const ay = y1 + (y2 - y1) * fragment;
    const bx = x2 + (x1 - x2) * fragment;
    const by = y2 + (y1 - y2) * fragment;
    context.moveTo(ax * sx, ay * sy);
    context.lineTo(bx * sx, by * sy);
  });
  context.strokeStyle = options.color;
  context.lineWidth = options.lineWidth;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  if (options.dash) context.setLineDash(options.dash);
  if (options.filter) context.filter = options.filter;
  context.stroke();
  context.restore();
}

function fieldSummary(field) {
  let volume = 0;
  let peak = 0;
  for (const value of field.cells) {
    volume += value;
    peak = Math.max(peak, value);
  }
  return { volume, peak };
}

/**
 * Mount a three-canvas clay landform board.
 *
 * `applyStroke(points, tool?)` is the programmatic equivalent of a completed
 * pointer gesture: it uses applyLandStroke, redraws the clay and shoreline,
 * measures, and invokes onStroke exactly once. Pointer drags use the same
 * method internally with notification deferred until their accepted release.
 *
 * The returned controller exposes `reset(kind?)`, `setTool(tool)`,
 * `setGuide(on)`, `applyStroke(points, tool?)`, `getMetrics()`, `getField()`,
 * `resize()`, `destroy()`, and `canvas` (the interactive clay layer).
 */
export function createLandformBoard(mount, {
  kind: initialKind = 'island',
  tool: initialTool = 'pour',
  color = '#79b52d',
  guide: initialGuide = true,
  onStroke,
} = {}) {
  if (!mount || typeof mount.append !== 'function') throw new TypeError('createLandformBoard needs a mount element.');
  if (initialTool !== 'pour' && initialTool !== 'scoop') throw new RangeError(`Unknown landform tool: ${initialTool}`);
  // Validate before mounting any owned nodes, so a typo cannot leave layers
  // behind in a caller's stage.
  targetMask(initialKind, 5, 5);

  // Layer order matters: live waterline glow, transparent shaded clay, then
  // a quiet dashed target boundary. No DOM outlines or filled target artwork.
  const shorelineCanvas = makeCanvas('landform-board__shoreline');
  const clayCanvas = makeCanvas('landform-board__clay', true);
  const guideCanvas = makeCanvas('landform-board__guide');
  mount.append(shorelineCanvas, clayCanvas, guideCanvas);

  const shorelineContext = shorelineCanvas.getContext('2d');
  const guideContext = guideCanvas.getContext('2d');
  const field = new HeightfieldClay(FIELD_SIZE.width, FIELD_SIZE.height);
  const renderer = new ClayRenderer(clayCanvas, field, { color, background: null, maxDpr: MAX_DPR });
  let kind = initialKind;
  let tool = initialTool;
  let guideOn = Boolean(initialGuide);
  let guideMask;
  let active = null;
  let destroyed = false;
  let layerFrame = null;

  function redrawShoreline() {
    shorelineContext.clearRect(0, 0, shorelineCanvas.width, shorelineCanvas.height);
    const mask = landMask(field);
    // Two raster strokes make an actual thresholded-clay shoreline glow:
    // the blurred pass sits behind a small crisp pale-cyan waterline.
    drawBoundary(shorelineContext, mask, field.width, field.height, shorelineCanvas, {
      color: 'rgba(180, 246, 250, .72)', lineWidth: 8, filter: 'blur(5px)',
    });
    drawBoundary(shorelineContext, mask, field.width, field.height, shorelineCanvas, {
      color: 'rgba(216, 252, 255, .78)', lineWidth: 1.5,
    });
  }

  function redrawGuide() {
    guideContext.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
    if (!guideOn) return;
    drawBoundary(guideContext, guideMask, field.width, field.height, guideCanvas, {
      color: 'rgba(31, 104, 128, .40)', lineWidth: 1.5, dash: [5, 5], fragment: .17,
    });
  }

  function renderNow(force = false) {
    if (destroyed) return;
    if (layerFrame !== null) {
      cancelAnimationFrame(layerFrame);
      layerFrame = null;
    }
    renderer.draw(force);
    redrawShoreline();
  }

  function requestLayers() {
    if (destroyed || layerFrame !== null) return;
    layerFrame = requestAnimationFrame(() => {
      layerFrame = null;
      if (destroyed) return;
      redrawShoreline();
    });
  }

  function scheduleRender() {
    renderer.requestDraw();
    requestLayers();
  }

  function metrics() {
    const semantic = measureLandform(field, kind);
    const summary = fieldSummary(field);
    return {
      ...semantic,
      revision: field.revision,
      volume: summary.volume,
      peak: summary.peak,
      renders: renderer.renders,
      tool,
      kind,
    };
  }

  // `notify` is intentionally internal. The public two-argument method
  // below always notifies; a live pointer drag defers that one notification
  // until it has accepted its release.
  function applyStroke(points, requestedTool = tool, notify = true) {
    if (destroyed) return { ...metrics(), changed: false };
    const changed = applyLandStroke(field, kind, requestedTool, points);
    if (changed) {
      // Programmatic strokes are complete transactions, so they leave every
      // layer current before their metrics/callback are observed. Pointer
      // chunks opt into the coalesced path below and finish synchronously on
      // their accepted release.
      if (notify) renderNow();
      else scheduleRender();
    }
    const result = { ...metrics(), changed };
    if (notify && typeof onStroke === 'function') onStroke(result);
    return result;
  }

  function restoreActive() {
    if (!active) return;
    const pointerId = active.pointerId;
    try { clayCanvas.releasePointerCapture(pointerId); } catch { /* capture is optional */ }
    field.cells.set(active.cells);
    field.revision = active.revision;
    active = null;
    if (layerFrame !== null) {
      cancelAnimationFrame(layerFrame);
      layerFrame = null;
    }
    // A cancelled stroke may restore an old revision which the renderer has
    // already painted before; forcing is what restores the exact snapshot.
    renderNow(true);
  }

  function normalizedPoint(sample) {
    const rect = clayCanvas.getBoundingClientRect();
    return {
      x: clamp((sample.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clamp((sample.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    };
  }

  function samplesFor(event) {
    const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const samples = [...coalesced, event];
    return samples.map(normalizedPoint);
  }

  function appendSamples(event) {
    if (!active) return;
    for (const point of samplesFor(event)) {
      const previous = active.points[active.points.length - 1];
      if (!previous || point.x !== previous.x || point.y !== previous.y) active.points.push(point);
    }
  }

  function exceedsSlop(event) {
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    return dx * dx + dy * dy >= 100;
  }

  function applyPendingPath() {
    if (!active || active.points.length - 1 <= active.lastApplied) return;
    const start = active.lastApplied === 0 ? 0 : active.lastApplied;
    const chunk = active.points.slice(start);
    const result = applyStroke(chunk, active.tool, false);
    active.changed ||= result.changed;
    active.lastApplied = active.points.length - 1;
  }

  function matchesActive(event) {
    return active && event.pointerId === active.pointerId;
  }

  function onPointerDown(event) {
    if (destroyed || active || event.isPrimary === false || event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const first = normalizedPoint(event);
    active = {
      pointerId: event.pointerId,
      tool,
      startX: event.clientX,
      startY: event.clientY,
      points: [first],
      lastApplied: 0,
      dragging: false,
      changed: false,
      cells: new Float32Array(field.cells),
      revision: field.revision,
    };
    try { clayCanvas.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
  }

  function onPointerMove(event) {
    if (!matchesActive(event)) return;
    event.preventDefault();
    appendSamples(event);
    if (!active.dragging && exceedsSlop(event)) active.dragging = true;
    if (active.dragging) applyPendingPath();
  }

  function onPointerUp(event) {
    if (!matchesActive(event)) return;
    event.preventDefault();
    appendSamples(event);
    const gesture = active;
    if (gesture.dragging || exceedsSlop(event)) {
      gesture.dragging = true;
      applyPendingPath();
    } else {
      // The board treats a sub-slop release as a deliberate one-point tap.
      const result = applyStroke([gesture.points[0]], gesture.tool, false);
      gesture.changed ||= result.changed;
    }
    active = null;
    try { clayCanvas.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    renderNow();
    const result = { ...metrics(), changed: gesture.changed };
    if (typeof onStroke === 'function') onStroke(result);
  }

  function onPointerCancel(event) {
    if (!matchesActive(event)) return;
    event.preventDefault();
    try { clayCanvas.releasePointerCapture(event.pointerId); } catch { /* capture is optional */ }
    restoreActive();
  }

  function onBlur() {
    restoreActive();
  }

  function resize() {
    if (destroyed) return;
    resizeCanvas(shorelineCanvas);
    resizeCanvas(guideCanvas);
    renderer.resize();
    redrawShoreline();
    redrawGuide();
  }

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(mount);
  clayCanvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp, { passive: false });
  window.addEventListener('pointercancel', onPointerCancel, { passive: false });
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', resize, { passive: true });

  function reset(nextKind = kind) {
    if (destroyed) return metrics();
    targetMask(nextKind, 5, 5);
    // Programmatic resets abandon a partial gesture without reporting it.
    if (active) {
      try { clayCanvas.releasePointerCapture(active.pointerId); } catch { /* capture is optional */ }
    }
    active = null;
    kind = nextKind;
    resetLandform(field, kind);
    guideMask = targetMask(kind, field.width, field.height);
    renderNow(true);
    redrawGuide();
    return metrics();
  }

  function setTool(nextTool) {
    if (nextTool !== 'pour' && nextTool !== 'scoop') throw new RangeError(`Unknown landform tool: ${nextTool}`);
    tool = nextTool;
  }

  function setGuide(on) {
    guideOn = Boolean(on);
    redrawGuide();
  }

  function destroy() {
    if (destroyed) return;
    restoreActive();
    destroyed = true;
    if (layerFrame !== null) cancelAnimationFrame(layerFrame);
    layerFrame = null;
    resizeObserver?.disconnect();
    clayCanvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', resize);
    renderer.destroy();
    shorelineCanvas.remove();
    clayCanvas.remove();
    guideCanvas.remove();
  }

  // Seed and paint once; the observer handles every later orientation/layout
  // change on demand.
  reset(initialKind);
  resize();

  return {
    reset,
    setTool,
    setGuide,
    applyStroke: (points, requestedTool) => applyStroke(points, requestedTool),
    getMetrics: metrics,
    getField: () => field,
    resize,
    destroy,
    canvas: clayCanvas,
  };
}
