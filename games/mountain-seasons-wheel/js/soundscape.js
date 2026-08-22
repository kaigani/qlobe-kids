// Recorded seasonal background-music adapter. It retains the original
// soundscape surface so lifecycle, mute, unlock, and debug hooks stay stable.
import * as bgm from '../../../shared/js/bgm.js';

export function createSoundscape(tracks = {}) {
  let muted = false;
  let season = null;
  const firstTrack = tracks.spring || Object.values(tracks)[0];

  if (firstTrack) bgm.preload(firstTrack);

  function unlock() { bgm.unlock(); }

  function start(nextSeason) {
    const next = String(nextSeason || 'spring').toLowerCase();
    const track = tracks[next] || firstTrack;
    if (!track) return;
    season = next;
    bgm.play(track, { key: `mountain-season-${next}` });
    bgm.setVolume(0.22);
    bgm.setMuted(muted);
  }

  function stop() {
    season = null;
    bgm.stop();
  }

  function setMuted(on) {
    muted = Boolean(on);
    bgm.setMuted(muted);
  }

  function isMuted() { return muted; }

  function duckDuring(promise) {
    return bgm.duckDuring(promise, { down: 0.16, downMs: 100, upMs: 320 });
  }

  function destroy() {
    season = null;
    bgm.stop({ fadeOutMs: 0 });
  }

  function stats() { return { ...bgm.stats(), season }; }

  return { unlock, start, stop, setMuted, isMuted, duckDuring, destroy, stats };
}
