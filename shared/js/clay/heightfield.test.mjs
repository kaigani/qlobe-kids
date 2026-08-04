import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The production file remains a plain browser ES module (`.js`) because this
// repository intentionally has no package.json. Load the same source through a
// data URL so Node tests it as ESM without changing that runtime constraint.
const source = await readFile(new URL('./heightfield.js', import.meta.url), 'utf8');
const { HeightfieldClay } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const relativeDrift = (before, after) => Math.abs(after - before) / before;
const changedCells = (before, after) => before.reduce(
  (count, value, index) => count + (Math.abs(value - after[index]) > 1e-5 ? 1 : 0),
  0,
);

// --- both presets create material, and press/smear/roll/relax conserve volume ---
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

// --- a press leaves a persistent dent, even after settling ---
{
  const clay = new HeightfieldClay();
  clay.reset('slab');
  const before = clay.heightAt(96, 64);
  clay.press(96, 64, 11, .7);
  clay.relax(4);
  const after = clay.heightAt(96, 64);
  assert.ok(after < before, 'a press leaves a persistent dent through relaxation');
}

// --- pressPath carves a continuous groove and still conserves volume ---
{
  const clay = new HeightfieldClay();
  clay.reset('slab');
  const path = [{ x: 60, y: 64 }, { x: 80, y: 64 }, { x: 100, y: 70 }, { x: 120, y: 70 }];
  const before = path.map((p) => clay.heightAt(p.x, p.y));
  const midBefore = path.slice(1).map((p, i) => clay.heightAt((path[i].x + p.x) / 2, (path[i].y + p.y) / 2));
  const baseline = clay.totalVolume();
  const changed = clay.pressPath(path, { radius: 11, depth: .28, spacing: 2.2 });
  assert.ok(changed, 'pressPath reports a change');
  path.forEach((p, i) => {
    assert.ok(clay.heightAt(p.x, p.y) < before[i], `pressPath lowers height at path point ${i}`);
  });
  // The real "groove, not beads" check: the gaps *between* the supplied points
  // must be carved too, which is only true if the resampler walked them.
  for (let i = 1; i < path.length; i += 1) {
    const midX = (path[i - 1].x + path[i].x) / 2;
    const midY = (path[i - 1].y + path[i].y) / 2;
    assert.ok(clay.heightAt(midX, midY) < midBefore[i - 1], `pressPath carves the gap before point ${i}`);
  }
  assert.ok(relativeDrift(baseline, clay.totalVolume()) < 1e-6, 'pressPath conserves volume');

  // a single-point polyline behaves like one press (a tap)
  const tapClay = new HeightfieldClay();
  tapClay.reset('slab');
  const tapChanged = tapClay.pressPath([{ x: 96, y: 64 }], { radius: 11, depth: .28 });
  assert.ok(tapChanged, 'a single-point pressPath (a tap) changes the field');
}

// --- depositPath adds material, caps its own peak, and bumps revision once ---
{
  const clay = new HeightfieldClay();
  const baseline = clay.totalVolume();
  assert.equal(baseline, 0, 'a fresh field is empty');
  const revisionBefore = clay.revision;
  const path = [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 80, y: 40 }];
  const changed = clay.depositPath(path, { radius: 9, peak: 5, spacing: 1.6 });
  assert.ok(changed, 'depositPath reports a change');
  assert.ok(clay.totalVolume() > baseline, 'depositPath adds material');
  assert.equal(clay.revision, revisionBefore + 1, 'depositPath bumps revision exactly once');

  const peakAfterOnce = clay.peakHeight();
  assert.ok(peakAfterOnce <= 5 + 1e-6, 'depositPath does not exceed the requested peak');

  // running the same path again max-blends rather than piling up
  clay.depositPath(path, { radius: 9, peak: 5, spacing: 1.6 });
  const peakAfterTwice = clay.peakHeight();
  assert.ok(peakAfterTwice <= 5 + 1e-6, 'repeating depositPath does not raise the peak above the requested peak');

  // a single-point polyline behaves like one dome
  const dotClay = new HeightfieldClay();
  const dotChanged = dotClay.depositPath([{ x: 96, y: 64 }], { radius: 9, peak: 5 });
  assert.ok(dotChanged, 'a single-point depositPath (a tap) changes the field');
}

// --- clear() empties the field and bumps revision ---
{
  const clay = new HeightfieldClay();
  clay.reset('balls');
  assert.ok(clay.totalVolume() > 0, 'field has material before clear');
  const revisionBefore = clay.revision;
  clay.clear();
  assert.equal(clay.totalVolume(), 0, 'clear() empties the field');
  assert.ok(clay.revision > revisionBefore, 'clear() bumps revision');
}

// --- bounds() ---
{
  const clay = new HeightfieldClay();
  assert.equal(clay.bounds(), null, 'bounds() is null on an empty field');

  const wideClay = new HeightfieldClay();
  const horizontalPath = [{ x: 30, y: 64 }, { x: 150, y: 64 }];
  wideClay.depositPath(horizontalPath, { radius: 6, peak: 4, spacing: 1.6 });
  const box = wideClay.bounds();
  assert.ok(box, 'bounds() finds the deposited rope');
  assert.ok(box.width > box.height, 'a horizontal rope is wider than it is tall');
}

// --- peakHeight() ---
{
  const clay = new HeightfieldClay();
  assert.equal(clay.peakHeight(), 0, 'peakHeight() is 0 on an empty field');
  clay.addBall(96, 64, 20, 6);
  assert.ok(clay.peakHeight() > 0, 'peakHeight() is positive after addBall');
}

// --- revision never decreases across a scripted sequence of every verb ---
{
  const clay = new HeightfieldClay();
  let lastRevision = clay.revision;
  const assertMonotonic = (label) => {
    assert.ok(clay.revision >= lastRevision, `revision did not decrease after ${label}`);
    lastRevision = clay.revision;
  };

  clay.reset('slab');
  assertMonotonic('reset');
  clay.addBall(50, 50, 10, 3);
  assertMonotonic('addBall');
  clay.addSlab(140, 90, 12, 8, 4);
  assertMonotonic('addSlab');
  clay.press(96, 64, 11, .3);
  assertMonotonic('press');
  clay.pressPath([{ x: 40, y: 40 }, { x: 60, y: 60 }], { radius: 8, depth: .2 });
  assertMonotonic('pressPath');
  clay.smear(96, 64, 103, 68, 13, .4);
  assertMonotonic('smear');
  clay.roll(103, 68, 15, .5);
  assertMonotonic('roll');
  clay.relax(3);
  assertMonotonic('relax');
  clay.depositPath([{ x: 20, y: 20 }, { x: 30, y: 30 }], { radius: 6, peak: 3 });
  assertMonotonic('depositPath');
  clay.clear();
  assertMonotonic('clear');
}

console.log('Heightfield tests passed: presets, volume-conserving verbs, persistent dents, path helpers, bounds, peak height, and monotonic revision.');
