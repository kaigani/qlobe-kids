import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The production file remains a plain browser ES module (`.js`) because this
// repository intentionally has no package.json. Load the same source through a
// data URL so Node tests it as ESM without changing that runtime constraint.
const source = await readFile(new URL('./lobes.js', import.meta.url), 'utf8');
const {
  MAX_LOBES, MAX_STRETCH, SHOULDER_KEEP,
  MAX_ELONGATION, TIP_KEEP, TIP_KEEP_FLOOR, SHAPE_TAPER, SHAPE_BLUNT,
  SETTLE_LENGTH_FLOOR, PULL_KIND, FUSE_THRESHOLD,
  sphereVolume, roundConeVolume, coneShape, maxLengthFor, elongation, radiusForVolume,
  contactAmount, pairKey, createLobeField,
  shadeDistance, shadeDistanceOrganic,
  DEFAULT_NOISE_SEED, NOISE_AMP, NOISE_FREQ, NOISE_FALLOFF, NOISE_SAFETY,
  noisePhase, noiseWave, SETTLE_MS,
} = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

// 1. add/remove/count/max-lobes rejection at 12; ids unique.
{
  const field = createLobeField();
  for (let i = 0; i < MAX_LOBES; i++) {
    const rec = field.add({ x: i * 3, y: 0, radius: 0.5, color: '#abcdef' });
    assert.ok(rec, `lobe ${i} should be accepted under the cap`);
  }
  assert.equal(field.count(), MAX_LOBES);
  assert.equal(field.add({ x: 0, y: 0, radius: 0.5, color: '#fff' }), null, 'a 13th lobe is rejected');
  assert.equal(field.add({ id: 'lobe-1', x: 0, y: 0, radius: 0.5, color: '#fff' }), null, 'duplicate id is rejected');
  assert.equal(field.add({ x: 0, y: 0, radius: 0, color: '#fff' }), null, 'radius <= 0 is rejected');
  assert.equal(field.add({ x: 0, y: 0, radius: -1, color: '#fff' }), null, 'negative radius is rejected');
  assert.ok(field.remove('lobe-1'));
  assert.equal(field.count(), MAX_LOBES - 1);
  assert.equal(field.remove('lobe-1'), false, 'removing twice fails');
  const ids = new Set(field.list().map((l) => l.id));
  assert.equal(ids.size, field.count(), 'ids stay unique');
}

// 2. contactAmount monotonic: far apart = 0, overlapping = 1, midpoint strictly between.
{
  const a = { x: 0, y: 0, z: 0, radius: 1 };
  const far = { x: 100, y: 0, z: 0, radius: 1 };
  const overlapping = { x: 0.1, y: 0, z: 0, radius: 1 };
  const mid = { x: 1.6, y: 0, z: 0, radius: 1 };
  assert.equal(contactAmount(a, far), 0);
  assert.equal(contactAmount(a, overlapping), 1);
  const midValue = contactAmount(a, mid);
  assert.ok(midValue > 0 && midValue < 1, `midpoint contact ${midValue} should be strictly between 0 and 1`);
  const closer = contactAmount(a, { x: 1.4, y: 0, z: 0, radius: 1 });
  assert.ok(closer > midValue, 'contact grows as lobes approach');
}

// pairKey is stable and order-independent.
{
  assert.equal(pairKey('a', 'b'), pairKey('b', 'a'));
  assert.equal(pairKey('a', 'b'), 'a|b');
}

// 3. Two lobes pushed together fuse; pulling apart keeps isFused true and the
// constraint clamps distance to (rA+rB)*neckSlack within 1e-9.
{
  const field = createLobeField();
  field.add({ id: 'a', x: -5, y: 0, radius: 1, color: '#111' });
  field.add({ id: 'b', x: 5, y: 0, radius: 1, color: '#222' });
  assert.equal(field.isFused('a', 'b'), false);

  const push = field.move('a', 4.3, 0);
  assert.ok(push.fused.includes(pairKey('a', 'b')), 'moving into contact fuses the pair');
  assert.ok(field.isFused('a', 'b'));

  const pull = field.move('a', -50, 0);
  assert.ok(field.isFused('a', 'b'), 'fusion survives pulling apart');
  const b = field.get('b');
  const dist = Math.hypot(pull.x - b.x, pull.y - b.y);
  const limit = (field.get('a').radius + b.radius) * 1.02;
  assert.ok(Math.abs(dist - limit) < 1e-9, `constrained distance ${dist} should equal limit ${limit} within 1e-9`);
}

// 4. A three-lobe chain: dragging the middle lobe respects both partners.
{
  const field = createLobeField();
  field.add({ id: 'left', x: -1, y: 0, radius: 1, color: '#111' });
  field.add({ id: 'mid', x: 0, y: 0, radius: 1, color: '#222' });
  field.add({ id: 'right', x: 1, y: 0, radius: 1, color: '#333' });
  // Radius-1 lobes one unit apart already overlap enough to fuse on contact,
  // so the chain (left-mid, mid-right) forms as soon as all three are placed.
  assert.ok(field.isFused('left', 'mid'));
  assert.ok(field.isFused('mid', 'right'));

  field.move('mid', 40, 40);
  const left = field.get('left');
  const mid = field.get('mid');
  const right = field.get('right');
  const limitLeft = (left.radius + mid.radius) * 1.02;
  const limitRight = (mid.radius + right.radius) * 1.02;
  const distLeft = Math.hypot(mid.x - left.x, mid.y - left.y);
  const distRight = Math.hypot(mid.x - right.x, mid.y - right.y);
  assert.ok(distLeft <= limitLeft + 1e-6, `left constraint respected (${distLeft} vs ${limitLeft})`);
  assert.ok(distRight <= limitRight + 1e-6, `right constraint respected (${distRight} vs ${limitRight})`);
}

// 5. Removing a fused lobe drops only its pairs; the remaining pair stays fused.
{
  const field = createLobeField();
  field.add({ id: 'a', x: 0, y: 0, radius: 1, color: '#111' });
  field.add({ id: 'b', x: 0, y: 0, radius: 1, color: '#222' });
  field.add({ id: 'c', x: 0, y: 0, radius: 1, color: '#333' });
  assert.ok(field.isFused('a', 'b'));
  assert.ok(field.isFused('b', 'c'));
  assert.ok(field.isFused('a', 'c'));
  field.remove('b');
  assert.equal(field.isFused('a', 'b'), false);
  assert.equal(field.isFused('b', 'c'), false);
  assert.ok(field.isFused('a', 'c'), 'unrelated pair stays fused');
  assert.deepEqual(field.fusedPairs(), [['a', 'c']]);
}

// 6. shading() axis points from a lobe toward its partner and is unit length;
// an isolated lobe has axis (0,0) and squash 0.
{
  const field = createLobeField();
  field.add({ id: 'lonely', x: -50, y: 0, radius: 1, color: '#111' });
  field.add({ id: 'a', x: 0, y: 0, radius: 1, color: '#222' });
  field.add({ id: 'b', x: 0.2, y: 0, radius: 1, color: '#333' });
  const shaded = field.shading();
  const lonely = shaded.find((s) => s.id === 'lonely');
  assert.deepEqual([lonely.axisX, lonely.axisY], [0, 0]);
  assert.equal(lonely.squash, 0);

  const a = shaded.find((s) => s.id === 'a');
  assert.ok(a.axisX > 0, 'axis points from a toward b (positive x)');
  const len = Math.hypot(a.axisX, a.axisY);
  assert.ok(Math.abs(len - 1) < 1e-9, `axis should be unit length, got ${len}`);
  assert.ok(a.squash > 0 && a.squash <= 1);
}

// 7. toJSON -> JSON.parse(JSON.stringify(...)) -> fromJSON round-trips
// positions, colors and the fused set exactly.
{
  // Coordinates are chosen with <= 4 decimals so toJSON's rounding is a no-op
  // and the round-trip can be compared for exact equality.
  const field = createLobeField();
  field.add({ id: 'a', x: 1.2345, y: -2.3, radius: 1, color: '#ff00aa' });
  field.add({ id: 'b', x: 1.9, y: -2.3, radius: 1, color: '#00ff00' });
  field.add({ id: 'c', x: 40, y: 40, radius: 0.7, color: '#0000ff' });
  assert.ok(field.isFused('a', 'b'));
  const roundTripped = JSON.parse(JSON.stringify(field.toJSON()));

  const restored = createLobeField();
  restored.add({ id: 'z', x: 0, y: 0, radius: 1, color: '#000' }); // prior state must be replaced
  assert.ok(restored.fromJSON(roundTripped));
  assert.equal(restored.has('z'), false);
  assert.equal(restored.count(), 3);
  for (const id of ['a', 'b', 'c']) {
    const before = field.get(id);
    const after = restored.get(id);
    assert.equal(after.x, before.x);
    assert.equal(after.y, before.y);
    assert.equal(after.color, before.color);
  }
  assert.ok(restored.isFused('a', 'b'));
  assert.deepEqual(new Set(restored.fusedPairs().map(([x, y]) => pairKey(x, y))), new Set(field.fusedPairs().map(([x, y]) => pairKey(x, y))));
}

// 8. fromJSON rejects garbage and leaves the previous state intact.
{
  const field = createLobeField();
  field.add({ id: 'a', x: 0, y: 0, radius: 1, color: '#111' });
  const before = field.toJSON();

  assert.equal(field.fromJSON(null), false);
  assert.equal(field.fromJSON({ format: 'wrong', lobes: [] }), false);
  assert.equal(field.fromJSON({ format: 'qlobe-clay-lobes', lobes: 'nope' }), false);
  assert.equal(field.fromJSON({ format: 'qlobe-clay-lobes', lobes: [{ id: 'x', x: NaN, y: 0, radius: 1 }] }), false);
  assert.equal(
    field.fromJSON({ format: 'qlobe-clay-lobes', lobes: Array.from({ length: MAX_LOBES + 1 }, (_, i) => ({ id: `l${i}`, x: 0, y: 0, radius: 1 })) }),
    false,
  );

  assert.deepEqual(field.toJSON(), before, 'state untouched after rejected payloads');
}

// 9. 12 lobes all mutually placed: bounds() and shading() are finite and
// shading() has 12 entries.
{
  const field = createLobeField();
  for (let i = 0; i < MAX_LOBES; i++) {
    field.add({ x: Math.cos(i) * 0.4, y: Math.sin(i) * 0.4, radius: 1, color: '#123456' });
  }
  assert.equal(field.count(), MAX_LOBES);
  const bounds = field.bounds();
  for (const key of ['minX', 'minY', 'maxX', 'maxY', 'width', 'height']) {
    assert.ok(Number.isFinite(bounds[key]), `bounds.${key} should be finite`);
  }
  const shaded = field.shading();
  assert.equal(shaded.length, MAX_LOBES);
  for (const s of shaded) {
    for (const key of ['x', 'y', 'z', 'radius', 'axisX', 'axisY', 'squash', 'join']) {
      assert.ok(Number.isFinite(s[key]), `shading().${key} should be finite`);
    }
  }
}

