import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Both production files stay plain browser ES modules — blob-legacy.js has no
// imports at all by design, and field.js has none either (see its own header)
// — so this repository's house pattern (no package.json, ever) still applies:
// load the real source through a data URL so node runs it as ESM without
// changing what ships. See shared/js/clay/field.test.mjs and
// heightfield.test.mjs for the same trick.
async function loadModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const { isLegacyBlobDoc, legacyToOps } = await loadModule('../js/blob-legacy.js');
const { createFieldFromDocument, DOC_FORMAT, DOC_VERSION, PULL_STEP_CAP } = await loadModule('../../../shared/js/clay/field.js');

function section(name) {
  console.log(`\n=== ${name} ===`);
}

const report = {};

// ===========================================================================
// 1. isLegacyBlobDoc — accepts v1-v4, rejects everything else
// ===========================================================================
section('1. isLegacyBlobDoc accepts v1-v4, rejects null/{}/v5');
{
  const v1 = { format: 'qlobe-clay-lobes', version: 1, lobes: [{ id: 'lobe-1', x: 0.5, y: 0.5, radius: 0.1, color: '#3fbf6f' }] };
  const v2 = { format: 'qlobe-clay-lobes', version: 2, lobes: [], ground: 0.6 };
  const v3 = { format: 'qlobe-clay-lobes', version: 3, seed: 42, lobes: [] };
  const v4 = { format: 'qlobe-clay-lobes', version: 4, seed: 42, lobes: [] };
  const v5 = { format: DOC_FORMAT, version: DOC_VERSION, seed: 1337, ops: [] };

  assert.equal(isLegacyBlobDoc(v1), true, 'v1 doc accepted');
  assert.equal(isLegacyBlobDoc(v2), true, 'v2 doc accepted');
  assert.equal(isLegacyBlobDoc(v3), true, 'v3 doc accepted');
  assert.equal(isLegacyBlobDoc(v4), true, 'v4 doc accepted');
  assert.equal(isLegacyBlobDoc(null), false, 'null rejected');
  assert.equal(isLegacyBlobDoc(undefined), false, 'undefined rejected');
  assert.equal(isLegacyBlobDoc({}), false, 'empty object rejected');
  assert.equal(isLegacyBlobDoc(v5), false, 'a v5 field document is rejected (it is not this format)');

  report.test1_isLegacyBlobDoc = { v1: true, v2: true, v3: true, v4: true, null: false, empty: false, v5: false };
}

// ===========================================================================
// 2. v1 doc: plain balls, no sx/sy/sz, no ground, no seed
// ===========================================================================
section('2. v1 doc converts to one stamp per lobe, no pulls, seed defaults, ground null');
{
  const doc = {
    format: 'qlobe-clay-lobes',
    version: 1,
    lobes: [
      { id: 'lobe-1', kind: 'ball', x: 0.3, y: 0.4, z: 0, radius: 0.12, color: '#3fbf6f' },
      { id: 'lobe-2', kind: 'ball', x: 0.6, y: 0.5, z: 0.02, radius: 0.10, color: '#ff7314' },
    ],
  };
  const converted = legacyToOps(doc, { aspect: 1, viewScale: 1 });
  assert.ok(converted, 'v1 doc converts to a usable result');
  assert.equal(converted.seed, 1337, 'seed defaults to 1337 when the doc predates v3');
  assert.equal(converted.ground, null, 'ground is null when the doc predates v2');
  assert.equal(converted.ops.length, 2, 'exactly one op per lobe');
  for (const op of converted.ops) {
    assert.equal(op.t, 's', 'a v1 doc (no stretch vectors) produces only stamp ops');
    assert.equal(op.k, undefined, 'a converted stamp never carries the tray-ball tag');
  }

  report.test2_v1PlainBalls = {
    seed: converted.seed,
    ground: converted.ground,
    opCount: converted.ops.length,
    opTypes: converted.ops.map((o) => o.t),
  };
}

