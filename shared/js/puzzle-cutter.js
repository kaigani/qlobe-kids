// puzzle-cutter.js — cut any image into interlocking jigsaw pieces.
//
// One module, two layers:
//
//   generatePuzzle(opts)      pure geometry — no DOM, runs in Node too. Builds
//                             the classic jigsaw cut pattern (three cubic
//                             beziers per tabbed edge, the shape every physical
//                             puzzle uses) for an arbitrary rows × cols grid,
//                             and returns per-piece SVG path strings plus
//                             bounds, cell rects, and tab/blank/flat labels.
//   cutImage(source, opts)    browser layer — runs generatePuzzle for the
//                             source's size, then renders every piece to its
//                             own transparent canvas (image clipped to the cut,
//                             optional inner outline + directional bevel so a
//                             piece reads as a chunky physical thing, not a
//                             flat sticker).
//
// Neighboring pieces share the SAME edge geometry, so pieces reassemble
// pixel-perfectly: place each piece's canvas at its `x, y` and the source image
// comes back seamless. That invariant is what a jigsaw game snaps against.
//
// Variety, all seeded through shared/js/rng.js so QLOBE_DEBUG.seed() and asset
// pipelines reproduce exactly:
//   - every tabbed edge flips direction, resizes, slides off-center, and leans
//     asymmetrically on its own draw
//   - interior grid corners jitter, so no two pieces are congruent
//   - tab depth scales with the SMALLER cell dimension and tab width is
//     converted to absolute units, so tabs stay round on elongated cells
//     (a 3×2 cut of a wide image gets real knobs, not stretched blobs)
//
// Same (seed, rows, cols, size, knobs) → same cut, but the sequence of RNG
// draws is part of that contract — if this file's draw order ever changes,
// previously generated layouts change with it. Pipelines that must keep a cut
// forever should keep the rendered PNGs (tools/cut-puzzle.mjs writes them),
// not just the seed.
//
// Typical runtime use:
//   import { cutImage } from '../../../shared/js/puzzle-cutter.js';
//   const img = new Image(); img.src = 'assets/photo.jpg'; await img.decode();
//   const puzzle = cutImage(img, { rows: 2, cols: 3, seed: 'round-1' });
//   for (const piece of puzzle.pieces) {
//     // piece.canvas is the cut piece; piece.x/y place it back in the image
//   }
//
// Pre-cutting to files instead: node tools/cut-puzzle.mjs <image> --grid 3x2

import { mulberry32, hashString } from './rng.js';

const round2 = (value) => Math.round(value * 100) / 100;
const pt = ([x, y]) => `${round2(x)} ${round2(y)}`;

function resolveSeed(seed) {
  if (typeof seed === 'string') return hashString(seed);
  const value = Number(seed);
  return Number.isFinite(value) ? value >>> 0 : 1;
}

// ───────────────────────────────────────────────────────────────── geometry ──

/**
 * Build the cut pattern for a rows × cols puzzle over a width × height image.
 * Pure math — safe to import in Node for manifests and tests.
 *
 * @param {object} opts
 * @param {number} opts.width         image width in px (required)
 * @param {number} opts.height        image height in px (required)
 * @param {number} [opts.rows=2]
 * @param {number} [opts.cols=2]
 * @param {number|string} [opts.seed=1]  string seeds hash via rng.hashString
 * @param {number} [opts.tabDepth=0.3]   knob bulge as a fraction of the
 *                                       smaller cell dimension
 * @param {number} [opts.wobble=0.045]   shoulder/neck waviness (w-axis units)
 * @param {number} [opts.posJitter=0.07] how far a knob may slide off-center,
 *                                       as a fraction of its edge length
 * @param {number} [opts.cornerJitter=0.05] interior corner drift, as a
 *                                       fraction of the smaller cell dimension
 * @returns {{
 *   width: number, height: number, rows: number, cols: number, seed: number,
 *   cellWidth: number, cellHeight: number,
 *   pieces: Array<{
 *     row: number, col: number, index: number,
 *     path: string,                                    // SVG d, image coords
 *     bounds: {x: number, y: number, width: number, height: number},
 *     cell:   {x: number, y: number, width: number, height: number},
 *     edges:  {top: string, right: string, bottom: string, left: string},
 *   }>,
 *   outlinePaths: string[],                            // border + every cut
 * }}
 */
