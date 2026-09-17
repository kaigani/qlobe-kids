// Responsive, file-free material sound. Voice and music stay on their shared
// channels; this one exists only while the child is actively pouring.

const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;

export function createPourSound() {
  let ctx = null;
  let master = null;
  let noise = null;
  let filter = null;
  let dryTimer = 0;
  let mode = 'water';
  let intensity = 0;
  let muted = false;
  let active = false;

  function ensure() {
    if (!AudioCtx) return null;
    if (!ctx) {
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function unlock() {
    const audio = ensure();
    if (audio?.state === 'suspended' || audio?.state === 'interrupted') {
      audio.resume().catch(() => {});
    }
  }

  function buildNoise() {
    if (!ctx || !master || noise) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * 1.2));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < frames; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * .86 + white * .14;
      data[i] = last;
    }
    noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1250;
    filter.Q.value = .65;
    noise.connect(filter);
    filter.connect(master);
    noise.start();
  }

  function dryTick() {
    if (!active || mode === 'water' || !ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const bean = mode === 'beans';
    osc.type = bean ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime((bean ? 330 : 1220) + Math.random() * (bean ? 220 : 580), now);
    osc.frequency.exponentialRampToValueAtTime(bean ? 170 : 620, now + (bean ? .07 : .035));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime((bean ? .085 : .027) * Math.max(.35, intensity), now + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, now + (bean ? .085 : .045));
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + .1);
    const pace = bean ? 105 : 58;
    dryTimer = setTimeout(dryTick, Math.max(32, pace - intensity * (bean ? 54 : 28) + Math.random() * 28));
  }

  function start(nextMode = 'water', nextIntensity = .7) {
    unlock();
    mode = nextMode;
    intensity = Math.max(0, Math.min(1, Number(nextIntensity) || 0));
    active = true;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(muted ? 0 : .38, now, .025);
    if (mode === 'water') {
      clearTimeout(dryTimer);
      buildNoise();
      filter.frequency.setTargetAtTime(900 + intensity * 1500, now, .04);
    } else if (!dryTimer) {
      dryTick();
    }
  }

  function setIntensity(value) {
    intensity = Math.max(0, Math.min(1, Number(value) || 0));
    if (ctx && filter && mode === 'water') {
      filter.frequency.setTargetAtTime(900 + intensity * 1500, ctx.currentTime, .04);
    }
  }

  function stop() {
    active = false;
    clearTimeout(dryTimer);
    dryTimer = 0;
    if (ctx && master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, .045);
    }
  }

  function setMuted(on) {
    muted = Boolean(on);
    if (muted) stop();
  }

  function destroy() {
    stop();
    try { noise?.stop(); } catch { /* already stopped */ }
    noise = null;
    filter = null;
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    master = null;
  }

  return { unlock, start, setIntensity, stop, setMuted, destroy };
}
