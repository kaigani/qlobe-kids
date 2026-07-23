// music-sync.js — musical-clock animation and audio-reactive hooks for puppets.

const FORMAT = 'qlobe-music-sync';
const VERSION = 1;

export function normalizeMusicSyncProfiles(document, sourceUrl = '') {
  const input = document && typeof document === 'object' ? document : {};
  const profiles = {};
  for (const [id, raw] of Object.entries(input.profiles || {})) {
    profiles[id] = {
      id,
      baseClip: raw.baseClip || 'idle',
      cycleBeats: Math.max(0.25, Number(raw.cycleBeats) || 1),
      phaseOffset: Number(raw.phaseOffset) || 0,
      latencyMs: Number(raw.latencyMs) || 0,
      gestures: { ...(raw.gestures || {}) },
      hooks: { note: true, beat: true, bar: true, ...(raw.hooks || {}) },
      reactive: { low: 0, mid: 0, high: 0, rms: 0, ...(raw.reactive || {}) },
    };
  }
  return {
    ...input, format: input.format || FORMAT, formatVersion: input.formatVersion || VERSION,
    id: input.id || 'music-sync', sourceUrl, profiles,
  };
}

export async function loadMusicSyncProfiles(url) {
  if (!url) return normalizeMusicSyncProfiles({ profiles: {} });
  const absolute = new URL(url, document.baseURI).href;
  const response = await fetch(absolute, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load Music Sync profiles: ${response.status}`);
  return normalizeMusicSyncProfiles(await response.json(), absolute);
}

export function createMusicSync({ puppet, profile = {}, onHook = null } = {}) {
  let activeProfile = normalizeMusicSyncProfiles({ profiles: { active: profile } }).profiles.active;
  let raf = 0;
  let position = null;
  let lastBeat = null;
  let lastBar = null;

  const emit = (kind, detail) => {
    if (activeProfile.hooks?.[kind] !== false) onHook?.(kind, detail);
  };

  const phase = (beat, bpm = 60) => {
    const adjusted = beat - (activeProfile.latencyMs / 1000) * (Number(bpm) || 60) / 60;
    return adjusted / activeProfile.cycleBeats + activeProfile.phaseOffset;
  };

  const sample = (info) => {
    if (!info || !puppet) return;
    const beat = Number(info.beat) || 0;
    puppet.setClipPhase?.(activeProfile.baseClip, phase(beat, info.bpm));
    const beatIndex = Math.floor(beat + 0.0001);
    const beatsPerBar = Number(info.song?.beatsPerBar) || 4;
    const barIndex = Math.floor(beatIndex / beatsPerBar);
    if (beatIndex !== lastBeat) { lastBeat = beatIndex; emit('beat', { ...info, beatIndex }); }
    if (barIndex !== lastBar) { lastBar = barIndex; emit('bar', { ...info, barIndex }); }
  };

  return {
    get profile() { return activeProfile; },
    setProfile(next = {}) {
      activeProfile = normalizeMusicSyncProfiles({ profiles: { active: next } }).profiles.active;
      lastBeat = lastBar = null;
    },
    start(positionProvider) {
      this.stop();
      position = positionProvider;
      const tick = () => {
        sample(position?.());
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0; position = null; },
    sample,
    note(event = {}) {
      const key = event.hit || event.note || event.midi;
      const gesture = activeProfile.gestures?.[key] || activeProfile.gestures?.note;
      emit('note', event);
      if (gesture && gesture !== activeProfile.baseClip) {
        puppet?.playClip?.(gesture, { loop: false, onDone: () => puppet?.setClipPhase?.(activeProfile.baseClip, phase(event.beat || 0, event.bpm)) });
      } else {
        puppet?.setClipPhase?.(activeProfile.baseClip, phase(event.beat || 0, event.bpm));
      }
    },
    destroy() { this.stop(); },
  };
}

export function createReactiveMeter(analyser, onFrame) {
  if (!analyser) return { destroy() {} };
  const bins = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  const average = (start, end) => {
    let sum = 0;
    const stop = Math.max(start + 1, Math.min(bins.length, end));
    for (let i = start; i < stop; i += 1) sum += bins[i];
    return sum / (stop - start) / 255;
  };
  const tick = () => {
    analyser.getByteFrequencyData(bins);
    const third = Math.max(1, Math.floor(bins.length / 3));
    let squares = 0;
    for (const value of bins) squares += (value / 255) ** 2;
    onFrame?.({
      rms: Math.sqrt(squares / bins.length),
      low: average(0, third), mid: average(third, third * 2), high: average(third * 2, bins.length),
    });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return { destroy() { if (raf) cancelAnimationFrame(raf); raf = 0; } };
}

export const MUSIC_SYNC_FORMAT = FORMAT;
export const MUSIC_SYNC_VERSION = VERSION;
