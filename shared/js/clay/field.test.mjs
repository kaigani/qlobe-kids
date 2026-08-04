import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';

const source = await readFile(new URL('./field.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {
  createClayField, parseColor, FIELD_RES, stampPhase, createFieldFromDocument,
  PULL_CORE, PULL_STEP_CAP, DOC_VERSION, FACE_MARGIN_VOXELS, COMPRESS_MAX,
} = await import(moduleUrl);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const degrees = (radians) => (radians * 180) / Math.PI;

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
  // A GENUINELY OVERHUNG LOAF STILL GOES OVER. What changed under the balance
  // rewrite is where it STOPS. The old solver rotated the silhouette's long
  // axis onto the horizon, so it always finished axis-exact (|short.y| > 0.98)
  // whether or not that was a resting pose. The new one rolls while the centre
  // of mass is outside the footprint and stops the instant it is inside, which
  // is the actual condition for lying still — and a lumpy loaf reaches that a
  // few degrees short of dead level, exactly as a real one does on a table.
  //
  // Traced, this fixture: it starts floating (no support at all, so no
  // rotation — you cannot topple in mid-air), drops 10.9 voxels onto the table,
  // then rolls 14.8 degrees, 12.1 degrees, and comes to rest with an overhang
  // ratio of 0.71. Short axis 0.583 -> 0.977, long axis 0.646 -> 0.213,
  // width/height 2.10. It lay down.
  assert.ok(Math.abs(shortAxisAfter[1]) > 0.95, `after settling, the shortest axis should stand near vertical (y=${shortAxisAfter[1].toFixed(4)})`);
  assert.ok(Math.abs(longAxisAfter[1]) < 0.30, `after settling, the longest axis should lie near the horizon (y=${longAxisAfter[1].toFixed(4)})`);
  assert.ok(Math.abs(shortAxisAfter[1]) > Math.abs(shortAxisBefore[1]) + 0.3,
    `the loaf should have visibly toppled, not merely twitched (${shortAxisBefore[1].toFixed(3)} -> ${shortAxisAfter[1].toFixed(3)})`);
  // The assertion the old one was standing in for, now stated directly: it is
  // at rest because it is BALANCED, not because a threshold ran out.
  const restPlan = f.settlePlan();
  assert.ok(restPlan.balance && !restPlan.balance.toppling,
    `a settled loaf must be balanced over its own foot (overhang=${restPlan.balance?.overhang.toFixed(3)})`);

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

// ===========================================================================
// 9. gesture revert is bit-exact
// ===========================================================================
section('9. gesture revert is bit-exact');
{
  const f = createClayField({ seed: 909 });
  f.stampBall({ x: -0.15, y: 0, z: 0 }, 0.22, '#3fbf6f');
  f.stampBall({ x: 0.15, y: 0.05, z: 0 }, 0.20, '#ff7314');
  f.pull({ x: 0, y: 0, z: 0 }, { x: 0.05, y: 0.02, z: 0 }, 0.2);

  const distSnap = f.dist.slice();
  const colorSnap = f.color.slice();
  const opsLenSnap = f.ops().length;
  const stampsSnap = f.stats().stamps;

  // Real work inside the gesture: several pulls at different places AND a
  // stamp, so the revert has to undo both op kinds and both the grid and the
  // stamp counter.
  f.clearDirty();
  f.beginGesture();
  f.pull({ x: -0.1, y: 0, z: 0.05 }, { x: 0.04, y: -0.02, z: 0.01 }, 0.18);
  f.pull({ x: 0.1, y: -0.05, z: -0.05 }, { x: -0.03, y: 0.02, z: 0.02 }, 0.16);
  f.stampBall({ x: 0, y: 0.2, z: -0.1 }, 0.14, '#f2c744');
  f.pull({ x: 0, y: 0.15, z: -0.05 }, { x: 0.02, y: -0.03, z: 0.01 }, 0.15);

  const reverted = f.revertGesture();
  assert.ok(reverted, 'revertGesture() should report success when a gesture is open');

  let distDiffAfterRevert = 0;
  for (let i = 0; i < f.dist.length; i++) if (f.dist[i] !== distSnap[i]) distDiffAfterRevert++;
  let colorDiffAfterRevert = 0;
  for (let i = 0; i < f.color.length; i++) if (f.color[i] !== colorSnap[i]) colorDiffAfterRevert++;
  assert.equal(distDiffAfterRevert, 0, 'reverted dist array must be bit-identical to the pre-gesture snapshot (a pointercancel must give the creature back EXACTLY, not approximately)');
  assert.equal(colorDiffAfterRevert, 0, 'reverted color array must be bit-identical to the pre-gesture snapshot');

  const opsLenAfterRevert = f.ops().length;
  assert.equal(opsLenAfterRevert, opsLenSnap, 'reverted op log must be back to its pre-gesture length');

  // The subtle one. stats.stamps is the index the per-stamp noise phase comes
  // from (see stampPhase / nextStampPhase in field.js). A reverted stamp that
  // left the counter advanced would silently hand the NEXT ball placed a
  // different set of lumps than it would have gotten had the cancelled
  // gesture never happened — and since an op-log save IS a replay, that one
  // skipped index would make a save/reload replay into a different-looking
  // creature than the one the child actually had on screen.
  const stampsAfterRevert = f.stats().stamps;
  assert.equal(stampsAfterRevert, stampsSnap, "reverted stats().stamps must be back to its pre-gesture value, since it seeds the next stamp's noise phase");

  const dirtyAfterRevert = f.dirtyCount();
  assert.ok(dirtyAfterRevert > 0, 'a revert must mark every touched brick dirty, or the renderer keeps showing stale (in-gesture) clay on screen');

  // commitGesture() on a fresh gesture KEEPS the work.
  const distBeforeCommit = f.dist.slice();
  f.beginGesture();
  f.pull({ x: 0.05, y: -0.1, z: 0.05 }, { x: -0.02, y: 0.03, z: -0.01 }, 0.17);
  const committed = f.commitGesture();
  assert.ok(committed, 'commitGesture() should report success when a gesture is open');
  let distDiffAfterCommit = 0;
  for (let i = 0; i < f.dist.length; i++) if (f.dist[i] !== distBeforeCommit[i]) distDiffAfterCommit++;
  assert.ok(distDiffAfterCommit > 0, 'a committed gesture must KEEP its work (the field should differ from its pre-gesture state)');

  // revertGesture() with nothing open is a no-op that reports failure.
  const distBeforeNoopRevert = f.dist.slice();
  const noopReverted = f.revertGesture();
  assert.equal(noopReverted, false, 'revertGesture() with no open gesture must return false');
  let distDiffNoopRevert = 0;
  for (let i = 0; i < f.dist.length; i++) if (f.dist[i] !== distBeforeNoopRevert[i]) distDiffNoopRevert++;
  assert.equal(distDiffNoopRevert, 0, 'revertGesture() with no open gesture must not change the field');

  report.test9_gestureRevert = {
    distDiffAfterRevert,
    colorDiffAfterRevert,
    opsLenSnap,
    opsLenAfterRevert,
    stampsSnap,
    stampsAfterRevert,
    dirtyCountAfterRevert: dirtyAfterRevert,
    distDiffAfterCommit,
    noopRevertReturnedFalse: noopReverted === false,
    distDiffNoopRevert,
  };
}

// ===========================================================================
// 10. replay determinism under arbitrary (non-6-decimal) inputs
// ===========================================================================
section('10. replay determinism under arbitrary (non-6-decimal) inputs');
{
  // The lab's own replay test (see section 2) only passes because every
  // number it feeds a stamp or a pull happens to be a 6-decimal value already
  // (0.05, 0.02, -0.1, ...). A real pointer drag does not produce 6-decimal
  // floats — it produces whatever the input device and the frame's delta-time
  // happen to multiply out to. `q6` (quantise-THEN-execute) exists so replay
  // is exact anyway. Since an op-log save IS a replay, this is the test that
  // stands in for "does a saved creature come back looking like itself" for
  // realistic, not friendly, inputs.
  const seed = 20260803;
  const rnd = makeLcg(seed);
  const ugly = () => (rnd() - 0.5) * 0.4123456789; // deliberately not 6 decimals

  const f = createClayField({ seed });
  const colors = ['#3fbf6f', '#ff7314', '#3f7fbf', '#f2c744'];
  for (let i = 0; i < 4; i++) {
    const cx = ugly(); const cy = ugly() * 0.5; const cz = ugly();
    const r = 0.15 + Math.abs(ugly()) * 0.3;
    f.stampBall({ x: cx, y: cy, z: cz }, r, colors[i % colors.length]);
  }
  for (let i = 0; i < 13; i++) {
    const fx = ugly(); const fy = ugly() * 0.5; const fz = ugly();
    const dx = ugly() * 0.2; const dy = ugly() * 0.2; const dz = ugly() * 0.2;
    const brush = 0.15 + Math.abs(ugly()) * 0.2;
    f.pull({ x: fx, y: fy, z: fz }, { x: dx, y: dy, z: dz }, brush);
  }
  f.simplify(0.1 + Math.abs(ugly()) * 0.1);
  f.settleRest({ rate: 0.3 + Math.abs(ugly()) * 0.3 });
  for (let i = 0; i < 2; i++) {
    const fx = ugly(); const fy = ugly() * 0.5; const fz = ugly();
    const dx = ugly() * 0.15; const dy = ugly() * 0.15; const dz = ugly() * 0.15;
    const brush = 0.15 + Math.abs(ugly()) * 0.15;
    f.pull({ x: fx, y: fy, z: fz }, { x: dx, y: dy, z: dz }, brush);
  }

  const opsList = f.ops();
  assert.ok(opsList.length >= 20, `expected at least 20 ops in the ugly-input creature, got ${opsList.length}`);

  const g = createClayField({ seed });
  g.replay(opsList);

  let distDiffUglyReplay = 0;
  for (let i = 0; i < f.dist.length; i++) if (f.dist[i] !== g.dist[i]) distDiffUglyReplay++;
  let colorDiffUglyReplay = 0;
  for (let i = 0; i < f.color.length; i++) if (f.color[i] !== g.color[i]) colorDiffUglyReplay++;
  // THIS is the assertion that would fail without quantise-then-execute: the
  // lab prototype rounded parameters on the way into the log but executed
  // with the raw value, which is bit-exact only when the caller happens to
  // pass 6-decimal values. `ugly()` deliberately never does (its multiplier
  // has ten decimal digits), so a diff here would mean q6 regressed.
  assert.equal(distDiffUglyReplay, 0, 'replaying an op log built from arbitrary (non-6-decimal) inputs must give a bit-identical dist array');
  assert.equal(colorDiffUglyReplay, 0, 'replaying an op log built from arbitrary (non-6-decimal) inputs must give a bit-identical color array');

  const partial = createClayField({ seed });
  const limit = Math.min(7, opsList.length);
  const replayedCount = partial.replay(opsList, { limit });
  assert.equal(replayedCount, limit, `replay(ops, { limit }) should stop after exactly ${limit} ops`);

  report.test10_replayDeterminismUglyInputs = {
    opsCount: opsList.length,
    distDiffUglyReplay,
    colorDiffUglyReplay,
    partialReplayLimit: limit,
    partialReplayReturned: replayedCount,
  };
}

// ===========================================================================
// 11. op tags and the ball count
// ===========================================================================
section('11. op tags and the ball count');
{
  const f = createClayField({ seed: 1111 });
  f.stampBall({ x: -0.2, y: 0, z: 0 }, 0.18, '#3fbf6f', { tag: 'ball' });
  f.stampBall({ x: 0.2, y: 0, z: 0 }, 0.18, '#ff7314', { tag: 'ball' });
  f.stampBall({ x: 0, y: 0.2, z: 0 }, 0.16, '#3f7fbf', { tag: 'ball' });
  f.stampBall({ x: 0, y: -0.2, z: 0.1 }, 0.15, '#f2c744'); // untagged
  f.stampBall({ x: 0.1, y: 0.1, z: -0.15 }, 0.14, '#c9a86a'); // untagged
  f.pull({ x: -0.1, y: 0, z: 0 }, { x: 0.03, y: 0.01, z: 0 }, 0.2);
  f.pull({ x: 0.1, y: 0, z: 0 }, { x: -0.02, y: 0.02, z: 0 }, 0.18);
  f.pull({ x: 0, y: 0.1, z: 0 }, { x: 0.01, y: -0.02, z: 0.01 }, 0.16);

  const ballCount = f.countStamps('ball');
  const allStampCount = f.countStamps();
  const totalOps = f.opCount();
  assert.equal(ballCount, 3, `countStamps('ball') should count only the tagged stamps (got ${ballCount})`);
  assert.equal(allStampCount, 5, `countStamps() with no tag should count every stamp regardless of tag (got ${allStampCount})`);
  assert.equal(totalOps, 8, `opCount() should be the full op-log length, stamps and pulls together (got ${totalOps})`);

  const g = createClayField({ seed: 1111 });
  g.replay(f.ops());
  const ballCountAfterReplay = g.countStamps('ball');
  // A replay that dropped the `k` tag would let a reloaded creature forget how
  // many balls earned the Decorate gate: the shelf card would look identical
  // but the game would think the child stamped zero balls.
  assert.equal(ballCountAfterReplay, 3, `the 'ball' tag must survive a replay (got ${ballCountAfterReplay})`);

  report.test11_opTagsAndBallCount = {
    ballCount,
    allStampCount,
    totalOps,
    ballCountAfterReplay,
  };
}

// ===========================================================================
// 12. the save document round-trips
// ===========================================================================
section('12. the save document round-trips');
{
  const f = createClayField({ seed: 1212, ground: -0.5 });
  f.stampBall({ x: -0.18, y: 0, z: 0 }, 0.2, '#3fbf6f', { tag: 'ball' });
  f.stampBall({ x: 0.15, y: 0.06, z: -0.05 }, 0.18, '#ff7314', { tag: 'ball' });
  f.stampBall({ x: 0.0, y: -0.12, z: 0.08 }, 0.16, '#3f7fbf', { tag: 'ball' });
  f.pull({ x: -0.08, y: 0, z: 0 }, { x: 0.04, y: 0.02, z: 0 }, 0.18);
  f.pull({ x: 0.08, y: 0.04, z: -0.02 }, { x: -0.03, y: 0.03, z: 0.01 }, 0.16);
  f.pull({ x: 0.0, y: -0.08, z: 0.04 }, { x: 0.02, y: -0.02, z: 0.02 }, 0.18);
  f.stampBall({ x: 0.18, y: 0.18, z: 0.08 }, 0.14, '#f2c744', { tag: 'ball' });
  f.pull({ x: 0.14, y: 0.14, z: 0.06 }, { x: -0.02, y: 0.02, z: -0.01 }, 0.15);
  f.pull({ x: -0.14, y: 0.04, z: -0.04 }, { x: 0.03, y: -0.02, z: 0.02 }, 0.16);
  f.simplify(0.18);
  f.pull({ x: 0.04, y: 0.08, z: 0.0 }, { x: -0.01, y: 0.02, z: 0.01 }, 0.14);
  f.pull({ x: -0.04, y: -0.08, z: 0.04 }, { x: 0.02, y: 0.01, z: -0.02 }, 0.16);
  assert.equal(f.opCount(), 12, `expected a 12-op creature for the save-size measurement, got ${f.opCount()}`);

  const doc = f.toDocument({ balls: 4 });
  assert.equal(doc.format, 'qlobe-clay-field', 'toDocument() envelope format must be the documented DOC_FORMAT');
  assert.equal(doc.version, DOC_VERSION, 'toDocument() envelope version must be the documented DOC_VERSION');
  assert.equal(DOC_VERSION, 6, 'DOC_VERSION is 6: balance, compression and the domain guard all change how an op replays');
  assert.equal(doc.legacyOps, undefined, 'a creature built from scratch today carries no legacy prefix');
  assert.equal(doc.seed, 1212, "toDocument() must carry the field's own seed");
  assert.equal(doc.ground, -0.5, 'toDocument() must carry the ground level when one is set');
  assert.equal(doc.balls, 4, 'extra fields passed to toDocument() must ride the envelope');

  const docBytes = JSON.stringify(doc).length;
  assert.ok(docBytes < 2000, `a 12-op save document should be well under 2000 bytes (the recommendation's figure is ~200; got ${docBytes})`);

  const restored = createFieldFromDocument(doc);
  assert.ok(restored, 'createFieldFromDocument() should succeed on a well-formed document');
  let distDiffDoc = 0;
  for (let i = 0; i < f.dist.length; i++) if (f.dist[i] !== restored.dist[i]) distDiffDoc++;
  let colorDiffDoc = 0;
  for (let i = 0; i < f.color.length; i++) if (f.color[i] !== restored.color[i]) colorDiffDoc++;
  assert.equal(distDiffDoc, 0, 'createFieldFromDocument() must reproduce a bit-identical dist array');
  assert.equal(colorDiffDoc, 0, 'createFieldFromDocument() must reproduce a bit-identical color array');

  // A corrupt localStorage entry must lose one shelf card, never crash the shelf.
  assert.equal(createFieldFromDocument(null), null, 'createFieldFromDocument(null) must return null, not throw');
  assert.equal(createFieldFromDocument({}), null, 'createFieldFromDocument({}) must return null, not throw');
  assert.equal(createFieldFromDocument({ ...doc, format: 'qlobe-clay-lobes' }), null, 'createFieldFromDocument() must reject a document from the other (lobes) format');
  assert.equal(createFieldFromDocument({ ...doc, ops: 'not-an-array' }), null, 'createFieldFromDocument() must reject a document whose ops is not an array');

  // The seed is baked into every stamp's noise phase at construction, so a
  // document whose seed differs from an EXISTING field's cannot be loaded into
  // that field — only createFieldFromDocument (which builds a fresh field with
  // the document's own seed) can honour it.
  const wrongSeedField = createClayField({ seed: 1212 + 1 });
  const wrongSeedDistBefore = wrongSeedField.dist.slice();
  const fromDocResult = wrongSeedField.fromDocument(doc);
  assert.equal(fromDocResult, false, "fromDocument() must refuse a document whose seed differs from this field's seed");
  let wrongSeedDiff = 0;
  for (let i = 0; i < wrongSeedField.dist.length; i++) if (wrongSeedField.dist[i] !== wrongSeedDistBefore[i]) wrongSeedDiff++;
  assert.equal(wrongSeedDiff, 0, 'a refused fromDocument() call must leave the field unchanged');

  report.test12_saveDocumentRoundTrip = {
    format: doc.format,
    version: doc.version,
    seed: doc.seed,
    ground: doc.ground,
    balls: doc.balls,
    opCount: f.opCount(),
    docBytes,
    distDiffDoc,
    colorDiffDoc,
    corruptDocsAllReturnedNull: true,
    wrongSeedFromDocumentReturnedFalse: fromDocResult === false,
    wrongSeedDiff,
  };
}

// ===========================================================================
// 13. setGround
// ===========================================================================
section('13. setGround');
{
  const f = createClayField({ seed: 1313, ground: null });
  assert.equal(f.ground(), null, 'a field constructed with ground: null should report ground() === null');

  // Stamp low in the domain so a ground plane can cut into it.
  f.stampBall({ x: 0, y: -0.3, z: 0 }, 0.22, '#c9a86a');
  const volBeforeAnyGround = f.volume();

  // A RISING plane (from null to a level that cuts into the material) eats
  // the clay it now passes through — the physically honest answer, and the
  // only one that keeps the flat contact patch correct.
  f.clearDirty();
  const cutLevel = -0.25; // inside the ball's y-span of roughly [-0.52, -0.08]
  const changed1 = f.setGround(cutLevel);
  assert.equal(changed1, true, 'setGround() should return true when the level actually changes');
  const volAfterCut = f.volume();
  assert.ok(volAfterCut < volBeforeAnyGround, `a ground plane rising into the material should REDUCE volume (before ${volBeforeAnyGround.toFixed(6)}, after ${volAfterCut.toFixed(6)})`);
  const dirtyAfterCut = f.dirtyCount();
  assert.ok(dirtyAfterCut > 0, 'setGround() cutting into material must mark bricks dirty for the renderer');

  // A FALLING plane must not teleport the body — it leaves it floating, and
  // the next settle drops it.
  const lowerLevel = cutLevel - 0.2;
  const changed2 = f.setGround(lowerLevel);
  assert.equal(changed2, true, "setGround() to a lower level should still report a change (ground() moved)");
  const volAfterLower = f.volume();
  assert.ok(Math.abs(volAfterLower - volAfterCut) < 1e-9, `a falling ground plane must NOT change volume (before ${volAfterCut.toFixed(6)}, after ${volAfterLower.toFixed(6)})`);

  // Same value again: no-op.
  const changed3 = f.setGround(lowerLevel);
  assert.equal(changed3, false, 'setGround() with the same value must return false');

  // Non-finite: refused, ground() unchanged.
  const changed4 = f.setGround(NaN);
  assert.equal(changed4, false, 'setGround(NaN) must return false');
  assert.equal(f.ground(), lowerLevel, 'a refused setGround() call must not change ground()');

  // A settle after the lowered ground brings the body back down to the table.
  let settleResult = null;
  for (let i = 0; i < 12; i++) {
    settleResult = f.settleRest({ rate: 1 });
    if (settleResult.done) break;
  }
  const b = f.bounds();
  const groundAfterSettle = f.ground();
  const minYDiff = Math.abs(b.minY - groundAfterSettle);
  assert.ok(minYDiff < 2 * f.h, `after settling onto the lowered ground, minY should be within ~2 voxels of ground (minY=${b.minY.toFixed(5)}, ground=${groundAfterSettle}, diff=${minYDiff.toFixed(5)}, voxel=${f.h.toFixed(5)})`);

  report.test13_setGround = {
    volBeforeAnyGround,
    volAfterCut,
    dirtyAfterCut,
    volAfterLower,
    volDropPct: (volBeforeAnyGround - volAfterCut) / volBeforeAnyGround * 100,
    setGroundSameValueReturnedFalse: changed3 === false,
    setGroundNonFiniteReturnedFalse: changed4 === false,
    groundAfterNonFiniteAttempt: f.ground(),
    minYDiffAfterSettle: minYDiff,
    voxel: f.h,
  };
}

// ===========================================================================
// 14. stampPhase is a pure function of seed and index
// ===========================================================================
section('14. stampPhase is a pure function of seed and index');
{
  const seedA = 1414;
  const seedB = 1415;
  const TAU_ = 2 * Math.PI;
  const inRange01 = (phases) => phases.every((p) => Number.isFinite(p) && p >= 0 && p < TAU_);

  const p0 = stampPhase(seedA, 0);
  const p1 = stampPhase(seedA, 1);
  const p3 = stampPhase(seedA, 3);
  assert.equal(p0.length, 3, 'stampPhase() should return three numbers');
  assert.ok(inRange01(p0) && inRange01(p1) && inRange01(p3), 'every stampPhase() component should be a finite number in [0, 2*PI)');

  const p0Again = stampPhase(seedA, 0);
  assert.deepEqual(p0Again, p0, 'stampPhase(seed, index) must be pure: same inputs give identical output');
  assert.notDeepEqual(p1, p0, 'a different index must give a different phase');
  const p0OtherSeed = stampPhase(seedB, 0);
  assert.notDeepEqual(p0OtherSeed, p0, 'a different seed must give a different phase');

  // The contract that matters: nextStampPhase() equals stampPhase(seed, n)
  // where n is how many stamps the field has done. This is what lets the
  // renderer draw a falling tray ball wearing the EXACT lumps it will inherit
  // the moment it welds, so it does not change shape at the instant it joins
  // the creature.
  const f = createClayField({ seed: seedA });
  const beforeAny = f.nextStampPhase();
  assert.deepEqual(beforeAny, stampPhase(seedA, 0), 'before any stamp, nextStampPhase() should equal stampPhase(seed, 0)');

  f.stampBall({ x: 0, y: 0, z: 0 }, 0.2, '#3fbf6f');
  const afterOne = f.nextStampPhase();
  assert.deepEqual(afterOne, stampPhase(seedA, 1), 'after one stamp, nextStampPhase() should equal stampPhase(seed, 1)');

  f.stampBall({ x: 0.2, y: 0, z: 0 }, 0.18, '#ff7314');
  f.stampBall({ x: -0.2, y: 0, z: 0 }, 0.18, '#3f7fbf');
  const afterThree = f.nextStampPhase();
  assert.deepEqual(afterThree, stampPhase(seedA, 3), 'after three stamps, nextStampPhase() should equal stampPhase(seed, 3)');

  report.test14_stampPhasePurity = {
    seedA,
    seedB,
    p0, p1, p3,
    samePhaseRepeats: JSON.stringify(p0Again) === JSON.stringify(p0),
    differentIndexDiffers: JSON.stringify(p1) !== JSON.stringify(p0),
    differentSeedDiffers: JSON.stringify(p0OtherSeed) !== JSON.stringify(p0),
    nextStampPhaseMatchesBeforeAnyStamp: JSON.stringify(beforeAny) === JSON.stringify(stampPhase(seedA, 0)),
    nextStampPhaseMatchesAfterOne: JSON.stringify(afterOne) === JSON.stringify(stampPhase(seedA, 1)),
    nextStampPhaseMatchesAfterThree: JSON.stringify(afterThree) === JSON.stringify(stampPhase(seedA, 3)),
  };
}

// ===========================================================================
// 15. rounded pull fronts
// ===========================================================================
//
// The owner, on the shipped build: "I don't want the sharp tips. I rounded it
// out towards the hand in the prototype and that was the ideal setting."
//
// What is measured here is the SILHOUETTE, because that is the shape a child
// sees: the camera is orthographic down -z, so a feature's apparent thickness
// is the width of its projection onto the x-y plane and not the width of any
// one slice through it. A slice-based measurement was tried first and reported
// a fat, healthy front for a creature that was visibly a needle on screen —
// the pull had grabbed the ball's front pole and drawn the spike toward the
// camera, where a z=0 slice could not see it at all.
section('15. rounded pull fronts');
{
  const H = 2 / FIELD_RES;

  // Is any material along the view ray through (x, y)? Marched at half a voxel:
  // a whole-voxel march steps straight over a front that is only a voxel thick
  // in depth, and then reports the hole it just made as a thin silhouette.
  const inSilhouette = (f, x, y) => {
    for (let z = -0.7; z <= 0.7; z += H / 2) if (f.sampleDistance(x, y, z) < 0) return true;
    return false;
  };

  /**
   * Half-width of the silhouette, in voxels, in a slab `depthVox` voxels behind
   * the point that reaches furthest along (ux, uy). A blunt front holds a
   * couple of voxels here; a drawn-out spike collapses toward zero.
   */
  function frontHalfWidth(f, ux, uy, depthVox) {
    const g = H / 4;
    const px = -uy;
    const py = ux;
    let best = -Infinity;
    let bx = 0;
    let by = 0;
    for (let x = -0.95; x <= 0.95; x += g) {
      for (let y = -0.95; y <= 0.95; y += g) {
        if (!inSilhouette(f, x, y)) continue;
        const t = x * ux + y * uy;
        if (t > best) { best = t; bx = x; by = y; }
      }
    }
    const cx = bx - ux * depthVox * H;
    const cy = by - uy * depthVox * H;
    let plus = 0;
    let minus = 0;
    for (let t = 0; t < 0.9; t += g) { if (inSilhouette(f, cx + px * t, cy + py * t)) plus = t; else break; }
    for (let t = 0; t < 0.9; t += g) { if (inSilhouette(f, cx - px * t, cy - py * t)) minus = t; else break; }
    return { reach: best, halfWidthVox: ((plus + minus) / 2) / H };
  }

  const build = () => {
    const f = createClayField({ seed: 1337, ground: null });
    f.stampBall({ x: -0.18, y: 0, z: 0 }, 0.30, '#ee4a44');
    f.stampBall({ x: 0.16, y: 0.02, z: 0.02 }, 0.26, '#1fbca4');
    return f;
  };

  // The brush the game pulls with. Kept here rather than imported so this test
  // states the condition it is actually asserting.
  const BRUSH = 0.26;
  const CAP = BRUSH * PULL_STEP_CAP;
  // Measured floor across the three scenarios below is 2.6 voxels; the
  // assertion sits well under it so grid alignment cannot make this flake, and
  // far above the 0.13 voxels the pre-palm build produced on the same drag.
  const FLOOR_VOX = 2.0;

  const grabFront = (f, x, y) => {
    const hit = f.raycast({ x, y, z: f.size }, { x: 0, y: 0, z: -1 });
    assert.ok(hit.hit, `the fixture should present clay at (${x}, ${y})`);
    return { x: hit.x, y: hit.y, z: hit.z };
  };

  // --- LONG: one drag across the whole toy, far past any single step cap.
  const fLong = build();
  {
    const p = grabFront(fLong, 0.34, 0.02);
    for (let i = 0; i < 40; i++) { fLong.pull(p, { x: 0.9 / 40, y: 0, z: 0 }, BRUSH); p.x += 0.9 / 40; }
  }
  const long = frontHalfWidth(fLong, 1, 0, 1);

  // --- FAST: pointermoves far larger than the cap, carried by the three
  //     substeps blob-field.js allows a flung finger. The substep arithmetic
  //     here is blob-field.js's pullToward(), clamp and all, because that clamp
  //     is load-bearing: ask for a step longer than the cap and pull() shortens
  //     it, and a caller that then advances its grab by the length it ASKED for
  //     walks the brush off the front of its own material and draws a thread.
  //     Measured with the grab desynchronised that way the front came out at
  //     0.87 voxels; with it kept honest, 3.1.
  const fFlick = build();
  {
    const p = grabFront(fFlick, 0.34, 0.02);
    for (let m = 0; m < 8; m++) {
      const distance = 0.18;
      const steps = Math.min(3, Math.max(1, Math.ceil(distance / CAP)));
      const per = Math.min(distance / steps, CAP);
      for (let i = 0; i < steps; i++) { fFlick.pull(p, { x: per, y: 0, z: 0 }, BRUSH); p.x += per; }
    }
  }
  const flick = frontHalfWidth(fFlick, 1, 0, 1);

  // --- SAME SPOT: thirty gestures that each re-grab the tip the last one made.
  //     This is the one that used to run away: every pull sharpened the front a
  //     little and the next pull took hold of the sharpened thing.
  const fSpot = build();
  {
    for (let i = 0; i < 30; i++) {
      const b = fSpot.bounds();
      const hit = fSpot.raycast({ x: b.maxX - 0.02, y: 0.02, z: fSpot.size }, { x: 0, y: 0, z: -1 });
      if (!hit.hit) break;
      const p = { x: hit.x, y: hit.y, z: hit.z };
      for (let k = 0; k < 3; k++) { fSpot.pull(p, { x: CAP, y: 0, z: 0 }, BRUSH); p.x += CAP; }
    }
  }
  const spot = frontHalfWidth(fSpot, 1, 0, 1);

  for (const [name, m] of [['long drag', long], ['fast flick', flick], ['same spot x30', spot]]) {
    assert.ok(
      m.halfWidthVox >= FLOOR_VOX,
      `after a ${name} the pulled front must stay blunt: half-width one voxel behind the tip was ${m.halfWidthVox.toFixed(2)} voxels, floor is ${FLOOR_VOX}`,
    );
  }

  // The palm must be a plateau, not a peak, or none of the above follows.
  assert.ok(PULL_CORE > 0 && PULL_CORE < 1, `PULL_CORE should be a fraction of the brush (got ${PULL_CORE})`);
  // ...and the step cap has to have come down with it, or the steeper falloff
  // folds the backward map. See the derivation on PULL_STEP_CAP.
  assert.ok(
    PULL_STEP_CAP < 0.667 * (1 - PULL_CORE),
    `PULL_STEP_CAP (${PULL_STEP_CAP}) must stay below the fold bound 0.667*(1-PULL_CORE) = ${(0.667 * (1 - PULL_CORE)).toFixed(4)}`,
  );

  // A blunting pass that blunted the whole creature would be a cure worse than
  // the disease. The palm is a change to the falloff and NOTHING else — there is
  // no smoothing pass anywhere in it — so a pull with the game's larger brush
  // must still write exactly the box it always wrote and leave every voxel
  // outside it bit-identical, detail and all.
  //
  // The box, not a sphere. A pull writes the axis-aligned box brush + 2 voxels
  // around the grab, and the volume renormalisation at the end of it shifts
  // every band voxel in that box by a hair — including the ones out in the
  // corners, further from the grab than the brush is long. That has been true
  // since the op existed; what must not change is the SIZE of the footprint.
  const fLocal = build();
  const centre = grabFront(fLocal, 0.34, 0.02);
  const distBefore = fLocal.dist.slice();
  fLocal.pull(centre, { x: CAP, y: 0, z: 0 }, BRUSH);
  const reach = BRUSH + 3 * H; // the write box, plus a voxel for centre rounding
  let outsideMoved = 0;
  let insideMoved = 0;
  {
    const { origin, res } = fLocal;
    for (let k = 0; k < res; k++) {
      const wz = Math.abs(origin + (k + 0.5) * H - centre.z);
      for (let j = 0; j < res; j++) {
        const wy = Math.abs(origin + (j + 0.5) * H - centre.y);
        let n = (k * res + j) * res;
        for (let i = 0; i < res; i++, n++) {
          if (fLocal.dist[n] === distBefore[n]) continue;
          const wx = Math.abs(origin + (i + 0.5) * H - centre.x);
          if (Math.max(wx, wy, wz) > reach) outsideMoved++; else insideMoved++;
        }
      }
    }
  }
  assert.equal(outsideMoved, 0, `a pull must leave every voxel outside its write box bit-identical (${outsideMoved} moved beyond ${reach.toFixed(3)})`);
  assert.ok(insideMoved > 0, 'the pull under test should actually have moved something');

  report.test15_roundedPullFronts = {
    brush: BRUSH,
    pullCore: PULL_CORE,
    stepCapFraction: PULL_STEP_CAP,
    foldBound: 0.667 * (1 - PULL_CORE),
    floorVox: FLOOR_VOX,
    longDrag: { reach: long.reach, halfWidthVox: long.halfWidthVox },
    fastFlick: { reach: flick.reach, halfWidthVox: flick.halfWidthVox },
    sameSpot: { reach: spot.reach, halfWidthVox: spot.halfWidthVox },
    voxelsMovedInsideBrush: insideMoved,
    voxelsMovedOutsideBrush: outsideMoved,
  };
}

// ===========================================================================
// 16. gravity rest rotates laterally and never in depth
// ===========================================================================
//
// The owner: "The rotation forward and back is unnecessary — we only need
// lateral rotation <-> if the object is unbalanced. On the x-y plane of the
// laptop, no z-direction forward or back."
section('16. gravity rest rotates laterally and never in depth');
{
  /** Axis-angle of a unit quaternion, as [x, y, z, radians]. */
  const axisAngle = (q) => {
    const w = Math.max(-1, Math.min(1, q[3]));
    const ang = 2 * Math.acos(w);
    const s = Math.sqrt(Math.max(1 - w * w, 1e-24));
    return s < 1e-8 ? [0, 0, 1, 0] : [q[0] / s, q[1] / s, q[2] / s, ang];
  };

  /**
   * A five-ball loaf tilted by `deg` out of the horizontal, in one of three
   * planes:
   *   'xy' — tilted left/right. Visibly off balance; must topple laterally.
   *   'xz' — still flat on screen, but with one end nearer the camera. This is
   *          the case the owner objected to: nothing about it looks wrong, and
   *          the old solver pitched it 48 degrees about x to "fix" it.
   *   'zy' — standing up toward the camera; reads on screen as standing on end.
   */
  const loaf = (deg, plane) => {
    const f = createClayField({ seed: 88 });
    const a = (deg * Math.PI) / 180;
    for (let i = 0; i < 5; i++) {
      const t = (i - 2) * 0.17;
      const along = Math.cos(a) * t;
      const rise = Math.sin(a) * t;
      const c = plane === 'xy' ? { x: along, y: rise, z: 0 }
        : plane === 'xz' ? { x: along, y: 0, z: rise }
          : { x: 0, y: rise, z: along };
      f.stampBall(c, 0.20, '#c9a86a');
    }
    return f;
  };

  // --- LATERAL. A loaf stood up at 40 degrees in the plane of the screen has
  //     something to say to gravity, and it says it by tipping sideways.
  const fLat = loaf(40, 'xy');
  // YOU CANNOT TOPPLE IN MID-AIR, and this fixture starts 11 voxels off the
  // table. Under the old shape-based solver that did not matter — it read the
  // silhouette, which is the same whether the loaf is resting or falling, and
  // planned 40 degrees of topple for a body that had nothing to topple about.
  // Balance is a question about a body and the ground it stands on, so the
  // first settle here is a pure drop (plan angle 0, drop 10.95 voxels) and only
  // once it has LANDED is there a support interval to be outside of. That
  // ordering is the physics, not a workaround for it.
  const latAirborne = fLat.settlePlan();
  assert.equal(latAirborne.balance, null, 'a body clear of the table has no support interval');
  assert.equal(latAirborne.angle, 0, 'a body clear of the table must not plan a rotation');
  assert.ok(latAirborne.drop < -5 * fLat.h, 'a body clear of the table must plan a real drop');
  fLat.settleRest({ rate: 1 });

  const latPlan = fLat.settlePlan();
  const latAxis = axisAngle(latPlan.quat);
  const latDegrees = (latPlan.angle * 180) / Math.PI;
  assert.ok(latPlan.balance.toppling,
    `a landed 40-degree lateral lean must read as toppling (overhang=${latPlan.balance.overhang.toFixed(3)})`);
  assert.ok(latPlan.angle > 0.06, `a 40-degree lateral lean should plan a real rotation (got ${latDegrees.toFixed(2)} degrees)`);
  assert.ok(
    Math.abs(latAxis[0]) < 1e-9 && Math.abs(latAxis[1]) < 1e-9,
    `the lateral topple axis must be pure z (got [${latAxis.slice(0, 3).map((v) => v.toFixed(9)).join(', ')}])`,
  );
  // A TOPPLE IS A ROLL, NOT A SNAP. The old solver computed the whole lay-down
  // in one plan (40 degrees, once) because it knew where it wanted the axis to
  // end up. This one only knows the body is past its tipping point and by how
  // much, so it takes a damped bite, re-measures the footprint — which has
  // MOVED, because different clay is touching the table now — and takes
  // another. Traced: 14.8 degrees, then 12.1, then balanced and still. That
  // accumulation is the fall, and it is why the per-plan angle is no longer
  // comparable to the lean the fixture was built with.
  let latResult = null;
  let latTotal = latPlan.angle;
  let latSteps = 1;
  for (let i = 0; i < 12; i++) {
    latResult = fLat.settleRest({ rate: 1 });
    if (latResult.done) break;
    const next = fLat.settlePlan();
    if (next && next.angle > 0) { latTotal += next.angle; latSteps += 1; }
  }
  const latAfter = fLat.principalAxes();
  const latTotalDegrees = (latTotal * 180) / Math.PI;
  assert.ok(latSteps >= 2, `a topple should develop over several settles (took ${latSteps})`);
  assert.ok(latTotalDegrees > 20, `the loaf should turn a substantial amount in total (got ${latTotalDegrees.toFixed(1)} degrees)`);
  assert.ok(
    Math.abs(latAfter.axes[0][1]) < 0.30,
    `after settling laterally the long axis should lie near the horizon (y=${latAfter.axes[0][1].toFixed(4)})`,
  );
  const latRest = fLat.settlePlan();
  assert.ok(!latRest.balance.toppling,
    `the toppled loaf must end BALANCED, which is why it stopped (overhang=${latRest.balance.overhang.toFixed(3)})`);

  // --- DEPTH. The SAME loaf, tilted the same 40 degrees, but with one end
  //     nearer the camera instead of higher up. On screen it is already lying
  //     down: there is nothing off balance for a child to see, and turning it
  //     reads as the toy wobbling for no reason. The old solver turned it 48
  //     degrees, almost all of that about x, which is a rotation the projection
  //     barely shows — so what the child got was not a topple but their
  //     creature quietly changing shape. It must now plan nothing.
  const fDepth = loaf(40, 'xz');
  const depthPlan = fDepth.settlePlan();
  const depthAxis = axisAngle(depthPlan.quat);
  const depthDegrees = (depthPlan.angle * 180) / Math.PI;
  assert.ok(
    Math.abs(depthAxis[0]) < 1e-9 && Math.abs(depthAxis[1]) < 1e-9,
    `a depth tilt must not produce any x or y rotation (got [${depthAxis.slice(0, 3).map((v) => v.toFixed(9)).join(', ')}])`,
  );
  // Not bit-zero, and it should not be: five discrete balls laid along a line
  // project to a silhouette with a fraction of a degree of real lean in it. The
  // bar is the game's own trigger — under SETTLE_ANGLE_MIN (3.4 degrees) no
  // settle is started at all, so a depth-tilted creature is never turned.
  assert.ok(
    depthDegrees < 3.4,
    `a creature tilted only in depth must plan less rotation than the settle trigger (planned ${depthDegrees.toFixed(4)} degrees)`,
  );

  // It may still be asked to sit DOWN — dropping onto the table is a
  // translation and was never the thing under complaint.
  const depthBoundsBefore = fDepth.bounds();
  fDepth.settleRest({ rate: 1 });
  const depthAfter = fDepth.bounds();
  const depthTurned = Math.abs((depthAfter.width - depthBoundsBefore.width) / depthBoundsBefore.width);
  assert.ok(
    depthTurned < 0.06,
    `settling a depth-tilted creature must not change how wide it looks (width moved ${(depthTurned * 100).toFixed(2)}%)`,
  );

  // --- NO AXIS SURVIVES A FULL SETTLE. Whatever the pose, every rotation this
  //     module ever bakes is about z. Swept, so a future change that reaches
  //     for the 3-D principal axes again fails here rather than in a playtest.
  const offAxis = [];
  for (const deg of [12, 27, 40, 63, 85]) {
    for (const plane of ['xy', 'xz', 'zy']) {
      const f = loaf(deg, plane);
      for (let i = 0; i < 6; i++) {
        const plan = f.settlePlan();
        if (!plan) break;
        const ax = axisAngle(plan.quat);
        offAxis.push(Math.max(Math.abs(ax[0]), Math.abs(ax[1])));
        if (f.settleRest({ rate: 1 }).done) break;
      }
    }
  }
  const worstOffAxis = Math.max(...offAxis);
  assert.ok(worstOffAxis < 1e-9, `no settle step may rotate about x or y (worst off-axis component ${worstOffAxis})`);

  // --- IDEMPOTENCE, still exact. Settling a settled creature does nothing.
  const fFix = loaf(40, 'xy');
  for (let i = 0; i < 12; i++) if (fFix.settleRest({ rate: 1 }).done) break;
  const restedVolume = fFix.volume();
  const restedBounds = fFix.bounds();
  const again = fFix.settleRest({ rate: 1 });
  assert.ok(again.done, 'a rested creature must report itself done on the next settle');
  assert.ok(
    Math.abs(fFix.volume() - restedVolume) / restedVolume < 0.005,
    `re-settling a rested creature must not move material (volume moved ${(Math.abs(fFix.volume() - restedVolume) / restedVolume * 100).toFixed(3)}%)`,
  );
  // ONE voxel of quantisation is allowed here and no more. A creature that
  // reports `done` may still be carrying a sub-voxel residual drop (this
  // fixture rests 0.52 of a voxel proud of the table, comfortably inside the
  // 0.8-voxel rest threshold), and applying half a voxel of shift can round the
  // lowest occupied row across one grid line. What must NOT happen is that it
  // keeps happening — so the real assertion is the one below: settle again and
  // nothing moves at all. That is the fixed point the child is promised.
  assert.ok(
    Math.abs(fFix.bounds().minY - restedBounds.minY) <= fFix.h * 1.5,
    `re-settling a rested creature must not drop it further (moved ${((fFix.bounds().minY - restedBounds.minY) / fFix.h).toFixed(3)} voxels)`,
  );
  const settledTwiceY = fFix.bounds().minY;
  const settledTwiceVolume = fFix.volume();
  for (let i = 0; i < 3; i++) fFix.settleRest({ rate: 1 });
  assert.equal(fFix.bounds().minY, settledTwiceY,
    'a settled creature must be a true fixed point: further settles move it exactly nowhere');
  assert.ok(
    Math.abs(fFix.volume() - settledTwiceVolume) / settledTwiceVolume < 0.005,
    `three more settles must not leak material (moved ${(Math.abs(fFix.volume() - settledTwiceVolume) / settledTwiceVolume * 100).toFixed(3)}%)`,
  );

  // --- DETERMINISM. Same build, same settles, same numbers.
  const buildAndSettle = () => {
    const f = loaf(40, 'xy');
    for (let i = 0; i < 12; i++) if (f.settleRest({ rate: 1 }).done) break;
    return { volume: f.volume(), bounds: f.bounds() };
  };
  const runA = buildAndSettle();
  const runB = buildAndSettle();
  assert.deepEqual(runB, runA, 'a settle sequence must be deterministic');

  report.test16_lateralOnlyGravity = {
    lateralPlanDegrees: latDegrees,
    lateralAxis: latAxis.slice(0, 3),
    lateralLongAxisYAfter: latAfter.axes[0][1],
    lateralDone: latResult.done,
    depthPlanDegrees: depthDegrees,
    depthQuat: depthPlan.quat,
    depthWidthChangePct: depthTurned * 100,
    worstOffAxisComponentAcrossSweep: worstOffAxis,
    settlePlansSwept: offAxis.length,
    idempotentVolume: restedVolume,
    deterministic: JSON.stringify(runA) === JSON.stringify(runB),
  };
}

// ===========================================================================
// 17. balance is centre of mass against support, not silhouette against vertical
//
// THE OWNER'S REPORT, AS A TEST: "It seems to lean when I put something on top
// even though it was more stable before — that lean doesn't make physical
// sense. Some of the weight should compress down and flatten down at the base."
// ===========================================================================
section('17. balance: COM over support, and the clay takes the weight');
{
  const GROUND = -0.70;
  const build = (f) => {
    // A wide, obviously stable body: three balls in a row on the table.
    f.stampBall({ x: -0.20, y: GROUND + 0.17, z: 0 }, 0.20, '#c85a3a');
    f.stampBall({ x: 0.00, y: GROUND + 0.19, z: 0 }, 0.22, '#c85a3a');
    f.stampBall({ x: 0.20, y: GROUND + 0.17, z: 0 }, 0.20, '#c85a3a');
    return f;
  };

  // --- THE PHANTOM LEAN IS GONE.
  const f = build(createClayField({ seed: 7, ground: GROUND }));
  const flatPlan = f.settlePlan();
  assert.ok(flatPlan.angle < 0.06, `a wide body on the table must not plan a topple (${degrees(flatPlan.angle).toFixed(2)} deg)`);

  // Stack it up. The silhouette's aspect ratio crosses 1 somewhere in here, and
  // under the old covariance solve THAT is what triggered: measured on the
  // shipping build, this exact fixture went from a 0.9-degree plan to an
  // 89.4-degree one on the stamp that made it taller than it was wide, and the
  // settle then laid the creature flat. The centre of mass never left the base.
  const comPath = [];
  for (const [i, y] of [0.50, 0.78, 1.02].entries()) {
    f.stampBall({ x: 0, y: GROUND + y, z: 0 }, 0.17 - i * 0.01, '#3fbf6f', { compress: true });
    const plan = f.settlePlan();
    comPath.push({
      height: f.bounds().height,
      angle: degrees(plan.angle),
      overhang: plan.balance.overhang,
      comX: plan.balance.comX,
    });
    assert.ok(plan.angle === 0,
      `a centred stack must plan NO rotation however tall it gets (ball ${i + 1}: ${degrees(plan.angle).toFixed(2)} deg)`);
    assert.ok(Math.abs(plan.balance.overhang) < 0.2,
      `the centre of mass must stay well inside the footprint (overhang ${plan.balance.overhang.toFixed(3)})`);
    assert.ok(!plan.balance.toppling, 'a centred stack is not toppling');
  }
  // It really did get taller — the assertion above is not passing because
  // nothing happened.
  assert.ok(comPath[2].height > comPath[0].height * 1.4,
    `the fixture must actually become a tall build (${comPath[0].height.toFixed(3)} -> ${comPath[2].height.toFixed(3)})`);
  // And it is TALLER THAN IT IS WIDE, which is precisely the condition that
  // used to flip the old solver's principal axis and knock the creature over.
  assert.ok(f.bounds().height > f.bounds().width,
    `the fixture must end up taller than wide (${f.bounds().height.toFixed(3)} vs ${f.bounds().width.toFixed(3)})`);
  // Settling it changes nothing, because there is nothing to fix.
  const beforeSettle = f.bounds();
  f.settleRest({ rate: 1 });
  assert.ok(Math.abs(f.bounds().width - beforeSettle.width) <= 2 * f.h,
    'settling a balanced creature must not move it sideways');
  assert.ok(f.bounds().height > f.bounds().width, 'a balanced creature must still be standing after a settle');

  // --- COMPRESSION: the clay takes the weight.
  const plain = build(createClayField({ seed: 7, ground: GROUND }));
  const loaded = build(createClayField({ seed: 7, ground: GROUND }));
  const footBefore = plain.supportSpan();
  plain.stampBall({ x: 0, y: GROUND + 0.50, z: 0 }, 0.17, '#3fbf6f');
  loaded.stampBall({ x: 0, y: GROUND + 0.50, z: 0 }, 0.17, '#3fbf6f', { compress: true });

  // SUB-VOXEL MEASUREMENTS, because the effect is deliberately smaller than a
  // voxel. bounds() reports the highest occupied voxel CENTRE, so it quantises a
  // 0.8-voxel squash to either 0 or a whole voxel depending on where the surface
  // happened to sit — measured, this exact pair reports an identical bounds
  // height while the surface really did drop. The distance field itself is
  // continuous, so ask it where the surface is.
  const surfaceTopY = (f, x = 0, z = 0) => {
    let above = null;
    for (let y = 1.0; y > -1.0; y -= f.h * 0.25) {
      const d = f.sampleDistance(x, y, z);
      if (d <= 0) {
        if (above === null) return y;
        // Linear crossing between the last outside sample and this inside one.
        const t = above.d / (above.d - d);
        return above.y + (y - above.y) * t;
      }
      above = { y, d };
    }
    return null;
  };
  const topPlain = surfaceTopY(plain);
  const topLoaded = surfaceTopY(loaded);
  const columnHeight = topPlain - GROUND;
  const heightLoss = (topPlain - topLoaded) / columnHeight;
  const comPlain = plain.principalAxes().center[1];
  const comLoaded = loaded.principalAxes().center[1];
  const footPlain = plain.supportSpan();
  const footLoaded = loaded.supportSpan();
  const footGain = (footLoaded.max - footLoaded.min) / (footPlain.max - footPlain.min) - 1;

  // The centre of mass comes DOWN. That is what "the clay took the weight"
  // means physically, and unlike a silhouette measurement it cannot be faked by
  // the surface merely rippling.
  assert.ok(comLoaded < comPlain,
    `compression must lower the centre of mass (${comPlain.toFixed(5)} -> ${comLoaded.toFixed(5)})`);

  assert.ok(loaded.stats().compressions === 1, 'a ball landing on clay must compress the column under it exactly once');
  assert.ok(heightLoss > 0.005, `the loaded column must visibly shorten (lost ${(heightLoss * 100).toFixed(2)}%)`);
  assert.ok(heightLoss <= COMPRESS_MAX,
    `one stamp may never squash more than COMPRESS_MAX out of a column (lost ${(heightLoss * 100).toFixed(2)}%)`);
  assert.ok(footGain > 0.01, `the base must spread measurably under the load (grew ${(footGain * 100).toFixed(2)}%)`);
  // VOLUME IS REDISTRIBUTED, NEVER DESTROYED.
  const volDrift = Math.abs(loaded.volume() - plain.volume()) / plain.volume();
  assert.ok(volDrift < 0.01,
    `compression must move clay, not consume it (volume differs by ${(volDrift * 100).toFixed(3)}%)`);

  // --- A BALL SET DOWN ON BARE TABLE COMPRESSES NOTHING.
  const alone = createClayField({ seed: 7, ground: GROUND });
  alone.stampBall({ x: 0, y: GROUND + 0.18, z: 0 }, 0.20, '#c85a3a', { compress: true });
  assert.equal(alone.stats().compressions, 0, 'the table does not squash');

  // --- DIMINISHING, so a long session cannot flatten a deliberate build.
  const many = build(createClayField({ seed: 7, ground: GROUND }));
  const squashes = [];
  for (let i = 0; i < 8; i++) {
    const before = many.opCount();
    many.stampBall({ x: 0, y: many.bounds().maxY - 0.05, z: 0 }, 0.15, '#4a86d8', { compress: true });
    const c = many.ops().slice(before).find((o) => o.t === 'c');
    squashes.push(c ? c.s : 0);
  }
  for (let i = 1; i < squashes.length; i++) {
    assert.ok(squashes[i] <= squashes[i - 1] + 1e-9,
      `each identical stamp must squash no more than the last (${squashes[i - 1]} -> ${squashes[i]})`);
  }
  assert.ok(squashes[7] < squashes[0] * 0.75,
    `the body must stiffen appreciably as it thickens (${squashes[0].toFixed(5)} -> ${squashes[7].toFixed(5)})`);
  // Eight balls of compression must still leave a tall creature standing.
  assert.ok(many.bounds().height > 1.0,
    `a deliberate tall build must survive a session of stamping (height ${many.bounds().height.toFixed(3)})`);
  assert.ok(many.settlePlan().angle === 0, 'and must still not be leaning');

  // --- A GENUINE OVERHANG STILL GOES OVER. Balance is not "never rotate".
  const tipsy = createClayField({ seed: 7, ground: GROUND });
  tipsy.stampBall({ x: 0, y: GROUND + 0.10, z: 0 }, 0.12, '#c85a3a');
  tipsy.stampBall({ x: 0.30, y: GROUND + 0.34, z: 0 }, 0.22, '#3fbf6f');
  const tipsyPlan = tipsy.settlePlan();
  assert.ok(tipsyPlan.balance.toppling,
    `a head cantilevered off a small foot must read as toppling (overhang ${tipsyPlan.balance.overhang.toFixed(2)})`);
  assert.ok(tipsyPlan.angle > 0.06, `and must plan a real rotation (${degrees(tipsyPlan.angle).toFixed(2)} deg)`);
  assert.equal(tipsyPlan.quat[0], 0, 'a topple is pure z: no x component');
  assert.equal(tipsyPlan.quat[1], 0, 'a topple is pure z: no y component');
  const tipsyWide = tipsy.bounds().width / tipsy.bounds().height;
  for (let i = 0; i < 12; i++) if (tipsy.settleRest({ rate: 1 }).done) break;
  assert.ok(tipsy.bounds().width / tipsy.bounds().height > tipsyWide,
    'a toppled creature must end up lower and wider than it started');
  assert.ok(!tipsy.settlePlan().balance.toppling, 'and must come to rest balanced');

  // --- NO SUPPORT, NO TOPPLE. You cannot fall over in mid-air.
  const airborne = createClayField({ seed: 7, ground: GROUND });
  airborne.stampBall({ x: 0, y: 0.30, z: 0 }, 0.10, '#c85a3a');
  airborne.stampBall({ x: 0.22, y: 0.48, z: 0 }, 0.16, '#3fbf6f');
  const airPlan = airborne.settlePlan();
  assert.equal(airPlan.balance, null, 'a body clear of the table has no support interval');
  assert.equal(airPlan.angle, 0, 'a body clear of the table plans no rotation, only a drop');
  assert.ok(airPlan.drop < 0, 'and the drop is downward');

  report.test17_balance = {
    flatPlanDegrees: degrees(flatPlan.angle),
    stackedPlanDegrees: comPath.map((s) => s.angle),
    stackedOverhang: comPath.map((s) => s.overhang),
    finalHeight: f.bounds().height,
    finalWidth: f.bounds().width,
    compressionHeightLossPct: heightLoss * 100,
    compressionComDrop: comPlain - comLoaded,
    compressionSurfaceTop: { plain: topPlain, loaded: topLoaded },
    compressionFootGainPct: footGain * 100,
    compressionVolumeDriftPct: volDrift * 100,
    squashSeries: squashes,
    tallBuildHeightAfterEightStamps: many.bounds().height,
    cantileverToppleDegrees: degrees(tipsyPlan.angle),
  };
}

// ===========================================================================
// 18. the domain guard: no shear, at any face, ever
//
// THE OWNER'S SECOND REPORT: "The top of the clay is getting clipped." The
// screenshot showed a hard flat horizontal cut across the creature's top.
// ===========================================================================
section('18. domain guard: clay never reaches a face');
{
  const GROUND = -0.70;
  const RES = FIELD_RES;

  /** Nearest occupied voxel to each of the six faces, in voxels. */
  const clearances = (f) => {
    const d = f.snapshot().dist;
    const out = { minusX: RES, plusX: RES, minusY: RES, plusY: RES, minusZ: RES, plusZ: RES };
    for (let k = 0; k < RES; k++) {
      for (let j = 0; j < RES; j++) {
        for (let i = 0; i < RES; i++) {
          if (d[(k * RES + j) * RES + i] >= 0) continue;
          if (i < out.minusX) out.minusX = i;
          if (RES - 1 - i < out.plusX) out.plusX = RES - 1 - i;
          if (j < out.minusY) out.minusY = j;
          if (RES - 1 - j < out.plusY) out.plusY = RES - 1 - j;
          if (k < out.minusZ) out.minusZ = k;
          if (RES - 1 - k < out.plusZ) out.plusZ = RES - 1 - k;
        }
      }
    }
    return out;
  };

  /** Width in voxels of the top `rows` occupied rows, topmost first. */
  const topProfile = (f, rows = 5) => {
    const d = f.snapshot().dist;
    let top = -1;
    for (let j = RES - 1; j >= 0 && top < 0; j--) {
      for (let k = 0; k < RES && top < 0; k++) {
        for (let i = 0; i < RES; i++) if (d[(k * RES + j) * RES + i] < 0) { top = j; break; }
      }
    }
    const widths = [];
    for (let n = 0; n < rows && top - n >= 0; n++) {
      const j = top - n;
      let lo = RES; let hi = -1;
      for (let k = 0; k < RES; k++) {
        for (let i = 0; i < RES; i++) if (d[(k * RES + j) * RES + i] < 0) { if (i < lo) lo = i; if (i > hi) hi = i; }
      }
      widths.push(hi >= lo ? hi - lo + 1 : 0);
    }
    return widths;
  };

  const assertClear = (f, label) => {
    const c = clearances(f);
    for (const [face, gap] of Object.entries(c)) {
      assert.ok(gap >= FACE_MARGIN_VOXELS,
        `${label}: material came within ${gap} voxels of the ${face} face (FACE_MARGIN_VOXELS is ${FACE_MARGIN_VOXELS})`);
    }
    return c;
  };

  /**
   * A ROUNDED TOP TAPERS. A sheared one ends at full width — that is what the
   * owner's screenshot showed, and it is what a boundary cut always looks like.
   * The topmost row must be narrower than the rows below it.
   */
  const assertRounded = (f, label) => {
    const w = topProfile(f);
    assert.ok(w[0] < w[w.length - 1],
      `${label}: the top must taper, not end flat (width profile top-down: ${w.join(', ')})`);
    assert.ok(w[0] <= w[1], `${label}: the topmost row must not be the widest (${w.join(', ')})`);
    return w;
  };

  // --- A TALL STACK AGAINST A GAME-SET LID.
  const stacked = createClayField({ seed: 7, ground: GROUND });
  stacked.setCeiling(0.62); // a landscape stage's visible top, less its inset
  let y = GROUND + 0.18;
  for (let i = 0; i < 14; i++) { stacked.stampBall({ x: 0, y, z: 0 }, 0.20, '#c85a3a'); y += 0.24; }
  const stackClear = assertClear(stacked, 'tall stack');
  const stackProfile = assertRounded(stacked, 'tall stack');
  assert.ok(stacked.bounds().maxY < 0.62 + 2 * stacked.h,
    `a stack must not build through the lid (top ${stacked.bounds().maxY.toFixed(3)}, lid 0.62)`);

  // --- SIXTY AGGRESSIVE UPWARD PULLS. This is the gesture that produced the
  //     screenshot: a spire dragged straight off the top of the frame.
  const pulled = createClayField({ seed: 7, ground: GROUND });
  pulled.setCeiling(0.62);
  pulled.stampBall({ x: 0, y: GROUND + 0.30, z: 0 }, 0.30, '#c85a3a');
  const climb = [];
  for (let i = 0; i < 60; i++) {
    pulled.pull({ x: 0, y: pulled.bounds().maxY - 0.06, z: 0 }, { x: 0, y: 0.5, z: 0 }, 0.26);
    if (i % 15 === 14) climb.push(pulled.bounds().maxY);
  }
  assertClear(pulled, 'sixty upward pulls');
  const pullProfile = assertRounded(pulled, 'sixty upward pulls');
  // ASYMPTOTIC, NOT A WALL: the last fifteen pulls must move it less than the
  // first fifteen did, and it must never arrive.
  assert.ok(climb[3] - climb[2] <= climb[1] - climb[0] + 1e-9,
    `upward pulls must yield less and less (${climb.map((v) => v.toFixed(4)).join(' -> ')})`);
  assert.ok(pulled.bounds().maxY < 0.62, 'sixty pulls must not reach the lid');

  // --- THE CUBE'S OWN MARGIN HOLDS WITH NO LID SET AT ALL. This is the layer
  //     that protects a portrait stage, where the canvas top and the cube top
  //     are the same line and a game-set ceiling would not be below the frame.
  const unlidded = createClayField({ seed: 7, ground: GROUND });
  let uy = GROUND + 0.18;
  for (let i = 0; i < 14; i++) { unlidded.stampBall({ x: 0, y: uy, z: 0 }, 0.20, '#c85a3a'); uy += 0.24; }
  for (let i = 0; i < 40; i++) {
    unlidded.pull({ x: 0, y: unlidded.bounds().maxY - 0.06, z: 0 }, { x: 0, y: 0.5, z: 0 }, 0.26);
  }
  const unlidClear = assertClear(unlidded, 'no lid set');
  assertRounded(unlidded, 'no lid set');

  // --- EVERY OTHER FACE, including stamps aimed far outside the world.
  const shoved = createClayField({ seed: 7, ground: GROUND });
  shoved.stampBall({ x: 0, y: GROUND + 0.30, z: 0 }, 0.28, '#c85a3a');
  for (let i = 0; i < 40; i++) shoved.pull({ x: shoved.bounds().maxX - 0.06, y: GROUND + 0.30, z: 0 }, { x: 0.5, y: 0, z: 0 }, 0.26);
  for (let i = 0; i < 40; i++) shoved.pull({ x: shoved.bounds().minX + 0.06, y: GROUND + 0.30, z: 0 }, { x: -0.5, y: 0, z: 0 }, 0.26);
  for (let i = 0; i < 40; i++) shoved.pull({ x: 0, y: GROUND + 0.30, z: shoved.bounds().maxZ - 0.06 }, { x: 0, y: 0, z: 0.5 }, 0.26);
  shoved.stampBall({ x: 5, y: GROUND + 0.4, z: 0 }, 0.2, '#3fbf6f');
  shoved.stampBall({ x: 0, y: 9, z: -7 }, 0.2, '#4a86d8');
  const shovedClear = assertClear(shoved, 'shoved at every wall');

  // --- AND IT IS STILL A REPLAYABLE CREATURE. The guard clamps the numbers
  //     BEFORE they are logged, so replaying the log reproduces it exactly.
  const rebuilt = createFieldFromDocument(shoved.toDocument());
  const a = shoved.snapshot();
  const b = rebuilt.snapshot();
  let diffs = 0;
  for (let i = 0; i < a.dist.length; i++) if (a.dist[i] !== b.dist[i]) diffs++;
  assert.equal(diffs, 0, 'a guarded creature must replay bit-exact from its own op log');

  report.test18_domainGuard = {
    faceMarginVoxels: FACE_MARGIN_VOXELS,
    tallStackClearances: stackClear,
    tallStackTopWidths: stackProfile,
    pulledTopWidths: pullProfile,
    pulledClimb: climb,
    unliddedClearances: unlidClear,
    shovedClearances: shovedClear,
    replayExact: diffs === 0,
  };
}

// ===========================================================================
// 19. save compatibility: an old creature may not change shape on load
// ===========================================================================
section('19. save compatibility across the v6 boundary');
{
  const GROUND = -0.587;
  // A v5 document, as written before any of this existed: no ceiling key, no
  // legacyOps key, and ops that were authored with no domain guard and baked by
  // the old shape-based settle.
  const v5 = {
    format: 'qlobe-clay-field',
    version: 5,
    seed: 1337,
    res: FIELD_RES,
    size: 2,
    ground: GROUND,
    ops: [
      { t: 's', x: 0, y: -0.407, z: 0, r: 0.2, c: '#c85a3a' },
      { t: 's', x: 0, y: -0.187, z: 0, r: 0.2, c: '#3fbf6f' },
      { t: 's', x: 0, y: 0.033, z: 0, r: 0.2, c: '#4a86d8' },
      { t: 's', x: 0, y: 0.253, z: 0, r: 0.2, c: '#c85a3a' },
      // Deliberately past the guard: a v5 creature was allowed to do this, and
      // must still be allowed to, or it loads as a different creature.
      { t: 's', x: 0, y: 0.900, z: 0, r: 0.2, c: '#3fbf6f' },
    ],
  };

  const loaded = createFieldFromDocument(v5);
  assert.ok(loaded, 'a v5 document must still load');
  // The out-of-guard stamp survived: its material is still up there, above the
  // faceLimit a creature built today could never cross.
  assert.ok(loaded.bounds().maxY > 0.9,
    `a v5 creature that built past the guard must keep its shape (top ${loaded.bounds().maxY.toFixed(3)})`);

  // --- AND THE OLD SETTLE STILL RESOLVES THE OLD WAY.
  //
  // This is the part that most needed a version gate. A 'g' op in a v5 file was
  // BAKED BY THE SHAPE-BASED SOLVER: replaying this straight tower through it
  // lays the tower down, because its silhouette is taller than it is wide and
  // that is all the old solver looked at. Under the new balance solve the same
  // tower is perfectly balanced and does not move at all. Both are asserted
  // here, side by side, because the difference between them IS the bug the
  // owner reported — and a saved creature has to keep the pose it was saved in
  // even when that pose came from a bug.
  const legacySettled = createFieldFromDocument({ ...v5, ops: [...v5.ops, { t: 'g', r: 1 }] });
  const legacyRatio = legacySettled.bounds().width / legacySettled.bounds().height;
  assert.ok(legacyRatio > 1,
    `a v5 'g' op must still lay a tower down, as it did when it was saved (w/h ${legacyRatio.toFixed(2)})`);

  const modernSettled = createFieldFromDocument({
    ...v5, version: DOC_VERSION, ops: [...v5.ops, { t: 'g', r: 1 }], legacyOps: 0,
  });
  const modernRatio = modernSettled.bounds().width / modernSettled.bounds().height;
  assert.ok(modernRatio < 1,
    `the same tower built today must STAY STANDING through a settle (w/h ${modernRatio.toFixed(2)})`);
  assert.ok(legacyRatio > modernRatio * 2,
    'the legacy and current settles must be visibly different, which is why the version gate exists');

  // Re-saving it bumps the version and RECORDS THE BOUNDARY.
  const resaved = loaded.toDocument();
  assert.equal(resaved.version, DOC_VERSION, 're-saving an old creature writes the current version');
  assert.equal(resaved.legacyOps, v5.ops.length, 'and records how many of its ops predate the guard');

  // Reloading the re-saved file must reproduce it exactly.
  const reloaded = createFieldFromDocument(resaved);
  const a = loaded.snapshot(); const b = reloaded.snapshot();
  let diffs = 0;
  for (let i = 0; i < a.dist.length; i++) if (a.dist[i] !== b.dist[i]) diffs++;
  assert.equal(diffs, 0, 'a re-saved legacy creature must reload bit-exact');

  // Work added TODAY is guarded, even on a creature that began life as v5.
  loaded.setCeiling(0.617);
  loaded.stampBall({ x: 0, y: 5, z: 0 }, 0.18, '#e8b23a', { compress: true });
  const newOp = loaded.ops().at(-1).t === 'c' ? loaded.ops().at(-2) : loaded.ops().at(-1);
  assert.ok(newOp.y <= 0.617,
    `a stamp made today must be clamped to the lid even on a legacy creature (logged y=${newOp.y})`);

  // And the mixed creature still round-trips.
  const mixed = loaded.toDocument();
  assert.equal(mixed.legacyOps, v5.ops.length, 'the legacy boundary must not move when new ops are added');
  const mixedBack = createFieldFromDocument(mixed);
  const c = loaded.snapshot(); const d = mixedBack.snapshot();
  let mixedDiffs = 0;
  for (let i = 0; i < c.dist.length; i++) if (c.dist[i] !== d.dist[i]) mixedDiffs++;
  assert.equal(mixedDiffs, 0, 'a creature with both legacy and current ops must round-trip bit-exact');

  report.test19_saveCompatibility = {
    legacyTopY: loaded.bounds().maxY,
    legacySettleWidthOverHeight: legacyRatio,
    currentSettleWidthOverHeight: modernRatio,
    resavedVersion: resaved.version,
    recordedLegacyOps: resaved.legacyOps,
    legacyReloadExact: diffs === 0,
    mixedRoundTripExact: mixedDiffs === 0,
  };
}

// ---------------------------------------------------------------------------
console.log('\n=== summary ===');
console.log(JSON.stringify(report, null, 2));
