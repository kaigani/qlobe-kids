// dough-field.js — the playdough factory's field-space tuning, on top of the
// shared HeightfieldClay solver.
//
// Everything below works in FIELD CELLS, never client pixels, and takes the
// field object in as its first argument rather than owning one. That is what
// lets `dough-field.test.mjs` drive the exact same numerics under plain node
// (see the module header of `heightfield.test.mjs` for why that trick only
// works when a file imports nothing): `clay-dough.js` is the only file that
// constructs a `HeightfieldClay`, owns a canvas, or knows what a pointer is.
//
// Every verb here either transports material (conserving) or is clearly a
// source (adding it from outside the sim) — see heightfield.js's own header
// for the underlying contract. `rollPass` is entirely conserving: a rolling
// pin never adds dough, it only spreads what is already there. `depositRope`
// and `stampGlyph`'s initial sheet are sources, same as any addSlab/addBall
// call — that is what makes a rope of squeezed-out dough or a starting lump
// possible at all.

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const ROLL_FIELD = { width: 224, height: 144 };
export const TRACE_FIELD = { width: 216, height: 144 };
export const FREE_FIELD = { width: 256, height: 160 };

// --- roll ------------------------------------------------------------------

// The starting lump is a BALL, roughly as tall as it is wide. That is what
// makes rolling read: the pin's length fixes the dough's vertical extent, so
// only x can grow, and a compact start turns into a long oval rope. An early
// tuning began from a tall vertical oval already as tall as the pin band, and
// widening it just produced a square slab of plasticine — the same silhouette
// at every swipe count, only bigger.
const ROLL_LUMP_RX_FRACTION = .105;
const ROLL_LUMP_RY_FRACTION = .19;
const ROLL_LUMP_PEAK = 11;
const ROLL_LUMP_RELAX_PASSES = 3;
const ROLL_LUMP_RELAX_RATE = .05;
const ROLL_LUMP_RELAX_YIELD = .16;

const ROLL_WORK_MIN_FRACTION = .10;
const ROLL_WORK_MAX_FRACTION = .90;
// The band spans the whole lump, not a slice of it: a band narrower than the
// dough leaves an unrolled ridge above and below the pin.
const ROLL_BAND_TOP_FRACTION = .31;
const ROLL_BAND_BOTTOM_FRACTION = .69;
// Nine overlapping discs, not five. At five the gaps between discs scalloped
// the silhouette's top and bottom edges into visible notches.
const ROLL_BAND_SAMPLES = 11;
// How much of the pin's force reaches the ends of the band. A pin applied at
// full strength across a flat band flattens the dough into a hard-edged
// RECTANGLE — which is what the first tuning produced, and it read as a sheet
// of plasticine rather than a rolled piece. Tapering the ends lets them stay
// rounded, so the lump elongates into an oval the way real dough does.
const ROLL_BAND_EDGE_WEIGHT = .34;
// A wild pointer jump (a coalesced-event backlog, a resize mid-drag) must
// never inject a smear bigger than a real swipe would produce — clamp the
// per-call travel before touching the field at all.
const ROLL_MAX_TRAVEL_FRACTION = .085;
const ROLL_FLATTEN_RADIUS = 15;
const ROLL_FLATTEN_STRENGTH = .30;
const ROLL_TRANSPORT_RADIUS = 16;
const ROLL_TRANSPORT_STRENGTH = .28;
const ROLL_TRANSPORT_FRACTION = .62;
// A low yield threshold here is what rounds the shoulders: roll() stops dead
// at its own disc edge, and only creep below the yield lets that step slump
// into a curve between passes.
const ROLL_PASS_RELAX_RATE = .07;
const ROLL_PASS_RELAX_YIELD = .05;
const ROLL_SETTLE_RELAX_RATE = .05;
const ROLL_SETTLE_RELAX_YIELD = .06;

// The pin's contact line, as `{ y, weight }` samples across the dough band.
function rollBandSamples(field) {
  const top = field.height * ROLL_BAND_TOP_FRACTION;
  const bottom = field.height * ROLL_BAND_BOTTOM_FRACTION;
  const samples = [];
  for (let index = 0; index < ROLL_BAND_SAMPLES; index += 1) {
    const t = index / (ROLL_BAND_SAMPLES - 1);
    const taper = ROLL_BAND_EDGE_WEIGHT
      + (1 - ROLL_BAND_EDGE_WEIGHT) * Math.sin(Math.PI * t);
    samples.push({ y: top + (bottom - top) * t, weight: taper });
  }
  return samples;
}

/**
 * Lays down the fat, short starting lump a rolling session begins from.
 * @param {import('../../../shared/js/clay/heightfield.js').HeightfieldClay} field
 * @returns {void}
 */