export function generatePuzzle({
  width, height, rows = 2, cols = 2, seed = 1,
  tabDepth = 0.3, wobble = 0.045, posJitter = 0.07, cornerJitter = 0.05,
} = {}) {
  if (!(width > 0) || !(height > 0)) {
    throw new Error('puzzle-cutter: generatePuzzle needs positive width and height');
  }
  const rowCount = Math.max(1, Math.floor(rows));
  const colCount = Math.max(1, Math.floor(cols));
  const random = mulberry32(resolveSeed(seed));
  const uniform = (min, max) => min + (max - min) * random();

  const cellWidth = width / colCount;
  const cellHeight = height / rowCount;
  const minCell = Math.min(cellWidth, cellHeight);

  // Corner lattice. Border corners stay put so the assembled puzzle is a clean
  // rectangle; interior corners drift so no two pieces are congruent.
  const corners = [];
  for (let r = 0; r <= rowCount; r += 1) {
    corners[r] = [];
    for (let c = 0; c <= colCount; c += 1) {
      let x = c * cellWidth;
      let y = r * cellHeight;
      if (r > 0 && r < rowCount && c > 0 && c < colCount) {
        x += uniform(-1, 1) * cornerJitter * minCell;
        y += uniform(-1, 1) * cornerJitter * minCell;
      }
      corners[r][c] = [x, y];
    }
  }

  // One tabbed edge from a → b: three cubic beziers (shoulder, knob, shoulder),
  // the standard jigsaw profile. Perpendicular offsets are in units of minCell
  // (so knob depth is aspect-independent); the knob's extent ALONG the edge is
  // converted from those same absolute units into a fraction of this edge's
  // length, which is what keeps knobs round instead of stretching with the cell.
  const tabbedEdge = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy; // perpendicular; sign flips it per edge
    const ny = ux;

    const sign = random() < 0.5 ? -1 : 1;
    const t = (tabDepth / 3) * uniform(0.85, 1.15); // knob unit; bulge ≈ 3t
    const shoulderA = uniform(-wobble, wobble);
    const neckWobble = uniform(-wobble, wobble);
    const shoulderB = uniform(-wobble, wobble);
    const lean = uniform(-1, 1) * 0.4 * t;          // knob asymmetry
    const pos = 0.5 + uniform(-posJitter, posJitter);
    const tv = (t * minCell) / len;                 // knob half-width, as length fraction
    const lv = (lean * minCell) / len;

    const P = (v, w) => [
      a[0] + ux * len * v + nx * minCell * w * sign,
      a[1] + uy * len * v + ny * minCell * w * sign,
    ];
    const segs = [
      { c1: P(0.2, shoulderA), c2: P(pos + lv, -t + neckWobble), p: P(pos - tv, t + neckWobble) },
      { c1: P(pos - 2 * tv - lv, 3 * t + neckWobble), c2: P(pos + 2 * tv - lv, 3 * t + neckWobble), p: P(pos + tv, t + neckWobble) },
      { c1: P(pos + lv, -t + neckWobble), c2: P(0.8, shoulderB), p: [b[0], b[1]] },
    ];
    // Which neighbor does the knob poke into? (bulge · toward-lower-index axis)
    const towardPrev = (nx * sign) * (Math.abs(nx)) + (ny * sign) * (Math.abs(ny)) < 0;
    return { a, b, segs, towardPrev };
  };

  const flatEdge = (a, b) => ({ a, b, segs: null, towardPrev: false });

  // Horizontal edges [r][c]: corner[r][c] → corner[r][c+1]. Vertical edges
  // [c][r]: corner[r][c] → corner[r+1][c]. Draw order is part of the seed
  // contract — see the header.
  const hEdges = [];
  for (let r = 0; r <= rowCount; r += 1) {
    hEdges[r] = [];
    for (let c = 0; c < colCount; c += 1) {
      const a = corners[r][c];
      const b = corners[r][c + 1];
      hEdges[r][c] = (r === 0 || r === rowCount) ? flatEdge(a, b) : tabbedEdge(a, b);
    }
  }
  const vEdges = [];
  for (let c = 0; c <= colCount; c += 1) {
    vEdges[c] = [];
    for (let r = 0; r < rowCount; r += 1) {
      const a = corners[r][c];
      const b = corners[r + 1][c];
      vEdges[c][r] = (c === 0 || c === colCount) ? flatEdge(a, b) : tabbedEdge(a, b);
    }
  }

  // Traverse an edge forward (a → b) or reversed, appending to an SVG d string
  // and collecting every anchor/control point (a bezier never escapes its
  // control hull, so those points bound the piece exactly enough).
  const appendEdge = (edge, reverse, points) => {
    if (!edge.segs) {
      const end = reverse ? edge.a : edge.b;
      points.push(end);
      return ` L ${pt(end)}`;
    }
    let segs = edge.segs;
    if (reverse) {
      const anchors = [edge.a, segs[0].p, segs[1].p, segs[2].p];
      segs = segs.map((seg, i) => ({ c1: seg.c2, c2: seg.c1, p: anchors[i] })).reverse();
    }
    let d = '';
    for (const seg of segs) {
      points.push(seg.c1, seg.c2, seg.p);
      d += ` C ${pt(seg.c1)} ${pt(seg.c2)} ${pt(seg.p)}`;
    }
    return d;
  };

  const pieces = [];
  for (let r = 0; r < rowCount; r += 1) {
    for (let c = 0; c < colCount; c += 1) {
      const top = hEdges[r][c];
      const right = vEdges[c + 1][r];
      const bottom = hEdges[r + 1][c];
      const left = vEdges[c][r];

      const points = [corners[r][c]];
      let d = `M ${pt(corners[r][c])}`;
      d += appendEdge(top, false, points);
      d += appendEdge(right, false, points);
      d += appendEdge(bottom, true, points);
      d += appendEdge(left, true, points);
      d += ' Z';

      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }

      const label = (edge, isFlat, tabWhenTowardPrev) => {
        if (isFlat) return 'flat';
        return edge.towardPrev === tabWhenTowardPrev ? 'tab' : 'blank';
      };
      pieces.push({
        row: r,
        col: c,
        index: r * colCount + c,
        path: d,
        bounds: {
          x: round2(minX), y: round2(minY),
          width: round2(maxX - minX), height: round2(maxY - minY),
        },
        cell: {
          x: round2(c * cellWidth), y: round2(r * cellHeight),
          width: round2(cellWidth), height: round2(cellHeight),
        },
        edges: {
          // A knob poking toward the lower-index neighbor belongs to THIS piece
          // on its top/left side, and to the neighbor on its bottom/right side.
          top: label(top, r === 0, true),
          right: label(right, c === colCount - 1, false),
          bottom: label(bottom, r === rowCount - 1, false),
          left: label(left, c === 0, true),
        },
      });
    }
  }

  // The full cut pattern as open strokes (border rectangle + each interior
  // cut), for previews and print — the template-sheet view of this puzzle.
  const outlinePaths = [
    `M 0 0 L ${round2(width)} 0 L ${round2(width)} ${round2(height)} L 0 ${round2(height)} Z`,
  ];
  const strokeOf = (edge) => {
    if (!edge.segs) return null;
    const points = [];
    return `M ${pt(edge.a)}${appendEdge(edge, false, points)}`;
  };
  for (let r = 1; r < rowCount; r += 1) {
    for (let c = 0; c < colCount; c += 1) outlinePaths.push(strokeOf(hEdges[r][c]));
  }
  for (let c = 1; c < colCount; c += 1) {
    for (let r = 0; r < rowCount; r += 1) outlinePaths.push(strokeOf(vEdges[c][r]));
  }

  return {
    width, height, rows: rowCount, cols: colCount, seed: resolveSeed(seed),
    cellWidth: round2(cellWidth), cellHeight: round2(cellHeight),
    pieces, outlinePaths: outlinePaths.filter(Boolean),
  };
}

