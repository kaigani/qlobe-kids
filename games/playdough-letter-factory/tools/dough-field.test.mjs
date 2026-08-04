import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Both the shared solver and this game's tuning stay plain browser ES
// modules (this repository intentionally has no package.json). Load each
// through its own data URL so node runs the exact same numerics the browser
// does. Neither file imports anything — that's what makes this work without
// a stub in sight; see dough-field.js's own module header.
const heightfieldSource = await readFile(
  new URL('../../../shared/js/clay/heightfield.js', import.meta.url),
  'utf8',
);
const { HeightfieldClay } = await import(
  `data:text/javascript;base64,${Buffer.from(heightfieldSource).toString('base64')}`
);

const doughFieldSource = await readFile(new URL('../js/dough-field.js', import.meta.url), 'utf8');
const doughField = await import(
  `data:text/javascript;base64,${Buffer.from(doughFieldSource).toString('base64')}`
);
const {
  ROLL_FIELD, TRACE_FIELD, FREE_FIELD, TRACE_SLAB_PEAK, GLYPHS,
  resetRollDough, rollPass, settleRoll,
  resetTraceSlab, carveGroove,
  resetFreeSheet, depositRope, stampGlyph, glyphPlacement, glyphStrokeToField,
  fieldMetrics,
} = doughField;

const relativeDrift = (before, after) => (before === 0 ? Math.abs(after) : Math.abs(after - before) / before);
const meanHeightAlong = (field, points) => {
  const values = points.map((p) => field.heightAt(p.x, p.y));
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};
const lerp = (a, b, t) => a + (b - a) * t;
const samplePath = (from, to, count) => {
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    points.push({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) });
  }
  return points;
};

// --- 1. roll actually lengthens and flattens --------------------------------
{
  const field = new HeightfieldClay(ROLL_FIELD.width, ROLL_FIELD.height);
  resetRollDough(field);
  const startMetrics = fieldMetrics(field, .12);
  const startSpreadX = startMetrics.spreadX;
  const startPeak = startMetrics.peak;
  const startVolume = field.totalVolume();

  assert.ok(startSpreadX > 0, 'roll: dough exists after resetRollDough');

  const w = field.width;
  let previousSpreadX = startSpreadX;
  const swipeSpreads = [];
  const STEPS = 40;
  for (let swipe = 0; swipe < 3; swipe += 1) {
    const leftToRight = swipe % 2 === 0;
    const from = leftToRight ? w * .2 : w * .8;
    const to = leftToRight ? w * .8 : w * .2;
    let cursor = from;
    for (let step = 0; step < STEPS; step += 1) {
      const t = (step + 1) / STEPS;
      const nextCursor = lerp(from, to, t);
      rollPass(field, cursor, nextCursor);
      cursor = nextCursor;
    }
    settleRoll(field);
    const spreadX = fieldMetrics(field, .12).spreadX;
    swipeSpreads.push(spreadX);
    assert.ok(spreadX > previousSpreadX, `roll: spreadX increases after swipe ${swipe + 1} (${spreadX.toFixed(3)} > ${previousSpreadX.toFixed(3)})`);
    previousSpreadX = spreadX;
  }

  const finalMetrics = fieldMetrics(field, .12);
  console.log(
    `[roll] startSpreadX=${startSpreadX.toFixed(3)} swipeSpreads=${swipeSpreads.map((v) => v.toFixed(3)).join(',')} `
    + `finalSpreadX=${finalMetrics.spreadX.toFixed(3)} startPeak=${startPeak.toFixed(3)} finalPeak=${finalMetrics.peak.toFixed(3)}`,
  );

  assert.ok(finalMetrics.spreadX >= 1.9 * startSpreadX, `roll: final spreadX (${finalMetrics.spreadX.toFixed(3)}) >= 1.9x start (${(1.9 * startSpreadX).toFixed(3)})`);
  assert.ok(finalMetrics.spreadX >= .55, `roll: final spreadX (${finalMetrics.spreadX.toFixed(3)}) >= .55 absolute`);
  assert.ok(finalMetrics.peak <= .6 * startPeak, `roll: final peak (${finalMetrics.peak.toFixed(3)}) <= .6x start (${(.6 * startPeak).toFixed(3)})`);

  const volumeDrift = relativeDrift(startVolume, field.totalVolume());
  console.log(`[roll] startVolume=${startVolume.toFixed(3)} finalVolume=${field.totalVolume().toFixed(3)} drift=${volumeDrift.toExponential(3)}`);
  assert.ok(volumeDrift < 1e-4, `roll: total volume drift (${volumeDrift.toExponential(3)}) stays under 1e-4`);

  const box = field.bounds(.35);
  assert.ok(box, 'roll: bounds(.35) finds material');
  console.log(`[roll] bounds(.35).minX=${box.minX} maxX=${box.maxX} field.width=${field.width}`);
  assert.ok(box.minX >= 2, `roll: dough never touches the left wall (minX=${box.minX} >= 2)`);
  assert.ok(box.maxX <= field.width - 3, `roll: dough never touches the right wall (maxX=${box.maxX} <= ${field.width - 3})`);
}

