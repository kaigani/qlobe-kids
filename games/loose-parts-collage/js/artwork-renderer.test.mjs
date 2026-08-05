import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeArtwork, renderArtworkToCanvas } from './artwork-renderer.js';

const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
const maliciousItem = {
  id: 'same-id',
  assetId: 'maple-leaf-coral',
  src: 'https://untrusted.example/payload.png',
  x: -99,
  y: 99,
  size: 99,
  rotation: 725,
  z: 5,
  mirror: 1,
  meta: { assetId: 'maple-leaf-coral', src: 'javascript:alert(1)', injected: true },
};
const normalized = normalizeArtwork({
  id: '<img>',
  paperId: 'not-a-paper',
  yarn: {
    strokes: [
      { textureId: 'sky', size: 9, points: Array.from({ length: 1900 }, (_, index) => ({ x: index / 100, y: -1 })) },
      { textureId: 'not-a-yarn', points: [{ x: .5, y: .5 }] },
    ],
  },
  collage: { items: Array.from({ length: 205 }, () => maliciousItem) },
}, config);

assert.equal(normalized.id, 'artwork');
assert.equal(normalized.paperId, 'cream');
assert.equal(normalized.yarn.strokes.length, 1);
assert.equal(normalized.yarn.strokes[0].textureId, 'sky');
assert.equal(normalized.yarn.strokes[0].points.length, 1800);
assert.equal(normalized.yarn.strokes[0].points[0].y, 0);
assert.equal(normalized.yarn.strokes[0].size, .09);
assert.equal(normalized.collage.items.length, 200);
assert.equal(normalized.collage.items[0].src, './assets/pieces/nature/maple-leaf-coral.webp');
assert.equal(normalized.collage.items[0].x, -.08);
assert.equal(normalized.collage.items[0].y, 1.08);
assert.equal(normalized.collage.items[0].size, .55);
assert.equal(normalized.collage.items[0].rotation, 5);
assert.deepEqual(normalized.collage.items[0].meta, { assetId: 'maple-leaf-coral', family: 'nature' });

const drawn = [];
globalThis.Image = class MockImage {
  naturalWidth = 100;
  naturalHeight = 50;
  complete = true;
  set src(value) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
  get src() { return this._src; }
};
const context = {
  clearRect() {}, fillRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
  translate() {}, rotate() {}, scale() {},
  drawImage(image) { drawn.push(image.src); },
};
const canvas = { width: 20, height: 20, getContext: () => context };
const render = await renderArtworkToCanvas(canvas, {
  paperId: 'sky',
  yarn: { strokes: [{ textureId: 'sky', points: [{ x: .1, y: .1 }, { x: .2, y: .2 }] }] },
  collage: { items: [{ assetId: 'acorn', x: .5, y: .5, size: .2, z: 1 }] },
}, config);
assert.equal(canvas.width, 1200);
assert.equal(canvas.height, 900);
assert.deepEqual(render.diagnostics.failures, []);
assert.equal(drawn[0], './assets/paper/sky.webp');
assert.ok(drawn.includes('./assets/yarn/sky.webp'));
assert.equal(drawn.at(-1), './assets/pieces/nature/acorn.webp');

console.log('artwork-renderer normalization tests passed');