export function resetRollDough(field) {
  field.clear();
  field.addSlab(
    field.width * .5,
    field.height * .5,
    field.width * ROLL_LUMP_RX_FRACTION,
    field.height * ROLL_LUMP_RY_FRACTION,
    ROLL_LUMP_PEAK,
  );
  field.relax(ROLL_LUMP_RELAX_PASSES, ROLL_LUMP_RELAX_RATE, ROLL_LUMP_RELAX_YIELD);
}

/**
 * One rolling-pin step: the pin is a vertical bar sweeping horizontally from
 * `fromX` to `toX`. Flattens under the bar's new position, transports a
 * fraction of what it picked up in the direction of travel, then lets the
 * squeeze relax outward. Volume-conserving — every verb used here is.
 * @param {import('../../../shared/js/clay/heightfield.js').HeightfieldClay} field
 * @param {number} fromX field-space x the pin is moving from.
 * @param {number} toX field-space x the pin is moving to.
 * @returns {boolean} true if the field was edited.
 */
export function rollPass(field, fromX, toX) {
  const minX = field.width * ROLL_WORK_MIN_FRACTION;
  const maxX = field.width * ROLL_WORK_MAX_FRACTION;
  const clampedFrom = clamp(fromX, minX, maxX);
  const rawTo = clamp(toX, minX, maxX);
  const maxTravel = field.width * ROLL_MAX_TRAVEL_FRACTION;
  const travel = clamp(rawTo - clampedFrom, -maxTravel, maxTravel);
  if (Math.abs(travel) < .01) return false;
  const clampedTo = clamp(clampedFrom + travel, minX, maxX);

  const ySamples = rollBandSamples(field);

  for (const sample of ySamples) {
    field.roll(clampedTo, sample.y, ROLL_FLATTEN_RADIUS, ROLL_FLATTEN_STRENGTH * sample.weight);
  }

  const transportTo = clamp(clampedFrom + travel * ROLL_TRANSPORT_FRACTION, minX, maxX);
  for (const sample of ySamples) {
    field.smear(
      clampedFrom,
      sample.y,
      transportTo,
      sample.y,
      ROLL_TRANSPORT_RADIUS,
      ROLL_TRANSPORT_STRENGTH * sample.weight,
    );
  }

  field.relax(1, ROLL_PASS_RELAX_RATE, ROLL_PASS_RELAX_YIELD);
  return true;
}

/**
 * One gentle relax pass, for the frames after the child releases the pin.
 * @param {import('../../../shared/js/clay/heightfield.js').HeightfieldClay} field
 * @returns {void}
 */
export function settleRoll(field) {
  field.relax(1, ROLL_SETTLE_RELAX_RATE, ROLL_SETTLE_RELAX_YIELD);
}

// --- trace -------------------------------------------------------------

const TRACE_SLAB_RX_FRACTION = .455;
const TRACE_SLAB_RY_FRACTION = .44;
export const TRACE_SLAB_PEAK = 6.4;
const TRACE_SLAB_RELAX_PASSES = 3;
const TRACE_SLAB_RELAX_RATE = .045;
const TRACE_SLAB_RELAX_YIELD = .16;

// The groove has to read as a real recess, not a shallow scratch, and the
// displaced material needs somewhere to go that reads as a rim rather than
// vanishing — press()'s own physics does the rim for free as long as the
// radius is small enough that a 4-7 cell perpendicular offset actually lands
// in its rim band (press's rim sits between .88x and 1.58x its radius).
const GROOVE_RADIUS = 7;
// `pressPath` presses every GROOVE_SPACING cells with a GROOVE_RADIUS brush, so
// any one cell is pressed roughly six times as the path sweeps over it. The
// per-press depth therefore has to stay small: at 7.5 (deeper than the slab
// itself) the floor reached exactly zero, which the transparent-background
// renderer draws as a see-through hole in the dough rather than a recess — and
// a second pass over the same stroke punched the whole letter out. At 1.3 the
// floor settles around 43% of TRACE_SLAB_PEAK: a strongly walled groove with
// material still under it, and headroom if a stroke ever gets carved twice.
const GROOVE_DEPTH = 1.3;
const GROOVE_SPACING = 2.2;
// Deliberately far above heightfield.js's own default (.18): a groove that
// relaxed at the normal rate would slump itself shut within a pass or two.
const GROOVE_RELAX_RATE = .05;
const GROOVE_RELAX_YIELD = .9;

/**
 * Lays down the rolled sheet the letter (or glyph) gets pressed into.
 * @param {import('../../../shared/js/clay/heightfield.js').HeightfieldClay} field
 * @returns {void}
 */
