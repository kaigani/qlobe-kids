import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The game module has no imports or browser dependencies, so load the exact
// production source through a data URL just like the other clay-field tests.
const solverSource = await readFile(new URL('../../../shared/js/clay/heightfield.js', import.meta.url), 'utf8');
const { HeightfieldClay } = await import(`data:text/javascript;base64,${Buffer.from(solverSource).toString('base64')}`);
const source = await readFile(new URL('../js/landform-field.js', import.meta.url), 'utf8');
const fieldApi = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { CHALLENGES, targetMask, resetLandform, applyLandStroke, measureLandform } = fieldApi;

const SIZE = { width: 96, height: 64 };
const make = () => new HeightfieldClay(SIZE.width, SIZE.height);
const paintMask = (field, kind) => {
  const mask = targetMask(kind, field.width, field.height);
  for (let i = 0; i < mask.length; i += 1) field.cells[i] = mask[i] ? 4 : 0;
  field.revision += 1;
};
const finiteMetrics = (metrics) => Object.values(metrics).every((value) => typeof value !== 'number' || Number.isFinite(value));

assert.ok(Object.isFrozen(CHALLENGES), 'challenge map is immutable');
assert.deepEqual(Object.keys(CHALLENGES), ['island', 'lake', 'peninsula', 'bay']);

for (const kind of Object.keys(CHALLENGES)) {
  const initial = make();
  resetLandform(initial, kind);
  const initialMetrics = measureLandform(initial, kind);
  assert.equal(initialMetrics.complete, false, `${kind}: seeded state is not already solved`);
  assert.ok(finiteMetrics(initialMetrics), `${kind}: seeded metrics stay finite`);

  const perfect = make();
  paintMask(perfect, kind);
  const metrics = measureLandform(perfect, kind);
  console.log(`[${kind}] score=${metrics.score} target=${metrics.targetCoverage.toFixed(2)} preserve=${metrics.preserveCoverage.toFixed(2)}`);
  assert.equal(metrics.complete, true, `${kind}: target blueprint is recognizably complete`);
  assert.ok(finiteMetrics(metrics), `${kind}: perfect metrics stay finite`);
}

// These are deliberately loose, child-sized gestures rather than direct cell
// painting. They demonstrate that each tuned reset/tool pairing can reach a
// semantic pass without tracing a blueprint pixel-for-pixel.
{
  const gestures = {
    island: [[{ x: .35, y: .5 }, { x: .65, y: .5 }]],
    lake: Array.from({ length: 4 }, () => [{ x: .5, y: .5 }]),
    peninsula: [[{ x: .2, y: .5 }, { x: .7, y: .5 }]],
    bay: Array.from({ length: 2 }, () => [{ x: .88, y: .5 }, { x: .42, y: .5 }]),
  };
  for (const kind of Object.keys(gestures)) {
    const field = make();
    resetLandform(field, kind);
    for (const points of gestures[kind]) applyLandStroke(field, kind, CHALLENGES[kind].tool, points);
    assert.equal(measureLandform(field, kind).complete, true, `${kind}: a loose practical gesture can complete the form`);
  }

  // The production tray is larger than the compact regression field. Keep
  // these same loose recipes covered at the canonical 192×128 board size.
  const production = { width: 192, height: 128 };
  const productionGestures = {
    island: [[{ x: .35, y: .5 }, { x: .65, y: .5 }]],
    lake: Array.from({ length: 4 }, () => [{ x: .5, y: .5 }]),
    peninsula: [[{ x: .2, y: .5 }, { x: .7, y: .5 }]],
    bay: [
      [{ x: .88, y: .5 }, { x: .42, y: .5 }],
      [{ x: .88, y: .5 }, { x: .42, y: .5 }],
    ],
  };
  for (const kind of Object.keys(productionGestures)) {
    const field = new HeightfieldClay(production.width, production.height);
    resetLandform(field, kind);
    for (const points of productionGestures[kind]) applyLandStroke(field, kind, CHALLENGES[kind].tool, points);
    assert.equal(measureLandform(field, kind).complete, true, `${kind}: production-size gesture can complete the form`);
  }
}

// Semantic near-misses: each has plausible pixels, but not the named form.
{
  const field = make();
  paintMask(field, 'island');
  for (let y = 0; y < field.height; y += 1) field.cells[y * field.width] = 4;
  assert.equal(measureLandform(field, 'island').complete, false, 'island: edge-touching land is not an island');
}
{
  const field = make();
  paintMask(field, 'lake');
  const cx = Math.floor(field.width * .5);
  for (let y = 0; y <= Math.floor(field.height * .5); y += 1) field.cells[y * field.width + cx] = 0;
  assert.equal(measureLandform(field, 'lake').complete, false, 'lake: water open to outside is not a lake');
}
{
  const field = make();
  paintMask(field, 'peninsula');
  for (let y = 0; y < field.height; y += 1) for (let x = 0; x < Math.floor(field.width * .28); x += 1) field.cells[y * field.width + x] = 0;
  assert.equal(measureLandform(field, 'peninsula').complete, false, 'peninsula: detached land is not a peninsula');
}
{
  const field = make();
  paintMask(field, 'bay');
  // Seal the inlet before it reaches the right-side ocean. The pocket still
  // looks bay-like, but it is enclosed water rather than an open bay.
  const x = Math.floor(field.width * .70);
  for (let y = 0; y < field.height; y += 1) field.cells[y * field.width + x] = 4;
  assert.equal(measureLandform(field, 'bay').complete, false, 'bay: enclosed water not open right is not a bay');
}

{
  const field = make();
  resetLandform(field, 'island');
  const emptyRevision = field.revision;
  assert.equal(applyLandStroke(field, 'island', 'scoop', [{ x: .5, y: .5 }]), false,
    'scooping an all-water island tray is a no-op');
  assert.equal(field.revision, emptyRevision, 'a no-op scoop does not advance the field revision');
  assert.equal(applyLandStroke(field, 'island', 'pour', [{ x: -50, y: -10 }, { x: 50, y: 20 }]), true, 'clamped pour changes field');
  for (const value of field.cells) assert.ok(Number.isFinite(value) && value >= 0, 'clamping never corrupts cells');
  assert.throws(() => applyLandStroke(field, 'island', 'rain', []), /Unknown landform tool/);
  assert.throws(() => resetLandform(field, 'fjord'), /Unknown landform kind/);
  assert.throws(() => targetMask('fjord', 10, 10), /Unknown landform kind/);
}

console.log('landform-field tests passed');
