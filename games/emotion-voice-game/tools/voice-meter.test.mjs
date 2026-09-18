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

const originals = new Map();
function replaceGlobal(name, value) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function fakeStream() {
  const state = { stopped: false };
  const track = { stop() { state.stopped = true; } };
  return {
    state,
    get active() { return !state.stopped; },
    getTracks() { return [track]; },
  };
}

const contexts = [];
class FakeAudioContext {
  constructor() {
    this.sampleRate = sampleRate;
    this.closed = false;
    contexts.push(this);
  }

  async resume() {}

  createAnalyser() {
    return {
      fftSize: 32,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData(values) {
        values.fill(.08);
      },
    };
  }

  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }

  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

let rafId = 0;
const rafTimers = new Map();
const fakeNavigator = { mediaDevices: { getUserMedia: null } };

try {
  replaceGlobal('navigator', fakeNavigator);
  replaceGlobal('window', { AudioContext: FakeAudioContext });
  replaceGlobal('requestAnimationFrame', (callback) => {
    const id = ++rafId;
    const timer = setTimeout(() => {
      rafTimers.delete(id);
      callback(performance.now());
    }, 2);
    rafTimers.set(id, timer);
    return id;
  });
  replaceGlobal('cancelAnimationFrame', (id) => {
    clearTimeout(rafTimers.get(id));
    rafTimers.delete(id);
  });

  let releasePermission = null;
  const lateStream = fakeStream();
  fakeNavigator.mediaDevices.getUserMedia = () => new Promise((resolve) => {
    releasePermission = resolve;
  });
  const pendingMeter = meter.createVoiceMeter();
  const pendingRequest = pendingMeter.request();
  await Promise.resolve();
  assert.equal(typeof releasePermission, 'function');
  pendingMeter.close();
  releasePermission(lateStream);
  assert.equal(await pendingRequest, false);
  assert.equal(lateStream.state.stopped, true, 'late permission stream must be stopped');

  const liveStream = fakeStream();
  fakeNavigator.mediaDevices.getUserMedia = async () => liveStream;
  const liveMeter = meter.createVoiceMeter({ fftSize: 32 });
  const listening = liveMeter.listen({ durationMs: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 12));
  liveMeter.close();
  const cancelled = await listening;
  assert.equal(cancelled.cancelled, true, 'active analysis must resolve as cancelled');
  assert.equal(liveStream.state.stopped, true, 'active microphone track must stop');
  assert.equal(contexts.at(-1).closed, true, 'active AudioContext must close');
} finally {
  for (const timer of rafTimers.values()) clearTimeout(timer);
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

console.log('voice-meter: analysis, scoring, and cancellation teardown passed');