export function resetTraceSlab(field) {
  field.clear();
  field.addSlab(
    field.width * .5,
    field.height * .5,
    field.width * TRACE_SLAB_RX_FRACTION,
    field.height * TRACE_SLAB_RY_FRACTION,
    TRACE_SLAB_PEAK,
  );
  field.relax(TRACE_SLAB_RELAX_PASSES, TRACE_SLAB_RELAX_RATE, TRACE_SLAB_RELAX_YIELD);
}

/**
 * Carves a recessed groove along a field-space polyline — the stroke the
 * child has just been credited with — and lets it settle just enough to lose
 * hard edges without healing shut.
 * @param {import('../../../shared/js/clay/heightfield.js').HeightfieldClay} field
 * @param {{x: number, y: number}[]} points field-space polyline points.
 * @returns {boolean} true if the field changed.
 */
export function carveGroove(field, points) {
  const changed = field.pressPath(points, {
    radius: GROOVE_RADIUS,
    depth: GROOVE_DEPTH,
    spacing: GROOVE_SPACING,
  });
  field.relax(1, GROOVE_RELAX_RATE, GROOVE_RELAX_YIELD);
  return changed;
}

// --- free dough --------------------------------------------------------

const FREE_SHEET_RX_FRACTION = .47;
const FREE_SHEET_RY_FRACTION = .45;
const FREE_SHEET_PEAK = 5.4;
const FREE_SHEET_RELAX_PASSES = 2;
const FREE_SHEET_RELAX_RATE = .045;
const FREE_SHEET_RELAX_YIELD = .16;

const ROPE_RADIUS = 9;
// Comfortably more than 2x the sheet peak before the settle pass eats into
// it — a rope that only just cleared 2x on paper would read as a stain the
// moment relax softened it.
const ROPE_PEAK = 12;
const ROPE_SPACING = 1.6;
const ROPE_RELAX_RATE = .03;
const ROPE_RELAX_YIELD = .3;

// Same carving recipe as the trace groove (see GROOVE_* above) — a stamp is
// just a press along a short, closed or open polyline instead of a swipe, so
// it lives under the same no-punch-through rule: a glyph whose strokes meet
// (A's crossbar, the star's tight arms) gets pressed from two directions at
// once, and at a large depth those junctions reached zero and the tray showed
// through as bright specks inside the letter.
const STAMP_RADIUS = 5.5;
const STAMP_DEPTH = .9;
const STAMP_SPACING = 1.6;
const STAMP_RELAX_RATE = .05;
const STAMP_RELAX_YIELD = .9;

// How big a glyph reads on the sheet, and the deterministic scatter that
// keeps repeated stamps from landing on top of each other. Scaled down from
// main.js's own `230 + (count*173) % 470` / `220 + (count*109) % 245`
// scatter (a 900x600 SVG canvas) into this field's much smaller resolution,
// keeping the same "walk, don't repeat" spirit.
const GLYPH_SIZE = 46;
const GLYPH_BASE_X = 66;
const GLYPH_STEP_X = 49;
const GLYPH_RANGE_X = 126;
// The y step and range must not share a factor that collapses the walk: 29
// into 58 only ever yields two rows, so every stamp landed on one of two
// horizontal lines. 23 into 70 walks eight rows before it repeats.
const GLYPH_BASE_Y = 48;
const GLYPH_STEP_Y = 23;
const GLYPH_RANGE_Y = 70;

function starPoints(outerRadius, innerRadius, pointCount) {
  const points = [];
  for (let index = 0; index < pointCount * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    // First outer point straight up: angle -90 degrees, then walk clockwise.
    const angle = -Math.PI / 2 + (index * Math.PI) / pointCount;
    points.push({ x: .5 + Math.cos(angle) * radius, y: .5 + Math.sin(angle) * radius });
  }
  points.push({ x: points[0].x, y: points[0].y });
  return points;
}

function ellipsePoints(rx, ry, sampleCount) {
  const points = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const angle = (index / sampleCount) * Math.PI * 2;
    points.push({ x: .5 + Math.cos(angle) * rx, y: .5 + Math.sin(angle) * ry });
  }
  points.push({ x: points[0].x, y: points[0].y });
  return points;
}

/**
 * Normalized (0..1, y down) single- or multi-stroke glyph geometry for the
 * free-dough stamps. Computed once at module load for 'O' and '*'.
 */
export const GLYPHS = {
  A: [
    [{ x: .10, y: 1 }, { x: .50, y: 0 }],
    [{ x: .50, y: 0 }, { x: .90, y: 1 }],
    [{ x: .22, y: .66 }, { x: .78, y: .66 }],
  ],
  O: [ellipsePoints(.44, .5, 28)],
  S: [[
    { x: .86, y: .16 }, { x: .66, y: .02 }, { x: .30, y: .02 }, { x: .14, y: .22 },
    { x: .16, y: .40 }, { x: .40, y: .50 }, { x: .62, y: .52 }, { x: .84, y: .62 },
    { x: .86, y: .80 }, { x: .70, y: .97 }, { x: .34, y: .98 }, { x: .12, y: .84 },
  ]],
  '*': [starPoints(.5, .21, 5)],
};

