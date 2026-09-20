const TWO_PI = Math.PI * 2;

export function midiToFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

export function lineIndexAt(elapsedSeconds, durationSeconds, lineCount = 4) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const line = Math.floor((elapsedSeconds / durationSeconds) * lineCount);
  return Math.max(0, Math.min(lineCount - 1, line));
}

export function validateSong(song) {
  if (!song || !Array.isArray(song.melody) || !song.melody.length) return false;
  if (!Array.isArray(song.choices) || song.choices.length !== 3) return false;
  return song.choices.every((choice) => Array.isArray(choice.lyrics) && choice.lyrics.length === 4);
}

export function createSongEngine({ volume = 0.22 } = {}) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  let context = null;
  let master = null;
  let muted = false;
  let timer = 0;
  let runId = 0;
  const voices = new Set();

  function ensureContext() {
    if (!AudioContextClass) return null;
    if (!context) {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(context.destination);
    }
    return context;
  }

  async function unlock() {
    const ctx = ensureContext();
    if (!ctx) return false;
    try { await ctx.resume(); } catch { /* Audio remains an optional enhancement. */ }
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.00001;
    oscillator.connect(gain).connect(master);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.015);
    return ctx.state === 'running';
  }

  function envelope(gain, at, peak, hold, release) {
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.018);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.5), at + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + hold + release);
  }

  function scheduleTone(midi, at, length, instrument = 'space', accent = 1) {
    const ctx = ensureContext();
    if (!ctx || !Number.isFinite(midi)) return;
    const frequency = midiToFrequency(midi);
    const gain = ctx.createGain();
    const primary = ctx.createOscillator();
    const shimmer = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();

    const profiles = {
      rain: { wave: 'sine', second: 'triangle', ratio: 2, detune: 3, peak: 0.34, cutoff: 2800, hold: 0.16, release: 0.34 },
      space: { wave: 'sine', second: 'sine', ratio: 2, detune: 7, peak: 0.3, cutoff: 4200, hold: 0.2, release: 0.52 },
      jungle: { wave: 'triangle', second: 'sine', ratio: 0.5, detune: 0, peak: 0.38, cutoff: 1900, hold: 0.18, release: 0.25 },
    };
    const profile = profiles[instrument] || profiles.space;
    primary.type = profile.wave;
    shimmer.type = profile.second;
    primary.frequency.setValueAtTime(frequency, at);
    shimmer.frequency.setValueAtTime(frequency * profile.ratio, at);
    shimmer.detune.setValueAtTime(profile.detune, at);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(profile.cutoff, at);
    envelope(gain, at, profile.peak * accent, Math.min(length * 0.55, profile.hold), Math.min(length * 0.8, profile.release));

    primary.connect(filter);
    shimmer.connect(filter);
    filter.connect(gain).connect(master);
    const end = at + Math.max(length, profile.hold + profile.release) + 0.04;
    voices.add(primary);
    voices.add(shimmer);
    primary.addEventListener('ended', () => voices.delete(primary), { once: true });
    shimmer.addEventListener('ended', () => voices.delete(shimmer), { once: true });
    primary.start(at);
    shimmer.start(at);
    primary.stop(end);
    shimmer.stop(end);
  }

  function scheduleBeat(at, instrument, strong) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = instrument === 'space' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(strong ? 108 : 146, at);
    osc.frequency.exponentialRampToValueAtTime(54, at + 0.11);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.18 : 0.09, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    osc.connect(gain).connect(master);
    voices.add(osc);
    osc.addEventListener('ended', () => voices.delete(osc), { once: true });
    osc.start(at);
    osc.stop(at + 0.17);
  }

  function stop() {
    runId += 1;
    globalThis.clearTimeout(timer);
    timer = 0;
    for (const voice of voices) {
      try { voice.stop(); } catch { /* already stopped */ }
    }
    voices.clear();
  }

  function play(song, { duration = 16, onEnd = () => {} } = {}) {
    stop();
    if (!validateSong(song)) return { startedAt: 0, duration, stop };
    const ctx = ensureContext();
    if (!ctx) {
      const thisRun = ++runId;
      const startedAt = performance.now();
      timer = globalThis.setTimeout(() => {
        if (thisRun === runId) onEnd();
      }, duration * 1000);
      return { startedAt, duration, stop };
    }
    ctx.resume?.().catch(() => {});
    const thisRun = ++runId;
    const lead = ctx.currentTime + 0.07;
    const step = duration / song.melody.length;
    song.melody.forEach((midi, index) => {
      const at = lead + (index * step);
      if (midi !== null) scheduleTone(Number(midi), at, step * 0.9, song.instrument, index % 8 === 0 ? 1.12 : 1);
      if (index % 4 === 0) scheduleBeat(at, song.instrument, index % 8 === 0);
    });
    const startedAt = performance.now() + 70;
    timer = globalThis.setTimeout(() => {
      if (thisRun !== runId) return;
      timer = 0;
      onEnd();
    }, (duration * 1000) + 90);
    return { startedAt, duration, stop };
  }

  function accent(instrument = 'space') {
    const ctx = ensureContext();
    if (!ctx) return;
    ctx.resume?.().catch(() => {});
    const at = ctx.currentTime + 0.01;
    scheduleTone(instrument === 'jungle' ? 67 : 72, at, 0.26, instrument, 0.75);
    scheduleTone(instrument === 'rain' ? 76 : 79, at + 0.08, 0.32, instrument, 0.55);
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (master && context) master.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.025);
  }

  function destroy() {
    stop();
    context?.close?.().catch(() => {});
    context = null;
    master = null;
  }

  return {
    unlock,
    play,
    accent,
    stop,
    destroy,
    setMuted,
    isMuted: () => muted,
    getState: () => ({ available: Boolean(AudioContextClass), contextState: context?.state || 'new', muted, activeVoices: voices.size }),
  };
}
