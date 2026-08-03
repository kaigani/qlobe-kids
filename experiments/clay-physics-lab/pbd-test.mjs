import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./pbd-solver.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { createIcosphere, createPlasticSphere } = await import(moduleUrl);

const topology = createIcosphere(3, 1);
assert.equal(topology.positions.length / 3, 642, 'detail-3 icosphere should have 642 welded vertices');
assert.equal(topology.indices.length / 3, 1280, 'detail-3 icosphere should have 1280 triangles');

const sphere = createPlasticSphere({ detail: 3, recovery: 0, substeps: 3, iterations: 6 });
const initial = sphere.metrics();
assert.equal(initial.vertices, 642);
assert.ok(initial.constraints > 2500, 'surface should have edges, spokes, and volume constraint');

let topVertex = 0;
for (let vertex = 1; vertex < sphere.positions.length / 3; vertex += 1) {
  if (sphere.positions[vertex * 3 + 1] > sphere.positions[topVertex * 3 + 1]) topVertex = vertex;
}
const offset = topVertex * 3;
const grabPoint = [sphere.positions[offset], sphere.positions[offset + 1], sphere.positions[offset + 2]];
const affected = sphere.beginGrab(grabPoint, { brushRadius: 0.58 });
assert.ok(affected > 10 && affected < 180, `brush should be local, affected ${affected} vertices`);
sphere.setGrabDisplacement([0.28, -0.22, 0]);
for (let frame = 0; frame < 70; frame += 1) sphere.step(1 / 60);
sphere.releaseGrab();
for (let frame = 0; frame < 90; frame += 1) sphere.step(1 / 60);

const deformed = sphere.metrics();
assert.ok(Number.isFinite(deformed.volumeDriftPercent));
assert.ok(deformed.volumeDriftPercent < 0.5, `volume drift ${deformed.volumeDriftPercent.toFixed(4)}% should stay below 0.5%`);
assert.ok(deformed.plasticStrain > 0.002, 'yield/creep should store a plastic rest-state change');
assert.ok(sphere.positions[offset] - grabPoint[0] > 0.05, 'pulled region should retain visible displacement after release');
assert.equal(deformed.invertedTriangles, 0, 'bounded pull should not invert surface triangles');
for (const value of sphere.positions) assert.ok(Number.isFinite(value), 'positions must remain finite');

sphere.reset();
const reset = sphere.metrics();
assert.ok(reset.volumeDriftPercent < 1e-4, 'reset should restore target volume');
assert.ok(reset.plasticStrain < 1e-7, 'reset should restore the original rest state');
assert.equal(reset.invertedTriangles, 0, 'reset sphere should have outward-facing triangles');

console.log(JSON.stringify({ initial, deformed, reset }, null, 2));