// ===========================================================================
// 3. v4 doc, a stretched lobe: stamp + pulls, step cap respected, exact sum
// ===========================================================================
section('3. v4 stretched lobe produces a stamp then pulls that respect the step cap and sum exactly');
{
  // Chosen so every intermediate number is exactly representable at 6
  // decimals (aspect 1, viewScale 1, radius 0.1, stretch 0.12 along board x
  // only) — the point of this test is the STEP-CAP and SUM arithmetic, not
  // whether 1e-6 quantisation of an arbitrary float behaves itself, which
  // test 4 below covers with its own tolerance instead.
  const doc = {
    format: 'qlobe-clay-lobes',
    version: 4,
    seed: 99,
    lobes: [
      { id: 'lobe-1', kind: 'ball', x: 0.5, y: 0.5, z: 0, radius: 0.1, color: '#3fbf6f', sx: 0.12, sy: 0, sz: 0 },
    ],
  };
  const converted = legacyToOps(doc, { aspect: 1, viewScale: 1 });
  assert.ok(converted, 'v4 stretched-lobe doc converts');
  assert.equal(converted.seed, 99);
  assert.equal(converted.ops[0].t, 's', 'first op is the stamp at the lobe base');

  const pulls = converted.ops.slice(1);
  assert.ok(pulls.length >= 1, 'at least one pull follows the stamp for a stretched lobe');
  for (const p of pulls) assert.equal(p.t, 'p', 'every op after the stamp is a pull');

  const brush = pulls[0].b;
  // THE LIVE CAP, read out of field.js rather than written down again here.
  // blob-legacy.js keeps its own copy of this number because it carries no
  // imports at all, and that copy went stale once: the engine's cap came down
  // when the pull falloff gained its palm, this converter kept measuring steps
  // against the old one, and field.pull() quietly shortened every one of them,
  // so legacy creatures rebuilt stubbier than they had been made. Nothing else
  // in the suite could have caught that, so it is pinned here.
  const capStep = brush * PULL_STEP_CAP;
  let maxStepLength = 0;
  for (const p of pulls) {
    const len = Math.hypot(p.dx, p.dy, p.dz);
    maxStepLength = Math.max(maxStepLength, len);
    assert.ok(len <= capStep + 1e-9, `pull step length ${len} must not exceed brush*PULL_STEP_CAP (${capStep})`);
    assert.equal(p.b, brush, 'every pull in one converted stretch shares the same brush');
  }

  const summed = pulls.reduce(
    (acc, p) => [acc[0] + p.dx, acc[1] + p.dy, acc[2] + p.dz],
    [0, 0, 0],
  );
  // Target: boardSx=0.12 -> worldSx = 0.12 * 2 * aspect * viewScale = 0.24;
  // sy/sz were 0, so their targets are 0.
  const target = [0.24, 0, 0];
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(summed[i] - target[i]) < 1e-6, `summed pull displacement axis ${i} (${summed[i]}) must match the stretch vector (${target[i]}) within 1e-6`);
  }

  // AND THE COUNT, which is what actually pins the two constants together. The
  // check above only catches a converter cap that is too BIG; a converter cap
  // that is too small chops the same stretch into more, shorter steps and sails
  // through it. The step count is exact either way.
  const summedLength = Math.hypot(summed[0], summed[1], summed[2]);
  const expectedSteps = Math.max(1, Math.ceil(summedLength / capStep));
  assert.equal(
    pulls.length, expectedSteps,
    `blob-legacy.js must chop a stretch with the SAME step cap field.js enforces: ${summedLength.toFixed(6)} of travel at a ${capStep.toFixed(6)} cap is ${expectedSteps} steps, got ${pulls.length}`,
  );

  report.test3_stretchedLobePulls = {
    stampOp: converted.ops[0],
    pullCount: pulls.length,
    expectedSteps,
    fieldPullStepCap: PULL_STEP_CAP,
    brush,
    capStep,
    maxStepLength,
    summedDisplacement: summed,
    targetDisplacement: target,
  };
}

