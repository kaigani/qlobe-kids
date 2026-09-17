// voice-meter.js — local-only microphone energy and pitch features.
//
// The service never records, uploads, or persists audio. It exposes gentle,
// device-relative voice features for expressive-play games; it is not an
// emotion classifier and must never be presented to children as one.

const DEFAULT_THRESHOLD = 0.022;

export function analyzeVoiceFrame(samples, sampleRate = 48000) {
  if (!samples?.length) return { rms: 0, peak: 0, zcr: 0, pitch: 0 };
  let square = 0;
  let peak = 0;
  let crossings = 0;
  let previous = samples[0] || 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Number(samples[index]) || 0;
    square += value * value;
    peak = Math.max(peak, Math.abs(value));
    if ((value >= 0) !== (previous >= 0)) crossings += 1;
    previous = value;
  }
  const rms = Math.sqrt(square / samples.length);
  return {
    rms,
    peak,
    zcr: crossings / Math.max(1, samples.length - 1),
    pitch: rms >= 0.012 ? estimatePitch(samples, sampleRate) : 0,
  };
}

export function summarizeVoiceFrames(frames, { threshold = DEFAULT_THRESHOLD } = {}) {
  const all = (frames || []).filter((frame) => Number.isFinite(frame?.rms));
  const active = all.filter((frame) => frame.rms >= threshold);
  const rmsValues = active.map((frame) => frame.rms);
  const pitches = active.map((frame) => frame.pitch).filter((value) => value >= 70 && value <= 700);
  const meanRms = mean(rmsValues);
  const durationMs = active.reduce((total, frame) => total + (frame.dt || 0), 0);
  const pitchMean = mean(pitches);
  const pitchRange = pitches.length > 3 ? percentile(pitches, 0.9) - percentile(pitches, 0.1) : 0;
  const energyVariation = meanRms ? standardDeviation(rmsValues, meanRms) / meanRms : 0;
  return {
    heard: durationMs >= 320,
    durationMs: Math.round(durationMs),
    activeRatio: all.length ? active.length / all.length : 0,
    meanRms,
    peak: active.reduce((value, frame) => Math.max(value, frame.peak || 0), 0),
    pitchMean,
    pitchRange,
    energyVariation,
  };
}

export function voiceSparks(profile, summary) {
  if (!summary?.heard) return 0;
  const energy = clamp((summary.meanRms - 0.018) / 0.12);
  const movement = clamp(summary.pitchRange / 150 + summary.energyVariation / 1.25);
  const steadiness = 1 - clamp(summary.energyVariation / 1.15);
  const sustained = clamp(summary.durationMs / 1500);
  const scores = {
    happy: 0.35 + energy * 0.25 + movement * 0.25 + sustained * 0.15,
    proud: 0.4 + energy * 0.35 + steadiness * 0.1 + sustained * 0.15,
    calm: 0.45 + (1 - energy) * 0.2 + steadiness * 0.2 + sustained * 0.15,
    silly: 0.35 + movement * 0.4 + energy * 0.1 + sustained * 0.15,
  };
  const score = scores[profile] ?? 0.7;
  return score >= 0.78 ? 3 : score >= 0.58 ? 2 : 1;
}