/** The cut pattern as a standalone SVG document string (preview / print). */
export function outlineSvg(puzzle, { stroke = '#1c1c1c', strokeWidth = 3, background = '#ffffff' } = {}) {
  const paths = puzzle.outlinePaths
    .map((d) => `  <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`)
    .join('\n');
  const bg = background ? `  <rect width="${puzzle.width}" height="${puzzle.height}" fill="${background}"/>\n` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${puzzle.width} ${puzzle.height}" width="${puzzle.width}" height="${puzzle.height}">\n${bg}${paths}\n</svg>\n`;
}

// ──────────────────────────────────────────────────────────────── rendering ──

function createCanvas(width, height) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  throw new Error('puzzle-cutter: rendering needs a browser (canvas); generatePuzzle alone is Node-safe');
}

/**
 * Render one piece of a generated puzzle to its own transparent canvas.
 *
 * @param {CanvasImageSource} source  drawn stretched to the puzzle's
 *                                    width × height, so geometry and image
 *                                    agree even if their sizes differ
 * @param {object} piece              an entry from generatePuzzle().pieces
 * @param {object} [opts]
 * @param {object} [opts.puzzle]      the puzzle (for width/height + default
 *                                    stroke sizing); cutImage passes it
 * @param {object|false} [opts.outline]  {color, width} inner cut line;
 *                                    false for the bare clipped image
 * @param {object|false} [opts.bevel]    {size, highlight, shadow} directional
 *                                    inner bevel (light from top-left);
 *                                    false to disable
 * @returns {{canvas: HTMLCanvasElement|OffscreenCanvas, x: number, y: number}}
 *          place the canvas at (x, y) in image coords to reassemble
 */
