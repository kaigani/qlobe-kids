/** Small, preschool-safe Web Audio sound engine for Bean Sprout Watch. */
export function createBotanySounds() {
  let ctx = null;
  let unlocked = false;
  let muted = false;
  let dead = false;
  const nodes = new Set();
  const timers = new Set();
  const log = [];

  function record(event) {
    log.push({ event, timestamp: Date.now() });
    if (log.length > 64) log.splice(0, log.length - 64);
  }

  function contextType() {
    return globalThis.AudioContext || globalThis.webkitAudioContext;
  }

  async function unlock() {
    if (dead) return false;
    if (unlocked && ctx) {
      try { await ctx.resume(); } catch (_) { /* unavailable */ }
      return true;
    }
    const Type = contextType();
    if (!Type) { record('unlock-unavailable'); return false; }
    try {
      ctx = new Type();
      await ctx.resume();
      unlocked = true;
      record('unlock');
      return true;
    } catch (_) {
      ctx = null;
      record('unlock-failed');
      return false;
    }
  }

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }

  function tone(name, frequency, duration, type = 'sine', volume = 0.08, endFrequency) {
    record(name);
    if (!ctx || !unlocked || muted || dead) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(ctx.destination);
    nodes.add(osc);
    osc.onended = () => { nodes.delete(osc); try { osc.disconnect(); gain.disconnect(); } catch (_) {} };
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function water() {
    record('water');
    tone('water', 420, 0.18, 'sine', 0.045, 680);
    later(() => tone('water-drop', 760, 0.12, 'sine', 0.025, 520), 110);
  }
  function sun() {
    record('sun');
    tone('sun', 520, 0.42, 'sine', 0.04, 780);
    later(() => tone('sun-shimmer', 1040, 0.3, 'sine', 0.018, 1320), 90);
  }
  function leaf() {
    record('leaf');
    tone('leaf', 180, 0.16, 'triangle', 0.025, 120);
  }
  function badge() {
    record('badge');
    tone('badge', 660, 0.28, 'sine', 0.045, 880);
    later(() => tone('badge-high', 990, 0.34, 'sine', 0.035, 1180), 100);
  }
  function stopAll() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const node of nodes) { try { node.stop(); node.disconnect(); } catch (_) {} }
    nodes.clear();
    record('stopAll');
  }
  function setMuted(value) { muted = Boolean(value); record(muted ? 'muted' : 'unmuted'); }
  function destroy() {
    if (dead) return;
    stopAll();
    dead = true;
    if (ctx) { try { ctx.close(); } catch (_) {} }
    ctx = null;
    unlocked = false;
    record('destroy');
  }
  function getLog() { return log.slice(); }

  return { unlock, water, sun, leaf, badge, setMuted, stopAll, destroy, getLog };
}

export default createBotanySounds;
