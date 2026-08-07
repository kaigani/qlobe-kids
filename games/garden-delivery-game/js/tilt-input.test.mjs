import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./tilt-input.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { createTiltInput } = await import(moduleUrl);

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatch(type, event = {}) { for (const callback of [...(listeners.get(type) ?? [])]) callback(event); },
    listenerCount(type) { return listeners.get(type)?.size ?? 0; },
  };
}

function setup({ permission, angle = 0, deviceEvent = true } = {}) {
  const win = eventTarget();
  win.screen = { orientation: { angle } };
  class DeviceOrientationEvent {}
  if (permission !== undefined) DeviceOrientationEvent.requestPermission = () => Promise.resolve(permission);
  if (deviceEvent) win.DeviceOrientationEvent = DeviceOrientationEvent;
  const samples = [];
  const statuses = [];
  const tilt = createTiltInput({
    window: win,
    orientation: win.screen.orientation,
    smoothing: 1,
    onSample: (sample) => samples.push(sample),
    onStatus: (status) => statuses.push(status),
  });
  return { win, samples, statuses, tilt, orientation: win.screen.orientation };
}

function calibrateWith(t, beta, gamma) {
  t.win.dispatch('deviceorientation', { beta, gamma });
  t.win.dispatch('deviceorientation', { beta, gamma });
  t.win.dispatch('deviceorientation', { beta, gamma });
}

console.log('tilt-input: permission status routes');
{
  const granted = setup({ permission: 'granted' });
  await granted.tilt.request();
  assert.deepEqual(granted.statuses, ['idle', 'requesting', 'active']);
  assert.equal(granted.win.listenerCount('deviceorientation'), 1);
  granted.tilt.destroy();

  const denied = setup({ permission: 'denied' });
  await denied.tilt.request();
  assert.deepEqual(denied.statuses, ['idle', 'requesting', 'denied']);
  assert.equal(denied.win.listenerCount('deviceorientation'), 0);
  denied.tilt.destroy();

  const unavailable = setup({ deviceEvent: false });
  await unavailable.tilt.request();
  assert.deepEqual(unavailable.statuses, ['idle', 'unavailable']);
  unavailable.tilt.destroy();
}

console.log('tilt-input: rotation mapping, calibration, clamp');
{
  const expected = [
    [0, 10, 4, { x: 4 / 30, y: 10 / 30 }],
    [90, 10, 4, { x: 10 / 30, y: -4 / 30 }],
    [180, 10, 4, { x: -4 / 30, y: -10 / 30 }],
    [270, 10, 4, { x: -10 / 30, y: 4 / 30 }],
  ];
  for (const [angle, beta, gamma, result] of expected) {
    const t = setup({ angle });
    await t.tilt.request();
    calibrateWith(t, 0, 0);
    t.win.dispatch('deviceorientation', { beta, gamma });
    const sample = t.samples.at(-1);
    assert.equal(sample.source, 'sensor');
    assert.equal(sample.x, result.x, `angle ${angle} x`);
    assert.equal(sample.y, result.y, `angle ${angle} y`);
    t.win.dispatch('deviceorientation', { beta: 120, gamma: 120 });
    assert.ok(Math.abs(t.samples.at(-1).x) <= 1 && Math.abs(t.samples.at(-1).y) <= 1, `angle ${angle} clamp`);
    t.tilt.destroy();
  }
}

console.log('tilt-input: pointer ownership and release');
{
  const t = setup();
  await t.tilt.request();
  calibrateWith(t, 0, 0);
  t.win.dispatch('deviceorientation', { beta: 0, gamma: 15 });
  t.tilt.setPointer(-2, 0.5);
  assert.deepEqual(t.samples.at(-1), { x: -1, y: 0.5, source: 'pointer' });
  t.win.dispatch('deviceorientation', { beta: 0, gamma: 30 });
  assert.equal(t.samples.at(-1).source, 'pointer', 'sensor must not displace an active pointer');
  t.tilt.releasePointer();
  assert.deepEqual(t.samples.at(-1), { x: 1, y: 0, source: 'sensor' });
  assert.equal(t.statuses.at(-1), 'active');
  t.win.dispatch('pointercancel');
  assert.equal(t.statuses.at(-1), 'active', 'a terminal event after release is harmless');
  t.tilt.destroy();
}

console.log('tilt-input: explicit calibration and reduced motion preserve mechanics');
{
  const t = setup();
  await t.tilt.request();
  t.win.dispatch('deviceorientation', { beta: 3, gamma: 12 });
  assert.equal(t.tilt.calibrate(), true);
  assert.deepEqual(t.samples.at(-1), { x: 0, y: 0, source: 'sensor' });
  t.win.dispatch('deviceorientation', { beta: 3, gamma: 27 });
  assert.deepEqual(t.samples.at(-1), { x: 0.5, y: 0, source: 'sensor' });
  t.tilt.destroy();

  const win = eventTarget();
  class DeviceOrientationEvent {}
  win.DeviceOrientationEvent = DeviceOrientationEvent;
  const samples = [];
  const reduced = createTiltInput({ window: win, reducedMotion: true, onSample: (sample) => samples.push(sample) });
  await reduced.request();
  reduced.setPointer(0.2, -0.2);
  assert.deepEqual(samples.at(-1), { x: 0.2, y: -0.2, source: 'pointer' }, 'reduced motion never disables input mechanics');
  reduced.destroy();
}

console.log('tilt-input: orientation change recalibrates and teardown is safe');
{
  const t = setup();
  await t.tilt.request();
  calibrateWith(t, 0, 0);
  t.win.dispatch('deviceorientation', { beta: 0, gamma: 15 });
  assert.equal(t.samples.at(-1).x, 0.5);
  t.orientation.angle = 90;
  t.win.dispatch('orientationchange');
  const beforeNewSamples = t.samples.length;
  t.win.dispatch('deviceorientation', { beta: 0, gamma: 15 });
  assert.equal(t.samples.length, beforeNewSamples, 'rotation starts a fresh stable calibration, not an old-axis sample');
  calibrateWith(t, 0, 15);
  t.win.dispatch('deviceorientation', { beta: 15, gamma: 15 });
  assert.deepEqual(t.samples.at(-1), { x: 0.5, y: 0, source: 'sensor' });
  const sampleCount = t.samples.length;
  t.tilt.setPointer(0.25, 0.25);
  t.tilt.destroy();
  t.tilt.destroy();
  assert.equal(t.win.listenerCount('deviceorientation'), 0);
  assert.equal(t.win.listenerCount('pointerup'), 0);
  t.win.dispatch('deviceorientation', { beta: 30, gamma: 30 });
  t.win.dispatch('pointerup');
  assert.equal(t.samples.length, sampleCount + 1, 'destroy prevents later sensor/cancel output');
}

console.log('tilt-input: all tests passed');
