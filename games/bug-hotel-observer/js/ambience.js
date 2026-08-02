// ambience.js — the paper garden's sound bed. ZERO audio files.
//
// game-design.md §9.9: a filtered noise-swell breeze under every play screen,
// sparse randomised cricket chirps in the log room, a soft bee hum in the
// bamboo room, and nothing at all on the splash. Fades in over 1.2 s on room
// entry, out over 600 ms on exit.
//
// WHY IT OWNS ITS OWN AudioContext. `shared/js/sfx.js` keeps its context
// private (it exports effects and `unlock()`, not the node graph), and reaching
// into it would mean editing a shared module for one game's benefit. A second
// context is a few hundred bytes of real cost and buys total isolation: the
// breeze can never leak into an effect's envelope, and `stop()` here can never
// silence a `pop()`. Both contexts are unlocked by the same gesture.
//
// THREE RULES, IN PRIORITY ORDER
//   1. It never plays before the first real gesture. `start()` before `unlock()`
//      is a no-op that ARMS itself — the same rule that keeps a recorded line
//      from degrading into the system speech voice.
//   2. It is gated on the same mute flag as voice and sfx.
//   3. It is suspended on `visibilitychange → hidden` and resumed on return.
//      A tab left in the background must not hum at a parent for ten minutes.
//
// It is deliberately quiet: the breeze peaks at gain 0.04. If a grown-up in the
// room can hear it over the teacher voice, it is wrong.

const BREEZE_GAIN = 0.04;
const HUM_GAIN = 0.022;
// P6: the cricket chirp is the one TRANSIENT in the bed — the breeze and the
// hum are beds the ear stops hearing, a 38 ms tick is not — and it was the only
// thing loud enough to land on top of a spoken word. It now peaks below the
// breeze's own swell.
const CHIRP_GAIN = 0.036;