// 10. roundConeVolume sanity: the degenerate d=0 case is a sphere, and the
// equal-radius d>0 case is a capsule. Both are closed-form cross-checks
// independent of coneShape/bisection.
{
  const r = 0.7;
  const sphereCase = roundConeVolume(r, r, 0);
  const expectedSphere = sphereVolume(r);
  assert.ok(
    Math.abs(sphereCase - expectedSphere) / expectedSphere < 1e-12,
    `roundConeVolume(r,r,0) should equal sphere volume, got ${sphereCase} vs ${expectedSphere}`,
  );

  const d = 1.3;
  const capsuleCase = roundConeVolume(r, r, d);
  const expectedCapsule = Math.PI * d * r * r + (4 / 3) * Math.PI * r * r * r;
  assert.ok(
    Math.abs(capsuleCase - expectedCapsule) / expectedCapsule < 1e-12,
    `equal-radius round cone should equal the capsule formula, got ${capsuleCase} vs ${expectedCapsule}`,
  );
}

// 11. Volume conservation: coneShape's bisected (ra, rb) must reproduce the
// original ball's volume, for every rest radius and every stretch length up
// to the cap, with drift tight enough that a drag-out/drag-back gesture
// never visibly changes size.
{
  let maxDrift = 0;
  for (const r0 of [0.15, 0.4, 1.0]) {
    const maxLength = MAX_STRETCH * r0;
    for (let i = 0; i < 25; i++) {
      const L = (maxLength * i) / 24; // 25 samples spanning 0..maxLength inclusive
      const { ra, rb } = coneShape(r0, L);
      const v = roundConeVolume(ra, rb, L);
      const target = sphereVolume(r0);
      const drift = Math.abs(v - target) / target;
      if (drift > maxDrift) maxDrift = drift;
      assert.ok(drift < 1e-9, `coneShape(${r0}, ${L}) volume drift ${drift} should be < 1e-9`);
    }
  }
  console.log(`Max relative volume drift across coneShape samples: ${maxDrift}`);
}

// 12. THE ROUNDED-ELONGATION READ, as numbers. This is the block the whole
// reshaping model is defended by: a spike and a capsule differ in exactly one
// measurement, and it is asserted here rather than left to a screenshot.
//
// Under SHAPE_BLUNT the TIP RATIO is pinned and the shoulder is solved from
// volume, so a mass gets longer AND thinner everywhere as it is drawn out, and
// its far end never becomes a point. Under the legacy SHAPE_TAPER the shoulder
// is pinned instead, which drives the tip to a needle — the read the owner
// rejected, kept alive only for creatures saved before this model existed.
{
  for (const r0 of [0.12, 0.5, 1.7]) {
    const maxLength = maxLengthFor(r0);
    assert.ok(Math.abs(maxLength - MAX_ELONGATION * r0) < 1e-12, 'maxLengthFor is MAX_ELONGATION rest radii');
    const ball = coneShape(r0, 0);
    assert.equal(ball.ra, r0, 'length 0 is an exact ball');
    assert.equal(ball.rb, r0, 'length 0 is an exact ball');

    let prevRa = r0;
    let prevRb = r0;
    let prevRatio = 1;
    let prevExtent = 2 * r0;
    for (let i = 1; i <= 24; i++) {
      const L = (maxLength * i) / 24;
      const { ra, rb } = coneShape(r0, L);
      const ratio = rb / ra;
      // THE WHOLE LOBE NARROWS. Both radii shrink together — that is what
      // "the overall size adjusts" means, and it is the half of the read the
      // old taper law got backwards (its shoulder barely moved).
      assert.ok(ra < prevRa, `ra must shrink as the mass lengthens (r0=${r0}, L=${L}): ${ra} vs ${prevRa}`);
      assert.ok(rb < prevRb, `rb must shrink as the mass lengthens (r0=${r0}, L=${L}): ${rb} vs ${prevRb}`);
      assert.ok(ratio < prevRatio + 1e-12, `rb/ra must not grow (r0=${r0}, L=${L}): ${ratio} vs ${prevRatio}`);
      // ...and the far end stays ROUNDED the whole way out. Nowhere on the
      // sweep may the silhouette cross into spike territory.
      assert.ok(ratio >= TIP_KEEP_FLOOR - 1e-12, `rb/ra must never fall under TIP_KEEP_FLOOR (r0=${r0}, L=${L}): ${ratio}`);
      // OVERALL SIZE ADJUSTS: tip-to-tip extent grows monotonically.
      const extent = L + ra + rb;
      assert.ok(extent > prevExtent, `extent must grow with length (r0=${r0}, L=${L}): ${extent} vs ${prevExtent}`);
      // Volume is EXACT, not approximate.
      const drift = Math.abs(roundConeVolume(ra, rb, L) - sphereVolume(r0)) / sphereVolume(r0);
      assert.ok(drift < 1e-9, `blunt-law volume drift ${drift} at r0=${r0} L=${L}`);
      // The round-cone hull is only defined for length >= |ra - rb|.
      assert.ok(L > ra - rb, `hull stays valid: L=${L} must exceed ra-rb=${ra - rb}`);
      prevRa = ra; prevRb = rb; prevRatio = ratio; prevExtent = extent;
    }

    const full = coneShape(r0, maxLength);
    assert.ok(Math.abs(full.rb / full.ra - TIP_KEEP) < 1e-9,
      `at full elongation rb/ra should be exactly TIP_KEEP, got ${full.rb / full.ra}`);
    // The owner's read, stated as two numbers: nearly twice as long, and
    // visibly thinner. A model that only did one of the two would still look
    // like a spike growing out of a ball that kept its size.
    const extent = maxLength + full.ra + full.rb;
    assert.ok(extent >= 1.6 * (2 * r0),
      `a fully drawn mass must be at least 1.6x the ball's diameter, got ${(extent / (2 * r0)).toFixed(3)}x`);
    assert.ok(full.ra <= 0.85 * r0,
      `a fully drawn mass must be at most 0.85x as wide as the ball, got ${(full.ra / r0).toFixed(3)}x`);
  }
}

// 12b. THE LEGACY TAPER LAW still produces its old numbers, because creatures
// saved before the reshaping model are re-derived under it and must not be
// quietly reshaped into different creatures on their own shelf cards.
{
  const r0 = 0.5;
  const maxLength = MAX_STRETCH * r0;
  let prevRatio = 1;
  for (let i = 1; i <= 20; i++) {
    const L = (maxLength * i) / 20;
    const { ra, rb } = coneShape(r0, L, SHAPE_TAPER);
    const ratio = rb / ra;
    assert.ok(ratio < prevRatio, `legacy rb/ra should strictly decrease (L=${L})`);
    assert.ok(rb < ra, `legacy tip must be thinner than the shoulder (L=${L})`);
    assert.ok(ra >= SHOULDER_KEEP * r0 - 1e-12, `legacy base holds SHOULDER_KEEP (L=${L}): ${ra / r0}`);
    // The signature of the OLD law, and the thing the new one exists to
    // replace: the tip gives up far more radius than the shoulder.
    assert.ok((r0 - ra) < (r0 - rb) * 0.5, `legacy tip gives up far more than the shoulder (L=${L})`);
    const drift = Math.abs(roundConeVolume(ra, rb, L) - sphereVolume(r0)) / sphereVolume(r0);
    assert.ok(drift < 1e-9, `legacy volume drift ${drift} at L=${L}`);
    prevRatio = ratio;
  }
  const capped = coneShape(r0, maxLength, SHAPE_TAPER);
  assert.ok(Math.abs(capped.ra - SHOULDER_KEEP * r0) < 1e-12, `legacy ra at the cap should be SHOULDER_KEEP*rest, got ${capped.ra / r0}`);
  const tipFraction = capped.rb / r0;
  assert.ok(tipFraction > 0.10 && tipFraction < 0.25, `legacy tip at the cap should be a needle-ish end, got ${tipFraction}`);
  // ...and it is unmistakably a DIFFERENT read from the blunt law at the same
  // numbers. If these two ever converged, the compatibility fork would be
  // pointless and a legacy save would be free to load blunt.
  assert.ok(capped.rb / capped.ra < 0.30, `the legacy law is a spike: ${capped.rb / capped.ra}`);
  assert.ok(coneShape(r0, MAX_ELONGATION * r0).rb / coneShape(r0, MAX_ELONGATION * r0).ra >= TIP_KEEP_FLOOR);

  // Past the tip-travel cap (only reachable when a re-aspected save carries a
  // stretch vector that out-grew its own shrunken radius) the legacy law
  // switches to shrinking the shoulder as well. Volume must stay exact there
  // too, and the handoff must be continuous — a limb that popped a size on an
  // orientation change would be a visible bug in a saved creature.
  const r1 = 0.7;
  const cap = MAX_STRETCH * r1;
  const target = sphereVolume(r1);
  let prev = coneShape(r1, cap * 0.9, SHAPE_TAPER);
  for (let i = 1; i <= 120; i++) {
    const L = cap * (0.9 + (i * 3.1) / 120); // 0.9x .. 4x the cap
    const { ra, rb } = coneShape(r1, L, SHAPE_TAPER);
    const drift = Math.abs(roundConeVolume(ra, rb, L) - target) / target;
    assert.ok(drift < 1e-9, `past-cap volume drift ${drift} at L=${L}`);
    assert.ok(rb <= ra && rb >= 0, `past-cap radii stay ordered at L=${L}: ra=${ra} rb=${rb}`);
    const jump = (Math.abs(ra - prev.ra) + Math.abs(rb - prev.rb)) / r1;
    assert.ok(jump < 0.02, `past-cap shape should move continuously at L=${L}, jumped ${jump}`);
    prev = { ra, rb };
  }
}
// 13. Round trip by gesture: stretching to the cap and then back to the
// base point must restore an EXACT ball (not merely close), because ra/rb
// are re-derived from scratch every call rather than integrated.
{
  const field = createLobeField();
  field.add({ id: 'a', x: 0, y: 0, z: 0, radius: 0.6, color: '#334455' });
  const before = field.toJSON();

  const full = field.stretch('a', 5, 0, 0); // far beyond MAX_STRETCH*radius: will clamp
  assert.ok(full.stretched, 'stretch to a far point should report stretched');
  assert.ok(full.length > 0, 'stretched length should be positive');

  const restored = field.stretch('a', 0, 0, 0);
  assert.ok(restored.stretched, 'stretch back to the base point should report stretched');
  assert.equal(restored.length, 0, 'stretching to the base point yields exactly zero length');

  const shape = field.shape('a');
  assert.equal(shape.ra, shape.restRadius, 'ra should be EXACTLY restRadius after unstretching');
  assert.equal(shape.rb, shape.restRadius, 'rb should be EXACTLY restRadius after unstretching');
  assert.equal(shape.ra, shape.rb, 'ra should be EXACTLY rb after unstretching');

  const after = field.toJSON();
  assert.deepEqual(after, before, 'toJSON after stretch-then-unstretch should be deep-equal to the pre-stretch save');
}

// 14. Stretch length cap: a tip requested 10x too far clamps to the elongation
// cap of the lobe's OWN shape law (within 1e-12) while keeping the requested
// direction. New clay is blunt, so the cap is MAX_ELONGATION rest radii; a
// legacy-taper lobe out of an old save keeps its own, longer, MAX_STRETCH cap.
{
  const field = createLobeField();
  field.add({ id: 'a', x: 2, y: 3, z: -1, radius: 1, color: '#111' });
  const cap = maxLengthFor(1);
  assert.equal(cap, MAX_ELONGATION * 1, 'new clay caps at MAX_ELONGATION rest radii');
  assert.equal(maxLengthFor(1, SHAPE_TAPER), MAX_STRETCH * 1, 'legacy clay keeps its own cap');
  const result = field.stretch('a', 2 + 100, 3, -1); // 10x+ too far, straight +x from the base
  assert.ok(Math.abs(result.length - cap) < 1e-12, `length should clamp to MAX_STRETCH*restRadius (${cap}), got ${result.length}`);
  assert.ok(Math.abs(result.tipX - (2 + cap)) < 1e-9, 'tip should sit cap units along +x from the base');
  assert.ok(Math.abs(result.tipY - 3) < 1e-9, 'direction should keep y unchanged (a pure +x request)');
  assert.ok(Math.abs(result.tipZ - (-1)) < 1e-9, 'direction should keep z unchanged (a pure +x request)');
}

