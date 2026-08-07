// camera-throw.js — privacy-minimal, local-only color-object throw tracking.
//
// This service recognizes only coarse red/yellow/blue connected components in
// a tiny private frame, then emits normalized semantic throw events. It does
// not recognize a person, face, body, pose, identity, room, or general object.
// Raw pixels never leave this closure and there is no preview, recording,
// persistence, export, or network API.

const DEFAULT_WIDTH = 128;
const DEFAULT_HEIGHT = 96;
const DEFAULT_INTERVAL = 72;
const COLOR_NAMES = Object.freeze(['red', 'yellow', 'blue']);
const LABELS = Object.freeze({ red: 1, yellow: 2, blue: 3 });
const STOPPED_STREAMS = new WeakSet();

export function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, Number(value) || 0));
}

export function rgbToHsv(r, g, b) {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }
  if (hue < 0) hue += 360;
  return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

export function classifyThrowColor(r, g, b, {
  minSaturation = 0.46,
  minValue = 0.18,
  maxValue = 1,
} = {}) {
  const hsv = rgbToHsv(r, g, b);
  if (hsv.s < minSaturation || hsv.v < minValue || hsv.v > maxValue) return null;
  if (hsv.h <= 20 || hsv.h >= 342) return 'red';
  if (hsv.h >= 38 && hsv.h <= 72) return 'yellow';
  if (hsv.h >= 190 && hsv.h <= 252) return 'blue';
  return null;
}

/**
 * Find the largest plausible red/yellow/blue 4-connected component.
 * Returns no pixels or masks: only a frozen coarse summary.
 */
export function findLargestColorBlob(rgba, width, height, options = {}) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  if (!rgba || rgba.length !== w * h * 4) {
    throw new TypeError('Color frame must contain width × height complete RGBA pixels');
  }

  const total = w * h;
  const labels = new Uint8Array(total);
  const saturation = new Uint8Array(total);
  const perColor = [0, 0, 0, 0];
  for (let i = 0, p = 0; p < total; i += 4, p += 1) {
    if (rgba[i + 3] < 128) continue;
    const hsv = rgbToHsv(rgba[i], rgba[i + 1], rgba[i + 2]);
    const color = classifyThrowColor(rgba[i], rgba[i + 1], rgba[i + 2], options);
    if (!color) continue;
    const label = LABELS[color];
    labels[p] = label;
    saturation[p] = Math.round(hsv.s * 255);
    perColor[label] += 1;
  }

  const seen = new Uint8Array(total);
  const queue = new Int32Array(total);
  const minPixels = Math.max(6, Math.round(total * (options.minFraction ?? 0.0022)));
  const maxPixels = Math.round(total * (options.maxFraction ?? 0.34));
  let best = null;

  for (let start = 0; start < total; start += 1) {
    const label = labels[start];
    if (!label || seen[start]) continue;
    let head = 0;
    let tail = 1;
    queue[0] = start;
    seen[start] = 1;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let satSum = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;

    while (head < tail) {
      const index = queue[head++];
      const x = index % w;
      const y = (index / w) | 0;
      count += 1;
      sumX += x;
      sumY += y;
      satSum += saturation[index];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const left = index - 1;
      const right = index + 1;
      const up = index - w;
      const down = index + w;
      if (x > 0 && !seen[left] && labels[left] === label) { seen[left] = 1; queue[tail++] = left; }
      if (x + 1 < w && !seen[right] && labels[right] === label) { seen[right] = 1; queue[tail++] = right; }
      if (y > 0 && !seen[up] && labels[up] === label) { seen[up] = 1; queue[tail++] = up; }
      if (y + 1 < h && !seen[down] && labels[down] === label) { seen[down] = 1; queue[tail++] = down; }
    }

    if (count < minPixels || count > maxPixels) continue;
    const boxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
    const fill = count / boxArea;
    const isolation = count / Math.max(1, perColor[label]);
    const averageSaturation = satSum / (count * 255);
    const confidence = clamp(
      0.42 * clamp(count / Math.max(minPixels * 4, 1))
      + 0.23 * fill
      + 0.20 * isolation
      + 0.15 * averageSaturation,
    );
    const candidate = {
      color: COLOR_NAMES[label - 1],
      x: (sumX / count + 0.5) / w,
      y: (sumY / count + 0.5) / h,
      area: count / total,
      confidence,
      bounds: {
        x: minX / w,
        y: minY / h,
        w: (maxX - minX + 1) / w,
        h: (maxY - minY + 1) / h,
      },
    };
    if (!best || candidate.area > best.area
      || (candidate.area === best.area && candidate.confidence > best.confidence)) best = candidate;
  }

  return best ? freezeBlob(best) : null;
}

