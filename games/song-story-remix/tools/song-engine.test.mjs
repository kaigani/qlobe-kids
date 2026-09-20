#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSongEngine, lineIndexAt, midiToFrequency, validateSong } from '../js/song-engine.js';

const gameRoot = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));

assert.equal(midiToFrequency(69), 440);
assert.ok(Math.abs(midiToFrequency(60) - 261.625565) < 0.0001);

assert.equal(lineIndexAt(-1, 16), 0);
assert.equal(lineIndexAt(0, 16), 0);
assert.equal(lineIndexAt(3.99, 16), 0);
assert.equal(lineIndexAt(4, 16), 1);
assert.equal(lineIndexAt(8, 16), 2);
assert.equal(lineIndexAt(12, 16), 3);
assert.equal(lineIndexAt(99, 16), 3);
assert.equal(lineIndexAt(4, 0), 0);

assert.equal(config.songs.length, 3);
assert.ok(config.songs.every(validateSong));
assert.equal(validateSong({ melody: [], choices: [] }), false);
assert.equal(new Set(config.songs.flatMap((song) => song.choices.map((choice) => choice.id))).size, 9);
assert.ok(config.songs.every((song) => song.melody.length === 32));

// Node has no AudioContext, so this covers the engine's bounded silent fallback.
const engine = createSongEngine();
let ended = false;
const handle = engine.play(config.songs[0], { duration: 0.01, onEnd: () => { ended = true; } });
assert.ok(handle.startedAt > 0);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(ended, true);
engine.destroy();

console.log(`song-engine: PASS (${config.songs.length} songs; ${gameRoot})`);
