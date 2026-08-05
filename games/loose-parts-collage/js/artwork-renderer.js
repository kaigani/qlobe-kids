// Local, semantic mixed-media renderer. Stored artwork is never allowed to
// choose a URL: normalizeArtwork reconstructs every asset reference from the
// committed game configuration before this module creates an Image.

import { drawTexturedStrokes } from './textured-stroke-canvas.js';

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 900;
const MAX_PIECES = 200;
const MAX_STROKE_POINTS = 1800;
const MIN_POSITION = -0.08;
const MAX_POSITION = 1.08;
const MIN_SIZE = 0.08;
const MAX_SIZE = 0.55;
const MAX_TIMESTAMP = 8640000000000000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finiteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const safeId = (value, fallback) => {
  const id = typeof value === 'string' ? value.trim() : '';
  return /^[a-zA-Z0-9_-]{1,96}$/.test(id) ? id : fallback;
};
const normalizeAngle = (value) => {
  const angle = finiteNumber(value, 0);
  return ((angle + 180) % 360 + 360) % 360 - 180;
};
const normalizeTimestamp = (value) => clamp(Math.round(finiteNumber(value, 0)), 0, MAX_TIMESTAMP);

function configMaps(config) {
  const papers = new Map((Array.isArray(config?.papers) ? config.papers : [])
    .filter((entry) => safeId(entry?.id, '') && typeof entry.art === 'string')
    .map((entry) => [entry.id, entry]));
  const materials = new Map((Array.isArray(config?.materials) ? config.materials : [])
    .filter((entry) => safeId(entry?.id, '') && typeof entry.art === 'string')
    .map((entry) => [entry.id, entry]));
  const yarns = new Map((Array.isArray(config?.yarns) ? config.yarns : [])
    .filter((entry) => safeId(entry?.id, '') && typeof entry.art === 'string')
    .map((entry) => [entry.id, entry]));
  const modes = new Set((Array.isArray(config?.modes) ? config.modes : [])
    .map((entry) => entry?.id).filter((id) => safeId(id, '')));
  const ideas = new Set((Array.isArray(config?.ideas) ? config.ideas : [])
    .map((entry) => entry?.id).filter((id) => safeId(id, '')));
  return { papers, materials, yarns, modes, ideas };
}

function normalizePoint(point) {
  const x = Array.isArray(point) ? point[0] : point?.x;
  const y = Array.isArray(point) ? point[1] : point?.y;
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
  return {
    x: clamp(Number(x), 0, 1),
    y: clamp(Number(y), 0, 1),
  };
}

/**
 * Produce the only document shape that reaches the renderer. In particular,
 * the persisted `src`, label, and arbitrary `meta` fields are discarded.
 */
export function normalizeArtwork(doc, config) {
  const source = doc && typeof doc === 'object' ? doc : {};
  const { papers, materials, yarns, modes, ideas } = configMaps(config);
  const fallbackPaper = papers.values().next().value;
  const requestedPaper = papers.get(source.paperId);
  const paper = requestedPaper || fallbackPaper || null;
  const fallbackMode = modes.has('collage') ? 'collage' : [...modes][0] || 'collage';
  const documentId = safeId(source.id, 'artwork');
  const itemIds = new Set();

  const normalized = {
    format: 'qlobe-little-artist',
    formatVersion: 1,
    id: documentId,
    createdAt: normalizeTimestamp(source.createdAt),
    updatedAt: normalizeTimestamp(source.updatedAt),
    mode: modes.has(source.mode) ? source.mode : fallbackMode,
    promptId: ideas.has(source.promptId) ? source.promptId : null,
    paperId: paper?.id || null,
    paper: paper ? { id: paper.id, src: paper.art, swatch: paper.swatch || null } : null,
    yarn: { format: 'qlobe-textured-strokes', formatVersion: 1, strokes: [] },
    collage: { format: 'qlobe-freeform-board', formatVersion: 1, items: [] },
  };

  let pointCount = 0;
  const strokes = Array.isArray(source.yarn?.strokes) ? source.yarn.strokes : [];
  for (let index = 0; index < strokes.length && pointCount < MAX_STROKE_POINTS; index += 1) {
    const stroke = strokes[index];
    if (!stroke || typeof stroke !== 'object') continue;
    const textureId = safeId(stroke.textureId ?? stroke.colorId ?? stroke.meta?.colorId, '');
    const yarn = yarns.get(textureId);
    if (!yarn) continue;
    const rawPoints = Array.isArray(stroke.points) ? stroke.points : [];
    const points = [];
    for (let pointIndex = 0; pointIndex < rawPoints.length && pointCount < MAX_STROKE_POINTS; pointIndex += 1) {
      const point = normalizePoint(rawPoints[pointIndex]);
      if (!point) continue;
      points.push(point);
      pointCount += 1;
    }
    if (!points.length) continue;
    normalized.yarn.strokes.push({
      textureId: yarn.id,
      points,
      size: clamp(finiteNumber(stroke.size, 0.036), 0.012, 0.09),
    });
  }

  const items = Array.isArray(source.collage?.items) ? source.collage.items : [];
  for (let index = 0; index < items.length && normalized.collage.items.length < MAX_PIECES; index += 1) {
    const item = items[index];
    if (!item || typeof item !== 'object') continue;
    const assetId = safeId(item.meta?.assetId ?? item.assetId, '');
    const material = materials.get(assetId);
    if (!material) continue;
    let id = safeId(item.id, `piece-${index + 1}`);
    while (itemIds.has(id)) id = `piece-${index + 1}-${itemIds.size}`;
    itemIds.add(id);
    normalized.collage.items.push({
      id,
      kind: material.id,
      src: material.art,
      alt: material.title || material.id,
      x: clamp(finiteNumber(item.x, 0.5), MIN_POSITION, MAX_POSITION),
      y: clamp(finiteNumber(item.y, 0.5), MIN_POSITION, MAX_POSITION),
      size: clamp(finiteNumber(item.size, material.size || 0.22), MIN_SIZE, MAX_SIZE),
      rotation: normalizeAngle(item.rotation),
      mirror: Boolean(item.mirror),
      z: clamp(Math.round(finiteNumber(item.z, index)), -1000000, 1000000),
      meta: { assetId: material.id, family: material.family || null },
    });
  }
  return normalized;
}