export function mapCameraX(x, mirrored = true) {
  const value = clamp(x);
  return mirrored ? 1 - value : value;
}

export function createThrowDetector(options = {}) {
  const settings = {
    minSpeed: Math.max(0.05, Number(options.minSpeed) || 0.52),
    exitSpeed: Math.max(0.05, Number(options.exitSpeed) || 0.62),
    minGrowth: Math.max(1.01, Number(options.minGrowth) || 1.16),
    strongGrowth: Math.max(1.01, Number(options.strongGrowth) || 1.42),
    minApproachArea: Math.max(0.001, Number(options.minApproachArea) || 0.009),
    maxGapMs: Math.max(60, Number(options.maxGapMs) || 210),
    cooldownMs: Math.max(100, Number(options.cooldownMs) || 800),
  };
  let previous = null;
  let motionSamples = 0;
  let armed = false;
  let lastEmitAt = -Infinity;
  let lastThrow = null;

  function reset({ keepCooldown = false } = {}) {
    previous = null;
    motionSamples = 0;
    armed = false;
    if (!keepCooldown) lastEmitAt = -Infinity;
    if (!keepCooldown) lastThrow = null;
  }

  function emit(sample, at, speed, reason) {
    if (at - lastEmitAt < settings.cooldownMs) return null;
    lastEmitAt = at;
    const confidence = clamp((sample.confidence ?? 0.5) * 0.72 + Math.min(1, speed) * 0.28);
    lastThrow = Object.freeze({
      x: clamp(sample.x),
      y: clamp(sample.y),
      color: sample.color || null,
      speed: Math.max(0, speed),
      confidence,
      at,
      reason,
    });
    previous = null;
    motionSamples = 0;
    armed = false;
    return lastThrow;
  }

  function push(blob, now = performance.now()) {
    const at = Number(now);
    if (!Number.isFinite(at)) throw new TypeError('Throw sample time must be finite');
    if (!blob) {
      if (armed && previous && at - previous.at <= settings.maxGapMs
        && previous.speed >= settings.exitSpeed && previous.area >= settings.minApproachArea) {
        return emit(previous, at, previous.speed, 'fast-exit');
      }
      if (previous && at - previous.at > settings.maxGapMs) {
        previous = null;
        motionSamples = 0;
        armed = false;
      }
      return null;
    }

    const sample = {
      x: clamp(blob.x),
      y: clamp(blob.y),
      area: Math.max(0, Number(blob.area) || 0),
      confidence: clamp(blob.confidence ?? 0.5),
      color: COLOR_NAMES.includes(blob.color) ? blob.color : null,
      at,
      speed: 0,
    };
    if (!previous || previous.color !== sample.color || at <= previous.at
      || at - previous.at > settings.maxGapMs) {
      previous = sample;
      motionSamples = 0;
      armed = false;
      return null;
    }

    const dt = Math.max(0.016, (at - previous.at) / 1000);
    const dx = sample.x - previous.x;
    const dy = sample.y - previous.y;
    const speed = Math.hypot(dx, dy) / dt;
    const growth = sample.area / Math.max(previous.area, 0.0001);
    sample.speed = speed;
    if (speed >= settings.minSpeed) motionSamples += 1;
    else motionSamples = Math.max(0, motionSamples - 1);
    if (motionSamples >= 2 || (speed >= settings.minSpeed && growth >= settings.strongGrowth)) armed = true;

    const approaching = growth >= settings.minGrowth && sample.area >= settings.minApproachArea;
    const descending = dy / dt > 0.12;
    const decisiveGrowth = growth >= settings.strongGrowth;
    previous = sample;
    if (armed && speed >= settings.minSpeed && approaching && (descending || decisiveGrowth)) {
      return emit(sample, at, speed, 'approach');
    }
    return null;
  }

  return {
    push,
    reset,
    snapshot: () => ({ armed, motionSamples, lastThrow, lastEmitAt }),
  };
}

export function createCameraThrow(options = {}) {
  return new CameraThrow(options);
}

