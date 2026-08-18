// Small, gesture-gated seasonal soundscape.  No audio is created until unlock().
export function createSoundscape() {
  let context = null;
  let master = null;
  let unlocked = false;
  let muted = false;
  let season = null;
  let timer = null;
  const nodes = new Set();
  const frequencies = {
    spring: [392, 494, 587, 784],
    summer: [330, 415, 523, 659],
    autumn: [262, 330, 392, 523],
    winter: [220, 277, 330, 440]
  };

  function remember(node) {
    nodes.add(node);
    node.addEventListener?.('ended', () => nodes.delete(node));
    return node;
  }

  function cancel() {
    if (timer !== null) { clearInterval(timer); timer = null; }
    nodes.forEach(node => {
      try { node.stop?.(); } catch (_) { /* already stopped */ }
      try { node.disconnect?.(); } catch (_) { /* harmless */ }
    });
    nodes.clear();
  }

  function tone(frequency, when, duration, gainAmount, type = 'sine') {
    if (!context || !master || muted) return;
    const oscillator = remember(context.createOscillator());
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(gainAmount, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.03);
  }

  function pulse() {
    if (!context || !master || muted || !season) return;
    const notes = frequencies[season] || frequencies.spring;
    const start = context.currentTime + 0.01;
    notes.forEach((frequency, index) => tone(frequency, start + index * 0.16, 0.22, 0.16, 'triangle'));
    // A very quiet filtered noise tick keeps the pulse wood-like without a harsh tone.
    const buffer = context.createBuffer(1, Math.max(1, context.sampleRate * 0.045), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = remember(context.createBufferSource());
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    noise.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = season === 'winter' ? 900 : 1400;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.1, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
    noise.connect(filter).connect(gain).connect(master);
    noise.start(start);
    noise.stop(start + 0.05);
  }

  function unlock() {
    if (unlocked) { try { context?.resume?.(); } catch (_) {} return; }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return;
    try {
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.03;
      master.connect(context.destination);
      unlocked = true;
      context.resume?.();
    } catch (_) { context = null; master = null; }
  }

  function start(nextSeason) {
    if (!unlocked || !context || muted) return;
    cancel();
    season = String(nextSeason || 'spring').toLowerCase();
    pulse();
    timer = setInterval(pulse, 3000);
  }

  function stop() { cancel(); season = null; }
  function setMuted(on) { muted = Boolean(on); if (muted) stop(); }
  function isMuted() { return muted; }
  function destroy() {
    stop();
    try { context?.close?.(); } catch (_) {}
    context = null; master = null; unlocked = false;
  }

  return { unlock, start, stop, setMuted, isMuted, destroy };
}
