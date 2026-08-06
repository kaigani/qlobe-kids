// camera-motion.js — privacy-minimal, local-only scene-motion feedback.
//
// The service intentionally answers only “how much did this tiny frame change?”
// It does not recognize a person, face, pose, object, identity, or gesture. Raw
// pixels never leave this closure and there is no recording/export API.

const DEFAULT_WIDTH = 64;
const DEFAULT_HEIGHT = 48;
const DEFAULT_INTERVAL = 90;

export function rgbaToLuminance(rgba, target) {
  if (!rgba || rgba.length % 4 !== 0) throw new TypeError('RGBA data must contain complete pixels');
  const out = target && target.length === rgba.length / 4
    ? target
    : new Uint8Array(rgba.length / 4);
  for (let source = 0, dest = 0; source < rgba.length; source += 4, dest += 1) {
    // Integer approximation of Rec. 601. Alpha is deliberately ignored.
    out[dest] = (77 * rgba[source] + 150 * rgba[source + 1] + 29 * rgba[source + 2]) >> 8;
  }
  return out;
}

export function measureFrameDifference(previous, current, { noise = 5 } = {}) {
  if (!previous || !current || previous.length !== current.length || !current.length) {
    throw new TypeError('Motion frames must be non-empty and the same length');
  }
  const floor = Math.max(0, Math.min(254, Number(noise) || 0));
  let changed = 0;
  for (let i = 0; i < current.length; i += 1) {
    changed += Math.max(0, Math.abs(current[i] - previous[i]) - floor);
  }
  return changed / (current.length * (255 - floor));
}

export function activityFromDifference(raw, baseline = 0) {
  const adjusted = Math.max(0, Number(raw) - Math.max(0, Number(baseline)) - 0.004);
  return clamp(adjusted / 0.12, 0, 1);
}

export function createCameraMotion(options = {}) {
  return new CameraMotion(options);
}

class CameraMotion {
  constructor({
    video = null,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    intervalMs = DEFAULT_INTERVAL,
    requestTimeoutMs = 15000,
    mediaDevices = globalThis.navigator?.mediaDevices,
    canvasFactory = () => document.createElement('canvas'),
    raf = (callback) => requestAnimationFrame(callback),
    caf = (id) => cancelAnimationFrame(id),
  } = {}) {
    this.video = video;
    this.mediaDevices = mediaDevices;
    this.width = Math.max(24, Math.min(160, Math.round(width)));
    this.height = Math.max(18, Math.min(120, Math.round(height)));
    this.intervalMs = Math.max(50, Number(intervalMs) || DEFAULT_INTERVAL);
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 15000);
    this.raf = raf;
    this.caf = caf;

    this.canvas = canvasFactory();
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.context = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true,
    });
    if (!this.context) throw new Error('Camera motion needs a private 2D context');

    this.state = 'idle';
    this.reason = null;
    this.stream = null;
    this.frame = null;
    this.rafId = null;
    this.lastFrameAt = -Infinity;
    this.requestToken = 0;
    this.destroyed = false;
    this.listeners = new Set();
    this.trackListeners = [];
    this.summary = Object.freeze({
      activity: 0,
      stillness: 1,
      rawActivity: 0,
      baseline: 0,
      calibrated: false,
      sampleCount: 0,
    });

    this.onVisibility = () => {
      if (document.visibilityState === 'hidden') this.stop('hidden');
    };
    this.onPageHide = () => this.stop('pagehide');
    globalThis.document?.addEventListener('visibilitychange', this.onVisibility);
    globalThis.addEventListener?.('pagehide', this.onPageHide);
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return { state: this.state, reason: this.reason, summary: { ...this.summary } };
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
      // Invoke synchronously inside the caller's camera-button handler. Some
      // WebKit builds are stricter when the request is deferred to a microtask.
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
    // A browser permission sheet cannot be programmatically dismissed. If the
    // app moves on, a late grant is immediately stopped before it touches video.
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

    try {
      const stream = await Promise.race([source, timeout]);
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
      if (token !== this.requestToken || this.destroyed) {
        this.releaseStream();
        return this.snapshot();
      }
      this.resetSamples();
      this.setState('live', null);
      this.scheduleFrame(token);
    } catch (error) {
      clearTimeout(timeoutId);
      if (token !== this.requestToken || this.destroyed) return this.snapshot();
      this.releaseStream();
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
    this.resetSamples();
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
    this.state = 'destroyed';
    this.reason = 'destroyed';
  }

  bindTracks(stream, token) {
    this.unbindTracks();
    for (const track of stream?.getTracks?.() || []) {
      const ended = () => {
        if (token !== this.requestToken || this.destroyed) return;
        this.releaseStream();
        this.resetSamples();
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

  releaseStream() {
    this.unbindTracks();
    stopStream(this.stream);
    this.stream = null;
    if (this.video) {
      try { this.video.pause?.(); } catch { /* media cleanup is best-effort */ }
      try { this.video.srcObject = null; } catch { /* older browsers */ }
    }
  }

  resetSamples() {
    this.frame = null;
    this.lastFrameAt = -Infinity;
    this.summary = Object.freeze({
      activity: 0,
      stillness: 1,
      rawActivity: 0,
      baseline: 0,
      calibrated: false,
      sampleCount: 0,
    });
  }

  scheduleFrame(token) {
    if (this.rafId !== null || this.state !== 'live') return;
    this.rafId = this.raf((now) => {
      this.rafId = null;
      if (token !== this.requestToken || this.state !== 'live' || this.destroyed) return;
      if (now - this.lastFrameAt >= this.intervalMs) {
        this.lastFrameAt = now;
        this.sampleFrame();
      }
      this.scheduleFrame(token);
    });
  }

  sampleFrame() {
    if (!this.video || this.video.readyState < 2) return;
    try {
      this.context.drawImage(this.video, 0, 0, this.width, this.height);
      const rgba = this.context.getImageData(0, 0, this.width, this.height).data;
      const current = rgbaToLuminance(rgba);
      if (!this.frame) {
        this.frame = current;
        return;
      }
      const raw = measureFrameDifference(this.frame, current);
      this.frame = current;
      const count = this.summary.sampleCount + 1;
      const baseline = count <= 12
        ? (count === 1 ? raw : Math.min(this.summary.baseline, raw))
        : this.summary.baseline;
      const instant = activityFromDifference(raw, baseline);
      const activity = clamp(this.summary.activity * 0.58 + instant * 0.42, 0, 1);
      this.summary = Object.freeze({
        activity: round(activity),
        stillness: round(1 - activity),
        rawActivity: round(raw),
        baseline: round(baseline),
        calibrated: count >= 8,
        sampleCount: count,
      });
      this.emit();
    } catch {
      // A single frame can fail while video changes dimensions/backgrounds.
      // Losing the stream itself is handled by the track's `ended` listener.
    }
  }

  setState(state, reason) {
    this.state = state;
    this.reason = reason;
    this.emit();
  }

  emit() {
    const value = this.snapshot();
    for (const listener of this.listeners) {
      try { listener(value); } catch { /* observers cannot break camera cleanup */ }
    }
  }
}

function stopStream(stream) {
  for (const track of stream?.getTracks?.() || []) {
    try { track.stop(); } catch { /* already ended */ }
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