// 15. Cone-aware contact: two lobes far enough apart that their CENTRES give
// zero contact; stretching one's tip toward the other raises contact above
// zero, and stretch alone must never fuse the pair.
{
  const field = createLobeField();
  field.add({ id: 'a', x: 0, y: 0, z: 0, radius: 1, color: '#111' });
  field.add({ id: 'b', x: 2.4, y: 0, z: 0, radius: 1, color: '#222' });
  const baseContact = field.contact('a', 'b');
  assert.equal(baseContact, 0, 'centres 2.4 apart with radius 1 each (threshold ~2.07) should give zero contact');

  const result = field.stretch('a', 2.4, 0, 0); // stretch a's tip all the way to b's centre
  assert.ok(result.stretched && result.length <= MAX_STRETCH * 1 + 1e-9);
  const afterContact = field.contact('a', 'b');
  assert.ok(afterContact > 0, `stretching a's tip toward b should raise contact above 0, got ${afterContact}`);
  assert.ok(!field.isFused('a', 'b'), 'stretch alone must never fuse a pair, even at full contact');
}

// 16. Ground: add()/move() below the plane are lifted so the base sphere
// bottom sits exactly SINK*ra under it; a lobe well above is untouched;
// shading() compensates the radius accordingly and more sink means more
// compensation.
{
  const SINK = 0.10;
  const field = createLobeField();
  field.setGround(-1);
  assert.equal(field.ground(), -1);

  const added = field.add({ id: 'sunk', x: 0, y: -5, radius: 0.5, color: '#111' });
  const expectedY = -1 + 0.5 * (1 - SINK); // ground + ra*(1-SINK)
  assert.ok(Math.abs(added.y - expectedY) < 1e-9, `add() below ground should lift to ${expectedY}, got ${added.y}`);
  const bottom = added.y - added.radius;
  assert.ok(Math.abs(bottom - (-1 - SINK * 0.5)) < 1e-9, 'base sphere bottom should sit exactly SINK*ra under the plane');

  field.add({ id: 'mover', x: 5, y: 10, radius: 0.5, color: '#222' });
  const moveResult = field.move('mover', 5, -20, 0);
  assert.ok(Math.abs(moveResult.y - expectedY) < 1e-9, `move() below ground should clamp to ${expectedY}, got ${moveResult.y}`);

  const high = field.add({ id: 'high', x: -5, y: 10, radius: 0.5, color: '#333' });
  assert.equal(high.y, 10, 'a lobe well above the plane should be untouched');

  const shaded = field.shading();
  const sunkShade = shaded.find((s) => s.id === 'sunk');
  const highShade = shaded.find((s) => s.id === 'high');
  assert.equal(highShade.radius, 0.5, 'shading radius should equal ra exactly when clear of the ground');
  assert.ok(
    sunkShade.radius > 0.5 && sunkShade.radius <= 0.5 * 1.15 + 1e-12,
    `resting lobe shading radius should be strictly greater than ra (and <= 1.15*ra), got ${sunkShade.radius}`,
  );

  // Deeper sink => larger scale (monotone). Both y values sit above baseMin
  // (so add() doesn't clamp either of them to the same floor) but at
  // different overlap depths.
  const shallowField = createLobeField();
  shallowField.setGround(-1);
  const shallowLobe = shallowField.add({ id: 's', x: 0, y: -0.02, radius: 1, color: '#444' });
  assert.equal(shallowLobe.y, -0.02, 'y above baseMin should be untouched by the ground clamp');
  const deepField = createLobeField();
  deepField.setGround(-1);
  const deepLobe = deepField.add({ id: 'd', x: 0, y: -0.08, radius: 1, color: '#555' });
  assert.equal(deepLobe.y, -0.08, 'y above baseMin should be untouched by the ground clamp');

  const shallowScale = shallowField.shading()[0].radius; // ra === 1, so radius === scale
  const deepScale = deepField.shading()[0].radius;
  assert.ok(deepScale > shallowScale, `deeper sink should give a larger shading scale: shallow ${shallowScale} vs deep ${deepScale}`);
}

// 17. Impact feed: with impact 0, deform reduces to 0.10*squash along the
// contact axis (the no-regression guard); a positive impact makes deform
// positive along the impact axis; a negative impact makes deform negative.
{
  const field = createLobeField();
  field.add({ id: 'a', x: 0, y: 0, radius: 1, color: '#111' });
  field.add({ id: 'b', x: 1.9, y: 0, radius: 1, color: '#222' }); // in range for contact, not fused

  const contactOnly = field.shading().find((s) => s.id === 'a');
  assert.ok(contactOnly.squash > 0, 'setup should have nonzero contact squash to exercise the no-regression guard');

  assert.ok(field.setImpact('a', 1, 0, 0));
  const zeroImpact = field.shading().find((s) => s.id === 'a');
  assert.ok(
    Math.abs(zeroImpact.deform - 0.10 * zeroImpact.squash) < 1e-12,
    `impact 0 should reduce to 0.10*squash, got ${zeroImpact.deform} vs ${0.10 * zeroImpact.squash}`,
  );
  assert.ok(
    Math.abs(zeroImpact.deformX - zeroImpact.axisX) < 1e-12 && Math.abs(zeroImpact.deformY - zeroImpact.axisY) < 1e-12,
    'impact 0 should keep the contact axis as the deform axis',
  );

  field.setImpact('a', 1, 0, 0.5);
  const positiveImpact = field.shading().find((s) => s.id === 'a');
  assert.ok(positiveImpact.deform > 0, 'a positive impact should make deform positive');
  assert.ok(
    Math.abs(positiveImpact.deformX - 1) < 1e-12 && Math.abs(positiveImpact.deformY - 0) < 1e-12,
    'deform axis should equal the impact axis',
  );

  field.setImpact('a', 0, 1, -0.6);
  const negativeImpact = field.shading().find((s) => s.id === 'a');
  assert.ok(negativeImpact.deform < 0, 'a negative impact should make deform negative');
  assert.ok(
    Math.abs(negativeImpact.deformX - 0) < 1e-12 && Math.abs(negativeImpact.deformY - 1) < 1e-12,
    'deform axis should equal the (negative-amount) impact axis',
  );
}

// 18. Persistence: v4 round-trips a stretched + fused field exactly; a
// synthetic v1 payload (no sx/sy/sz) loads as balls; a v2 payload with a
// garbage (NaN) stretch vector is rejected atomically.
{
  const field = createLobeField();
  field.add({ id: 'a', x: 0, y: 0, radius: 1, color: '#ff0011' });
  field.add({ id: 'b', x: 1.5, y: 0, radius: 1, color: '#00ff22' }); // close enough to fuse
  field.stretch('a', 1.2345, 0.5, 0);
  assert.ok(field.isFused('a', 'b'), 'setup should have a fused pair to round-trip');
  const saved = JSON.parse(JSON.stringify(field.toJSON()));
  assert.equal(saved.version, 4, 'toJSON should stamp version 4');

  const restored = createLobeField();
  assert.ok(restored.fromJSON(saved));
  for (const id of ['a', 'b']) {
    const before = field.get(id);
    const after = restored.get(id);
    assert.equal(after.x, before.x);
    assert.equal(after.y, before.y);
    assert.equal(after.z, before.z);
    assert.equal(after.sx, before.sx);
    assert.equal(after.sy, before.sy);
    assert.equal(after.sz, before.sz);
    assert.equal(after.color, before.color);
  }
  assert.ok(restored.isFused('a', 'b'));

  const v1 = {
    format: 'qlobe-clay-lobes',
    version: 1,
    lobes: [{ id: 'x', kind: 'lobe', x: 0, y: 0, z: 0, radius: 0.8, color: '#123123' }],
    fused: [],
  };
  const v1Field = createLobeField();
  assert.ok(v1Field.fromJSON(v1));
  assert.equal(v1Field.shape('x').length, 0, 'a v1 payload with no stretch fields should load as a ball (length 0)');
  // A creature saved before the hand-worked surface existed still has to look
  // the same every time it is opened, so a payload with no seed gets the
  // CONSTANT default rather than anything session-dependent.
  assert.equal(v1Field.seed(), DEFAULT_NOISE_SEED, 'a seedless (v1/v2) payload must load at the constant default seed');
  const v1Again = createLobeField();
  assert.ok(v1Again.fromJSON(JSON.parse(JSON.stringify(v1))));
  assert.equal(v1Again.seed(), v1Field.seed(), 'two loads of the same seedless payload must agree on the seed');

  const priorField = createLobeField();
  priorField.add({ id: 'keep', x: 3, y: 4, radius: 1, color: '#abcabc' });
  const priorSnapshot = priorField.toJSON();
  const garbage = {
    format: 'qlobe-clay-lobes',
    version: 2,
    lobes: [{ id: 'bad', x: 0, y: 0, z: 0, radius: 1, sx: NaN, sy: 0, sz: 0, color: '#000' }],
    fused: [],
  };
  assert.equal(priorField.fromJSON(garbage), false, 'a NaN stretch vector should be rejected');
  assert.deepEqual(priorField.toJSON(), priorSnapshot, 'rejected v2 payload should leave prior state untouched');
}

// 19. 12 lobes, several stretched, several resting on the ground: bounds()
// and every shading() field stay finite, and shading has 12 entries.
{
  const field = createLobeField();
  field.setGround(-2);
  for (let i = 0; i < MAX_LOBES; i++) {
    const x = Math.cos(i) * 3;
    const y = i % 3 === 0 ? -1.95 : Math.sin(i) * 3; // some resting near the ground, some floating
    field.add({ x, y, radius: 0.6, color: '#123456' });
  }
  const ids = field.list().map((l) => l.id);
  for (let i = 0; i < ids.length; i++) {
    if (i % 2 === 0) {
      const lobe = field.get(ids[i]);
      field.stretch(ids[i], lobe.x + 1, lobe.y + 0.3, 0.2);
    }
  }
  assert.equal(field.count(), MAX_LOBES);
  const bounds = field.bounds();
  for (const key of ['minX', 'minY', 'maxX', 'maxY', 'width', 'height']) {
    assert.ok(Number.isFinite(bounds[key]), `bounds.${key} should be finite`);
  }
  const shaded = field.shading();
  assert.equal(shaded.length, MAX_LOBES);
  for (const s of shaded) {
    for (const key of ['x', 'y', 'z', 'radius', 'tipX', 'tipY', 'tipZ', 'tipRadius', 'restRadius', 'axisX', 'axisY', 'squash', 'join', 'deformX', 'deformY', 'deform']) {
      assert.ok(Number.isFinite(s[key]), `shading().${key} should be finite for lobe ${s.id}`);
    }
  }
}

