// sfx.js — WebAudio-synthesized sound effects. Zero audio files.
// One shared AudioContext (created lazily, unlocked on first gesture).

let ctx = null;
let master = null;

/** Lazily build the AudioContext + master gain. Safe to call repeatedly. */
function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

/** Resume the context — call from the first user gesture (iOS unlock). */
export function unlock() {
  ensure();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

/** Current audio time, or 0 if no context. */
function now() {
  return ctx ? ctx.currentTime : 0;
}

/**
 * Play a single oscillator note with an envelope.
 * @param {object} o
 */
function note({ type = 'sine', f0, f1, t0 = 0, dur = 0.2, gain = 0.4, dest }) {
  if (!ensure()) return;
  const start = now() + t0;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, start);
  if (f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(dest || master);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** A short buffer of white noise for whoosh effects. */
function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// ---- Effects ----------------------------------------------------------

/** Tile tap: bright sine blip 600 -> 900 Hz. */
export function pop() {
  note({ type: 'sine', f0: 600, f1: 900, dur: 0.08, gain: 0.4 });
}

/** Tile un-slot: reverse blip 700 -> 400 Hz. */
export function unpop() {
  note({ type: 'sine', f0: 700, f1: 400, dur: 0.1, gain: 0.35 });
}

/** Tile flying: band-passed noise sweep. */
export function whoosh() {
  if (!ensure()) return;
  const start = now();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.2);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(500, start);
  bp.frequency.exponentialRampToValueAtTime(2200, start + 0.15);
  bp.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.25, start + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(start);
  src.stop(start + 0.22);
}

/** Bonus word: triangle arpeggio C6-E6-G6 staggered. */
export function sparkle() {
  const freqs = [1046.5, 1318.5, 1568.0]; // C6 E6 G6
  freqs.forEach((f, i) => {
    note({ type: 'triangle', f0: f, dur: 0.22, gain: 0.35, t0: i * 0.06 });
  });
  note({ type: 'triangle', f0: 2093.0, dur: 0.25, gain: 0.25, t0: 0.18 }); // C7 sparkle
}

/** Picture word: C-major chord swell + quick octave arpeggio. */
export function tada() {
  // chord swell
  [523.25, 659.25, 783.99].forEach((f) => {
    note({ type: 'sine', f0: f, dur: 0.7, gain: 0.22 });
  });
  // quick rising arpeggio on top
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    note({ type: 'triangle', f0: f, dur: 0.3, gain: 0.28, t0: 0.12 + i * 0.08 });
  });
}

/** Silly blend: goofy saw wobble 300 -> 150 Hz with vibrato. */
export function silly() {
  if (!ensure()) return;
  const start = now();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, start);
  osc.frequency.exponentialRampToValueAtTime(150, start + 0.5);
  // vibrato LFO ~8 Hz
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 8;
  lfoGain.gain.value = 30;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.22, start + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
  osc.connect(g);
  g.connect(master);
  osc.start(start);
  lfo.start(start);
  osc.stop(start + 0.55);
  lfo.stop(start + 0.55);
}

/** Subtle synthesized boing for animal reveals. */
export function boing() {
  if (!ensure()) return;
  const start = now();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, start);
  osc.frequency.exponentialRampToValueAtTime(520, start + 0.08);
  osc.frequency.exponentialRampToValueAtTime(220, start + 0.3);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.2, start + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
  osc.connect(g);
  g.connect(master);
  osc.start(start);
  osc.stop(start + 0.35);
}

/** Tiny UI click. */
export function tick() {
  note({ type: 'square', f0: 880, dur: 0.04, gain: 0.18 });
}
