/**
 * A small, self-contained canvas layer for materials such as yarn or ribbon.
 * Strokes are intentionally stored as normalized points: the texture is drawn
 * again at the current sheet size instead of saving screen pixels.
 */

const FORMAT = 'qlobe-textured-strokes';
const FORMAT_VERSION = 1;
const MAX_STROKES = 160;
const MAX_POINTS_PER_STROKE = 600;
const MAX_TOTAL_POINTS = 1800;
const DEFAULT_SIZE = 0.036;
const MIN_SIZE = 0.012;
const MAX_SIZE = 0.09;
// The authored yarn strips deliberately retain soft transparent fiber margins.
// Compensate only on the short axis so those margins do not make a finger-
// drawn yarn path look like a pencil line; its length and bend spacing remain
// faithful to the extracted local-API asset.
const TEXTURE_SHORT_AXIS_COMPENSATION = 4.5;
const URL_IMAGE_CACHE = new Map();

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const copyPoint = (point) => ({ x: point.x, y: point.y });

function safeCall(callback, ...args) {
  try { callback?.(...args); } catch { /* A host callback must not break drawing. */ }
}

function imageDimensions(image) {
  if (!image) return null;
  const width = image.naturalWidth || image.videoWidth || image.width;
  const height = image.naturalHeight || image.videoHeight || image.height;
  return finite(width) && finite(height) && width > 0 && height > 0 ? { width, height } : null;
}

function imageIsReady(image) {
  const dimensions = imageDimensions(image);
  if (!dimensions) return false;
  // Image.complete is only meaningful on HTMLImageElement.  Canvas and
  // ImageBitmap sources deliberately have no complete property.
  return image.complete === undefined || image.complete === true;
}

function textureSource(entry) {
  if (!entry) return null;
  if (typeof entry === 'string' || imageDimensions(entry)) return entry;
  if (typeof entry === 'object') return entry.image ?? entry.art ?? entry.src ?? entry.url ?? null;
  return null;
}

function textureEntries(textures) {
  const entries = [];
  if (textures instanceof Map) {
    textures.forEach((source, id) => entries.push([String(id), textureSource(source)]));
  } else if (Array.isArray(textures)) {
    textures.forEach((entry) => {
      if (entry?.id != null) entries.push([String(entry.id), textureSource(entry)]);
    });
  } else if (textures && typeof textures === 'object') {
    Object.entries(textures).forEach(([id, source]) => entries.push([id, textureSource(source)]));
  }
  return entries.filter(([id, source]) => id && source);
}

function loadUrlImage(url) {
  if (URL_IMAGE_CACHE.has(url)) return URL_IMAGE_CACHE.get(url);
  const promise = new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(imageIsReady(image) ? image : null);
    image.onerror = () => resolve(null);
    image.src = url;
  });
  URL_IMAGE_CACHE.set(url, promise);
  return promise;
}

async function resolveTexture(source) {
  if (typeof source === 'string') return loadUrlImage(source);
  if (imageIsReady(source)) return source;
  // An image which has been supplied before it finishes loading is still a
  // valid texture declaration. Wait for it rather than treating it as a blank.
  if (source && typeof source.addEventListener === 'function') {
    return new Promise((resolve) => {
      const done = () => resolve(imageIsReady(source) ? source : null);
      source.addEventListener('load', done, { once: true });
      source.addEventListener('error', () => resolve(null), { once: true });
    });
  }
  return null;
}

async function resolvedTextures(textures) {
  const entries = textureEntries(textures);
  const images = await Promise.all(entries.map(async ([id, source]) => [id, await resolveTexture(source)]));
  return new Map(images.filter(([, image]) => imageIsReady(image)));
}