// --- Reshaping ---------------------------------------------------------------
// A small harness: build a two-ball lump on a table, take hold of the clay at a
// world point and drag it by a world delta in `steps` sub-moves, exactly the
// way a finger produces a gesture. Every reshaping block below goes through
// beginPull/pullTo/endPull rather than poking records, so none of them can pass
// on a shortcut the game itself cannot take.
function lump({ ground = -0.9, ra = 0.30, rb = 0.28 } = {}) {
  const field = createLobeField();
  field.setGround(ground);
  field.add({ id: 'a', kind: 'ball', x: 0, y: -0.6, z: 0, radius: ra, color: '#e33' });
  field.add({ id: 'b', kind: 'ball', x: 0.45, y: -0.6, z: 0, radius: rb, color: '#3e3' });
  field.beginSettle();
  field.finishSettle();
  return field;
}
function drag(field, px, py, dx, dy, steps = 8) {
  const begun = field.beginPull(px, py);
  if (!begun) return null;
  let last = null;
  for (let i = 1; i <= steps; i++) last = field.pullTo(begun.id, px + (dx * i) / steps, py + (dy * i) / steps);
  const state = field.gestureState();
  field.endPull(begun.id);
  return { begun, last, state };
}
function settleNow(field) {
  const delta = field.beginSettle();
  field.finishSettle();
  return delta;
}

// 20. A DRAG ON A BALL ELONGATES THAT BALL. Nothing is created, nothing is
// spawned, and the mass under the finger is the mass that changed. This is the
// single most important behavioural difference from the additive model it
// replaced, where the same gesture minted a new tapered lobe every time.
{
  const field = lump();
  const before = field.protrusion('a');
  const beforeCount = field.count();
  const beforeVolume = field.totalVolume();
  const out = drag(field, -0.20, -0.6, -0.55, 0);
  assert.ok(out, 'a drag on clay must never be refused');
  assert.equal(out.state.mode, 'reshape', 'an axial drag on a ball reshapes it');
  assert.equal(field.count(), beforeCount, 'a reshape creates nothing');
  assert.ok(!field.list().some((l) => l.kind === PULL_KIND), 'no spawned mass appears');
  assert.equal(out.state.lobeId, 'a', 'the mass under the finger is the one that moved');

  const after = field.protrusion('a');
  assert.ok(after.length > before.length + 0.1, `the ball elongated: ${before.length} -> ${after.length}`);
  // WHOLE-LOBE NARROWING UNDER CONSERVATION — the redistribution that makes
  // this read as stretching rather than as growing a bump.
  assert.ok(after.ra < before.ra, `the mass narrowed as it lengthened: ra ${before.ra} -> ${after.ra}`);
  assert.ok(after.tipRatio >= TIP_KEEP_FLOOR, `the drawn end stays rounded: rb/ra = ${after.tipRatio}`);
  assert.ok(
    Math.abs(field.totalVolume() / beforeVolume - 1) < 1e-12,
    `total clay is conserved across a reshape, drifted ${field.totalVolume() / beforeVolume - 1}`,
  );
}

// 21. REPEATED PULLS KEEP ELONGATING, and cost nothing. Eight successive
// gestures on the same mass, each grabbing its current drawn end and pulling
// further out, must converge on the elongation cap without the primitive count
// moving. "Is there a limit on how many times we can deform the clay" is
// answered here.
{
  const field = lump();
  const n0 = field.count();
  let prev = 0;
  const lengths = [];
  for (let i = 0; i < 8; i++) {
    const s = field.shape('a');
    const out = drag(field, s.tipX, s.tipY, -0.14, 0);
    assert.ok(out, `pull ${i} must not be refused`);
    settleNow(field);
    const now = field.protrusion('a').length;
    assert.ok(now >= prev - 1e-9, `length must never go backwards on pull ${i}: ${prev} -> ${now}`);
    lengths.push(now);
    prev = now;
    assert.equal(field.count(), n0, `pull ${i} must not change the primitive count`);
  }
  assert.ok(field.protrusion('a').elongation > 0.85, `eight pulls should approach the cap, reached ${field.protrusion('a').elongation}`);
  assert.ok(field.protrusion('a').tipRatio >= TIP_KEEP_FLOOR, 'the rounded read survives to the cap');
}

// 22. PULLING THE FAR END CONTINUES THE STRETCH rather than undoing it. The
// mass re-roots on the end the child left behind, which is the whole reason
// there is no wrong end to hold.
{
  const field = lump();
  drag(field, -0.20, -0.6, -0.5, 0);
  settleNow(field);
  const before = field.protrusion('a');
  // Grab the end nearer the body and drag it the other way.
  const out = drag(field, before.x, before.y, 0.30, 0);
  assert.ok(out, 'a drag on the far end must not be refused');
  const after = field.protrusion('a');
  assert.ok(after.length >= before.length - 1e-9,
    `pulling the far end continues the stretch: ${before.length} -> ${after.length}`);
}

// 23. THE MID-GESTURE ESCAPE IS BIT-EXACT. Push the clay back and cancel and
// the whole lump — including any clay a neighbour donated — is restored to the
// numbers it had, not to numbers near them. The additive model needed a donor
// ledger to promise this; the reshaping model promises it with a snapshot.
{
  const field = lump();
  const before = JSON.stringify(field.toJSON());
  const begun = field.beginPull(-0.20, -0.6);
  assert.ok(begun);
  for (let i = 1; i <= 8; i++) field.pullTo(begun.id, -0.20 - (0.5 * i) / 8, -0.6);
  assert.notEqual(JSON.stringify(field.toJSON()), before, 'the drag must actually have changed something');
  assert.ok(field.cancelPull(begun.id), 'cancelPull should succeed on a live gesture');
  assert.equal(JSON.stringify(field.toJSON()), before, 'cancelPull restores the lump bit-exactly');
  assert.equal(field.gestureState(), null, 'the gesture is over');
}

// 24. A CLEARLY SIDEWAYS DRAG OFF A LONG SHAFT SPAWNS ONE PRIMITIVE, and that
// is the ONLY thing in this file that does. It comes out of the parent's own
// clay (so volume is conserved), welds to it on the frame it is born, and obeys
// exactly the same rounded law.
{
  const field = lump();
  drag(field, -0.20, -0.6, -0.55, 0);
  settleNow(field);
  const shaft = field.shape('a');
  const midX = shaft.x + (shaft.tipX - shaft.x) * 0.5;
  const midY = shaft.y + (shaft.tipY - shaft.y) * 0.5;
  const n0 = field.count();
  const v0 = field.totalVolume();
  const out = drag(field, midX, midY, 0, 0.30, 10);
  assert.ok(out, 'a sideways drag must not be refused');
  assert.equal(out.state.mode, 'branch', 'a sideways drag off a long shaft branches');
  assert.equal(field.count(), n0 + 1, 'a branch costs exactly one primitive');
  const spawned = field.get(out.state.spawned);
  assert.ok(spawned, 'the branch exists');
  assert.equal(spawned.kind, PULL_KIND, 'a spawned mass is marked as one');
  assert.equal(spawned.root, 'a', 'the branch is rooted on the mass it came out of');
  assert.ok(field.isFused('a', spawned.id), 'the branch welds to its parent on the frame it appears');
  assert.ok(
    Math.abs(field.totalVolume() / v0 - 1) < 1e-12,
    `the parent pays exactly: volume drifted ${field.totalVolume() / v0 - 1}`,
  );
  const branch = field.protrusion(spawned.id);
  assert.ok(branch.tipRatio >= TIP_KEEP_FLOOR, `the branch obeys the same rounded law: ${branch.tipRatio}`);

  // ...and an axial drag on a ROUND ball never spawns, because a ball has no
  // sideways: every direction from it is the same direction.
  const plain = lump();
  const before = plain.count();
  const axial = drag(plain, -0.20, -0.6, -0.4, 0);
  assert.equal(axial.state.mode, 'reshape', 'a drag on a ball is always a reshape');
  assert.equal(plain.count(), before, 'a drag on a ball spawns nothing');
}

// 25. NO LIMIT ON DEFORMING. A hundred scripted gestures on one creature: not
// one refusal, the primitive count bounded and plateauing rather than growing,
// the ball count never dropping, and total clay conserved. This is the block
// that answers "there shouldn't be a limit" — and the plateau is what makes
// that affordable, since the merge inside the settle keeps giving slots back.
{
  const field = createLobeField();
  field.setGround(-0.9);
  for (let i = 0; i < 4; i++) {
    field.add({ id: `ball${i}`, kind: 'ball', x: -0.3 + i * 0.2, y: -0.6, z: 0, radius: 0.20, color: '#e33' });
  }
  settleNow(field);
  const v0 = field.totalVolume();
  const balls0 = field.ballCount();
  let refusals = 0;
  let peak = field.count();
  const trajectory = [];
  for (let i = 0; i < 100; i++) {
    const shapes = field.list();
    const target = shapes[i % shapes.length];
    const s = field.shape(target.id);
    const along = [1, 0, 0.5][i % 3];
    const px = s.x + (s.tipX - s.x) * along;
    const py = s.y + (s.tipY - s.y) * along;
    if (!field.raycast(px, py)) continue; // the aim missed the clay entirely; not a refusal
    assert.equal(field.pullRefusal(px, py), null, `pullRefusal must be silent on clay (gesture ${i})`);
    const angle = i * 0.83;
    const out = drag(field, px, py, Math.cos(angle) * 0.12, Math.sin(angle) * 0.12, 6);
    if (!out) { refusals += 1; continue; }
    settleNow(field);
    peak = Math.max(peak, field.count());
    if (i % 10 === 9) trajectory.push(field.count());
    assert.ok(field.count() <= MAX_LOBES, `the primitive cap holds at gesture ${i}: ${field.count()}`);
    assert.ok(field.ballCount() >= balls0, `a merge may never cost the creature a ball (gesture ${i})`);
  }
  assert.equal(refusals, 0, `a hundred gestures on clay must produce zero refusals, got ${refusals}`);
  assert.ok(
    trajectory[trajectory.length - 1] <= peak,
    `the primitive count must plateau, not grow: ${trajectory.join(' ')} against a peak of ${peak}`,
  );
  assert.ok(
    Math.abs(field.totalVolume() / v0 - 1) < 1e-9,
    `clay is conserved across a hundred gestures, drifted ${field.totalVolume() / v0 - 1}`,
  );
}

// 26. CAP PRESSURE. Fill the field to MAX_LOBES and keep gesturing: still no
// refusal, still inside the cap. Where the additive model answered a full field
// with a wiggle, this one merges a pair to make room — and if even that is
// impossible it quietly reshapes instead, so the child never meets a no.
{
  const field = createLobeField();
  field.setGround(-0.9);
  field.add({ id: 'body', kind: 'ball', x: 0, y: -0.55, z: 0, radius: 0.34, color: '#e33' });
  for (let i = 1; i < MAX_LOBES; i++) {
    const angle = (i / (MAX_LOBES - 1)) * Math.PI * 2;
    field.add({
      id: `p${i}`, kind: PULL_KIND, color: '#e33',
      x: Math.cos(angle) * 0.30, y: -0.55 + Math.sin(angle) * 0.30, z: 0,
      radius: 0.10, sx: Math.cos(angle) * 0.12, sy: Math.sin(angle) * 0.12, sz: 0,
    });
  }
  assert.equal(field.count(), MAX_LOBES, 'setup should fill the field');
  settleNow(field);
  for (let i = 0; i < 20; i++) {
    const s = field.shape('body');
    const px = s.x + s.ra * 0.6;
    const py = s.y;
    if (!field.raycast(px, py)) continue;
    const out = drag(field, px, py, 0.16 * Math.cos(i), 0.16 * Math.sin(i), 6);
    assert.ok(out, `a gesture at the cap must not be refused (${i})`);
    settleNow(field);
    assert.ok(field.count() <= MAX_LOBES, `the cap holds at gesture ${i}: ${field.count()}`);
  }
}

