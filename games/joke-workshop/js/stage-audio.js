// Tiny zero-file comedy payoff: a warm kick/snare/cymbal rimshot followed by
// friendly toy-theater applause. Voice remains the semantic audio channel.

export function createComedyAudio() {
  let context = null;
  let muted = false;
  const active = new Set();

  function getContext() {
    if (context) return context;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    return context;
  }

  function unlock() {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      void ctx.resume().catch(() => {});
    }
    // A silent source in the gesture task primes older iPadOS WebAudio.
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    try { source.start(); } catch { /* audio is supportive */ }
  }

  function remember(source) {
    active.add(source);
    source.addEventListener?.('ended', () => active.delete(source), { once: true });
    return source;
  }

  function tone({ at, frequency, endFrequency = frequency, duration, gain = .16, type = 'sine' }) {
    const ctx = getContext();
    if (!ctx || muted) return;
    const osc = remember(ctx.createOscillator());
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
    amp.gain.setValueAtTime(.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + .008);
    amp.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + .03);
  }

  function noise({ at, duration, gain = .1, highpass = 500, bandpass = 0 }) {
    const ctx = getContext();
    if (!ctx || muted) return;
    const length = Math.max(1, Math.ceil(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const falloff = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * falloff;
    }
    const source = remember(ctx.createBufferSource());
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    source.buffer = buffer;
    filter.type = bandpass ? 'bandpass' : 'highpass';
    filter.frequency.value = bandpass || highpass;
    filter.Q.value = bandpass ? .8 : .45;
    amp.gain.setValueAtTime(gain, at);
    amp.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter).connect(amp).connect(ctx.destination);
    source.start(at);
  }

  function rimshot() {
    const ctx = getContext();
    if (!ctx || muted) return;
    unlock();
    const now = ctx.currentTime + .015;
    tone({ at: now, frequency: 125, endFrequency: 54, duration: .14, gain: .19 });
    noise({ at: now, duration: .15, gain: .13, bandpass: 1250 });
    tone({ at: now + .22, frequency: 138, endFrequency: 70, duration: .12, gain: .14 });
    noise({ at: now + .22, duration: .13, gain: .12, bandpass: 1480 });
    noise({ at: now + .39, duration: .62, gain: .105, highpass: 5200 });
    tone({ at: now + .39, frequency: 4700, endFrequency: 2100, duration: .44, gain: .035, type: 'triangle' });
  }

  function crowd() {
    const ctx = getContext();
    if (!ctx || muted) return;
    unlock();
    const now = ctx.currentTime + .01;
    // Staggered little paper-theater claps.
    for (let i = 0; i < 11; i += 1) {
      const at = now + i * .082 + (i % 3) * .017;
      noise({ at, duration: .075, gain: .035 + (i % 4) * .007, bandpass: 1900 + (i % 3) * 360 });
    }
    // Two rounded "ha-ha" shapes under the recorded crowd line.
    for (let i = 0; i < 4; i += 1) {
      tone({
        at: now + .08 + i * .19,
        frequency: 255 + (i % 2) * 48,
        endFrequency: 190 + (i % 2) * 34,
        duration: .13,
        gain: .028,
        type: 'triangle',
      });
    }
  }

  function stop() {
    for (const source of [...active]) {
      try { source.stop(); } catch { /* already ended */ }
      active.delete(source);
    }
  }

  function setMuted(on) {
    muted = Boolean(on);
    if (muted) stop();
    return muted;
  }

  return { unlock, rimshot, crowd, stop, setMuted };
}