// --- 2. trace groove is deep and has a rim ----------------------------------
{
  const field = new HeightfieldClay(TRACE_FIELD.width, TRACE_FIELD.height);
  resetTraceSlab(field);
  const baselineVolume = field.totalVolume();

  const from = { x: field.width * .22, y: field.height * .28 };
  const to = { x: field.width * .78, y: field.height * .72 };
  const path = samplePath(from, to, 12);

  // perpendicular offset sample at the path midpoint, for the rim check
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const perp = { x: -dy / len, y: dx / len };
  const rimOffset = 6; // within the required 4-7 cell band
  const rimPoint = { x: mid.x + perp.x * rimOffset, y: mid.y + perp.y * rimOffset };
  const rimBefore = field.heightAt(rimPoint.x, rimPoint.y);

  const changed = carveGroove(field, path);
  assert.ok(changed, 'trace: carveGroove reports a change');

  const meanAlong = meanHeightAlong(field, path);
  console.log(`[trace] TRACE_SLAB_PEAK=${TRACE_SLAB_PEAK} meanAlong=${meanAlong.toFixed(3)} threshold=${(.48 * TRACE_SLAB_PEAK).toFixed(3)}`);
  assert.ok(meanAlong <= .48 * TRACE_SLAB_PEAK, `trace: mean height along groove (${meanAlong.toFixed(3)}) <= .48x slab peak (${(.48 * TRACE_SLAB_PEAK).toFixed(3)})`);

  // The groove must stay a RECESS, never a hole. heightfield-canvas.js draws
  // any cell at or below .018 as background — with the transparent background
  // this game uses, that is the cream tray showing through a letter-shaped
  // gap instead of dough with a channel pressed into it. This bound is why
  // GROOVE_DEPTH is small and pressed repeatedly rather than large and once.
  const CUTOUT_FLOOR = .018;
  const floorAlong = Math.min(...path.map((point) => field.heightAt(point.x, point.y)));
  console.log(`[trace] floorAlong=${floorAlong.toFixed(3)} must stay above the renderer's ${CUTOUT_FLOOR} cutout floor`);
  assert.ok(floorAlong > CUTOUT_FLOOR, `trace: groove floor (${floorAlong.toFixed(3)}) never punches through to transparent`);

  const rimAfter = field.heightAt(rimPoint.x, rimPoint.y);
  console.log(`[trace] rimBefore=${rimBefore.toFixed(3)} rimAfter=${rimAfter.toFixed(3)} required>=${(1.05 * rimBefore).toFixed(3)}`);
  assert.ok(rimAfter >= 1.05 * rimBefore, `trace: rim height (${rimAfter.toFixed(3)}) >= 1.05x pre-carve height at same offset (${(1.05 * rimBefore).toFixed(3)})`);

  const volumeDrift = relativeDrift(baselineVolume, field.totalVolume());
  console.log(`[trace] volumeDrift=${volumeDrift.toExponential(3)}`);
  assert.ok(volumeDrift < 1e-5, `trace: carveGroove conserves volume (drift ${volumeDrift.toExponential(3)} < 1e-5)`);

  let allFiniteAndNonNegative = true;
  for (let i = 0; i < field.cells.length; i += 1) {
    if (!Number.isFinite(field.cells[i]) || field.cells[i] < 0) { allFiniteAndNonNegative = false; break; }
  }
  assert.ok(allFiniteAndNonNegative, 'trace: every cell stays finite and >= 0 after carving');

  // --- 3. carving the same stroke twice is stable ---
  carveGroove(field, path);
  let stableAfterSecondCarve = true;
  for (let i = 0; i < field.cells.length; i += 1) {
    const v = field.cells[i];
    if (!Number.isFinite(v) || v < 0) { stableAfterSecondCarve = false; break; }
  }
  const peakAfterTwice = field.peakHeight();
  console.log(`[trace] peakAfterTwice=${peakAfterTwice.toFixed(3)} ceiling=${(3 * TRACE_SLAB_PEAK).toFixed(3)}`);
  assert.ok(stableAfterSecondCarve, 'trace: carving twice produces no NaN or negative heights');
  assert.ok(peakAfterTwice <= 3 * TRACE_SLAB_PEAK, `trace: carving twice keeps peak (${peakAfterTwice.toFixed(3)}) <= 3x slab peak (${(3 * TRACE_SLAB_PEAK).toFixed(3)})`);
}