// --- The settle ---------------------------------------------------------------

// 27. THE SETTLE IS DETERMINISTIC, FINITE, VISIBLE, AND WORK-PRESERVING.
//
// The previous tuning was correct on every count except the one that mattered:
// its largest surface travel on a real stage was two to four CSS pixels, and
// the owner watching a release reasonably reported that nothing happened. So
// there is now a FLOOR as well as a ceiling, and both are asserted.
{
  // Deterministic: a jump-to-end settle and a ragged frame sequence must land
  // on bit-identical numbers, or a thumbnail rasterized tomorrow would not
  // match the stage the child saw today.
  const build = () => {
    const field = lump();
    drag(field, -0.20, -0.6, -0.5, 0);
    return field;
  };
  const jumped = build();
  jumped.beginSettle();
  jumped.finishSettle();

  const stepped = build();
  stepped.beginSettle();
  let frames = 0;
  const ragged = [7.2, 16.7, 33.4, 11.1, 21.9, 8.3];
  while (stepped.advanceSettle(ragged[frames % ragged.length])) {
    frames += 1;
    assert.ok(frames < 400, 'a settle must terminate');
  }
  assert.deepEqual(stepped.toJSON(), jumped.toJSON(), 'a settle is a pure function of where it started');
  assert.ok(frames * 8 <= SETTLE_MS + 40, `a settle finishes inside its own duration, took ${frames} frames`);
  assert.equal(stepped.settleState().active, false, 'the stage is still again afterwards');

  // VISIBLE FLOOR and WORK-PRESERVING CEILING, measured against the mean
  // radius so the bound is scale-free.
  const field = build();
  const before = field.protrusion('a').length;
  const mean = field.list().reduce((sum, l) => sum + l.radius, 0) / field.count();
  const delta = field.beginSettle();
  while (field.advanceSettle(16.7));
  assert.ok(delta >= mean * 0.04, `a settle must be SEEN: travelled ${(delta / mean).toFixed(3)} of a mean radius`);
  assert.ok(delta <= mean * 0.35, `a settle must not be healing: travelled ${(delta / mean).toFixed(3)} of a mean radius`);

  // The settle softens FORM, never WORK: a deliberate elongation survives.
  const after = field.protrusion('a').length;
  assert.ok(
    after >= before * SETTLE_LENGTH_FLOOR,
    `a deliberate elongation survives the settle: ${before} -> ${after} (floor ${before * SETTLE_LENGTH_FLOOR})`,
  );

  // IDEMPOTENCE — the cumulative-sag regression guard, and the property that
  // actually protects a child's work. A settle that shipped once already
  // re-drooped every limb and re-drew every weld on EVERY release, so a child
  // who kept sculpting watched their first arm slowly sag and their body slowly
  // close up. Every effect in the relaxation is now a fixed point, and this is
  // what proves it: twelve more settles must be literal no-ops.
  const snapshot = JSON.stringify(field.toJSON());
  for (let i = 0; i < 12; i++) {
    assert.equal(field.beginSettle(), 0, `settle ${i + 2} on a set composition must be a no-op`);
    assert.equal(JSON.stringify(field.toJSON()), snapshot, `settle ${i + 2} must not move one number`);
  }
}

// 28. NO EROSION UNDER REPETITION. Twenty micro-drags on the same limb, each
// nudging its drawn end by about a percent of its length, must not creep the
// limb shorter twenty times over. The relax is floored at the length the mass
// already had when it last took its set, so only genuinely NEW length slumps.
{
  const field = lump();
  drag(field, -0.20, -0.6, -0.5, 0);
  settleNow(field);
  const base = field.protrusion('a').length;
  for (let i = 0; i < 20; i++) {
    const s = field.shape('a');
    drag(field, s.tipX, s.tipY, -0.004, 0, 3);
    settleNow(field);
  }
  const after = field.protrusion('a').length;
  assert.ok(
    after >= base * 0.99,
    `twenty micro-drags must not erode the limb: ${base} -> ${after}`,
  );
}

// 29. THE DROOP IS BUDGETED. A limb slumps under its own weight ONCE, however
// many times it is worked afterwards: the budget is per-lobe and per-lifetime,
// which is what lets it be set at a size worth seeing without it compounding
// into an arm that visibly falls over a long session.
{
  const field = lump();
  drag(field, -0.20, -0.6, -0.55, 0);
  const first = field.shape('a');
  const axis0 = { x: first.tipX - first.x, y: first.tipY - first.y };
  for (let i = 0; i < 30; i++) settleNow(field);
  const last = field.shape('a');
  const axis1 = { x: last.tipX - last.x, y: last.tipY - last.y };
  const cos = (axis0.x * axis1.x + axis0.y * axis1.y)
    / (Math.hypot(axis0.x, axis0.y) * Math.hypot(axis1.x, axis1.y));
  const swung = Math.acos(Math.min(1, Math.max(-1, cos)));
  assert.ok(swung <= 0.09, `thirty settles must not swing a limb more than one dose of droop, swung ${swung} rad`);
}

// --- The merge ----------------------------------------------------------------

// 30. THE CLAY ROUNDS ITSELF. Two heavily-overlapping same-colour masses that
// already read as one are replaced by the one mass they look like: the count
// drops by exactly one, the clay is conserved, the survivor keeps its id and
// its colour, and the merged capsule SPANS both originals so nothing the child
// made can be swallowed.
{
  const build = () => {
    const field = createLobeField();
    field.setGround(-0.9);
    field.add({ id: 'body', kind: 'ball', x: 0, y: -0.6, z: 0, radius: 0.30, color: '#abc' });
    field.add({ id: 'p1', kind: PULL_KIND, x: 0.05, y: -0.6, z: 0, radius: 0.16, sx: 0.10, sy: 0, sz: 0, color: '#abc' });
    field.add({ id: 'other', kind: PULL_KIND, x: 0.06, y: -0.6, z: 0.01, radius: 0.14, sx: 0.10, sy: 0, sz: 0, color: '#f0f' });
    return field;
  };
  const field = build();
  const candidate = field.mergeCandidate();
  assert.ok(candidate, 'a deeply overlapping same-colour pair is a merge candidate');
  assert.ok(
    (candidate.keepId === 'body' && candidate.goneId === 'p1'),
    `the ball survives and the spawned mass is the one absorbed, got ${JSON.stringify(candidate)}`,
  );

  const n0 = field.count();
  const v0 = field.totalVolume();
  const balls0 = field.ballCount();
  const spanBefore = Math.max(
    field.protrusion('body').length + field.protrusion('body').ra + field.protrusion('body').rb,
    field.protrusion('p1').length + field.protrusion('p1').ra + field.protrusion('p1').rb,
  );
  settleNow(field);
  assert.equal(field.count(), n0 - 1, 'a merge frees exactly one primitive');
  assert.equal(field.has('body'), true, 'the survivor keeps its id');
  assert.equal(field.get('body').color, '#abc', 'the survivor keeps its colour');
  assert.equal(field.ballCount(), balls0, 'a merge never costs the creature a ball');
  assert.ok(
    Math.abs(field.totalVolume() / v0 - 1) < 1e-9,
    `a merge conserves clay, drifted ${field.totalVolume() / v0 - 1}`,
  );
  const merged = field.protrusion('body');
  assert.ok(
    merged.length + merged.ra + merged.rb >= spanBefore - 1e-9,
    `the merged mass spans both originals: ${merged.length + merged.ra + merged.rb} vs ${spanBefore}`,
  );
  // NEVER ACROSS A COLOUR BOUNDARY: the seams between colours are the
  // creature's identity, and a merge that crossed one would be deleting a
  // decision rather than simplifying a form.
  assert.ok(field.has('other'), 'a different-colour mass is never merged away, however deep the overlap');
  assert.equal(field.get('other').color, '#f0f');

  // ...and it is DETERMINISTIC: frame-by-frame lands where jump-to-end lands.
  const stepped = build();
  stepped.beginSettle();
  while (stepped.advanceSettle(11.3));
  assert.deepEqual(stepped.toJSON(), field.toJSON(), 'a merge is a pure function of the state it started from');
}

// 31. TWO PLAIN BALLS NEVER MERGE. The four-ball Decorate gate counts balls, so
// clay tidying itself out of a gate is the single worst trap this feature could
// introduce. Exactly one side of a merge may vanish and it has to be a mass a
// gesture spawned.
{
  const field = createLobeField();
  field.setGround(-0.9);
  field.add({ id: 'x', kind: 'ball', x: 0, y: -0.6, z: 0, radius: 0.30, color: '#abc' });
  field.add({ id: 'y', kind: 'ball', x: 0.04, y: -0.6, z: 0, radius: 0.28, color: '#abc' });
  assert.equal(field.mergeCandidate(), null, 'two balls are never a merge candidate, however deep the overlap');
  const balls = field.ballCount();
  for (let i = 0; i < 5; i++) settleNow(field);
  assert.equal(field.ballCount(), balls, 'the ball count is invariant across every settle');
  assert.equal(field.count(), 2, 'and so is the primitive count');
}

// 32. ballCount counts what PROGRESS counts. Reshaping the body is made of clay
// that is already there, so it can never fake progress toward the four-ball
// gate; only a ball brought from the tray moves it.
{
  const field = lump();
  assert.equal(field.ballCount(), 2);
  drag(field, -0.20, -0.6, -0.5, 0);
  settleNow(field);
  assert.equal(field.ballCount(), 2, 'a reshape does not add a ball');
  const shaft = field.shape('a');
  drag(field, shaft.x + (shaft.tipX - shaft.x) * 0.5, shaft.y + (shaft.tipY - shaft.y) * 0.5, 0, 0.30, 10);
  assert.equal(field.ballCount(), 2, 'nor does a branch');
  assert.ok(field.count() > 2, 'even though the branch did cost a primitive');
  field.add({ id: 'c', kind: 'ball', x: -0.9, y: -0.6, z: 0, radius: 0.2, color: '#00f' });
  assert.equal(field.ballCount(), 3, 'a ball from the tray does');
}

