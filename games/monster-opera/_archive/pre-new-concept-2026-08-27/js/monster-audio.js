const PITCH_DEGREE_SHIFT = { low: -5, middle: 0, high: 5 };
const C_MAJOR_PENTATONIC = new Set([0, 2, 4, 7, 9]);
const PHRASE_DEGREES = [
  [0, 1, 2],
  [2, 1, 0],
  [0, 2, 3],
  [3, 2, 1, 0],
  [0, 0, 2],
];

const VOICES = {
  mint: { wave: 'triangle', filter: 1350, note: 0.38, gap: 0.34 },
  pink: { wave: 'sine', filter: 2400, note: 0.3, gap: 0.28 },
  blue: { wave: 'triangle', filter: 1850, note: 0.32, gap: 0.3 },
  purple: { wave: 'sine', filter: 980, note: 0.42, gap: 0.36 },
  orange: { wave: 'square', filter: 620, note: 0.24, gap: 0.31 },
  yellow: { wave: 'sine', filter: 3100, note: 0.2, gap: 0.25 },
  teal: { wave: 'sine', filter: 820, note: 0.48, gap: 0.4 },
  coral: { wave: 'triangle', filter: 1150, note: 0.16, gap: 0.27 },
};

function midiToHz(note) {
  return 440 * (2 ** ((note - 69) / 12));
}

function pentatonicStep(baseMidi, degrees) {
  let note = Math.round(baseMidi);
  const direction = degrees < 0 ? -1 : 1;
  let remaining = Math.abs(Math.trunc(degrees));
  while (remaining > 0) {
    note += direction;
    if (C_MAJOR_PENTATONIC.has(((note % 12) + 12) % 12)) remaining -= 1;
  }
  return note;
}

/**
 * Original-sample + consonant-tone monster instrument.
 *
 * The committed sample gives every singer its own generated/mixed texture.
 * A quiet tuned oscillator underlay guarantees that arbitrary combinations
 * remain on the authored pentatonic pitch grid even when a source sample is
 * noisy or unavailable.
 */