function cleanPoints(points, limit = MAX_POINTS_PER_STROKE) {
  if (!Array.isArray(points)) return [];
  const clean = [];
  for (const point of points) {
    if (!finite(point?.x) || !finite(point?.y)) continue;
    const next = { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
    const previous = clean[clean.length - 1];
    // Coalesced events may contain duplicate locations. Keeping one protects
    // persistence while preserving every meaningful turn in the path.
    if (!previous || Math.hypot(next.x - previous.x, next.y - previous.y) > 0.00005) clean.push(next);
    if (clean.length >= limit) break;
  }
  return clean;
}

function cleanStroke(stroke, knownTextureIds) {
  if (!stroke || typeof stroke !== 'object' || typeof stroke.textureId !== 'string') return null;
  if (knownTextureIds && !knownTextureIds.has(stroke.textureId)) return null;
  const points = cleanPoints(stroke.points);
  if (!points.length) return null;
  return {
    textureId: stroke.textureId,
    points,
    size: finite(stroke.size) ? clamp(stroke.size, MIN_SIZE, MAX_SIZE) : DEFAULT_SIZE,
  };
}

function cleanSnapshot(value, knownTextureIds) {
  if (!value || value.format !== FORMAT || value.formatVersion !== FORMAT_VERSION || !Array.isArray(value.strokes)) {
    return [];
  }
  const strokes = [];
  let totalPoints = 0;
  for (const candidate of value.strokes) {
    if (strokes.length >= MAX_STROKES || totalPoints >= MAX_TOTAL_POINTS) break;
    const stroke = cleanStroke(candidate, knownTextureIds);
    if (!stroke) continue;
    const remaining = MAX_TOTAL_POINTS - totalPoints;
    if (stroke.points.length > remaining) stroke.points = stroke.points.slice(0, remaining);
    if (!stroke.points.length) break;
    strokes.push(stroke);
    totalPoints += stroke.points.length;
  }
  return strokes;
}

function isSnapshot(value) {
  return Boolean(value && value.format === FORMAT && value.formatVersion === FORMAT_VERSION && Array.isArray(value.strokes));
}

function cloneStroke(stroke) {
  return { textureId: stroke.textureId, size: stroke.size, points: stroke.points.map(copyPoint) };
}

function makeSnapshot(strokes) {
  return { format: FORMAT, formatVersion: FORMAT_VERSION, strokes: strokes.map(cloneStroke) };
}

function trimCommittedStrokes(strokes) {
  let pointCount = strokes.reduce((total, stroke) => total + stroke.points.length, 0);
  while (strokes.length > MAX_STROKES || pointCount > MAX_TOTAL_POINTS) {
    const removed = strokes.shift();
    pointCount -= removed?.points.length || 0;
  }
}

function drawStamp(ctx, image, x, y, angle, thickness) {
  const dimensions = imageDimensions(image);
  if (!dimensions) return;
  const aspect = dimensions.width / dimensions.height;
  const stampWidth = Math.max(thickness, thickness * aspect);
  const stampHeight = thickness * TEXTURE_SHORT_AXIS_COMPENSATION;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(image, -stampWidth / 2, -stampHeight / 2, stampWidth, stampHeight);
  ctx.restore();
}

function drawStroke(ctx, stroke, image, width, height) {
  const points = stroke.points;
  if (!points.length) return;
  const thickness = clamp(stroke.size || DEFAULT_SIZE, MIN_SIZE, MAX_SIZE) * Math.min(width, height);
  if (!(thickness > 0)) return;
  const first = points[0];
  drawStamp(ctx, image, first.x * width, first.y * height, 0, thickness);
  const dimensions = imageDimensions(image);
  const aspect = dimensions ? dimensions.width / dimensions.height : 4;
  // Overlap each authored tile by more than half. This joins its transparent
  // fiber edges without ever using CanvasRenderingContext2D.stroke().
  const spacing = Math.max(1, thickness * Math.max(1.1, aspect) * 0.42);

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const x1 = from.x * width;
    const y1 = from.y * height;
    const x2 = to.x * width;
    const y2 = to.y * height;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 0.01) continue;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const stamps = Math.max(1, Math.ceil(length / spacing));
    for (let stamp = 1; stamp <= stamps; stamp += 1) {
      const progress = stamp / stamps;
      drawStamp(ctx, image, x1 + (x2 - x1) * progress, y1 + (y2 - y1) * progress, angle, thickness);
    }
  }
}