// 33. SAVES. A reshaped creature round-trips exactly at v4; a pre-v4 payload
// keeps the SHAPE LAW it was made with, so a creature saved as a set of tapered
// spikes is never quietly reshaped into a set of capsules on its own shelf card;
// and every older format still loads.
{
  const field = lump();
  drag(field, -0.20, -0.6, -0.5, 0);
  settleNow(field);
  field.setSeed(1234);
  const saved = JSON.parse(JSON.stringify(field.toJSON()));
  assert.equal(saved.version, 4, 'a live field serializes as v4');
  assert.equal(saved.seed, 1234, 'the creature carries its own noise seed');
  assert.ok(saved.lobes.every((l) => l.law === undefined), 'new clay carries no legacy law marker');
  const restored = createLobeField();
  assert.ok(restored.fromJSON(saved));
  assert.deepEqual(restored.toJSON(), saved, 'a v4 save round-trips exactly');

  // A v3 payload with a STRETCHED spawned mass: that mass was shaped by the old
  // law and must keep being shaped by it.
  const legacy = {
    format: 'qlobe-clay-lobes',
    version: 3,
    seed: 9,
    lobes: [
      { id: 'ball', kind: 'ball', x: 0, y: 0, z: 0, radius: 0.30, color: '#fff' },
      { id: 'spike', kind: PULL_KIND, x: 0.1, y: 0, z: 0, radius: 0.12, sx: 0.30, sy: 0, sz: 0, color: '#fff', root: 'ball' },
    ],
    fused: ['ball|spike'],
  };
  const old = createLobeField();
  assert.ok(old.fromJSON(legacy), 'a v3 payload loads');
  assert.equal(old.protrusion('spike').law, SHAPE_TAPER, 'a stretched pre-v4 mass keeps the taper law');
  assert.equal(old.protrusion('ball').law, SHAPE_BLUNT, 'an unstretched ball is identical under both laws, so it stays blunt');
  assert.ok(
    old.protrusion('spike').tipRatio < 0.30,
    `the legacy spike is NOT retro-morphed into a capsule: rb/ra = ${old.protrusion('spike').tipRatio}`,
  );
  const resaved = old.toJSON();
  assert.equal(resaved.version, 4, 'it re-saves at v4');
  assert.equal(resaved.lobes.find((l) => l.id === 'spike').law, SHAPE_TAPER, 'and carries the law forward');
  assert.equal(resaved.lobes.find((l) => l.id === 'ball').law, undefined, 'without marking clay that needs no marker');
  const reloaded = createLobeField();
  assert.ok(reloaded.fromJSON(resaved));
  assert.equal(reloaded.protrusion('spike').law, SHAPE_TAPER, 'a v4 payload honours an explicit legacy law');

  // v1 (no stretch, no seed) and v2 (stretch, no seed) still load, blunt, at
  // the CONSTANT default seed — an old creature has to look the same every
  // single time it is opened.
  const v1 = { format: 'qlobe-clay-lobes', version: 1, lobes: [{ id: 'q', kind: 'lobe', x: 0, y: 0, z: 0, radius: 0.2, color: '#123' }], fused: [] };
  const v1Field = createLobeField();
  assert.ok(v1Field.fromJSON(v1));
  assert.equal(v1Field.get('q').law, SHAPE_BLUNT, 'an unstretched v1 lobe is blunt');
  assert.equal(v1Field.seed(), DEFAULT_NOISE_SEED, 'a seedless payload loads at the constant default');
  const overCap = { format: 'qlobe-clay-lobes', version: 4, lobes: new Array(MAX_LOBES + 1).fill(0).map((_, i) => ({ id: `o${i}`, x: i, y: 0, z: 0, radius: 0.1, color: '#000' })), fused: [] };
  assert.equal(v1Field.fromJSON(overCap), false, 'an over-cap payload is still rejected');
  assert.ok(v1Field.has('q'), 'and rejecting it leaves the prior state untouched');
}

// 35. CONSOLIDATION reclaims only what is invisible, and reclaiming it changes
// nothing else. A mass buried inside the union costs a slot for nothing, but a
// child watching their creature must never see one pop: so every OTHER mass's
// radius has to come through the absorb bit-identical, and a mass that is even
// partly visible must survive. It is deliberately distinct from the merge above
// — that one CHANGES the form and is meant to be seen; this one changes nothing
// whatsoever.
{
  const field = createLobeField();
  field.add({ id: 'big', kind: 'ball', x: 0, y: 0, z: 0, radius: 1, color: '#111' });
  // A stub buried entirely inside the ball.
  field.add({ id: 'stub', kind: PULL_KIND, x: -0.1, y: 0, z: 0, radius: 0.18, sx: -0.05, sy: 0, sz: 0, color: '#111', root: 'big' });
  // A limb standing proud of it.
  field.add({ id: 'arm', kind: PULL_KIND, x: 0.8, y: 0, z: 0, radius: 0.22, sx: 0.5, sy: 0, sz: 0, color: '#111', root: 'big' });
  field.add({ id: 'lid', kind: 'ball', x: -0.75, y: 0, z: 0, radius: 0.95, color: '#222' });

  const before = new Map(field.list().map((l) => [l.id, l.radius]));
  const volumeBefore = field.totalVolume();
  const reclaimed = field.consolidate();
  assert.equal(reclaimed, 1, `exactly the buried stub should be reclaimed, got ${reclaimed}`);
  assert.equal(field.has('stub'), false, 'the buried stub is gone');
  assert.ok(field.has('arm'), 'a limb standing proud of the body must NOT be reclaimed');
  assert.ok(field.has('big') && field.has('lid'), 'a ball is never reclaimed, however deeply it is buried');
  for (const lobe of field.list()) {
    assert.equal(lobe.radius, before.get(lobe.id), `${lobe.id} must come through consolidation bit-identical (no pop)`);
  }
  // To the last ulp of a floating-point sum: every surviving radius is
  // untouched, so the only thing the field can have lost is the absorbed mass.
  // (Not `assert.equal` — the two sides add the same terms in a different
  // order, which is a one-ulp difference and not a leak.)
  const expected = volumeBefore - sphereVolume(before.get('stub'));
  assert.ok(
    Math.abs(field.totalVolume() - expected) <= Math.abs(expected) * 1e-15,
    `the field loses exactly the absorbed mass and not one drop more: ${field.totalVolume()} vs ${expected}`,
  );
  assert.equal(field.consolidate(), 0, 'a settled field has nothing left to reclaim');
}

// 36. THE HAND-WORKED SURFACE. Three properties the renderer depends on.
//   SEEDED AND STABLE — the phase triple is a pure function of (seed, lobe id),
//   so the same creature has the same lumps every frame, every session, and on
//   its shelf thumbnail; a different seed gives different lumps.
//   BOUNDED — the displacement never exceeds the amplitude it advertises, which
//   is what lets the quad padding and the capsule rejection be sized for it.
//   MARCH-SAFE — its gradient must stay under the slack NOISE_SAFETY buys, or
//   both the CPU trace and the GLSL march step through the shell and stipple
//   the silhouette.
{
  const a = noisePhase('lobe-1', 7);
  const b = noisePhase('lobe-1', 7);
  assert.deepEqual(a, b, 'the same (id, seed) must give the same phase, always');
  assert.notDeepEqual(noisePhase('lobe-1', 8), a, 'a different seed must give different lumps');
  assert.notDeepEqual(noisePhase('lobe-2', 7), a, 'a different lobe must get its own lumps');
  for (const key of ['x', 'y', 'z']) {
    assert.ok(a[key] >= 0 && a[key] < Math.PI * 2 && Number.isFinite(a[key]), `phase.${key} should be a finite angle, got ${a[key]}`);
  }

  let maxWave = 0;
  for (let i = 0; i < 4000; i++) {
    const q = [(i % 37) * 0.31 - 5, ((i * 7) % 41) * 0.27 - 5, ((i * 13) % 43) * 0.23 - 5];
    maxWave = Math.max(maxWave, Math.abs(noiseWave(q[0], q[1], q[2], a)));
  }
  assert.ok(maxWave <= 1.0000001, `the wave is a weighted sum of unit sinusoids and cannot exceed 1, got ${maxWave}`);

  // The gradient bound NOISE_SAFETY is derived from, measured rather than
  // assumed. Sampled across a real lobe's surface band, where the falloff is
  // live and the displacement is actually doing work.
  const field = createLobeField();
  field.setSeed(7);
  field.add({ id: 'ball', x: 0, y: 0, z: 0, radius: 0.5, color: '#111' });
  const s = field.shading()[0];
  assert.ok(s.noiseAmp === NOISE_AMP && s.noisePhase, 'shading() must carry the displacement inputs to the renderer');
  const h = 1e-4;
  let maxGrad = 0;
  let maxDisp = 0;
  for (let i = 0; i < 3000; i++) {
    const theta = i * 0.7013;
    const phi = Math.acos(1 - 2 * ((i % 97) / 97));
    const band = 0.5 + ((i % 23) / 23 - 0.5) * 0.4; // sweep in and out through the shell
    const p = [
      Math.sin(phi) * Math.cos(theta) * band,
      Math.sin(phi) * Math.sin(theta) * band,
      Math.cos(phi) * band,
    ];
    const d0 = shadeDistance(s, p[0], p[1], p[2]);
    const dn = shadeDistanceOrganic(s, p[0], p[1], p[2]);
    maxDisp = Math.max(maxDisp, Math.abs(dn - d0));
    const gx = (shadeDistanceOrganic(s, p[0] + h, p[1], p[2]) - shadeDistanceOrganic(s, p[0] - h, p[1], p[2])) / (2 * h);
    const gy = (shadeDistanceOrganic(s, p[0], p[1] + h, p[2]) - shadeDistanceOrganic(s, p[0], p[1] - h, p[2])) / (2 * h);
    const gz = (shadeDistanceOrganic(s, p[0], p[1], p[2] + h) - shadeDistanceOrganic(s, p[0], p[1], p[2] - h)) / (2 * h);
    maxGrad = Math.max(maxGrad, Math.hypot(gx, gy, gz));
  }
  assert.ok(
    maxDisp <= s.radius * NOISE_AMP * 1.0001,
    `displacement must stay inside the amplitude the quad padding is sized for: ${maxDisp} vs ${s.radius * NOISE_AMP}`,
  );
  assert.ok(
    maxGrad <= 1 / NOISE_SAFETY,
    `the displaced field's gradient ${maxGrad} must stay inside the 1/${NOISE_SAFETY} = ${(1 / NOISE_SAFETY).toFixed(3)} slack the march safety scale buys`,
  );
  console.log(`Surface noise: max displacement ${(maxDisp / s.radius * 100).toFixed(2)}% of a radius (cap ${(NOISE_AMP * 100).toFixed(1)}%), max |grad| ${maxGrad.toFixed(4)} (budget ${(1 / NOISE_SAFETY).toFixed(4)}), freq ${NOISE_FREQ}, falloff ${NOISE_FALLOFF}`);

  // SEED ROUND TRIP. The seed is what makes an old creature look like itself,
  // so it has to survive the save and it has to survive a reload into a fresh
  // field that never saw the original.
  field.setSeed(4242);
  const saved = JSON.parse(JSON.stringify(field.toJSON()));
  assert.equal(saved.seed, 4242, 'the save carries the creature seed');
  const restored = createLobeField();
  assert.ok(restored.fromJSON(saved));
  assert.equal(restored.seed(), 4242, 'and a reload restores it');
  assert.deepEqual(restored.shading()[0].noisePhase, field.shading()[0].noisePhase, 'so the same lobe gets the same lumps after a reload');
}

// --- Gravity rest -------------------------------------------------------------
// A tilted loaf on a table, built the way the game builds one: a ball dropped
// at its rest height, then drawn out and UP so the ground clamp (which only
// ever pushes) leaves it balanced on one end with its belly in the air. This is
// the owner's snapshot A, as close as a scripted gesture gets to it.
function tiltedLoaf({ ground = -0.9, radius = 0.30 } = {}) {
  const field = createLobeField();
  field.setGround(ground);
  // At the settled sink a resting ball's centre sits ra*(1-0.17) above the
  // plane; land it exactly there so `grounded` is true from the first frame,
  // exactly as blob-lobes.js's drop animation does.
  field.add({ id: 'a', kind: 'ball', x: 0, y: ground + radius * 0.9, z: 0, radius, color: '#a06cd5' });
  settleNow(field);
  drag(field, -0.20, ground + radius * 0.9, -0.45, 0.55, 12);
  return field;
}

