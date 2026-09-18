/**
 * Normalized tablet tilt and pointer input for balance-style games.
 *
 * `onSample` receives `{ x, y, source }`, where both axes are normalized to
 * -1..1. `x` follows the visible horizontal screen axis and `y` follows its
 * vertical axis, regardless of whether the device is portrait or landscape.
 * Pointer coordinates are already expected to be normalized by the caller.
 *
 * The only privileged operation in this module is iOS's
 * `DeviceOrientationEvent.requestPermission()`, and it is called only by
 * `request()`. Call that method directly from a user gesture.
 */

const DEFAULT_TILT_RANGE = 30;
const DEFAULT_SMOOTHING = 0.24;
const DEFAULT_STABLE_SAMPLES = 3;
const DEFAULT_STABLE_DELTA = 1.5;

function clamp(value, min = -1, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function orientationAngle(orientation) {
  const candidate = typeof orientation === 'function' ? orientation() : orientation;
  const raw = typeof candidate === 'number'
    ? candidate
    : candidate?.angle ?? candidate?.orientation;
  if (!Number.isFinite(raw)) return 0;
  return ((raw % 360) + 360) % 360;
}

/** Maps DeviceOrientation beta/gamma into visible screen axes. */
function mapAxes(beta, gamma, angle) {
  switch (angle) {
    case 90: return { x: beta, y: -gamma };
    case 180: return { x: -gamma, y: -beta };
    case 270: return { x: -beta, y: gamma };
    default: return { x: gamma, y: beta };
  }
}

/**
 * Create a normalized input service.
 *
 * `window`, `DeviceOrientationEvent`, and `orientation` are optional injected
 * dependencies for non-browser consumers and deterministic tests. `reducedMotion`
 * is accepted deliberately but does not change input: it controls decorative
 * motion in the game, while tilt and pointer mechanics must remain available.
 */
export function createTiltInput({
  onSample = () => {},
  onStatus = () => {},
  reducedMotion = false,
  window: suppliedWindow,
  DeviceOrientationEvent: suppliedDeviceOrientationEvent,
  orientation: suppliedOrientation,
  tiltRange = DEFAULT_TILT_RANGE,
  smoothing = DEFAULT_SMOOTHING,
  stableSamples = DEFAULT_STABLE_SAMPLES,
  stableDelta = DEFAULT_STABLE_DELTA,
} = {}) {
  // Read the global only when a browser provides one; importing this module in
  // Node must not create a browser-only dependency.
  const win = suppliedWindow ?? (typeof window === 'undefined' ? null : window);
  const deviceOrientationEvent = suppliedDeviceOrientationEvent ?? win?.DeviceOrientationEvent;
  const orientation = suppliedOrientation ?? win?.screen?.orientation ?? win;
  const range = Math.max(0.001, Number.isFinite(tiltRange) ? Math.abs(tiltRange) : DEFAULT_TILT_RANGE);
  const alpha = clamp(Number.isFinite(smoothing) ? smoothing : DEFAULT_SMOOTHING, 0, 1);
  const requiredStableSamples = Math.max(1, Math.floor(Number.isFinite(stableSamples) ? stableSamples : DEFAULT_STABLE_SAMPLES));
  const maxStableDelta = Math.max(0, Number.isFinite(stableDelta) ? stableDelta : DEFAULT_STABLE_DELTA);

  // Kept as an explicit read so linting/optimizers do not mistake the accepted
  // option for an accidental omission. It intentionally has no input effect.
  void reducedMotion;

  let status = 'idle';
  let destroyed = false;
  let sensorAttached = false;
  let pointerActive = false;
  let requestPromise = null;
  let requestGeneration = 0;
  let origin = null;
  let stable = [];
  let lastRaw = null;
  let smoothed = { x: 0, y: 0 };

  const notifyStatus = (next) => {
    if (destroyed || status === next) return;
    status = next;
    try { onStatus(status); } catch { /* callbacks must not disable controls */ }
  };
  const emit = (x, y, source) => {
    if (destroyed) return;
    try { onSample({ x: clamp(x), y: clamp(y), source }); } catch { /* keep listeners usable */ }
  };

  const resetCalibration = () => {
    origin = null;
    stable = [];
    smoothed = { x: 0, y: 0 };
  };
  const outputSensor = () => {
    if (!lastRaw || !origin || pointerActive) return;
    const targetX = clamp((lastRaw.x - origin.x) / range);
    const targetY = clamp((lastRaw.y - origin.y) / range);
    smoothed = {
      x: clamp(smoothed.x + (targetX - smoothed.x) * alpha),
      y: clamp(smoothed.y + (targetY - smoothed.y) * alpha),
    };
    emit(smoothed.x, smoothed.y, 'sensor');
  };
  const acceptRaw = (raw) => {
    lastRaw = raw;
    if (!origin) {
      stable.push(raw);
      if (stable.length > requiredStableSamples) stable.shift();
      const first = stable[0];
      const isStable = stable.length === requiredStableSamples
        && stable.every((sample) => Math.abs(sample.x - first.x) <= maxStableDelta
          && Math.abs(sample.y - first.y) <= maxStableDelta);
      if (!isStable) return;
      origin = stable.reduce((total, sample) => ({ x: total.x + sample.x, y: total.y + sample.y }), { x: 0, y: 0 });
      origin.x /= stable.length;
      origin.y /= stable.length;
      stable = [];
      smoothed = { x: 0, y: 0 };
    }
    outputSensor();
  };
  const handleDeviceOrientation = (event) => {
    const beta = finite(event?.beta);
    const gamma = finite(event?.gamma);
    if (beta === null || gamma === null) return;
    acceptRaw(mapAxes(beta, gamma, orientationAngle(orientation)));
  };
  const attachSensor = () => {
    if (destroyed || sensorAttached) return false;
    if (!win?.addEventListener || !deviceOrientationEvent) return false;
    win.addEventListener('deviceorientation', handleDeviceOrientation);
    sensorAttached = true;
    return true;
  };
  const detachSensor = () => {
    if (!sensorAttached) return;
    win?.removeEventListener?.('deviceorientation', handleDeviceOrientation);
    sensorAttached = false;
  };

  const releaseForCancel = () => {
    if (pointerActive) service.releasePointer();
  };
  const handleOrientationChange = () => {
    // Rotation can invalidate both a drag coordinate system and its former
    // neutral. Do not wait for an unreliable pointerup from a rotating tablet.
    pointerActive = false;
    resetCalibration();
    if (sensorAttached) notifyStatus('active');
    else if (status === 'fallback') notifyStatus('fallback');
  };

  if (win?.addEventListener) {
    win.addEventListener('pointerup', releaseForCancel);
    win.addEventListener('pointercancel', releaseForCancel);
    win.addEventListener('blur', releaseForCancel);
    win.addEventListener('orientationchange', handleOrientationChange);
  }

  const service = {
    /** Request sensor access. Invoke directly in a user-gesture task on iOS. */
    request() {
      if (destroyed) return Promise.resolve(status);
      if (sensorAttached) return Promise.resolve(status);
      if (requestPromise) return requestPromise;
      if (!deviceOrientationEvent || !win?.addEventListener) {
        notifyStatus('unavailable');
        return Promise.resolve(status);
      }

      const generation = ++requestGeneration;
      const permission = deviceOrientationEvent.requestPermission;
      if (typeof permission !== 'function') {
        attachSensor();
        if (!pointerActive) notifyStatus('active');
        return Promise.resolve(status);
      }

      notifyStatus('requesting');
      // Deliberately call before creating/awaiting any other async work so this
      // remains in the caller's gesture task.
      let permissionResult;
      try {
        permissionResult = permission.call(deviceOrientationEvent);
      } catch {
        notifyStatus('denied');
        return Promise.resolve(status);
      }
      requestPromise = Promise.resolve(permissionResult)
        .then((result) => {
          if (destroyed || generation !== requestGeneration) return status;
          if (result !== 'granted') {
            notifyStatus('denied');
            return status;
          }
          if (!attachSensor()) {
            notifyStatus('unavailable');
            return status;
          }
          if (!pointerActive) notifyStatus('active');
          return status;
        })
        .catch(() => {
          if (!destroyed && generation === requestGeneration) notifyStatus('denied');
          return status;
        })
        .finally(() => { if (generation === requestGeneration) requestPromise = null; });
      return requestPromise;
    },

    /** Set the current device position as neutral when a sensor sample exists. */
    calibrate() {
      if (destroyed || !lastRaw) return false;
      origin = { ...lastRaw };
      stable = [];
      smoothed = { x: 0, y: 0 };
      if (!pointerActive) emit(0, 0, 'sensor');
      return true;
    },

    /** Supply a normalized pointer sample. Pointer temporarily owns input. */
    setPointer(x, y) {
      if (destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      pointerActive = true;
      notifyStatus('fallback');
      emit(x, y, 'pointer');
      return true;
    },

    /** Release pointer ownership; a live sensor resumes without a new request. */
    releasePointer() {
      if (destroyed || !pointerActive) return false;
      pointerActive = false;
      if (sensorAttached) {
        notifyStatus('active');
        outputSensor();
      } else {
        notifyStatus('fallback');
      }
      return true;
    },

    /** Remove all window listeners. Safe to call repeatedly, including mid-request. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestGeneration += 1;
      detachSensor();
      win?.removeEventListener?.('pointerup', releaseForCancel);
      win?.removeEventListener?.('pointercancel', releaseForCancel);
      win?.removeEventListener?.('blur', releaseForCancel);
      win?.removeEventListener?.('orientationchange', handleOrientationChange);
      pointerActive = false;
      stable = [];
      lastRaw = null;
    },
  };

  // Tell consumers the known initial state after all callbacks and listeners
  // have been safely established.
  try { onStatus(status); } catch { /* same callback safety as later updates */ }
  return service;
}