function paintResolvedStrokes(ctx, snapshot, knownTextureIds, images, width, height) {
  const strokes = cleanSnapshot(snapshot, knownTextureIds);
  for (const stroke of strokes) {
    const image = images.get(stroke.textureId);
    if (image) drawStroke(ctx, stroke, image, width, height);
  }
}

/**
 * Paint a semantic snapshot into the existing context. It does not clear or
 * resize the context, allowing the artwork compositor to place yarn over paper.
 */
export async function drawTexturedStrokes(ctx, snapshot, { textures, width, height } = {}) {
  if (!ctx || typeof ctx.drawImage !== 'function') return false;
  const drawWidth = finite(width) && width > 0 ? width : ctx.canvas?.width;
  const drawHeight = finite(height) && height > 0 ? height : ctx.canvas?.height;
  if (!finite(drawWidth) || !finite(drawHeight) || drawWidth <= 0 || drawHeight <= 0) return false;
  const sources = textureEntries(textures);
  const knownTextureIds = new Set(sources.map(([id]) => id));
  const strokes = cleanSnapshot(snapshot, knownTextureIds);
  if (!strokes.length) return true;
  const images = await resolvedTextures(textures);
  paintResolvedStrokes(ctx, { format: FORMAT, formatVersion: FORMAT_VERSION, strokes }, knownTextureIds, images, drawWidth, drawHeight);
  return true;
}

function makeRenderCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') return null;
  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  return buffer;
}