// ===========================================================================
// 4. board -> world mapping is exact at two aspect/viewScale combinations
// ===========================================================================
section('4. board -> world mapping is exact at aspect 1.5 (viewScale 1/1.5) and aspect 0.7 (viewScale 1)');
{
  function stampFor(nx, ny, aspect, viewScale) {
    const doc = { format: 'qlobe-clay-lobes', version: 1, lobes: [{ id: 'lobe-1', x: nx, y: ny, radius: 0.05, color: '#3fbf6f' }] };
    return legacyToOps(doc, { aspect, viewScale }).ops[0];
  }

  const vsWide = 1 / 1.5;
  const centerWide = stampFor(0.5, 0.5, 1.5, vsWide);
  assert.ok(Math.abs(centerWide.x) < 1e-9, 'board centre x -> world 0 at aspect 1.5');
  assert.ok(Math.abs(centerWide.y) < 1e-9, 'board centre y -> world 0 at aspect 1.5');
  const cornerWide = stampFor(1, 0, 1.5, vsWide);
  assert.ok(Math.abs(cornerWide.x - 1.5 * vsWide) < 1e-6, 'board (1,0) x -> +aspect*viewScale at aspect 1.5');
  assert.ok(Math.abs(cornerWide.y - vsWide) < 1e-6, 'board (1,0) y -> +viewScale at aspect 1.5');

  const vsTall = 1;
  const centerTall = stampFor(0.5, 0.5, 0.7, vsTall);
  assert.ok(Math.abs(centerTall.x) < 1e-9, 'board centre x -> world 0 at aspect 0.7');
  assert.ok(Math.abs(centerTall.y) < 1e-9, 'board centre y -> world 0 at aspect 0.7');
  const cornerTall = stampFor(1, 0, 0.7, vsTall);
  assert.ok(Math.abs(cornerTall.x - 0.7 * vsTall) < 1e-6, 'board (1,0) x -> +aspect*viewScale at aspect 0.7');
  assert.ok(Math.abs(cornerTall.y - vsTall) < 1e-6, 'board (1,0) y -> +viewScale at aspect 0.7');

  report.test4_boardToWorldMapping = {
    aspect1_5: { viewScale: vsWide, center: [centerWide.x, centerWide.y], corner: [cornerWide.x, cornerWide.y] },
    aspect0_7: { viewScale: vsTall, center: [centerTall.x, centerTall.y], corner: [cornerTall.x, cornerTall.y] },
  };
}

// ===========================================================================
// 5. ground round-trips
// ===========================================================================
section('5. ground round-trips: board 0.85 at viewScale 1 -> world y -0.7');
{
  const doc = { format: 'qlobe-clay-lobes', version: 2, ground: 0.85, lobes: [] };
  const converted = legacyToOps(doc, { aspect: 1, viewScale: 1 });
  assert.ok(converted, 'a ground-only doc converts');
  assert.ok(Math.abs(converted.ground - -0.7) < 1e-6, `board ground 0.85 must map to world y -0.7 (got ${converted.ground})`);

  report.test5_groundRoundTrip = { boardGround: 0.85, viewScale: 1, worldGround: converted.ground };
}