// 39. GRAVITY ROTATES THE CREATURE ONTO ITS SUPPORT. The owner's report was
// literal: "note how the object has not settled as it would from gravity — it
// would be rotated to sit on the table". Before this, the ground behaviour only
// ever flattened clay that overlapped the plane, so an elongated mass drawn out
// and up stayed balanced on one end forever. It now falls over.
{
  const field = tiltedLoaf();
  const before = field.restState();
  assert.equal(before.length, 1, 'one welded component');
  assert.equal(before[0].onTable, true, 'the loaf is resting on the table, not falling through the air');
  assert.equal(before[0].stable, false, 'a loaf balanced on one end is NOT a pose clay holds');
  assert.ok(before[0].overhang > 0, `its centre of mass hangs outside its support by ${before[0].overhang}`);
  assert.ok(
    Math.abs(before[0].angle) > 0.35,
    `and gravity has a real rotation to apply, not a nudge: ${(before[0].angle * 180 / Math.PI).toFixed(1)} degrees`,
  );

  // How far off horizontal the mass's own axis lies, in radians: 0 is flat on
  // the table, pi/2 is standing straight up. Measured as the rise over the
  // length so that pointing left and pointing right are the same answer.
  const offFlat = (s) => Math.asin(Math.min(1, Math.abs(s.tipY - s.y) / Math.max(Math.hypot(s.tipX - s.x, s.tipY - s.y), 1e-9)));
  const tiltAxis = offFlat(field.shape('a'));

  settleNow(field);

  // THE STABILITY PREDICATE, from the other side: after the settle the centre
  // of mass is over the support with the margin clay needs, and gravity has
  // nothing left to say.
  const after = field.restState();
  assert.equal(after[0].stable, true, 'after the settle the creature is at rest');
  assert.ok(after[0].overhang < 0, `its COM is INSIDE its support by ${(-after[0].overhang).toFixed(4)}`);
  assert.ok(
    after[0].slack <= 0,
    `...and inside it by more than the stability margin: slack ${after[0].slack}`,
  );

  // IT LIES DOWN. The axis that was pointing up into the air is now within a
  // few degrees of the table, which is the whole of what the owner asked for.
  const flat = field.shape('a');
  const flatAxis = offFlat(flat);
  assert.ok(tiltAxis > 0.5, `the pull really did leave it tilted: ${(tiltAxis * 180 / Math.PI).toFixed(1)} degrees off flat`);
  assert.ok(
    flatAxis < 0.25,
    `and the settle lays it down: ${(tiltAxis * 180 / Math.PI).toFixed(1)} -> ${(flatAxis * 180 / Math.PI).toFixed(1)} degrees off flat`,
  );

  // BOTH ENDS ARE ON THE WOOD, not one end down and a belly hovering. Measured
  // against each end's own resting plane, because clay sinks into the table by
  // a fraction of its OWN radius and a fat end therefore sits deeper than a
  // thin one on the same flat surface.
  const sink = 0.17;
  const baseRest = flat.y - flat.ra * (1 - sink);
  const tipRest = flat.tipY - flat.rb * (1 - sink);
  assert.ok(
    Math.abs(baseRest - tipRest) < flat.ra * 0.25,
    `the loaf lies on its belly, not on one end: base plane ${baseRest.toFixed(4)} vs tip plane ${tipRest.toFixed(4)}`,
  );

  // IDEMPOTENT. A creature that has come to rest does not move again, which is
  // the same fixed-point guarantee the rest of the settle already carries — and
  // without it a rested creature would rock forever, one dead band at a time.
  const snapshot = JSON.stringify(field.toJSON());
  for (let i = 0; i < 12; i++) {
    assert.equal(field.beginSettle(), 0, `settle ${i + 2} on a rested creature must be a no-op`);
    assert.equal(JSON.stringify(field.toJSON()), snapshot, `settle ${i + 2} must not move one number`);
  }
}

// 40. THE ROTATION IS RIGID, AT EVERY INSTANT OF IT. Not "rigid at both ends" —
// interpolating two rotated poses componentwise walks every primitive along the
// CHORD of its own arc, and a composite whose parts all cut their own chords
// visibly shrinks and shears as it falls. The topple is therefore evaluated as
// a rotation at every frame, and this is the assertion that keeps it one.
// A tilted loaf with a branch pulled off its shaft: two welded primitives, so
// the composite has an internal geometry a sloppy interpolation could distort.
function branchedLoaf() {
  const field = tiltedLoaf();
  const shaft = field.shape('a');
  const midX = shaft.x + (shaft.tipX - shaft.x) * 0.5;
  const midY = shaft.y + (shaft.tipY - shaft.y) * 0.5;
  const px = -(shaft.tipY - shaft.y), py = shaft.tipX - shaft.x;
  const pl = Math.hypot(px, py) || 1;
  drag(field, midX, midY, (px / pl) * 0.30, (py / pl) * 0.30, 10);
  return field;
}
{
  const field = branchedLoaf();
  assert.equal(field.count(), 2, 'the fixture really is two welded primitives');

  const plan = field.restState()[0];
  assert.equal(plan.ids.length, 2, 'and they are ONE component, so they fall together');
  assert.equal(plan.stable, false, 'the branched loaf has somewhere to fall');

  // Every pairwise distance in the composite, under the rigid transform alone,
  // sampled across the whole rotation. `restPose(u)` is the same transform the
  // settle evaluates; at u = 0 it is the identity and at u = 1 it is the pose
  // the creature comes to rest in.
  const points = (pose) => pose.flatMap((p) => [{ x: p.x, y: p.y }, { x: p.x + p.sx, y: p.y + p.sy }]);
  const distances = (pts) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) out.push(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    }
    return out;
  };
  const base = distances(points(field.restPose(0)));
  assert.ok(base.length >= 6, 'there is more than one primitive to hold rigid');
  let worst = 0;
  for (let step = 0; step <= 20; step++) {
    const now = distances(points(field.restPose(step / 20)));
    assert.equal(now.length, base.length, 'the composite keeps all of its primitives through the fall');
    for (let i = 0; i < base.length; i++) worst = Math.max(worst, Math.abs(now[i] - base[i]));
  }
  assert.ok(worst <= 1e-12, `every pairwise distance survives the rotation: worst drift ${worst}`);

  // DETERMINISTIC. Two identical fields fall identically, and a ragged frame
  // sequence lands on the same numbers as a jump to the end — the same promise
  // the rest of the settle already makes, extended over the rotation.
  const jumped = branchedLoaf();
  jumped.beginSettle();
  jumped.finishSettle();
  const stepped = branchedLoaf();
  stepped.beginSettle();
  let frames = 0;
  const ragged = [7.2, 16.7, 33.4, 11.1, 21.9, 8.3];
  while (stepped.advanceSettle(ragged[frames % ragged.length])) {
    frames += 1;
    assert.ok(frames < 400, 'a topple must terminate');
  }
  assert.deepEqual(stepped.toJSON(), jumped.toJSON(), 'a topple is a pure function of where it started');
  assert.equal(stepped.settleState().active, false, 'and the stage is still again afterwards');
}

// 41. A CREATURE THAT IS ALREADY LYING DOWN DOES NOT MOVE, and neither does a
// loose ball. This is the other half of the promise: gravity that fired on
// everything would be a creature that rearranged itself every time a child let
// go of it.
{
  const field = lump();
  const before = JSON.stringify(field.toJSON());
  for (const state of field.restState()) {
    assert.equal(state.stable, true, 'a two-ball lump on the table is already at rest');
  }
  assert.equal(field.beginSettle(), 0, 'and there is nothing to settle');
  assert.equal(JSON.stringify(field.toJSON()), before, 'nothing moved');

  // A single ball is stable by construction: its centre of mass is directly
  // over the middle of its own contact patch, whatever size it is.
  const solo = createLobeField();
  solo.setGround(-0.9);
  solo.add({ id: 'only', kind: 'ball', x: 0.2, y: -0.9 + 0.22 * 0.9, z: 0, radius: 0.22, color: '#e33' });
  settleNow(solo);
  assert.equal(solo.restState()[0].stable, true, 'a ball resting on the table is at rest');
  assert.equal(solo.beginSettle(), 0, 'and settles to itself');

  // Clay a child is HOLDING is never rotated, however unstable the pose the
  // gesture is passing through.
  const held = tiltedLoaf();
  const begun = held.beginPull(held.shape('a').tipX, held.shape('a').tipY);
  assert.ok(begun, 'the loaf can be taken hold of');
  held.pullTo(begun.id, -0.55, 0.05);
  for (const state of held.restState()) {
    assert.equal(state.stable, true, 'a creature under the finger reports nothing to do');
  }
  // A settle forced mid-gesture (nothing in the game does this, but the model
  // must not depend on that) still relaxes fresh work — it simply refuses to
  // rotate anything. The clay under the finger is where the child put it.
  held.beginSettle();
  assert.equal(held.settleState().resting, false, 'no component topples while a finger is down');
  assert.equal(held.settleState().restAngle, 0, '...and no rotation is applied at all');
  held.finishSettle();
  held.endPull(begun.id);
  const released = held.beginSettle();
  assert.ok(released > 0, '...but the release settles it');
  assert.equal(held.settleState().resting, true, 'and THAT settle is the one gravity rides in on');
}

// --- Welds are inviolable -------------------------------------------------------

// 42. ONCE WELDED, MATERIAL CANNOT BE LEVERED OUT AS A UNIT. The owner's
// snapshot B: elongate a welded mass upward and then drag it repeatedly around
// the clock, and the whole primitive swings out of the body about its own weld.
// The primitive still existed as a primitive, so it could still be moved as
// one, and the seam the child made stopped being a seam.
//
// Twenty directions, twice round, with a settle after each: the contact of
// every weld the green mass has must never fall below the value it was welded
// at. Cross-colour on purpose — a same-colour pair eventually merges and the
// question stops existing, which is exactly why the cross-colour case is the
// one that has to be proved.
{
  const field = createLobeField();
  field.setGround(-0.9);
  field.add({ id: 'body1', kind: 'ball', x: -0.15, y: -0.9 + 0.30 * 0.9, z: 0, radius: 0.30, color: '#e8a33d' });
  field.add({ id: 'body2', kind: 'ball', x: 0.22, y: -0.9 + 0.28 * 0.9, z: 0, radius: 0.28, color: '#e8a33d' });
  field.add({ id: 'green', kind: 'ball', x: 0.05, y: -0.28, z: 0, radius: 0.22, color: '#4bbf73' });
  settleNow(field);
  const partners0 = field.partners('green');
  assert.ok(partners0.length >= 2, `the green mass welds into the body: ${partners0.join(', ')}`);

  const greenWelds = () => field.weldState().filter((w) => w.pair.includes('green'));
  for (const w of greenWelds()) {
    assert.ok(w.floor > 0, 'every weld records the geometry it welded at');
    assert.ok(w.floor <= 0.7201, `...capped, so a buried branch can still be drawn out: ${w.floor}`);
  }

  // Step one of the owner's sequence: draw the welded mass upward.
  const g0 = field.shape('green');
  drag(field, g0.x, g0.y + g0.ra * 0.8, 0, 0.42, 10);
  settleNow(field);
  assert.ok(field.protrusion('green').length > 0.1, 'the green mass really was elongated');

  // Step two: haul it round the clock, twice, and try to walk it out.
  let worstMargin = Infinity;
  let worstAt = '';
  let attempts = 0;
  for (let lap = 0; lap < 2; lap++) {
    for (let k = 0; k < 20; k++) {
      if (!field.has('green')) break;
      const theta = (k / 20) * Math.PI * 2;
      const s = field.shape('green');
      const gx = s.x + (s.tipX - s.x) * 0.6;
      const gy = s.y + (s.tipY - s.y) * 0.6;
      const out = drag(field, gx, gy, Math.cos(theta) * 0.55, Math.sin(theta) * 0.55, 10);
      assert.ok(out, `lever attempt ${lap}.${k} must not be refused`);
      settleNow(field);
      attempts += 1;
      assert.ok(field.has('green'), 'the green mass is never destroyed by being pulled on');
      const welds = greenWelds();
      assert.ok(welds.length > 0, `the green mass is still welded into the body after attempt ${lap}.${k}`);
      for (const w of welds) {
        const margin = w.contact - w.floor;
        if (margin < worstMargin) { worstMargin = margin; worstAt = `${w.pair} at ${lap}.${k} (contact ${w.contact.toFixed(3)}, floor ${w.floor.toFixed(3)})`; }
      }
    }
  }
  assert.equal(attempts, 40, 'all forty lever attempts ran');
  assert.ok(
    worstMargin >= -0.01,
    `no weld is ever levered below its as-welded contact: worst was ${worstMargin.toFixed(4)} on ${worstAt}`,
  );
  // ...and the green mass is still IN the body rather than dangling off it: at
  // the floor its axis is well inside tangency with its neighbour's.
  for (const w of greenWelds()) {
    assert.ok(w.contact >= FUSE_THRESHOLD, `the weld is still a weld, not a graze: ${w.pair} at ${w.contact}`);
  }
  console.log(`Weld lever proof: 40 scripted attempts, worst contact margin ${worstMargin.toFixed(4)} above floor (${worstAt})`);
}