export function createMonsterAudio(config, { onNote = null } = {}) {
  const cast = new Map(config.cast.map((monster) => [monster.id, monster]));
  const buffers = new Map();
  const failures = new Set();
  const active = new Set();
  const callbackTimers = new Set();
  const log = [];

  let context = null;
  let compressor = null;
  let master = null;
  let initPromise = null;
  let muted = false;

  function ensureContext() {
    if (context) return context;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    context = new AudioCtor({ latencyHint: 'interactive' });
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.18;
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.72;
    master.connect(compressor);
    compressor.connect(context.destination);
    return context;
  }

  async function init() {
    if (initPromise) return initPromise;
    const ctx = ensureContext();
    if (!ctx) {
      initPromise = Promise.resolve({ loaded: 0, failed: [...cast.keys()] });
      return initPromise;
    }
    initPromise = Promise.all([...cast.values()].map(async (monster) => {
      try {
        const response = await fetch(monster.audio);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(data.slice(0));
        if (!(decoded.duration > 0.08)) throw new Error('decoded sample is empty');
        buffers.set(monster.id, decoded);
        failures.delete(monster.id);
      } catch (error) {
        failures.add(monster.id);
        console.warn(`[monster-opera] ${monster.id} sample fallback:`, error);
      }
    })).then(() => ({ loaded: buffers.size, failed: [...failures] }));
    return initPromise;
  }

  async function unlock() {
    const ctx = ensureContext();
    if (!ctx) return false;
    try { await ctx.resume(); } catch { /* a later gesture can retry */ }
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(master);
      source.start();
    } catch { /* the resume is the useful part */ }
    init();
    return ctx.state === 'running';
  }

  function remember(entry) {
    log.push(entry);
    if (log.length > 120) log.splice(0, log.length - 120);
  }

  function track(node) {
    active.add(node);
    node.addEventListener?.('ended', () => active.delete(node), { once: true });
    return node;
  }

  function scheduleVisual(id, note, when, index, sourceKind) {
    if (typeof onNote !== 'function' || !context) return;
    const fire = () => {
      callbackTimers.delete(timer);
      try { onNote({ id, note, index, sourceKind }); } catch { /* visual only */ }
    };
    const delay = Math.max(0, (when - context.currentTime) * 1000);
    let timer = null;
    if (delay < 10) fire();
    else {
      timer = window.setTimeout(fire, delay);
      callbackTimers.add(timer);
    }
  }

  function scheduleTone(monster, midi, when, duration, gainValue) {
    if (!context || !master) return;
    const voice = VOICES[monster.id] || VOICES.mint;
    const osc = track(context.createOscillator());
    const overtone = track(context.createOscillator());
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const overtoneGain = context.createGain();
    const end = when + duration;

    osc.type = voice.wave;
    osc.frequency.setValueAtTime(midiToHz(midi), when);
    overtone.type = monster.id === 'orange' ? 'triangle' : 'sine';
    // An octave adds brightness without introducing a pitch class outside the
    // one shared C-major-pentatonic note set.
    overtone.frequency.setValueAtTime(midiToHz(midi + 12), when);
    overtoneGain.gain.value = monster.id === 'yellow' ? 0.16 : 0.08;
    filter.type = 'lowpass';
    filter.frequency.value = voice.filter;
    filter.Q.value = 0.65;

    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.006, gainValue), when + 0.025);
    envelope.gain.setValueAtTime(Math.max(0.006, gainValue * 0.82), Math.max(when + 0.03, end - 0.06));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(filter);
    overtone.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    osc.start(when);
    overtone.start(when);
    osc.stop(end + 0.02);
    overtone.stop(end + 0.02);
  }

  function scheduleSample(monster, when, pitch) {
    const buffer = buffers.get(monster.id);
    if (!context || !master || !buffer) return false;
    const rate = pitch === 'low' ? 0.5 : pitch === 'high' ? 2 : 1;
    const duration = Math.min(buffer.duration / rate, 1.5);
    const source = track(context.createBufferSource());
    const gain = context.createGain();
    const end = when + duration;
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(rate, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.19 * monster.gain, when + 0.018);
    gain.gain.setValueAtTime(0.16 * monster.gain, Math.max(when + 0.02, end - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(gain);
    gain.connect(master);
    source.start(when, 0, duration);
    source.stop(end + 0.02);
    return true;
  }

  function playMonster(id, {
    pitch = 'middle',
    phraseIndex = 0,
    when = null,
    sample = true,
    gain = 1,
  } = {}) {
    const monster = cast.get(id);
    const ctx = ensureContext();
    if (!monster || !ctx) return { accepted: false, duration: 0, sourceKind: 'silent' };
    const start = Math.max(ctx.currentTime + 0.015, Number.isFinite(when) ? when : ctx.currentTime + 0.025);
    const voice = VOICES[id] || VOICES.mint;
    const phrase = PHRASE_DEGREES[Math.abs(phraseIndex) % PHRASE_DEGREES.length];
    const shift = PITCH_DEGREE_SHIFT[pitch] ?? 0;
    const notes = phrase.map((degree) => pentatonicStep(monster.baseMidi, shift + degree));
    const sampled = sample && scheduleSample(monster, start, pitch);
    const sourceKind = sampled ? 'hybrid-sample' : 'synth-fallback';

    notes.forEach((midi, index) => {
      const noteWhen = start + index * voice.gap;
      scheduleTone(monster, midi, noteWhen, voice.note, 0.055 * monster.gain * gain);
      scheduleVisual(id, midi, noteWhen, index, sourceKind);
    });

    const duration = (phrase.length - 1) * voice.gap + voice.note;
    remember({
      id,
      pitch,
      phraseIndex: Math.abs(phraseIndex) % PHRASE_DEGREES.length,
      notes,
      sourceKind,
      sampleReady: buffers.has(id),
      at: Math.round(start * 1000),
      duration: Math.round(duration * 1000),
    });
    return { accepted: true, start, duration, sourceKind, notes };
  }

  function playChorus(ids, { when = null, phraseIndex = 0 } = {}) {
    const ctx = ensureContext();
    if (!ctx) return { accepted: false, duration: 0 };
    const start = Math.max(ctx.currentTime + 0.02, Number.isFinite(when) ? when : ctx.currentTime + 0.05);
    let duration = 0;
    ids.slice(0, config.maxSelected).forEach((id, index) => {
      const result = playMonster(id, {
        pitch: index === 0 ? 'middle' : (index % 3 === 1 ? 'low' : 'high'),
        phraseIndex: phraseIndex + index,
        when: start + index * 0.11,
        gain: ids.length > 3 ? 0.82 : 1,
      });
      duration = Math.max(duration, index * 0.11 + result.duration);
    });
    return { accepted: true, start, duration };
  }

  function stageSting(stageId) {
    const ctx = ensureContext();
    if (!ctx) return false;
    const notes = stageId === 'moon' ? [60, 67, 72] : stageId === 'cloud' ? [67, 72, 76] : [64, 67, 72];
    const fake = { id: 'teal', gain: 0.55 };
    const start = ctx.currentTime + 0.02;
    notes.forEach((note, index) => scheduleTone(fake, note, start + index * 0.12, 0.24, 0.035));
    return true;
  }

  function stop() {
    for (const timer of callbackTimers) window.clearTimeout(timer);
    callbackTimers.clear();
    for (const node of active) {
      try { node.stop(); } catch { /* already ended */ }
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    active.clear();
  }

  function setMuted(on = true) {
    muted = Boolean(on);
    if (context && master) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(muted ? 0 : 0.72, now, 0.012);
    }
    if (muted) stop();
    return muted;
  }

  function getStatus() {
    return {
      supported: Boolean(window.AudioContext || window.webkitAudioContext),
      state: context?.state || 'uninitialized',
      loaded: buffers.size,
      total: cast.size,
      failed: [...failures],
      ready: buffers.size === cast.size,
      muted,
    };
  }

  return {
    init,
    unlock,
    playMonster,
    playChorus,
    stageSting,
    stop,
    setMuted,
    isMuted: () => muted,
    getStatus,
    getLog: () => log.map((entry) => ({ ...entry })),
    clearLog: () => { log.length = 0; },
    now: () => ensureContext()?.currentTime || 0,
  };
}