// ===========================================================================
// 6. end-to-end: the converted ops replay into a real, bit-identical field
// ===========================================================================
section('6. converted ops replay through field.js into a non-empty, in-bounds, bit-identical field');
{
  const doc = {
    format: 'qlobe-clay-lobes',
    version: 4,
    seed: 555,
    ground: 0.82,
    lobes: [
      { id: 'lobe-1', kind: 'ball', x: 0.45, y: 0.55, z: 0, radius: 0.14, color: '#3fbf6f' },
      { id: 'lobe-2', kind: 'ball', x: 0.6, y: 0.45, z: 0.02, radius: 0.10, color: '#ff7314', sx: 0.08, sy: 0.03, sz: 0 },
    ],
  };
  const converted = legacyToOps(doc, { aspect: 1, viewScale: 1 });
  assert.ok(converted, 'a two-lobe v4 doc with one stretched lobe converts');

  const envelope = {
    format: DOC_FORMAT,
    version: DOC_VERSION,
    seed: converted.seed,
    ground: converted.ground,
    ops: converted.ops,
  };

  const fieldA = createFieldFromDocument(envelope);
  assert.ok(fieldA, 'createFieldFromDocument builds a real field from the converted ops');

  const vol = fieldA.volume();
  assert.ok(vol > 0, 'the converted creature has positive volume');

  const bounds = fieldA.bounds();
  assert.ok(bounds, 'the converted creature has non-null bounds');
  const half = fieldA.size / 2;
  const coords = [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ];
  const insideCube = coords.every((c) => Math.abs(c) < half);
  assert.ok(insideCube, `all material must sit inside the field's own cube (half=${half}); bounds were ${JSON.stringify(bounds)}`);

  // Same seed, same ops, freshly built: field.js's quantise-then-execute (q6)
  // is what makes this bit-exact rather than merely close (see field.js's own
  // replay-determinism test, which this mirrors for a CONVERTED creature).
  const fieldB = createFieldFromDocument(envelope);
  let distDiff = 0;
  for (let i = 0; i < fieldA.dist.length; i++) if (fieldA.dist[i] !== fieldB.dist[i]) distDiff++;
  assert.equal(distDiff, 0, 'replaying the same converted ops twice must give a bit-identical dist array');

  report.test6_endToEndField = {
    opCount: converted.ops.length,
    volume: vol,
    bounds,
    fieldCubeHalfSize: half,
    distDiffBetweenTwoReplays: distDiff,
  };
}

// ===========================================================================
// 7. corrupt input handling — one lost shelf card, never a crashed shelf
// ===========================================================================
section('7. empty lobes array and corrupt lobe entries never throw');
{
  const emptyDoc = { format: 'qlobe-clay-lobes', version: 1, lobes: [] };
  const convertedEmpty = legacyToOps(emptyDoc, { aspect: 1, viewScale: 1 });
  assert.ok(convertedEmpty, 'a doc with an empty lobes array converts');
  assert.deepEqual(convertedEmpty.ops, [], 'an empty lobes array yields an empty ops array, not null');

  const corruptDoc = {
    format: 'qlobe-clay-lobes',
    version: 2,
    lobes: [
      { id: 'lobe-1' }, // missing x, y, z, radius, color entirely
      { id: 'lobe-2', x: 0.4, y: 0.4, radius: 'not-a-number', color: 12345 },
      null, // a genuinely broken array entry
    ],
  };
  let converted = null;
  assert.doesNotThrow(() => { converted = legacyToOps(corruptDoc, { aspect: 1, viewScale: 1 }); }, 'a corrupt lobe entry must not throw');
  assert.ok(converted, 'a corrupt doc still returns a usable conversion');
  assert.equal(converted.ops.length, 2, 'the two malformed-but-object lobes each still produce a stamp; the null entry is skipped');
  for (const op of converted.ops) {
    assert.equal(op.t, 's');
    assert.ok(Number.isFinite(op.r) && op.r > 0, 'a missing/garbage radius falls back to a sane positive default');
    assert.ok(/^#[0-9a-f]{6}$/.test(op.c), 'a missing/garbage color falls back to a sane hex default');
  }

  report.test7_corruptInputsNeverThrow = {
    emptyOpsLength: convertedEmpty.ops.length,
    corruptOpsLength: converted.ops.length,
    corruptSampleOps: converted.ops,
  };
}

// ---------------------------------------------------------------------------
console.log('\n=== summary ===');
console.log(JSON.stringify(report, null, 2));