export function createVoiceMeter({ fftSize = 2048 } = {}) {
  let context = null;
  let stream = null;
  let analyser = null;
  let source = null;
  let permission = 'unknown';
  let epoch = 0;
  let cancelActiveListen = null;

  function dispose(resources = {}) {
    try { resources.source?.disconnect(); } catch { /* already disconnected */ }
    for (const track of resources.stream?.getTracks?.() || []) track.stop();
    try {
      const closing = resources.context?.close();
      closing?.catch?.(() => {});
    } catch { /* already closed */ }
  }

  async function request() {
    if (analyser && stream?.active) return true;
    const requestEpoch = epoch;
    if (!navigator.mediaDevices?.getUserMedia) {
      permission = 'unavailable';
      return false;
    }
    let nextContext = null;
    let nextStream = null;
    let nextAnalyser = null;
    let nextSource = null;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        video: false,
      });
      if (requestEpoch !== epoch) {
        dispose({ stream: nextStream });
        return false;
      }
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) throw new Error('AudioContext unavailable');
      nextContext = new AudioCtor();
      await nextContext.resume();
      if (requestEpoch !== epoch) {
        dispose({ stream: nextStream, context: nextContext });
        return false;
      }
      nextAnalyser = nextContext.createAnalyser();
      nextAnalyser.fftSize = fftSize;
      nextAnalyser.smoothingTimeConstant = 0.18;
      nextSource = nextContext.createMediaStreamSource(nextStream);
      nextSource.connect(nextAnalyser);
      context = nextContext;
      stream = nextStream;
      analyser = nextAnalyser;
      source = nextSource;
      permission = 'granted';
      return true;
    } catch (error) {
      dispose({ source: nextSource, stream: nextStream, context: nextContext });
      if (requestEpoch === epoch) {
        permission = error?.name === 'NotAllowedError' ? 'denied' : 'unavailable';
      }
      return false;
    }
  }

  async function listen({ durationMs = 2300, threshold = DEFAULT_THRESHOLD, onFrame } = {}) {
    const listenEpoch = epoch;
    if (!(await request()) || listenEpoch !== epoch) {
      return { ...summarizeVoiceFrames([]), permission, cancelled: listenEpoch !== epoch };
    }
    const liveAnalyser = analyser;
    const liveContext = context;
    if (!liveAnalyser || !liveContext) {
      return { ...summarizeVoiceFrames([]), permission, cancelled: true };
    }
    const data = new Float32Array(liveAnalyser.fftSize);
    const frames = [];
    const started = performance.now();
    let previous = started;
    let cancelled = false;
    let raf = 0;

    const result = await new Promise((resolve) => {
      let settled = false;
      let cancel = null;
      const finish = (wasCancelled = false) => {
        if (settled) return;
        settled = true;
        cancelled ||= wasCancelled;
        if (raf) cancelAnimationFrame(raf);
        if (cancelActiveListen === cancel) cancelActiveListen = null;
        resolve(summarizeVoiceFrames(frames, { threshold }));
      };
      cancel = () => finish(true);
      cancelActiveListen = cancel;
      function tick(now) {
        if (listenEpoch !== epoch) return finish(true);
        if (now - started >= durationMs) return finish();
        try {
          liveAnalyser.getFloatTimeDomainData(data);
        } catch {
          return finish(true);
        }
        const frame = analyzeVoiceFrame(data, liveContext.sampleRate);
        frame.dt = Math.min(80, Math.max(0, now - previous));
        previous = now;
        frames.push(frame);
        onFrame?.({ ...frame, level: clamp((frame.rms - threshold * 0.6) / 0.13) });
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    });

    return {
      ...result,
      permission,
      cancelled,
    };
  }

  function close() {
    epoch += 1;
    cancelActiveListen?.();
    cancelActiveListen = null;
    dispose({ source, stream, context });
    source = null;
    analyser = null;
    stream = null;
    context = null;
  }

  return { request, listen, close, get permission() { return permission; } };
}

function estimatePitch(samples, sampleRate) {
  const minLag = Math.max(2, Math.floor(sampleRate / 700));
  const maxLag = Math.min(samples.length - 2, Math.floor(sampleRate / 70));
  let bestLag = 0;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag += 2) {
    let product = 0;
    let left = 0;
    let right = 0;
    const limit = samples.length - lag;
    for (let index = 0; index < limit; index += 2) {
      const a = samples[index];
      const b = samples[index + lag];
      product += a * b;
      left += a * a;
      right += b * b;
    }
    const correlation = product / Math.sqrt(left * right || 1);
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  return bestCorrelation >= 0.5 && bestLag ? sampleRate / bestLag : 0;
}

function mean(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function standardDeviation(values, average = mean(values)) {
  return values.length ? Math.sqrt(mean(values.map((value) => (value - average) ** 2))) : 0;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
