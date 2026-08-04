import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';

const source = await readFile(new URL('./field-core.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { createClayField, parseColor, FIELD_RES } = await import(moduleUrl);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function section(name) {
  console.log(`\n=== ${name} ===`);
}

/** Deterministic tiny LCG -> [0,1). No Math.random anywhere in this file. */
function makeLcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Mean magnitude of the finite-difference gradient of `dist`, restricted to
 * voxels within one voxel of the zero surface. A well-formed SDF has
 * |grad d| ~ 1 there; a blurred/oversmoothed one drops below 1.
 */
function surfaceSharpness(f) {
  const { dist, res, h } = f;
  const stride = res;
  const slab = res * res;
  let sum = 0;
  let count = 0;
  for (let k = 1; k < res - 1; k++) {
    for (let j = 1; j < res - 1; j++) {
      let n = (k * res + j) * res + 1;
      for (let i = 1; i < res - 1; i++, n++) {
        const d = dist[n];
        if (d >= h || d <= -h) continue;
        const gx = (dist[n + 1] - dist[n - 1]) / (2 * h);
        const gy = (dist[n + stride] - dist[n - stride]) / (2 * h);
        const gz = (dist[n + slab] - dist[n - slab]) / (2 * h);
        sum += Math.sqrt(gx * gx + gy * gy + gz * gz);
        count++;
      }
    }
  }
  return count ? sum / count : 0;
}

const report = { fieldRes: FIELD_RES };

// ===========================================================================
// 1. stamp determinism
// ===========================================================================
section('1. stamp determinism');
{
  const seedA = 42;
  const stampSeq = [
    [{ x: -0.2, y: 0, z: 0 }, 0.25, '#3fbf6f'],
    [{ x: 0.15, y: 0.1, z: -0.1 }, 0.2, '#ff7314'],
    [{ x: 0.05, y: -0.15, z: 0.1 }, 0.18, '#3f7fbf'],
  ];

  const f1 = createClayField({ seed: seedA });
  const f2 = createClayField({ seed: seedA });
  for (const [c, r, col] of stampSeq) f1.stampBall(c, r, col);
  for (const [c, r, col] of stampSeq) f2.stampBall(c, r, col);

  let distDiffSameSeed = 0;
  for (let i = 0; i < f1.dist.length; i++) if (f1.dist[i] !== f2.dist[i]) distDiffSameSeed++;
  let colorDiffSameSeed = 0;
  for (let i = 0; i < f1.color.length; i++) if (f1.color[i] !== f2.color[i]) colorDiffSameSeed++;
  assert.equal(distDiffSameSeed, 0, 'same seed + same stamp sequence must give bit-identical dist arrays');
  assert.equal(colorDiffSameSeed, 0, 'same seed + same stamp sequence must give bit-identical color arrays');

  const f3 = createClayField({ seed: seedA + 1 });
  for (const [c, r, col] of stampSeq) f3.stampBall(c, r, col);
  let distDiffOtherSeed = 0;
  for (let i = 0; i < f1.dist.length; i++) if (f1.dist[i] !== f3.dist[i]) distDiffOtherSeed++;
  assert.ok(distDiffOtherSeed > 0, 'a different seed must produce a different field (seeded noise must actually do something)');

  const fBall = createClayField({ seed: seedA });
  const r = 0.30;
  fBall.stampBall({ x: 0, y: 0, z: 0 }, r, '#3fbf6f');
  const analyticVolume = (4 / 3) * Math.PI * r * r * r;
  const measuredVolume = fBall.volume();
  const volumePctDiff = Math.abs(measuredVolume - analyticVolume) / analyticVolume * 100;
  assert.ok(volumePctDiff < 3, `single-ball volume should be within 3% of the analytic 4/3*pi*r^3 (got ${volumePctDiff.toFixed(3)}%)`);

  report.test1_stampDeterminism = {
    distDiffSameSeed,
    colorDiffSameSeed,
    distDiffOtherSeedVoxels: distDiffOtherSeed,
    singleBallVolumeMeasured: measuredVolume,
    singleBallVolumeAnalytic: analyticVolume,
    singleBallVolumePctDiff: volumePctDiff,
  };
}

// ===========================================================================
// 2. replay determinism
// ===========================================================================
section('2. replay determinism');
{
  const seed = 7;
  const f = createClayField({ seed });
  // ~12 mixed ops: stamps + pulls + one simplify. No settle, so the replay
  // comparison can be exact rather than epsilon-bounded.
  f.stampBall({ x: -0.2, y: 0, z: 0 }, 0.22, '#3fbf6f');
  f.stampBall({ x: 0.15, y: 0.05, z: -0.05 }, 0.20, '#ff7314');
  f.stampBall({ x: 0.0, y: -0.15, z: 0.1 }, 0.18, '#3f7fbf');
  f.pull({ x: -0.1, y: 0, z: 0 }, { x: 0.05, y: 0.02, z: 0 }, 0.2);
  f.pull({ x: 0.1, y: 0.05, z: -0.02 }, { x: -0.03, y: 0.04, z: 0.01 }, 0.18);
  f.pull({ x: 0.0, y: -0.1, z: 0.05 }, { x: 0.02, y: -0.03, z: 0.02 }, 0.2);
  f.stampBall({ x: 0.2, y: 0.2, z: 0.1 }, 0.15, '#f2c744');
  f.pull({ x: 0.15, y: 0.15, z: 0.08 }, { x: -0.02, y: 0.03, z: -0.01 }, 0.16);
  f.pull({ x: -0.15, y: 0.05, z: -0.05 }, { x: 0.03, y: -0.02, z: 0.02 }, 0.18);
  f.simplify(0.2);
  f.pull({ x: 0.05, y: 0.1, z: 0.0 }, { x: -0.01, y: 0.02, z: 0.01 }, 0.15);
  f.pull({ x: -0.05, y: -0.1, z: 0.05 }, { x: 0.02, y: 0.01, z: -0.02 }, 0.17);

  const opsList = f.ops();
  assert.equal(opsList.length, 12, `expected 12 logged ops, got ${opsList.length}`);

  const g = createClayField({ seed });
  const t0 = performance.now();
  g.replay(opsList);
  const replayMs = performance.now() - t0;

  let distDiffReplay = 0;
  for (let i = 0; i < f.dist.length; i++) if (f.dist[i] !== g.dist[i]) distDiffReplay++;
  assert.equal(distDiffReplay, 0, 'replaying the op log onto a fresh same-seed field must give a bit-identical dist array');

  // A separate 100-op creature (stamps + pulls), purely to measure replay cost
  // at a size relevant to a save-strategy decision.
  const rnd100 = makeLcg(2024);
  const f100 = createClayField({ seed: 2024 });
  f100.stampBall({ x: 0, y: 0, z: 0 }, 0.25, '#3fbf6f');
  f100.stampBall({ x: 0.15, y: 0.1, z: 0.05 }, 0.2, '#ff7314');
  f100.stampBall({ x: -0.15, y: -0.08, z: 0.08 }, 0.18, '#3f7fbf');
  for (let i = 0; i < 97; i++) {
    const px = (rnd100() - 0.5) * 0.3;
    const py = (rnd100() - 0.5) * 0.3;
    const pz = (rnd100() - 0.5) * 0.3;
    const dx = (rnd100() - 0.5) * 0.1;
    const dy = (rnd100() - 0.5) * 0.1;
    const dz = (rnd100() - 0.5) * 0.1;
    const brush = 0.15 + rnd100() * 0.1;
    f100.pull({ x: px, y: py, z: pz }, { x: dx, y: dy, z: dz }, brush);
  }
  const ops100 = f100.ops();
  assert.equal(ops100.length, 100, 'expected exactly 100 ops for the replay-cost measurement');

  const g100 = createClayField({ seed: 2024 });
  const t100 = performance.now();
  g100.replay(ops100);
  const replayMs100Ops = performance.now() - t100;

  report.test2_replayDeterminism = {
    opsCount: opsList.length,
    distDiffReplay,
    replayMs,
    replayMs100Ops,
  };
}

// ===========================================================================
// 3. advection locality
// ===========================================================================
section('3. advection locality');
{
  const f = createClayField({ seed: 11 });
  const leftCenter = { x: -0.45, y: 0, z: 0 };
  f.stampBall(leftCenter, 0.2, '#3fbf6f');
  f.stampBall({ x: 0.45, y: 0, z: 0 }, 0.2, '#ff7314');

  const before = f.dist.slice();
  f.clearDirty();

  const brush = 0.18;
  f.pull(leftCenter, { x: 0.06, y: 0.03, z: 0 }, brush);

  const { h, origin, res, brickSize: BRICK } = f;
  const marginVoxels = 3; // "brush + a couple of voxels"
  const threshold = brush + marginVoxels * h;

  let localityViolations = 0;
  let changedVoxels = 0;
  const changedIdx = [];
  for (let k = 0; k < res; k++) {
    const wz = origin + (k + 0.5) * h;
    for (let j = 0; j < res; j++) {
      const wy = origin + (j + 0.5) * h;
      let n = (k * res + j) * res;
      for (let i = 0; i < res; i++, n++) {
        const wx = origin + (i + 0.5) * h;
        const changed = f.dist[n] !== before[n];
        if (changed) {
          changedVoxels++;
          changedIdx.push([i, j, k]);
          const dx = wx - leftCenter.x;
          const dy = wy - leftCenter.y;
          const dz = wz - leftCenter.z;
          const distFromPull = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (distFromPull > threshold) localityViolations++;
        }
      }
    }
  }
  assert.equal(localityViolations, 0, `every voxel further than ${threshold.toFixed(4)} from the pull centre must stay bit-identical`);

  const dirty = f.dirtyBricks();
  const dirtyFraction = dirty.length / f.brickCount;
  assert.ok(dirtyFraction < 0.15, `dirty bricks should be a small fraction of brickCount (got ${(dirtyFraction * 100).toFixed(2)}%, ${dirty.length}/${f.brickCount})`);

  const dirtySet = new Set(dirty.map((b) => `${b.bi},${b.bj},${b.bk}`));
  let missingBrickCoverage = 0;
  for (const [i, j, k] of changedIdx) {
    const bi = (i / BRICK) | 0;
    const bj = (j / BRICK) | 0;
    const bk = (k / BRICK) | 0;
    if (!dirtySet.has(`${bi},${bj},${bk}`)) missingBrickCoverage++;
  }
  assert.equal(missingBrickCoverage, 0, 'every changed voxel must fall inside some dirty brick (a miss would mean the GPU shows stale clay)');

  report.test3_advectionLocality = {
    changedVoxels,
    dirtyBrickCount: dirty.length,
    brickCount: f.brickCount,
    dirtyFractionPct: dirtyFraction * 100,
    localityViolations,
    missingBrickCoverage,
  };
}

// ===========================================================================
// 4. volume drift over a 50-op session
// ===========================================================================
section('4. volume drift over a 50-op session');
{
  const f = createClayField({ seed: 555 });
  f.stampBall({ x: -0.15, y: 0, z: 0 }, 0.22, '#3fbf6f');
  f.stampBall({ x: 0.15, y: 0.05, z: 0 }, 0.20, '#ff7314');
  f.stampBall({ x: 0.0, y: -0.15, z: 0.05 }, 0.18, '#3f7fbf');
  const baselineVolume = f.volume();

  const rnd = makeLcg(777);
  const volumes = [];
  const pullMsList = [];
  for (let i = 0; i < 50; i++) {
    const px = (rnd() - 0.5) * 0.5;
    const py = (rnd() - 0.5) * 0.4 - 0.05;
    const pz = (rnd() - 0.5) * 0.3;
    const dx = (rnd() - 0.5) * 0.12;
    const dy = (rnd() - 0.5) * 0.12;
    const dz = (rnd() - 0.5) * 0.12;
    const brush = 0.12 + rnd() * 0.12;
    const ms = f.pull({ x: px, y: py, z: pz }, { x: dx, y: dy, z: dz }, brush);
    pullMsList.push(ms);
    volumes.push(f.volume());
  }

  const finalVolume = volumes[volumes.length - 1];
  const driftPct = Math.abs(finalVolume - baselineVolume) / baselineVolume * 100;
  assert.ok(driftPct < 2, `final volume drift over 50 ops should stay under 2% (got ${driftPct.toFixed(3)}%)`);

  let maxIntermediateDriftPct = 0;
  for (const v of volumes) {
    const d = Math.abs(v - baselineVolume) / baselineVolume * 100;
    if (d > maxIntermediateDriftPct) maxIntermediateDriftPct = d;
  }

  const sorted = pullMsList.slice().sort((a, b) => a - b);
  const medianPullMs = sorted[Math.floor(sorted.length * 0.5)];
  const p95PullMs = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const maxPullMs = sorted[sorted.length - 1];
  assert.ok(p95PullMs < 8, `p95 pull time should stay under the 8ms interaction budget (got ${p95PullMs.toFixed(3)}ms)`);

  report.test4_volumeDrift50Ops = {
    baselineVolume,
    finalVolume,
    driftPct,
    maxIntermediateDriftPct,
    medianPullMs,
    p95PullMs,
    maxPullMs,
    interactionBudgetMs: 8,
  };
}

// ===========================================================================
// 5. colour smear irreversibility ("no green ball recovery")
// ===========================================================================
section('5. colour smear irreversibility ("no green ball recovery")');
{
  const GREEN = '#3fbf6f';
  const ORANGE = '#ff7314';
  const f = createClayField({ seed: 314 });
  f.stampBall({ x: -0.12, y: 0, z: 0 }, 0.22, GREEN);
  f.stampBall({ x: 0.12, y: 0, z: 0 }, 0.22, ORANGE);

  const censusBefore = f.colorCensus([GREEN, ORANGE]);
  assert.ok(censusBefore.mixedFraction < 0.10, `unworked seam should be crisp (mixedFraction ${censusBefore.mixedFraction.toFixed(4)})`);

  // A straight back-and-forth drag mostly just TRANSLATES the seam rather than
  // stretching it, which barely raises mixedFraction. Real marbling needs the
  // interface stretched and folded, so instead this stirs: `from` orbits the
  // seam centre and `dir` is roughly tangential (a spoon stirring two colours
  // of icing together), which winds the boundary into a lengthening spiral.
  const pulls = [];
  const brush = 0.28;
  const N = 30; // "~20"
  const angleStep = (2 * Math.PI * 4) / N; // ~4 revolutions of stirring
  for (let i = 0; i < N; i++) {
    const angle = i * angleStep;
    // Radius breathes in and out so the stir works the whole seam volume in
    // both plane and depth, not one ring of it.
    const stirRadius = 0.06 + 0.16 * (0.5 + 0.5 * Math.sin(i * 0.75));
    const px = stirRadius * Math.cos(angle);
    const py = stirRadius * Math.sin(angle) * 0.5;
    const pz = stirRadius * Math.sin(angle * 1.7 + 1.1) * 0.6;
    // Tangential direction: rotate the radial vector 90 degrees in-plane.
    const tx = -Math.sin(angle);
    const ty = Math.cos(angle) * 0.5;
    const dx = tx * brush * 0.34;
    const dy = ty * brush * 0.34;
    const dz = Math.cos(angle * 1.7 + 1.1) * brush * 0.15;
    pulls.push({ from: { x: px, y: py, z: pz }, dir: { x: dx, y: dy, z: dz }, brush });
  }
  for (const p of pulls) f.pull(p.from, p.dir, p.brush);

  const censusAfter = f.colorCensus([GREEN, ORANGE]);
  assert.ok(
    censusAfter.mixedFraction > censusBefore.mixedFraction * 3,
    `mixedFraction should rise more than 3x after working the seam (before ${censusBefore.mixedFraction.toFixed(4)}, after ${censusAfter.mixedFraction.toFixed(4)})`,
  );
  assert.ok(censusAfter.mixedFraction > 0.15, `mixedFraction should exceed 0.15 after working the seam (got ${censusAfter.mixedFraction.toFixed(4)})`);

  // The exact inverse: same positions, negated directions, reverse order.
  const inversePulls = pulls
    .slice()
    .reverse()
    .map((p) => ({ from: p.from, dir: { x: -p.dir.x, y: -p.dir.y, z: -p.dir.z }, brush: p.brush }));
  for (const p of inversePulls) f.pull(p.from, p.dir, p.brush);

  const censusRestored = f.colorCensus([GREEN, ORANGE]);
  assert.ok(
    censusRestored.mixedFraction > censusBefore.mixedFraction * 2,
    `inverse pulls should NOT recover the crisp seam (before ${censusBefore.mixedFraction.toFixed(4)}, after-inverse ${censusRestored.mixedFraction.toFixed(4)})`,
  );

  // Structural claim: there is no accessor that could return "the green ball".
  const keys = Object.keys(f);
  const suspectPattern = /lobe|primitive|ball|piece|part/i;
  const suspectKeys = keys.filter((k) => suspectPattern.test(k) && k !== 'stampBall');
  assert.equal(suspectKeys.length, 0, `no accessor API should expose ball/lobe/piece identity (found: ${suspectKeys.join(', ')})`);

  report.test5_colorSmearIrreversibility = {
    mixedFractionBefore: censusBefore.mixedFraction,
    mixedFractionAfterSmear: censusAfter.mixedFraction,
    mixedFractionAfterInverse: censusRestored.mixedFraction,
    apiKeys: keys,
    suspectKeysFound: suspectKeys,
  };
}

// ===========================================================================
// 6. settle: elongated loaf lies down
// ===========================================================================
section('6. settle: elongated loaf lies down');
{
  const f = createClayField({ seed: 88 });
  const angle = 40 * Math.PI / 180;
  const dirx = Math.cos(angle);
  const diry = Math.sin(angle);
  const spacing = 0.17;
  const ballCount = 5;
  for (let i = 0; i < ballCount; i++) {
    const t = i - (ballCount - 1) / 2; // -2..2
    const cx = t * spacing * dirx;
    const cy = t * spacing * diry;
    f.stampBall({ x: cx, y: cy, z: 0 }, 0.20, '#c9a86a');
  }

  const volBeforeSettle = f.volume();
  const paBefore = f.principalAxes();
  const shortAxisBefore = paBefore.axes[2];
  const longAxisBefore = paBefore.axes[0];
  assert.ok(Math.abs(shortAxisBefore[1]) < 0.8, `before settling, the shortest axis should be far from vertical (y=${shortAxisBefore[1].toFixed(4)})`);

  const t0 = performance.now();
  let iterations = 0;
  let lastResult = null;
  for (let i = 0; i < 12; i++) {
    lastResult = f.settleRest({ rate: 1 });
    iterations++;
    if (lastResult.done) break;
  }
  const settleMs = performance.now() - t0;

  const paAfter = f.principalAxes();
  const shortAxisAfter = paAfter.axes[2];
  const longAxisAfter = paAfter.axes[0];
  assert.ok(Math.abs(shortAxisAfter[1]) > 0.98, `after settling, the shortest axis should lie almost flat/vertical (y=${shortAxisAfter[1].toFixed(4)})`);
  assert.ok(Math.abs(longAxisAfter[1]) < 0.15, `after settling, the longest axis should be nearly horizontal (y=${longAxisAfter[1].toFixed(4)})`);

  const b = f.bounds();
  const groundY = f.ground();
  const minYDiff = Math.abs(b.minY - groundY);
  assert.ok(minYDiff < 1.5 * f.h, `resting body's minY should be within 1.5 voxels of the ground (minY=${b.minY.toFixed(5)}, ground=${groundY}, diff=${minYDiff.toFixed(5)}, voxel=${f.h.toFixed(5)})`);

  const volAfterSettle = f.volume();
  const settleDriftPct = Math.abs(volAfterSettle - volBeforeSettle) / volBeforeSettle * 100;
  assert.ok(settleDriftPct < 2, `volume drift across the whole settle should stay under 2% (got ${settleDriftPct.toFixed(3)}%)`);

  report.test6_settleLoafLiesDown = {
    shortAxisBefore,
    longAxisBefore,
    shortAxisAfter,
    longAxisAfter,
    iterations,
    settleMs,
    volBeforeSettle,
    volAfterSettle,
    settleDriftPct,
    doneAtLastIteration: lastResult.done,
  };
}

// ===========================================================================
// 7. resample blur is O(1) per settle sequence
// ===========================================================================
section('7. resample blur is O(1) per settle sequence');
{
  function buildLoaf(seed) {
    const f = createClayField({ seed });
    const angle = 35 * Math.PI / 180;
    const dirx = Math.cos(angle);
    const diry = Math.sin(angle);
    const spacing = 0.17;
    const ballCount = 5;
    for (let i = 0; i < ballCount; i++) {
      const t = i - (ballCount - 1) / 2;
      const cx = t * spacing * dirx;
      const cy = t * spacing * diry;
      f.stampBall({ x: cx, y: cy, z: 0 }, 0.20, '#c9a86a');
    }
    return f;
  }

  // Case A: ONE settle sequence, all steps resampling from the same pristine
  // base (the claimed O(1)-blur path).
  const fAccumulated = buildLoaf(4001);
  const sharpnessBeforeAnySettle = surfaceSharpness(fAccumulated);
  for (let i = 0; i < 8; i++) fAccumulated.settleRest({ rate: 0.2 });
  const sharpnessAccumulatedBase = surfaceSharpness(fAccumulated);

  // Case B (contrast): force a fresh base before every settle step by calling
  // simplify(0) between them. Per field-core, simplify() always invalidates
  // the settle base (see invalidateBase() in `simplify`), and strength 0 makes
  // relaxRegion() a no-op (`if (s <= 0 ...) return;`), so this is a "zero
  // effect" way to invalidate without any smoothing of its own — each settle
  // step is now forced to resample from an already-resampled field, which is
  // exactly the O(frames)-blur path.
  const fInvalidated = buildLoaf(4001);
  for (let i = 0; i < 8; i++) {
    fInvalidated.settleRest({ rate: 0.2 });
    fInvalidated.simplify(0);
  }
  const sharpnessInvalidatedBase = surfaceSharpness(fInvalidated);

  assert.ok(
    sharpnessAccumulatedBase > sharpnessInvalidatedBase,
    `an accumulated-base settle sequence should retain more surface sharpness than a per-step-invalidated one (accumulated=${sharpnessAccumulatedBase.toFixed(4)}, invalidated=${sharpnessInvalidatedBase.toFixed(4)})`,
  );

  report.test7_resampleBlurO1 = {
    sharpnessBeforeAnySettle,
    sharpnessAfterAccumulatedBaseSequence: sharpnessAccumulatedBase,
    sharpnessAfterPerStepInvalidatedBase: sharpnessInvalidatedBase,
    resampleGenerationsAccumulated: fAccumulated.stats().resampleGenerations,
    resampleGenerationsInvalidated: fInvalidated.stats().resampleGenerations,
  };
}

// ===========================================================================
// 8. snapshot/restore round-trip + grid-snapshot size
// ===========================================================================
section('8. snapshot/restore round-trip + grid-snapshot size');
{
  const f = createClayField({ seed: 606 });
  f.stampBall({ x: -0.15, y: 0, z: 0 }, 0.22, '#3fbf6f');
  f.stampBall({ x: 0.15, y: 0.05, z: 0 }, 0.20, '#ff7314');
  f.pull({ x: 0, y: 0, z: 0 }, { x: 0.05, y: 0.02, z: 0 }, 0.2);
  f.simplify(0.15);

  const snap = f.snapshot();
  const distAtSnap = f.dist.slice();
  const colorAtSnap = f.color.slice();

  // Mutate further, then restore.
  f.pull({ x: 0.05, y: -0.05, z: 0.05 }, { x: -0.04, y: 0.03, z: -0.02 }, 0.18);
  f.stampBall({ x: 0, y: 0.2, z: -0.1 }, 0.15, '#f2c744');

  const restored = f.restore(snap);
  assert.ok(restored, 'restore() should report success');

  let distDiffAfterRestore = 0;
  for (let i = 0; i < f.dist.length; i++) if (f.dist[i] !== distAtSnap[i]) distDiffAfterRestore++;
  let colorDiffAfterRestore = 0;
  for (let i = 0; i < f.color.length; i++) if (f.color[i] !== colorAtSnap[i]) colorDiffAfterRestore++;
  assert.equal(distDiffAfterRestore, 0, 'restored dist array should be bit-identical to the snapshot');
  assert.equal(colorDiffAfterRestore, 0, 'restored color array should be bit-identical to the snapshot');

  const saveOpsBytes = JSON.stringify(f.ops()).length;
  const packed = f.packAll();
  const saveGridBytes = packed.length;
  const saveGridGzipBytes = gzipSync(Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength)).length;

  report.test8_snapshotRestoreRoundTrip = {
    distDiffAfterRestore,
    colorDiffAfterRestore,
    saveOpsBytes,
    saveGridBytes,
    saveGridGzipBytes,
  };
}

// ---------------------------------------------------------------------------
console.log('\n=== summary ===');
console.log(JSON.stringify(report, null, 2));
