import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the browser module as a data URL so this test stays runnable in this
// repository (which intentionally has no root package.json type declaration).
const source = await readFile(new URL('../js/letter-writing.js', import.meta.url), 'utf8');
const { createLetterWriter } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));

function canvas() {
  const ctx = { beginPath() {}, setLineDash() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, clearRect() {}, save() {}, restore() {}, scale() {} };
  return { width: 0, height: 0, style: {}, clientWidth: 400, clientHeight: 300, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }), addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {} };
}
const line = (a, b, steps = 30) => Array.from({ length: steps + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }));
const trace = (writer, path) => { assert.equal(writer.pointerDown(path[0]), true); for (const p of path.slice(1)) writer.pointerMove(p); writer.pointerUp(); };

const events = [];
const writer = createLetterWriter({ canvas: canvas(), tolerance: .08, onStrokeComplete: (e) => events.push(`s${e.stroke}`), onLetterComplete: () => events.push('letter') });
writer.setLetter({ id: 'l', strokes: [line({ x: .25, y: .2 }, { x: .25, y: .8 }), line({ x: .25, y: .8 }, { x: .7, y: .8 })] });
assert.equal(writer.pointerDown({ x: .9, y: .9 }), false, 'distant starts cannot begin');
assert.equal(writer.pointerDown({ x: .25, y: .2 }), true);
assert.equal(writer.pointerMove({ x: .25, y: .8 }), false, 'a stray endpoint jump cannot complete');
assert.equal(writer.getState().completed, 0);
trace(writer, line({ x: .25, y: .2 }, { x: .25, y: .8 }));
assert.equal(writer.getState().completed, 1, 'first stroke completes');
assert.equal(writer.pointerDown({ x: .25, y: .2 }), false, 'second stroke must start in order');
trace(writer, line({ x: .25, y: .8 }, { x: .7, y: .8 }));
assert.deepEqual(events, ['s0', 's1', 'letter']);
assert.equal(writer.getState().complete, true);
assert.equal(writer.debugTrace().total, 2);
writer.reset();
writer.pointerDown({ x: .25, y: .2 }); writer.pointerMove({ x: .25, y: .35 }); writer.pointerUp();
assert.equal(writer.getState().completed, 0, 'cancel/lift recovers without completing');
trace(writer, line({ x: .25, y: .2 }, { x: .25, y: .8 }));
assert.equal(writer.debugTrace().completed, 1, 'debug trace follows actual progress');
const sized = writer.resize(); assert.deepEqual(sized, { width: 400, height: 300, dpr: 1 });
writer.destroy();

// The manuscript e must teach a left-to-right crossbar before its loop/tail;
// this guards against accidentally restoring the old reversed formation path.
const eGuide = config.letters.e.strokes;
assert.equal(eGuide.length, 1, 'lowercase e is one continuous formation');
assert.ok(eGuide[0][0][0] < .3, 'lowercase e starts near the left midline');
assert.ok(eGuide[0][3][0] > .65, 'lowercase e crosses left to right before looping');
assert.ok(eGuide[0][4][1] < eGuide[0][3][1], 'lowercase e rises into its loop after the crossbar');
console.log('letter-writing tests passed');