export function renderPiece(source, piece, { puzzle = null, outline = {}, bevel = {} } = {}) {
  const width = puzzle?.width ?? (source.naturalWidth ?? source.width);
  const height = puzzle?.height ?? (source.naturalHeight ?? source.height);
  const minCell = puzzle
    ? Math.min(puzzle.cellWidth, puzzle.cellHeight)
    : Math.min(piece.bounds.width, piece.bounds.height);

  const outlineWidth = outline === false ? 0 : (outline.width ?? Math.max(1.5, minCell * 0.014));
  const bevelSize = bevel === false ? 0 : (bevel.size ?? Math.max(2, minCell * 0.03));
  const pad = Math.ceil(Math.max(outlineWidth, bevelSize, 2) + 2);

  const x = Math.floor(piece.bounds.x - pad);
  const y = Math.floor(piece.bounds.y - pad);
  const canvasWidth = Math.ceil(piece.bounds.x + piece.bounds.width + pad) - x;
  const canvasHeight = Math.ceil(piece.bounds.y + piece.bounds.height + pad) - y;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  ctx.translate(-x, -y);

  const path = new Path2D(piece.path);
  ctx.save();
  ctx.clip(path);
  ctx.drawImage(source, 0, 0, width, height);
  ctx.restore();

  // Everything below paints only where the piece already has pixels, so the
  // bevel and cut line hug the bezier silhouette exactly.
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineJoin = 'round';

  if (bevelSize > 0) {
    // Stroke the silhouette twice, nudged along the light axis: shifting the
    // white stroke down-right leaves its paint inside the piece's TOP-LEFT
    // edges (highlight); the dark stroke shifted up-left lands inside the
    // BOTTOM-RIGHT edges (shadow). Cheap, and reads as thickness at kid sizes.
    const shift = bevelSize * 0.55;
    ctx.lineWidth = bevelSize * 2;
    ctx.save();
    ctx.translate(shift, shift);
    ctx.strokeStyle = bevel.highlight ?? 'rgba(255, 255, 255, 0.4)';
    ctx.stroke(path);
    ctx.restore();
    ctx.save();
    ctx.translate(-shift, -shift);
    ctx.strokeStyle = bevel.shadow ?? 'rgba(0, 0, 0, 0.3)';
    ctx.stroke(path);
    ctx.restore();
  }

  if (outlineWidth > 0) {
    // Doubled width + source-atop keeps only the inner half: a crisp cut line
    // that never halos outside the silhouette.
    ctx.lineWidth = outlineWidth * 2;
    ctx.strokeStyle = outline.color ?? 'rgba(30, 20, 10, 0.4)';
    ctx.stroke(path);
  }

  ctx.globalCompositeOperation = 'source-over';
  return { canvas, x, y };
}

/**
 * The one-call version: generate geometry for the source's size and render
 * every piece. Geometry opts (rows, cols, seed, tabDepth, …) and render opts
 * (outline, bevel) share this options bag.
 *
 * @param {CanvasImageSource} source  image, canvas, or bitmap
 * @returns {ReturnType<typeof generatePuzzle> & {
 *   pieces: Array<{canvas, x, y} & piece>   // geometry fields + rendered canvas
 * }}
 */
export function cutImage(source, { outline = {}, bevel = {}, ...geometry } = {}) {
  const width = source.naturalWidth ?? source.videoWidth ?? source.width;
  const height = source.naturalHeight ?? source.videoHeight ?? source.height;
  const puzzle = generatePuzzle({ width, height, ...geometry });
  const pieces = puzzle.pieces.map((piece) => ({
    ...piece,
    ...renderPiece(source, piece, { puzzle, outline, bevel }),
  }));
  return { ...puzzle, pieces };
}