// --- 4. free rope sits on top of the sheet ----------------------------------
{
  const field = new HeightfieldClay(FREE_FIELD.width, FREE_FIELD.height);
  resetFreeSheet(field);
  const baselineVolume = field.totalVolume();
  const sheetHeight = field.heightAt(field.width * .5, field.height * .5);

  const ropeFrom = { x: field.width * .25, y: field.height * .5 };
  const ropeTo = { x: field.width * .75, y: field.height * .5 };
  const ropePath = samplePath(ropeFrom, ropeTo, 10);
  const changed = depositRope(field, ropePath);
  assert.ok(changed, 'free: depositRope reports a change');

  const peakAlongRope = Math.max(...ropePath.map((p) => field.heightAt(p.x, p.y)));
  console.log(`[free-rope] sheetHeight=${sheetHeight.toFixed(3)} peakAlongRope=${peakAlongRope.toFixed(3)} required>=${(2 * sheetHeight).toFixed(3)}`);
  assert.ok(peakAlongRope >= 2 * sheetHeight, `free: peak along rope (${peakAlongRope.toFixed(3)}) >= 2x sheet height (${(2 * sheetHeight).toFixed(3)})`);
  assert.ok(field.totalVolume() > baselineVolume, 'free: depositRope increases total volume (it is a source)');
}

// --- 5. stamps carve a real impression --------------------------------------
{
  const field = new HeightfieldClay(FREE_FIELD.width, FREE_FIELD.height);
  resetFreeSheet(field);
  const sheetHeight = field.heightAt(field.width * .5, field.height * .5);

  const marks = ['A', 'O', 'S', '*'];
  const centres = [];
  marks.forEach((mark, index) => {
    const strokes = GLYPHS[mark === '★' ? '*' : mark];
    const allPoints = [];
    stampGlyph(field, mark, index);

    // Ask the module itself where the stamp landed. An earlier version of this
    // test kept its own copy of the scatter constants and silently sampled the
    // wrong cells the moment they were retuned.
    const { x: centerX, y: centerY } = glyphPlacement(index);
    centres.push({ x: centerX, y: centerY });

    strokes.forEach((stroke) => {
      allPoints.push(...glyphStrokeToField(stroke, index));
    });

    const meanAlong = meanHeightAlong(field, allPoints);
    console.log(`[free-stamp ${mark}] centre=(${centerX},${centerY}) meanAlong=${meanAlong.toFixed(3)} threshold=${(.55 * sheetHeight).toFixed(3)}`);
    assert.ok(meanAlong <= .55 * sheetHeight, `free: mean height along '${mark}' stroke (${meanAlong.toFixed(3)}) <= .55x sheet height (${(.55 * sheetHeight).toFixed(3)})`);

    // Same no-punch-through rule as the trace groove: where a glyph's strokes
    // meet (A's crossbar, the star's arms) the sheet gets pressed from two
    // directions at once, and a deep stamp drove those junctions to zero —
    // which the transparent-background renderer drew as bright tray specks
    // inside the letter.
    const floorAlong = Math.min(...allPoints.map((p) => field.heightAt(p.x, p.y)));
    assert.ok(floorAlong > .018, `free: glyph '${mark}' floor (${floorAlong.toFixed(3)}) never punches through to transparent`);

    const margin = 2;
    const insideField = allPoints.every((p) => p.x > margin && p.x < field.width - margin && p.y > margin && p.y < field.height - margin);
    assert.ok(insideField, `free: glyph '${mark}' stayed inside the field with no sample clamped to the border`);
  });

  for (let i = 0; i < centres.length; i += 1) {
    for (let j = i + 1; j < centres.length; j += 1) {
      const same = centres[i].x === centres[j].x && centres[i].y === centres[j].y;
      assert.ok(!same, `free: stamp centres for index ${i} and ${j} differ`);
    }
  }
  console.log(`[free-stamp] centres=${JSON.stringify(centres)}`);
}

// --- 6. fieldMetrics is honest -----------------------------------------------
{
  const empty = new HeightfieldClay(FREE_FIELD.width, FREE_FIELD.height);
  const emptyMetrics = fieldMetrics(empty, .12);
  assert.equal(emptyMetrics.spreadX, 0, 'metrics: spreadX is 0 on an empty field');
  assert.equal(emptyMetrics.spreadY, 0, 'metrics: spreadY is 0 on an empty field');
  assert.equal(emptyMetrics.revision, empty.revision, 'metrics: revision matches the field on an empty field');

  const horizontal = new HeightfieldClay(FREE_FIELD.width, FREE_FIELD.height);
  const hPath = samplePath({ x: horizontal.width * .1, y: horizontal.height * .5 }, { x: horizontal.width * .9, y: horizontal.height * .5 }, 12);
  horizontal.depositPath(hPath, { radius: 6, peak: 4, spacing: 1.6 });
  const hMetrics = fieldMetrics(horizontal, .12);
  console.log(`[metrics] horizontal rope spreadX=${hMetrics.spreadX.toFixed(3)} spreadY=${hMetrics.spreadY.toFixed(3)} revision=${hMetrics.revision}`);
  assert.ok(hMetrics.spreadX > hMetrics.spreadY, `metrics: a horizontal rope has spreadX (${hMetrics.spreadX.toFixed(3)}) > spreadY (${hMetrics.spreadY.toFixed(3)})`);
  assert.equal(hMetrics.revision, horizontal.revision, 'metrics: revision matches the field after edits');
}

console.log('Dough field tests passed: roll lengthens/flattens conservatively, trace groove carves with a rim, repeat-carve stability, free rope sits above the sheet, glyph stamps carve real impressions at distinct centres, and fieldMetrics is honest.');
