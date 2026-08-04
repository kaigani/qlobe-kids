import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../../../shared/js/voice-meter.js', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const meter = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const sampleRate = 48000;
const samples = Float32Array.from({ length: 2048 }, (_, index) =>
  Math.sin(2 * Math.PI * 240 * index / sampleRate) * 0.12);
const frame = meter.analyzeVoiceFrame(samples, sampleRate);
assert.ok(frame.rms > 0.07 && frame.rms < 0.1, `unexpected RMS ${frame.rms}`);
assert.ok(frame.pitch > 210 && frame.pitch < 270, `unexpected pitch ${frame.pitch}`);

const quiet = meter.summarizeVoiceFrames([{ rms: 0.005, peak: 0.01, pitch: 0, dt: 500 }]);
assert.equal(quiet.heard, false);
assert.equal(meter.voiceSparks('happy', quiet), 0);

const expressive = meter.summarizeVoiceFrames([
  { rms: 0.08, peak: 0.18, pitch: 170, dt: 350 },
  { rms: 0.11, peak: 0.24, pitch: 245, dt: 350 },
  { rms: 0.07, peak: 0.16, pitch: 310, dt: 350 },
  { rms: 0.12, peak: 0.27, pitch: 210, dt: 350 },
]);
assert.equal(expressive.heard, true);
assert.ok(expressive.pitchRange > 50);
assert.ok(meter.voiceSparks('happy', expressive) >= 2);
assert.ok(meter.voiceSparks('silly', expressive) >= 2);

console.log('voice-meter: analysis, silence gate, and expressive scoring passed');