function glyphKeyFor(mark) {
  return mark === '★' ? '*' : mark;
}

/**
 * Where stamp number `index` lands, and how big it is. Exported so the test
 * can sample exactly where a stamp was carved instead of keeping its own copy
 * of the scatter arithmetic — a duplicated copy silently sampled the wrong
 * cells the first time these constants were retuned.
 * @param {number} index a monotonically increasing stamp counter.
 * @returns {{x: number, y: number, size: number}} field-space centre and glyph box size.
 */
export function glyphPlacement(index) {
  return {
    x: GLYPH_BASE_X + (index * GLYPH_STEP_X) % GLYPH_RANGE_X,
    y: GLYPH_BASE_Y + (index * GLYPH_STEP_Y) % GLYPH_RANGE_Y,
    size: GLYPH_SIZE,
  };
}

/** Maps one normalized glyph stroke into field space for stamp `index`. */
export function glyphStrokeToField(stroke, index) {
  const { x, y, size } = glyphPlacement(index);
  return stroke.map((point) => ({
    x: x + (point.x - .5) * size,
    y: y + (point.y - .5) * size,
  }));
}

/**
 * Lays down the thin sheet of dough covering the free-play tray. A press
 * (stamp) or a groove has nothing to carve into without this.
 * @param {import('../../../shared/js/clay/heightfield.js').HeightfieldClay} field
 * @returns {void}
 */
export function resetFreeSheet(field) {
  field.clear();
  field.addSlab(
    field.width * .5,
    field.height * .5,
    field.width * FREE_SHEET_RX_FRACTION,
    field.height * FREE_SHEET_RY_FRACTION,
    FREE_SHEET_PEAK,
  );
  field.relax(FREE_SHEET_RELAX_PASSES, FREE_SHEET_RELAX_RATE, FREE_SHEET_RELAX_YIELD);
}

/**
 * Lays a raised rope of dough along a field-space polyline drag — the child
 * squeezing new dough out, hence a material source via `depositPath`, plus
 * one light relax so the rope reads as plastic rather than extruded plastic.
 * @param {import('../../../shared/js/clay/heightfield.js').HeightfieldClay} field
 * @param {{x: number, y: number}[]} points field-space polyline points.
 * @returns {boolean} true if the field changed.
 */
export function depositRope(field, points) {
  const changed = field.depositPath(points, {
    radius: ROPE_RADIUS,
    peak: ROPE_PEAK,
    spacing: ROPE_SPACING,
  });
  field.relax(1, ROPE_RELAX_RATE, ROPE_RELAX_YIELD);
  return changed;
}

/**
 * Presses a letter-shaped (or star-shaped) impression into the free-dough
 * sheet. `index` scatters repeated stamps around the sheet deterministically,
 * in the spirit of main.js's SVG-era scatter arithmetic, so they don't pile
 * on top of each other.
 * @param {import('../../../shared/js/clay/heightfield.js').HeightfieldClay} field
 * @param {'A'|'O'|'S'|'*'|'★'} mark which glyph to stamp.
 * @param {number} index a monotonically increasing stamp counter.
 * @returns {boolean} true if the field changed.
 */
export function stampGlyph(field, mark, index) {
  const key = glyphKeyFor(mark);
  const strokes = GLYPHS[key];
  if (!strokes) return false;

  let changed = false;
  for (const stroke of strokes) {
    const fieldPoints = glyphStrokeToField(stroke, index);
    if (field.pressPath(fieldPoints, {
      radius: STAMP_RADIUS,
      depth: STAMP_DEPTH,
      spacing: STAMP_SPACING,
    })) changed = true;
  }
  field.relax(1, STAMP_RELAX_RATE, STAMP_RELAX_YIELD);
  return changed;
}

// --- metrics -------------------------------------------------------------

/**
 * Honest debug-state numbers for the current field: no smoothing, no
 * fudging — this feeds the game's QLOBE_DEBUG state directly.
 * @param {import('../../../shared/js/clay/heightfield.js').HeightfieldClay} field
 * @param {number} [threshold] passed straight through to `field.bounds()`.
 * @returns {{revision: number, volume: number, peak: number, spreadX: number, spreadY: number}}
 */
export function fieldMetrics(field, threshold) {
  const box = field.bounds(threshold);
  return {
    revision: field.revision,
    volume: field.totalVolume(),
    peak: field.peakHeight(),
    spreadX: box ? box.width / field.width : 0,
    spreadY: box ? box.height / field.height : 0,
  };
}
