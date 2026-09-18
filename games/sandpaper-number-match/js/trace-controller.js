/* Forgiving normalized numeral tracing. Canvas is the live sand/guide substrate;
   the authored raster numeral remains the visible physical object underneath. */

const toPoint = (value) => (Array.isArray(value)
  ? { x: Number(value[0]), y: Number(value[1]) }
  : { x: Number(value?.x), y: Number(value?.y) });

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function segmentDistance(point, start, end) {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  const ratio = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared))
    : 0;
  return distance(point, { x: start.x + ratio * vx, y: start.y + ratio * vy });
}

function resample(path, spacing = 0.018) {
  const source = (path || []).map(toPoint).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (source.length < 2) return source;
  const result = [source[0]];
  let carry = 0;
  for (let index = 1; index < source.length; index += 1) {
    let start = source[index - 1];
    const end = source[index];
    let remaining = distance(start, end);
    if (!remaining) continue;
    while (carry + remaining >= spacing) {
      const ratio = (spacing - carry) / remaining;
      start = {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
      result.push(start);
      remaining = distance(start, end);
      carry = 0;
    }
    carry += remaining;
  }
  const last = source[source.length - 1];
  if (distance(result[result.length - 1], last) > spacing * 0.35) result.push(last);
  return result;
}

function strokeLength(stroke) {
  return stroke.reduce((total, point, index) => (
    total + (index ? distance(stroke[index - 1], point) : 0)
  ), 0);
}

export function createTraceController(canvas, {
  paths = [],
  threshold = 0.68,
  startTolerance = 0.16,
  pathTolerance = 0.105,
  reducedMotion = false,
  onProgress,
  onComplete,
  onMiss,
  onPathAdvance,
} = {}) {
  const context = canvas?.getContext?.('2d');
  const normalizedPaths = paths.map((path) => path.map(toPoint));
  const samples = normalizedPaths.map((path) => resample(path));
  const strokes = [];
  let activeStroke = null;
  let activePointer = null;
  let activePointerPath = 0;
  let activePointerCovered = 0;
  let completed = false;
  let destroyed = false;
  let frame = 0;
  let logicalWidth = 1;
  let logicalHeight = 1;
  let lastResult = { coverage: 0, complete: false, meaningfulStrokes: 0, targets: [] };

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.width ? (event.clientX - rect.left) / rect.width : 0,
      y: rect.height ? (event.clientY - rect.top) / rect.height : 0,
    };
  }

  function nextPathIndex() {
    const required = lastResult.threshold || threshold;
    const pending = samples.findIndex((_, pathIndex) => (
      (lastResult.targets?.[pathIndex]?.coverage || 0) < required
    ));
    return pending < 0 ? Math.max(0, samples.length - 1) : pending;
  }

  function isNearAStart(point) {
    if (!samples.length) return false;
    // Montessori stroke order is part of the learning goal. Only the frontier
    // of the first unfinished path is active; later stroke starts stay dormant
    // until the child has completed the current one.
    const pathIndex = nextPathIndex();
    const path = samples[pathIndex] || [];
    const reached = lastResult.targets?.[pathIndex]?.covered || 0;
    const start = Math.max(0, reached - 4);
    const end = Math.min(path.length, reached + 7);
    const tolerance = reached ? pathTolerance * 1.8 : startTolerance;
    return path.slice(start, end).some((sample) => distance(point, sample) <= tolerance);
  }

  function drawPath(path) {
    if (!path.length) return;
    context.beginPath();
    path.forEach((point, index) => {
      if (index) context.lineTo(point.x, point.y);
      else context.moveTo(point.x, point.y);
    });
  }

  function directionMatches(stroke, pathIndex, covered = 0) {
    const path = samples[pathIndex] || [];
    if (stroke.length < 2 || path.length < 2) return false;
    const origin = stroke[0];
    const childPoint = stroke.find((point) => distance(origin, point) >= 0.055) || stroke.at(-1);
    const targetOrigin = path[Math.min(covered, path.length - 2)];
    const targetPoint = path[Math.min(path.length - 1, covered + 6)];
    const childVector = { x: childPoint.x - origin.x, y: childPoint.y - origin.y };
    const targetVector = { x: targetPoint.x - targetOrigin.x, y: targetPoint.y - targetOrigin.y };
    const childLength = Math.hypot(childVector.x, childVector.y);
    const targetLength = Math.hypot(targetVector.x, targetVector.y);
    if (childLength < 0.025 || targetLength < 0.001) return false;
    return ((childVector.x * targetVector.x + childVector.y * targetVector.y)
      / (childLength * targetLength)) >= 0.8;
  }

  function drawDirectionArrow(path, frontier) {
    if (!path.length) return;
    const from = path[Math.min(path.length - 2, frontier + 1)];
    const tip = path[Math.min(path.length - 1, frontier + 4)];
    if (!from || !tip) return;
    const dx = tip.x - from.x;
    const dy = tip.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const size = 0.024;
    const base = { x: tip.x - ux * size * 1.55, y: tip.y - uy * size * 1.55 };
    context.fillStyle = 'rgba(207, 83, 66, .96)';
    context.beginPath();
    context.moveTo(tip.x, tip.y);
    context.lineTo(base.x - uy * size, base.y + ux * size);
    context.lineTo(base.x + uy * size, base.y - ux * size);
    context.closePath();
    context.fill();
  }

  function render() {
    if (!context || destroyed) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(canvas.width, canvas.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';

    const pathIndex = nextPathIndex();
    normalizedPaths.forEach((path, index) => {
      if (index > pathIndex) return;
      drawPath(path);
      context.setLineDash([0.018, 0.016]);
      context.strokeStyle = index < pathIndex
        ? 'rgba(255, 250, 226, .34)'
        : 'rgba(255, 250, 226, .96)';
      context.lineWidth = 0.018;
      context.stroke();
    });

    context.setLineDash([]);
    const visibleStrokes = [
      ...strokes.map((entry) => entry.points),
      ...(activeStroke ? [activeStroke] : []),
    ];
    for (const stroke of visibleStrokes) {
      if (stroke.length < 2) continue;
      drawPath(stroke);
      context.strokeStyle = 'rgba(207, 83, 66, .32)';
      context.lineWidth = 0.055;
      context.stroke();
      drawPath(stroke);
      context.strokeStyle = 'rgba(255, 225, 116, .94)';
      context.lineWidth = 0.027;
      context.stroke();
      context.fillStyle = 'rgba(255, 245, 205, .72)';
      for (let index = 1; index < stroke.length; index += 4) {
        const point = stroke[index];
        context.beginPath();
        context.arc(point.x, point.y, 0.006 + ((index % 3) * 0.0018), 0, Math.PI * 2);
        context.fill();
      }
    }

    const activePath = samples[pathIndex] || [];
    const activeTarget = lastResult.targets?.[pathIndex];
    const frontier = Math.min(Math.max(0, activePath.length - 1), activeTarget?.covered || 0);
    const starts = activePath.length ? [activePath[frontier]] : [];
    for (const start of starts) {
      const pulse = reducedMotion ? 1 : 0.88 + Math.sin(performance.now() / 310) * 0.12;
      context.fillStyle = 'rgba(255, 248, 220, .98)';
      context.beginPath();
      context.arc(start.x, start.y, 0.037 * pulse, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(207, 83, 66, .96)';
      context.beginPath();
      context.arc(start.x, start.y, 0.025 * pulse, 0, Math.PI * 2);
      context.fill();
    }
    drawDirectionArrow(activePath, frontier);
    context.restore();
  }

  function evaluate() {
    const previousPathIndex = nextPathIndex();
    const pixelScale = Math.max(logicalWidth, logicalHeight);
    const meaningful = strokes.filter((entry) => (
      entry.points.length > 1 && strokeLength(entry.points) * pixelScale >= 24
    ));
    const targets = samples.map((path, pathIndex) => {
      let covered = 0;
      for (const { points: stroke } of meaningful.filter((entry) => entry.pathIndex === pathIndex)) {
        for (let pointIndex = 1; pointIndex < stroke.length && covered < path.length; pointIndex += 1) {
          const start = stroke[pointIndex - 1];
          const end = stroke[pointIndex];
          const lookAhead = Math.min(path.length, covered + 5);
          let reached = -1;
          for (let sampleIndex = covered; sampleIndex < lookAhead; sampleIndex += 1) {
            if (segmentDistance(path[sampleIndex], start, end) <= pathTolerance) {
              reached = sampleIndex;
              break;
            }
          }
          if (reached >= covered) {
            covered = reached;
            while (covered < path.length
                && segmentDistance(path[covered], start, end) <= pathTolerance) {
              covered += 1;
            }
          }
        }
      }
      const coverage = path.length ? covered / path.length : 1;
      return { coverage, covered, total: path.length };
    });
    const coverage = targets.length
      ? targets.reduce((total, target) => total + target.coverage, 0) / targets.length
      : 1;
    const effectiveThreshold = meaningful.length >= 3 ? Math.max(0.5, threshold - 0.1) : threshold;
    lastResult = {
      coverage,
      complete: targets.every((target) => target.coverage >= effectiveThreshold),
      meaningfulStrokes: meaningful.length,
      threshold: effectiveThreshold,
      targets,
    };
    const currentPathIndex = nextPathIndex();
    if (!lastResult.complete && currentPathIndex > previousPathIndex) {
      onPathAdvance?.({ pathIndex: currentPathIndex, previousPathIndex, result: lastResult });
    }
    onProgress?.(lastResult);
    if (lastResult.complete && !completed) {
      completed = true;
      onComplete?.(lastResult);
    }
    return lastResult;
  }

  function ingest(points) {
    if (destroyed || completed) return lastResult;
    const stroke = (points || []).map(toPoint).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (stroke.length < 2 || !isNearAStart(stroke[0])) {
      onMiss?.({ reason: 'start', point: stroke[0] || null });
      render();
      return evaluate();
    }
    const pathIndex = nextPathIndex();
    const covered = lastResult.targets?.[pathIndex]?.covered || 0;
    if (!directionMatches(stroke, pathIndex, covered)) {
      onMiss?.({ reason: 'direction', point: stroke[0] || null });
      render();
      return lastResult;
    }
    strokes.push({ points: stroke, pathIndex });
    const result = evaluate();
    render();
    return result;
  }

  function pointerDown(event) {
    if (destroyed || completed || activePointer !== null || event.isPrimary === false) return;
    const point = canvasPoint(event);
    if (!isNearAStart(point)) {
      onMiss?.({ reason: 'start', point });
      return;
    }
    event.preventDefault();
    activePointer = event.pointerId;
    activePointerPath = nextPathIndex();
    activePointerCovered = lastResult.targets?.[activePointerPath]?.covered || 0;
    activeStroke = [point];
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* optional */ }
    render();
  }

  function pointerMove(event) {
    if (destroyed || event.pointerId !== activePointer || !activeStroke) return;
    event.preventDefault();
    const point = canvasPoint(event);
    const previous = activeStroke[activeStroke.length - 1];
    if (!previous || distance(previous, point) >= 0.006) activeStroke.push(point);
    render();
  }

  function pointerUp(event) {
    if (event.pointerId !== activePointer || !activeStroke) return;
    event.preventDefault();
    const stroke = activeStroke;
    activeStroke = null;
    activePointer = null;
    try { canvas.releasePointerCapture?.(event.pointerId); } catch { /* optional */ }
    if (stroke.length > 1 && directionMatches(stroke, activePointerPath, activePointerCovered)) {
      strokes.push({ points: stroke, pathIndex: activePointerPath });
      evaluate();
    } else {
      onMiss?.({ reason: 'direction', point: stroke[0] || null });
    }
    render();
  }

  function cancelPointer(event) {
    if (event && activePointer !== null && event.pointerId !== activePointer) return;
    activeStroke = null;
    activePointer = null;
    render();
  }

  function resize() {
    if (!canvas || destroyed) return;
    const rect = canvas.getBoundingClientRect();
    logicalWidth = Math.max(1, rect.width);
    logicalHeight = Math.max(1, rect.height);
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.round(logicalWidth * dpr));
    canvas.height = Math.max(1, Math.round(logicalHeight * dpr));
    render();
  }

  function animate() {
    if (destroyed || reducedMotion) return;
    render();
    frame = requestAnimationFrame(animate);
  }

  canvas?.addEventListener('pointerdown', pointerDown);
  canvas?.addEventListener('pointermove', pointerMove);
  canvas?.addEventListener('pointerup', pointerUp);
  canvas?.addEventListener('pointercancel', cancelPointer);
  window.addEventListener('blur', cancelPointer);
  resize();
  if (!reducedMotion) frame = requestAnimationFrame(animate);

  return {
    ingest,
    resize,
    clear() {
      strokes.length = 0;
      completed = false;
      activeStroke = null;
      activePointer = null;
      render();
      return evaluate();
    },
    getState() {
      return {
        coverage: lastResult.coverage,
        complete: lastResult.complete,
        meaningfulStrokes: lastResult.meaningfulStrokes,
        threshold: lastResult.threshold,
        strokeCount: strokes.length,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      canvas?.removeEventListener('pointerdown', pointerDown);
      canvas?.removeEventListener('pointermove', pointerMove);
      canvas?.removeEventListener('pointerup', pointerUp);
      canvas?.removeEventListener('pointercancel', cancelPointer);
      window.removeEventListener('blur', cancelPointer);
    },
  };
}