class CameraThrow {
  constructor({
    video = null,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    intervalMs = DEFAULT_INTERVAL,
    requestTimeoutMs = 15000,
    mirrored = true,
    mediaDevices = globalThis.navigator?.mediaDevices,
    canvasFactory = () => document.createElement('canvas'),
    raf = (callback) => requestAnimationFrame(callback),
    caf = (id) => cancelAnimationFrame(id),
    detector = createThrowDetector(),
  } = {}) {
    this.video = video;
    this.mediaDevices = mediaDevices;
    this.width = Math.max(48, Math.min(192, Math.round(width)));
    this.height = Math.max(36, Math.min(144, Math.round(height)));
    this.intervalMs = Math.max(50, Number(intervalMs) || DEFAULT_INTERVAL);
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 15000);
    this.mirrored = Boolean(mirrored);
    this.raf = raf;
    this.caf = caf;
    this.detector = detector;
    this.canvas = canvasFactory();
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.context = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true,
    });
    if (!this.context) throw new Error('Camera throw tracking needs a private 2D context');

    this.state = 'idle';
    this.reason = null;
    this.stream = null;
    this.rafId = null;
    this.lastFrameAt = -Infinity;
    this.requestToken = 0;
    this.destroyed = false;
    this.listeners = new Set();
    this.throwListeners = new Set();
    this.trackListeners = [];
    this.blob = null;
    this.lastThrow = null;

    this.onVisibility = () => {
      if (document.visibilityState === 'hidden') this.stop('hidden');
    };
    this.onPageHide = () => this.stop('pagehide');
    globalThis.document?.addEventListener('visibilitychange', this.onVisibility);
    globalThis.addEventListener?.('pagehide', this.onPageHide);
  }

  snapshot() {
    return {
      state: this.state,
      reason: this.reason,
      mirrored: this.mirrored,
      blob: this.blob ? { ...this.blob, bounds: { ...this.blob.bounds } } : null,
      lastThrow: this.lastThrow ? { ...this.lastThrow } : null,
    };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  onThrow(listener) {
    if (typeof listener !== 'function') return () => {};
    this.throwListeners.add(listener);
    return () => this.throwListeners.delete(listener);
  }

  setMirrored(value) {
    this.mirrored = Boolean(value);
    this.detector.reset({ keepCooldown: true });
    this.emit();
    return this.snapshot();
  }

  async request() {
    if (this.destroyed) return this.snapshot();
    this.stop('restart');
    const token = ++this.requestToken;
    if (!this.video || typeof this.mediaDevices?.getUserMedia !== 'function') {
      this.setState('unavailable', 'camera-api-missing');
      return this.snapshot();
    }

    this.setState('requesting', null);
    let timeoutId;
    let timedOut = false;
    let source;
    try {
      source = Promise.resolve(this.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 24 },
        },
      }));
    } catch (error) {
      source = Promise.reject(error);
    }
    source.then((stream) => {
      if (timedOut || token !== this.requestToken || this.destroyed) stopStream(stream);
    }, () => {});
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        const error = new Error('Camera permission timed out');
        error.name = 'TimeoutError';
        reject(error);
      }, this.requestTimeoutMs);
    });

    let stream = null;
    try {
      stream = await Promise.race([source, timeout]);
      clearTimeout(timeoutId);
      if (token !== this.requestToken || this.destroyed) {
        stopStream(stream);
        return this.snapshot();
      }
      this.stream = stream;
      this.bindTracks(stream, token);
      this.video.muted = true;
      this.video.defaultMuted = true;
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.setAttribute?.('playsinline', '');
      this.video.srcObject = stream;
      await Promise.resolve(this.video.play?.());
      if (
        token !== this.requestToken
        || this.destroyed
        || this.stream !== stream
        || this.state !== 'requesting'
      ) {
        this.releaseStream(stream);
        return this.snapshot();
      }
      this.clearSamples();
      this.setState('live', null);
      this.scheduleFrame(token);
    } catch (error) {
      clearTimeout(timeoutId);
      if (token !== this.requestToken || this.destroyed) {
        if (stream) this.releaseStream(stream);
        return this.snapshot();
      }
      if (stream) this.releaseStream(stream);
      else this.releaseStream();
      const name = String(error?.name || 'Error');
      if (name === 'NotAllowedError' || name === 'SecurityError') this.setState('denied', 'permission-denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') this.setState('unavailable', 'camera-unavailable');
      else if (name === 'TimeoutError') this.setState('unavailable', 'permission-timeout');
      else this.setState('error', 'camera-start-failed');
    }
    return this.snapshot();
  }

  stop(reason = 'stopped') {
    ++this.requestToken;
    if (this.rafId !== null) this.caf(this.rafId);
    this.rafId = null;
    this.releaseStream();
    this.clearSamples();
    if (!this.destroyed) this.setState('stopped', reason);
    return this.snapshot();
  }

  destroy() {
    if (this.destroyed) return;
    this.stop('destroyed');
    this.destroyed = true;
    globalThis.document?.removeEventListener('visibilitychange', this.onVisibility);
    globalThis.removeEventListener?.('pagehide', this.onPageHide);
    this.listeners.clear();
    this.throwListeners.clear();
    this.state = 'destroyed';
    this.reason = 'destroyed';
  }

  bindTracks(stream, token) {
    this.unbindTracks();
    for (const track of stream?.getTracks?.() || []) {
      const ended = () => {
        if (token !== this.requestToken || this.destroyed || this.stream !== stream) return;
        this.releaseStream(stream);
        this.clearSamples();
        this.setState('ended', 'stream-ended');
      };
      track.addEventListener?.('ended', ended, { once: true });
      this.trackListeners.push([track, ended]);
    }
  }

  unbindTracks() {
    for (const [track, listener] of this.trackListeners) track.removeEventListener?.('ended', listener);
    this.trackListeners = [];
  }

  releaseStream(stream = this.stream) {
    if (stream && stream !== this.stream) {
      stopStream(stream);
      return false;
    }
    this.unbindTracks();
    const current = this.stream;
    stopStream(current);
    this.stream = null;
    if (this.video) {
      try { this.video.pause?.(); } catch { /* best effort */ }
      try {
        if (!current || this.video.srcObject === current) this.video.srcObject = null;
      } catch { /* older browsers */ }
    }
    return true;
  }

  clearSamples() {
    this.blob = null;
    this.lastThrow = null;
    this.detector.reset();
  }

  scheduleFrame(token) {
    if (this.rafId !== null || this.state !== 'live') return;
    this.rafId = this.raf((now) => {
      this.rafId = null;
      if (token !== this.requestToken || this.state !== 'live' || this.destroyed) return;
      if (now - this.lastFrameAt >= this.intervalMs) {
        this.lastFrameAt = now;
        this.sampleFrame(now);
      }
      this.scheduleFrame(token);
    });
  }

  sampleFrame(now = performance.now()) {
    if (!this.video || this.video.readyState < 2) return;
    try {
      drawCover(this.context, this.video, this.width, this.height);
      const rgba = this.context.getImageData(0, 0, this.width, this.height).data;
      const raw = findLargestColorBlob(rgba, this.width, this.height);
      this.blob = raw ? freezeBlob({ ...raw, x: mapCameraX(raw.x, this.mirrored) }) : null;
      const throwEvent = this.detector.push(this.blob, now);
      if (throwEvent) {
        this.lastThrow = throwEvent;
        for (const listener of this.throwListeners) {
          try { listener({ ...throwEvent }); } catch { /* observers cannot stop tracking */ }
        }
      }
      this.emit();
    } catch {
      this.releaseStream();
      this.clearSamples();
      this.setState('error', 'frame-read-failed');
    }
  }

  setState(state, reason) {
    this.state = state;
    this.reason = reason;
    this.emit();
  }

  emit() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      try { listener(snapshot); } catch { /* observers cannot stop tracking */ }
    }
  }
}

function drawCover(context, video, width, height) {
  const sourceWidth = Math.max(1, Number(video.videoWidth) || width);
  const sourceHeight = Math.max(1, Number(video.videoHeight) || height);
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
}

function freezeBlob(blob) {
  return Object.freeze({
    color: blob.color,
    x: clamp(blob.x),
    y: clamp(blob.y),
    area: Math.max(0, Number(blob.area) || 0),
    confidence: clamp(blob.confidence),
    bounds: Object.freeze({
      x: clamp(blob.bounds?.x),
      y: clamp(blob.bounds?.y),
      w: clamp(blob.bounds?.w),
      h: clamp(blob.bounds?.h),
    }),
  });
}

function stopStream(stream) {
  if (!stream || (typeof stream !== 'object' && typeof stream !== 'function')) return;
  if (STOPPED_STREAMS.has(stream)) return;
  STOPPED_STREAMS.add(stream);
  for (const track of stream?.getTracks?.() || []) {
    try { track.stop(); } catch { /* best effort */ }
  }
}
