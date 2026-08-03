import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The production file remains a plain browser ES module (`.js`) because this
// repository intentionally has no package.json. Load the same source through a
// data URL so Node tests it as ESM without changing that runtime constraint.
const source = await readFile(new URL('./clay-grid.js', import.meta.url), 'utf8');
const { HeightfieldClay } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const relativeDrift = (before, after) => Math.abs(after - before) / before;
const changedCells = (before, after) => before.reduce(
  (count, value, index) => count + (Math.abs(value - after[index]) > 1e-5 ? 1 : 0),
  0,
);

for (const preset of ['slab', 'balls']) {
  const clay = new HeightfieldClay();
  clay.reset(preset);
  const baseline = clay.totalVolume();
  assert.ok(baseline > 1000, `${preset} creates material`);

  const beforePress = [...clay.cells];
  clay.press(96, 64, 11, .7);
  assert.ok(changedCells(beforePress, clay.cells) > 100, `${preset} press changes a region`);
  assert.ok(relativeDrift(baseline, clay.totalVolume()) < 1e-6, `${preset} press conserves volume`);

  const beforeSmear = [...clay.cells];
  clay.smear(96, 64, 103, 68, 13, .4);
  assert.ok(changedCells(beforeSmear, clay.cells) > 100, `${preset} smear transports material`);
  assert.ok(relativeDrift(baseline, clay.totalVolume()) < 1e-6, `${preset} smear conserves volume`);

  clay.roll(103, 68, 15, .5);
  assert.ok(relativeDrift(baseline, clay.totalVolume()) < 1e-6, `${preset} roll conserves volume`);

  clay.relax(4);
  assert.ok(relativeDrift(baseline, clay.totalVolume()) < 1e-6, `${preset} relaxation conserves volume`);
}

console.log('Clay field tests passed: persistent edits and volume-conserving press, pull, roll, and relaxation.');