export function createTexturedStrokeCanvas(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('A canvas element is required.');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas context is required.');

  const textureDeclarations = options.textures ?? [];
  const textureIds = new Set(textureEntries(textureDeclarations).map(([id]) => id));
  let selectedTextureId = textureIds.has(options.initialTextureId)
    ? options.initialTextureId
    : textureIds.values().next().value ?? null;
  let strokes = [];
  let active = null;
  let destroyed = false;
  let renderGeneration = 0;
  let cssWidth = 1;
  let cssHeight = 1;
  let pixelRatio = 1;
  const priorTouchAction = canvas.style.touchAction;
  const win = typeof window === 'undefined' ? null : window;

  canvas.style.touchAction = 'none';

  function currentSnapshot() { return makeSnapshot(strokes); }
  // The in-progress stroke is rendered, but never escapes through snapshot or
  // persistence until its pointer has completed successfully.
  function renderSnapshot() { return makeSnapshot(active ? [...strokes, active.stroke] : strokes); }
  function emitChange() { safeCall(options.onChange, currentSnapshot()); }

  async function redraw() {
    const generation = ++renderGeneration;
    const snapshot = renderSnapshot();
    const images = await resolvedTextures(textureDeclarations);
    // All waiting happens before touching the visible canvas. From here to the
    // commit there is no await, so a newer event cannot interleave a stale
    // paint. This also makes the no-OffscreenCanvas fallback deterministic.
    if (destroyed || generation !== renderGeneration) return;

    const buffer = makeRenderCanvas(canvas.width, canvas.height);
    const bufferContext = buffer?.getContext?.('2d');
    if (bufferContext) {
      bufferContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      paintResolvedStrokes(bufferContext, snapshot, textureIds, images, cssWidth, cssHeight);
      if (destroyed || generation !== renderGeneration) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(buffer, 0, 0);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    paintResolvedStrokes(ctx, snapshot, textureIds, images, cssWidth, cssHeight);
  }

  function resize() {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width || canvas.clientWidth || 1);
    cssHeight = Math.max(1, rect.height || canvas.clientHeight || 1);
    pixelRatio = clamp(win?.devicePixelRatio || 1, 1, 3);
    const nextWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
    const nextHeight = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    redraw();
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function appendPoint(event, force = false) {
    if (!active || event.pointerId !== active.pointerId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const last = active.stroke.points[active.stroke.points.length - 1];
    const minimumDistance = 0.0015;
    if (!force && last && Math.hypot(point.x - last.x, point.y - last.y) < minimumDistance) return;
    if (active.stroke.points.length < MAX_POINTS_PER_STROKE) active.stroke.points.push(point);
    else if (force) active.stroke.points[MAX_POINTS_PER_STROKE - 1] = point;
    redraw();
  }

  function releasePointer(pointerId) {
    try { if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId); } catch { /* no-op */ }
  }

  function discardActive(pointerId) {
    if (!active || (pointerId != null && pointerId !== active.pointerId)) return;
    releasePointer(active.pointerId);
    active = null;
    redraw();
  }

  function finishActive(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    appendPoint(event, true);
    const finished = active.stroke;
    releasePointer(active.pointerId);
    active = null;
    if (strokes.length < MAX_STROKES) strokes.push(finished);
    else strokes.shift(), strokes.push(finished);
    trimCommittedStrokes(strokes);
    redraw();
    emitChange();
    safeCall(options.onStrokeEnd, cloneStroke(finished), currentSnapshot());
  }

  function onPointerDown(event) {
    if (destroyed || active || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0) || !selectedTextureId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    active = { pointerId: event.pointerId, stroke: { textureId: selectedTextureId, size: DEFAULT_SIZE, points: [point] } };
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* Window listeners still clean up. */ }
    redraw();
    safeCall(options.onStrokeStart, cloneStroke(active.stroke));
  }

  function onPointerMove(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    // Coalesced points keep a fast pencil/finger path smooth without storing
    // more than the semantic point cap.
    const events = event.getCoalescedEvents?.() || [event];
    events.forEach((coalesced) => appendPoint(coalesced));
  }

  function onPointerUp(event) { finishActive(event); }
  function onPointerCancel(event) { discardActive(event.pointerId); }
  function onWindowBlur() { discardActive(); }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  win?.addEventListener?.('pointerup', onPointerUp);
  win?.addEventListener?.('pointercancel', onPointerCancel);
  win?.addEventListener?.('blur', onWindowBlur);

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(canvas);
  const onWindowResize = () => resize();
  win?.addEventListener?.('resize', onWindowResize);
  resize();

  // This never rejects: a failed authored image simply leaves its matching
  // semantic stroke transparent until the asset is repaired or available.
  const ready = resolvedTextures(textureDeclarations).then(() => { if (!destroyed) return redraw(); });

  return {
    ready,
    setTexture(textureId) {
      if (!textureIds.has(textureId)) return false;
      selectedTextureId = textureId;
      return true;
    },
    snapshot: currentSnapshot,
    load(value) {
      if (!isSnapshot(value)) return false;
      strokes = cleanSnapshot(value, textureIds);
      discardActive();
      redraw();
      emitChange();
      return currentSnapshot();
    },
    clear() {
      const hadStrokes = strokes.length > 0;
      strokes = [];
      discardActive();
      redraw();
      if (hadStrokes) emitChange();
    },
    hasStrokes() { return strokes.length > 0; },
    debugStroke(points, textureId = selectedTextureId) {
      const stroke = cleanStroke({ textureId, points, size: DEFAULT_SIZE }, textureIds);
      if (!stroke) return false;
      if (strokes.length >= MAX_STROKES) strokes.shift();
      strokes.push(stroke);
      trimCommittedStrokes(strokes);
      redraw();
      emitChange();
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      renderGeneration += 1;
      discardActive();
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      win?.removeEventListener?.('pointerup', onPointerUp);
      win?.removeEventListener?.('pointercancel', onPointerCancel);
      win?.removeEventListener?.('blur', onWindowBlur);
      win?.removeEventListener?.('resize', onWindowResize);
      canvas.style.touchAction = priorTouchAction;
    },
  };
}
