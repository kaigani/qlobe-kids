// percussion.js — deterministic WebAudio body-percussion voices.
//
// CLAP / STOMP / TAP / SHAKE are synthesized live (zero bytes, no 404s,
// identical on every device). One AudioContext, created lazily on the first
// gesture unlock; every voice is a short noise/tone envelope so nothing ever
// rings longer than ~300 ms and overlapping hits simply layer.

let ctx = null;
let master = null;

export function unlock() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function now() { return ctx ? ctx.currentTime : 0; }

/** White-noise buffer, cached. */
let noiseBuf = null;
function noise() {
  if (!ctx) return null;
  if (!noiseBuf) {
    const len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function env(gainNode, t0, peak, decay) {
  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + 0.004);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
}

function burst(opts) {
  if (!ctx) return;
  const { t0, freq, q = 1, peak = 0.5, decay = 0.08, type = 'bandpass', offset = 0 } = opts;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  src.connect(filter).connect(gain).connect(master);
  const t = t0 + offset;
  env(gain, t, peak, decay);
  src.start(t, 0, decay + 0.05);
  src.stop(t + decay + 0.06);
}

function tone(opts) {
  if (!ctx) return;
  const { t0, f0, f1 = f0, peak = 0.4, decay = 0.12, type = 'sine' } = opts;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + decay);
  const gain = ctx.createGain();
  osc.connect(gain).connect(master);
  env(gain, t0, peak, decay);
  osc.start(t0);
  osc.stop(t0 + decay + 0.02);
}

const VOICES = {
  // Two-handed clap: bright bandpass noise, a short body tick, and two quick
  // slap-back echoes that read as one clap with a tiny room.
  clap() {
    const t0 = now();
    burst({ t0, freq: 1900, q: 1.1, peak: 0.55, decay: 0.07 });
    tone({ t0, f0: 420, f1: 260, peak: 0.2, decay: 0.05 });
    burst({ t0, freq: 1700, q: 1.4, peak: 0.22, decay: 0.05, offset: 0.028 });
    burst({ t0, freq: 1500, q: 1.6, peak: 0.1, decay: 0.04, offset: 0.05 });
  },
  // Stomp: felt thump — a pitched drop from 110 to 55 Hz plus a soft click.
  stomp() {
    const t0 = now();
    tone({ t0, f0: 110, f1: 52, peak: 0.85, decay: 0.14 });
    burst({ t0, freq: 380, q: 0.8, peak: 0.3, decay: 0.045 });
    tone({ t0, f0: 66, f1: 44, peak: 0.5, decay: 0.16, type: 'triangle' });
  },
  // Tap: a dry little wood-knock — short bandpass knock + tiny body pitch.
  tap() {
    const t0 = now();
    burst({ t0, freq: 950, q: 1.8, peak: 0.4, decay: 0.035 });
    tone({ t0, f0: 300, f1: 210, peak: 0.22, decay: 0.05 });
  },
  // Shake: maraca — highpassed noise with a fast pulse train (8 granules).
  shake() {
    if (!ctx) return;
    const t0 = now();
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 5200;
    const gain = ctx.createGain();
    src.connect(filter).connect(gain).connect(master);
    const dur = 0.24;
    const pulses = 10;
    const step = dur / pulses;
    for (let i = 0; i < pulses; i++) {
      const t = t0 + i * step;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.28 + 0.14 * Math.random(), t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
    }
    src.start(t0, 0, dur + 0.02);
    src.stop(t0 + dur + 0.03);
  },
  // Tick — the metronome's quiet wood-block.
  tick() {
    const t0 = now();
    burst({ t0, freq: 1250, q: 2.2, peak: 0.12, decay: 0.03 });
  },
  // Warm pentatonic pluck under the song-replay beat (C-D-E-G-A pentatonic).
  bass(step = 0) {
    if (!ctx) return;
    const scale = [130.81, 146.83, 164.81, 196.0, 220.0];
    const f0 = scale[((step % scale.length) + scale.length) % scale.length];
    const t0 = now();
    tone({ t0, f0, f1: f0 * 0.98, peak: 0.5, decay: 0.34, type: 'triangle' });
    tone({ t0, f0: f0 * 2, f1: f0 * 2, peak: 0.12, decay: 0.12 });
  },
  // A little C-major strum for the win moment.
  strum() {
    if (!ctx) return;
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((f0, i) => {
      tone({ t0: now() + i * 0.07, f0, f1: f0 * 0.99, peak: 0.35, decay: 0.5, type: 'triangle' });
    });
  },
};

/** Play one voice: 'clap' | 'stomp' | 'tap' | 'shake' | 'tick'. */
export function play(name, ...args) {
  if (!ctx || !VOICES[name]) return;
  VOICES[name](...args);
}

export function isReady() { return !!ctx; }