function emitFailure(diagnostics, options, failure) {
  diagnostics.failures.push(failure);
  try { options.onDiagnostic?.(failure, diagnostics); } catch { /* Diagnostics never interrupt art. */ }
}

function loadLocalImage(src, cache, diagnostics, options, type, id) {
  if (!src || cache.has(src)) return cache.get(src);
  const task = new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      emitFailure(diagnostics, options, { type, id, src, reason: 'Image API unavailable' });
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      emitFailure(diagnostics, options, { type, id, src, reason: 'image failed to load' });
      resolve(null);
    };
    // src comes exclusively from config after normalization. Do not set
    // crossOrigin: the game is deliberately static/offline and local only.
    image.src = src;
  });
  cache.set(src, task);
  return task;
}

function ensureCanvas(canvas, width, height) {
  const target = canvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
  if (!target?.getContext) throw new Error('A canvas element is required to render artwork.');
  target.width = width;
  target.height = height;
  return target;
}

/**
 * Draw paper, then yarn, then bitmap pieces. Result diagnostics make missing
 * local art observable without preventing a child from keeping/exporting art.
 */
export async function renderArtworkToCanvas(canvas, doc, config, options = {}) {
  const width = clamp(Math.round(finiteNumber(options.width, DEFAULT_WIDTH)), 1, 8192);
  const height = clamp(Math.round(finiteNumber(options.height, DEFAULT_HEIGHT)), 1, 8192);
  const target = ensureCanvas(canvas, width, height);
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');
  const artwork = normalizeArtwork(doc, config);
  const diagnostics = { failures: [], artwork };
  const imageCache = new Map();

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  // The authored paper has a true-alpha deckled edge. Fill first so exported
  // PNGs remain an opaque keepsake at the corners while preserving that edge.
  ctx.fillStyle = artwork.paper?.swatch || '#fff7e7';
  ctx.fillRect(0, 0, width, height);

  if (artwork.paper?.src) {
    const paper = await loadLocalImage(artwork.paper.src, imageCache, diagnostics, options, 'paper', artwork.paper.id);
    if (paper) ctx.drawImage(paper, 0, 0, width, height);
  } else {
    emitFailure(diagnostics, options, { type: 'paper', id: null, src: null, reason: 'no trusted paper asset' });
  }

  const textures = {};
  const yarnAssets = configMaps(config).yarns;
  await Promise.all([...yarnAssets.values()].map(async (yarn) => {
    const image = await loadLocalImage(yarn.art, imageCache, diagnostics, options, 'yarn', yarn.id);
    if (image) textures[yarn.id] = image;
  }));
  try {
    await drawTexturedStrokes(ctx, artwork.yarn, { textures, width, height });
  } catch (error) {
    emitFailure(diagnostics, options, {
      type: 'yarn', id: null, src: null,
      reason: error instanceof Error ? error.message : 'textured stroke render failed',
    });
  }

  const orderedPieces = artwork.collage.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.z - b.item.z || a.index - b.index);
  for (const { item } of orderedPieces) {
    const image = await loadLocalImage(item.src, imageCache, diagnostics, options, 'piece', item.meta.assetId);
    if (!image) continue;
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) {
      emitFailure(diagnostics, options, { type: 'piece', id: item.meta.assetId, src: item.src, reason: 'invalid image dimensions' });
      continue;
    }
    const drawWidth = item.size * width;
    const drawHeight = drawWidth * naturalHeight / naturalWidth;
    ctx.save();
    ctx.translate(item.x * width, item.y * height);
    ctx.rotate(item.rotation * Math.PI / 180);
    ctx.scale(item.mirror ? -1 : 1, 1);
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }
  ctx.restore();
  return { canvas: target, diagnostics };
}

export function createArtworkThumbnail(canvas, doc, config) {
  return renderArtworkToCanvas(canvas, doc, config, {
    width: canvas?.width || DEFAULT_WIDTH,
    height: canvas?.height || DEFAULT_HEIGHT,
  });
}

function pngBlob(canvas) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(resolve, 'image/png');
      return;
    }
    resolve(null);
  });
}

function pngFilename(filename) {
  const clean = typeof filename === 'string' ? filename.trim().replace(/[\\/:*?"<>|]+/g, '-') : '';
  const base = clean.replace(/\.png$/i, '') || 'little-artist';
  return `${base.slice(0, 100)}.png`;
}

/** Render locally and trigger a conventional browser download. Pass returnBlob
 * to receive the PNG for a caller-owned local action instead. */
export async function downloadArtworkPng(doc, config, filename, options = {}) {
  const target = options.canvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
  if (!target) return false;
  await renderArtworkToCanvas(target, doc, config, options);
  const blob = await pngBlob(target);
  if (!blob) return false;
  if (options.returnBlob) return blob;
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = pngFilename(filename);
  link.style.display = 'none';
  document.body?.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

export const ARTWORK_RENDER_LIMITS = Object.freeze({
  maxPieces: MAX_PIECES,
  maxStrokePoints: MAX_STROKE_POINTS,
  defaultWidth: DEFAULT_WIDTH,
  defaultHeight: DEFAULT_HEIGHT,
});