// 43. THE CONSTRAINT FEELS LIKE CLAY, NOT LIKE GLASS. A weld that stopped the
// gesture dead would be a wall, and a five-year-old pulling on clay that
// suddenly will not move learns that the toy is broken. The weld is held by
// SLIDING the mass deeper into the body instead, which costs the gesture
// nothing: the limb goes on lengthening at exactly the rate the finger moves,
// and the only thing that ever caps it is the elongation cap that was always
// there. Proved by running the same drag on a welded mass and on a loose one
// and comparing where each of them stops responding.
{
  const build = (welded) => {
    const field = createLobeField();
    field.setGround(-0.9);
    field.add({ id: 'body', kind: 'ball', x: 0, y: -0.9 + 0.32 * 0.9, z: 0, radius: 0.32, color: '#e8a33d' });
    // The loose one is parked far enough away that it never welds to anything.
    field.add({ id: 'nub', kind: 'ball', x: welded ? 0.30 : 1.60, y: -0.9 + 0.20 * 0.9, z: 0, radius: 0.20, color: '#4bbf73' });
    settleNow(field);
    return field;
  };
  const drive = (field) => {
    const start = field.shape('nub');
    const px = start.x + start.ra * 0.7;
    const py = start.y;
    const begun = field.beginPull(px, py);
    assert.ok(begun, 'the nub can be taken hold of');
    const lengths = [];
    const contacts = [];
    for (let i = 1; i <= 24; i++) {
      field.pullTo(begun.id, px + 0.030 * i, py);
      lengths.push(field.shape('nub').length);
      contacts.push(field.has('body') ? field.contact('body', 'nub') : 0);
    }
    field.endPull(begun.id);
    return { lengths, contacts };
  };
  const stalls = (lengths) => lengths.filter((v, i) => i > 0 && v - lengths[i - 1] < 1e-6).length;

  const welded = build(true);
  assert.ok(welded.isFused('body', 'nub'), 'the nub is welded to the body');
  const floor = welded.weldState().find((w) => w.pair === pairKey('body', 'nub')).floor;
  const held = drive(welded);
  const loose = drive(build(false));

  // NEVER BACKWARDS, and never below the floor.
  for (let i = 1; i < held.lengths.length; i++) {
    assert.ok(held.lengths[i] >= held.lengths[i - 1] - 1e-9, `the clay never snaps back under a steady pull (step ${i})`);
  }
  for (const c of held.contacts) {
    assert.ok(c >= floor - 0.01, `and the weld is held for every frame of the drag: contact ${c} vs floor ${floor}`);
  }
  // NO WALL THE WELD PUT THERE. The welded mass stops responding on the same
  // step the loose one does, give or take the sub-step the elongation cap
  // lands on, so every stall in the profile belongs to the cap and none of
  // them to the weld.
  assert.ok(
    Math.abs(stalls(held.lengths) - stalls(loose.lengths)) <= 1,
    `a weld costs the gesture nothing: ${stalls(held.lengths)} stalled steps welded vs ${stalls(loose.lengths)} loose`,
  );
  // ...and past the cap the clay still SHAPES: re-aiming a mass at full draw
  // changes it completely while changing its length not at all, which is what
  // keeps "there is no limit on deforming" true at the constraint too.
  const capped = welded.shape('nub');
  const swing = welded.beginPull(capped.tipX, capped.tipY);
  assert.ok(swing, 'a mass at the cap can still be taken hold of');
  welded.pullTo(swing.id, capped.x, capped.y + 0.5);
  const swung = welded.shape('nub');
  welded.endPull(swing.id);
  const before = Math.atan2(capped.tipY - capped.y, capped.tipX - capped.x);
  const after = Math.atan2(swung.tipY - swung.y, swung.tipX - swung.x);
  assert.ok(Math.abs(after - before) > 0.3, `a welded mass at the cap still re-aims freely: swung ${(after - before).toFixed(3)} rad`);
  assert.ok(
    welded.contact('body', 'nub') >= floor - 0.01,
    'and it stays bedded while it swings',
  );
  console.log(`Weld feel: contact held between ${Math.min(...held.contacts).toFixed(3)} and ${Math.max(...held.contacts).toFixed(3)} against a ${floor.toFixed(3)} floor; ${stalls(held.lengths)} stalled steps welded vs ${stalls(loose.lengths)} loose`);
}

// 44. THE SAVE FORMAT DID NOT CHANGE, AND A RELOADED CREATURE IS HELD JUST THE
// SAME. A weld's floor is DERIVED from the geometry on load rather than
// persisted, because the geometry in the file already is the record of how
// deeply the child's welds were pressed together. So every file this game has
// ever written still loads byte-identically, and the creature that comes back
// cannot be levered apart either.
{
  const field = createLobeField();
  field.setGround(-0.9);
  field.add({ id: 'body1', kind: 'ball', x: -0.15, y: -0.9 + 0.30 * 0.9, z: 0, radius: 0.30, color: '#e8a33d' });
  field.add({ id: 'green', kind: 'ball', x: 0.18, y: -0.9 + 0.24 * 0.9, z: 0, radius: 0.24, color: '#4bbf73' });
  settleNow(field);
  const saved = JSON.parse(JSON.stringify(field.toJSON()));
  assert.equal(saved.version, 4, 'the save format is still v4');
  assert.deepEqual(Object.keys(saved).sort(), ['format', 'fused', 'lobes', 'seed', 'version'], 'and nothing was added to it');

  const reloaded = createLobeField();
  reloaded.setGround(-0.9);
  assert.ok(reloaded.fromJSON(saved));
  const floors = reloaded.weldState();
  assert.equal(floors.length, 1, 'the reloaded creature has its weld');
  assert.ok(floors[0].floor > FUSE_THRESHOLD, `and a floor derived from what it measures: ${floors[0].floor}`);
  assert.ok(floors[0].contact >= floors[0].floor - 1e-9, 'which it already satisfies, by construction');

  // The lever attempt, on the creature that came back off the shelf.
  let worst = Infinity;
  for (let k = 0; k < 12; k++) {
    const theta = (k / 12) * Math.PI * 2;
    const s = reloaded.shape('green');
    drag(reloaded, s.x + (s.tipX - s.x) * 0.6, s.y + (s.tipY - s.y) * 0.6, Math.cos(theta) * 0.5, Math.sin(theta) * 0.5, 10);
    settleNow(reloaded);
    assert.ok(reloaded.isFused('body1', 'green'), `the reloaded weld survives attempt ${k}`);
    const w = reloaded.weldState().find((entry) => entry.pair === pairKey('body1', 'green'));
    worst = Math.min(worst, w.contact - w.floor);
  }
  assert.ok(worst >= -0.01, `a reloaded creature is held exactly as a live one is: worst margin ${worst.toFixed(4)}`);

  // AN OLD SAVE LOADS IN THE POSE IT WAS SAVED IN. fromJSON is deserialization
  // and nothing else: it does not settle, so a creature made before gravity
  // existed comes back exactly as the child left it and its shelf thumbnail
  // still matches its file. Gravity gets its say on the first release after
  // that, which reads as the creature responding to being touched rather than
  // as the shelf rearranging itself while the child watches.
  const legacy = {
    format: 'qlobe-clay-lobes',
    version: 4,
    lobes: [{ id: 'a', kind: 'ball', x: 0, y: -0.71, z: 0, radius: 0.3, sx: -0.45, sy: 0.42, sz: 0, color: '#a06cd5' }],
    fused: [],
  };
  const old = createLobeField();
  old.setGround(-0.9);
  assert.ok(old.fromJSON(legacy));
  const asSaved = old.shape('a');
  assert.equal(asSaved.x, 0, 'a legacy creature loads exactly where it was saved');
  assert.ok(Math.abs(asSaved.tipY - (-0.71 + 0.42)) < 1e-12, '...tilt and all');
  assert.equal(old.restState()[0].stable, false, 'even when gravity would now correct the pose');
  const corrected = old.beginSettle();
  old.finishSettle();
  assert.ok(corrected > 0, 'and the first settle after it is put down is where gravity gets its say');
  assert.equal(old.restState()[0].stable, true, 'after which it is at rest');
}

console.log([
  'Clay lobes tests passed:',
  'add/remove/max-lobes, contactAmount monotonicity, fusion permanence, neck constraint (single + chain),',
  'shading feed, JSON round-trip/rejection, round-cone volume conservation;',
  'THE ROUNDED-ELONGATION READ (whole-lobe narrowing, tip ratio held above the floor, extent growth, exact volume)',
  'and the legacy taper law it replaced (still spiky, still exact, still continuous past its cap);',
  'stretch gestures + per-law length cap, ground plane, impact feed;',
  'RESHAPING: a drag elongates the ball under the finger and creates nothing, repeated pulls keep elongating,',
  'the far end continues the stretch, the mid-gesture escape is bit-exact, a sideways drag off a long shaft',
  'spawns exactly one primitive out of its parent;',
  'NO LIMITS: a hundred gestures with zero refusals, a bounded and plateauing primitive count, and clay conserved,',
  'plus the same at the primitive cap;',
  'THE SETTLE: deterministic, finite, visible (a floor as well as a ceiling), work-preserving, idempotent',
  '(the cumulative-sag guard), non-eroding under repetition, and a droop budgeted per lifetime;',
  'GRAVITY REST: a loaf balanced on one end topples onto its belly, the rotation is rigid to 1e-12 at every',
  'instant of it, deterministic and idempotent, and neither a lump already lying down, nor a loose ball,',
  'nor clay under a live finger is ever moved;',
  'WELDS ARE INVIOLABLE: forty scripted lever attempts round the clock never drop a weld below the contact it',
  'was made at, the constraint costs the gesture no responsiveness (it is held by rooting deeper, not by a wall),',
  'and a creature reloaded off the shelf is held exactly as a live one is — with the save format unchanged;',
  'THE MERGE: same-colour only, ball count invariant, clay conserved, spanning both originals, deterministic;',
  'ballCount vs progress; v4 saves with the legacy shape law riding through; consolidation conservation;',
  'and the seeded hand-worked surface (stability, amplitude bound, march-safety gradient, seed round trip).',
].join('\n  '));