export function createAmbience({ isMuted = () => false } = {}) {
  let ctx = null;
  let master = null;          // everything hangs off this one gain
  let breezeSrc = null;
  let breezeGain = null;
  let breezeLfo = null;
  let humSrc = null;
  let humGain = null;
  let chirpTimer = null;

  let unlocked = false;
  let armed = null;           // a room requested before the first gesture
  let current = null;         // the room id (or 'hotel'/'journal') now playing
  let destroyed = false;

  const canPlay = () => unlocked && !destroyed && !isMuted();

  function ensure() {
    if (ctx || destroyed) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    } catch {
      ctx = null;                 // an unavailable context is simply silence
    }
    return ctx;
  }

  function resume() {
    // iPadOS parks the context on 'interrupted' after a call or Siri, and on
    // 'suspended' when backgrounded; neither recovers on its own.
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  /** A few seconds of white noise, looped. One buffer for the session. */
  function noiseBuffer(seconds = 3) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function ramp(param, to, ms) {
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(to, t + Math.max(0.01, ms / 1000));
    } catch { /* a scheduling failure is silence, never a thrown frame */ }
  }

  function startBreeze() {
    if (breezeSrc || !ctx) return;
    // noise -> lowpass 520 Hz -> a gain the LFO swells. Filtered noise at this
    // corner reads as leaves, not as static; the swell is what stops it being
    // a hiss the ear tunes out and then notices.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = BREEZE_GAIN * 0.55;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;              // one swell every ~14 s
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = BREEZE_GAIN * 0.45;
    lfo.connect(lfoGain).connect(gain.gain);

    src.connect(filter).connect(gain).connect(master);
    src.start();
    lfo.start();
    breezeSrc = src;
    breezeGain = gain;
    breezeLfo = lfo;
  }

  function startHum() {
    if (humSrc || !ctx) return;
    // Two detuned saws an octave apart through a narrow lowpass: a bee, at the
    // edge of audibility. Any louder and it is a machine.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 118;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 121.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const wob = ctx.createOscillator();
    wob.type = 'sine';
    wob.frequency.value = 5.2;
    const wobGain = ctx.createGain();
    wobGain.gain.value = HUM_GAIN * 0.4;
    wob.connect(wobGain).connect(gain.gain);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(master);
    osc.start(); osc2.start(); wob.start();
    ramp(gain.gain, HUM_GAIN, 1200);
    humSrc = { osc, osc2, wob };
    humGain = gain;
  }

  function stopHum() {
    if (!humSrc) return;
    const { osc, osc2, wob } = humSrc;
    const g = humGain;
    humSrc = null;
    humGain = null;
    ramp(g.gain, 0, 500);
    const stopAt = (ctx ? ctx.currentTime : 0) + 0.7;
    for (const node of [osc, osc2, wob]) {
      try { node.stop(stopAt); } catch { /* already stopped */ }
    }
  }

  /** One cricket: a short chirping burst of 3–5 pulses around 3.6 kHz. */
  function chirp() {
    if (!ctx || !canPlay()) return;
    const t0 = ctx.currentTime + 0.02;
    const pulses = 3 + Math.floor(Math.random() * 3);
    const base = 3300 + Math.random() * 700;
    for (let i = 0; i < pulses; i += 1) {
      const t = t0 + i * 0.055;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(CHIRP_GAIN, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.038);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  function scheduleChirp() {
    clearTimeout(chirpTimer);
    // Sparse and irregular: 2.6–7.4 s apart. A fixed interval turns a cricket
    // into a metronome inside a minute.
    chirpTimer = setTimeout(() => {
      chirp();
      scheduleChirp();
    }, 2600 + Math.random() * 4800);
  }

  function stopChirps() {
    clearTimeout(chirpTimer);
    chirpTimer = null;
  }

  function applyRoom(room) {
    if (room === 'bamboo') startHum(); else stopHum();
    if (room === 'log') { if (!chirpTimer) scheduleChirp(); } else stopChirps();
  }

  const ambience = {
    /** Called from the game's unlockAudio() on EVERY gesture. Idempotent. */
    unlock() {
      if (destroyed) return;
      unlocked = true;
      if (!ensure()) return;
      resume();
      if (armed) { const room = armed; armed = null; ambience.start(room); }
    },

    /**
     * Bring the bed up for a screen. `room` is a room id for the room-specific
     * layers, or any other string ('hotel', 'journal') for breeze only.
     * Calling it with the room already playing just re-asserts the fade.
     */
    start(room = 'hotel') {
      if (destroyed) return;
      if (!unlocked) { armed = room; return; }      // §3.1 — nothing before a gesture
      if (!ensure()) return;
      resume();
      current = room;
      if (isMuted()) { ramp(master.gain, 0, 200); return; }
      startBreeze();
      applyRoom(room);
      ramp(master.gain, 1, 1200);
    },

    /** Fade the whole bed out; the graph stays warm for the next room. */
    stop() {
      if (!ctx) { armed = null; current = null; return; }
      current = null;
      armed = null;
      stopChirps();
      stopHum();
      ramp(master.gain, 0, 600);
    },

    /** Backgrounding: hard-suspend, so a parked tab is truly silent. */
    suspend() {
      if (!ctx) return;
      stopChirps();
      ramp(master.gain, 0, 120);
      setTimeout(() => { if (ctx && document.hidden) ctx.suspend().catch(() => {}); }, 160);
    },

    resume() {
      if (!ctx || destroyed) return;
      resume();
      if (current) ambience.start(current);
    },

    setMuted(value) {
      if (!ctx) return;
      if (value) { stopChirps(); ramp(master.gain, 0, 160); }
      else if (current) ambience.start(current);
    },

    get room() { return current; },
    get running() { return Boolean(ctx && current && ctx.state === 'running'); },

    destroy() {
      destroyed = true;
      stopChirps();
      stopHum();
      if (breezeSrc) { try { breezeSrc.stop(); } catch { /* already stopped */ } }
      if (breezeLfo) { try { breezeLfo.stop(); } catch { /* already stopped */ } }
      breezeSrc = null; breezeLfo = null; breezeGain = null;
      if (ctx) { try { ctx.close(); } catch { /* already closed */ } }
      ctx = null; master = null;
    },
  };

  return ambience;
}
