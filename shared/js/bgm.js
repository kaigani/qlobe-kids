// bgm.js — background-music player for a recorded (non-seamless) track.
//
// shared/js/music.js is a WebAudio band engine for procedurally-arranged
// instrument-sample songs, which loop bar-for-bar with no seam. This module
// is for the opposite case: a real generated/recorded song file (e.g. a
// MiniMax Music 3 render) that has a definite start and end and was never
// composed to loop cleanly. It fakes a loop by fading the track to silence
// just before it ends, then restarting from the top and fading back in —
// and exposes the same duck()/setMuted() shape as music.js so callers can
// treat either engine the same way around spoken lines.
//
// One persistent <audio> element for the whole session (matches the
// single-AudioContext trick in music.js and voice-clips.js): unlock() primes
// it during the first real user gesture, so later programmatic play() calls
// — triggered by a tap handler, not necessarily still "inside" the gesture —
// keep working under iOS's autoplay policy.
//
// Volume ramps use setInterval, not requestAnimationFrame: rAF fully stops
// while the tab is hidden (an iPad app-switch mid-fade would freeze it
// forever), where a timer just gets throttled and still completes. The
// loop's fade-out trigger is driven by the element's own 'timeupdate'
// (actual playback position), not a one-shot setTimeout, so it self-corrects
// after any throttling instead of drifting. On returning to the foreground,
// any in-flight ramp snaps straight to its target — see docs/interaction-
// patterns.md §9 on why this codebase always assumes iPadOS can yank audio
// out from under a game mid-gesture.

let audio = null;
let currentUrl = null;
let currentKey = null;
let generation = 0;
let muted = false;
let volume = 0.6;   // target "full" volume before ducking
let duckFactor = 1;  // 0..1 multiplier applied on top of volume
let tweenTimer = null;
let tweenTarget = 0;
let loopFadeOutMs = 2500;
let fadeOutTriggered = false;

function ensureAudio() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0;
    audio.addEventListener('timeupdate', onTimeUpdate);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  return audio;
}

function effectiveVolume() {
  return muted ? 0 : Math.max(0, Math.min(1, volume * duckFactor));
}

function clearTween() {
  if (tweenTimer) clearInterval(tweenTimer);
  tweenTimer = null;
}

function tweenVolumeTo(target, ms, onDone) {
  if (!audio) return;
  clearTween();
  const start = audio.volume;
  tweenTarget = Math.max(0, Math.min(1, target));
  if (ms <= 0 || start === tweenTarget) {
    audio.volume = tweenTarget;
    onDone?.();
    return;
  }
  const t0 = performance.now();
  const STEP_MS = 40;
  tweenTimer = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / ms);
    audio.volume = start + (tweenTarget - start) * p;
    if (p >= 1) {
      clearTween();
      onDone?.();
    }
  }, STEP_MS);
}

// A backgrounded/throttled tab can leave a ramp stuck mid-flight for a long
// stretch. Rather than let it resume from a stale value, snap straight to
// where it should already be — correctness over a smooth-but-invisible fade.
function onVisibilityChange() {
  if (document.hidden || !audio) return;
  if (tweenTimer) {
    clearTween();
    audio.volume = tweenTarget;
  }
}

// Loop-with-fade: watch actual playback position (not a one-shot timer) so
// the fade-out start self-corrects regardless of background throttling.
function onTimeUpdate() {
  if (!audio || fadeOutTriggered || currentUrl == null) return;
  const duration = audio.duration;
  if (!Number.isFinite(duration)) return;
  if (audio.currentTime * 1000 >= duration * 1000 - loopFadeOutMs) {
    fadeOutTriggered = true;
    tweenVolumeTo(0, loopFadeOutMs);
  }
}

function onEnded() {
  if (!audio || currentUrl == null) return;
  fadeOutTriggered = false;
  audio.currentTime = 0;
  audio.volume = 0;
  audio.play().catch(() => {});
  tweenVolumeTo(effectiveVolume(), 900);
}

/**
 * Give the persistent element something loadable before the first gesture,
 * so unlock()'s play()-then-pause() primer has real content to attempt —
 * an empty-src play() throws synchronously on iOS and never registers as a
 * user-gesture activation. Safe to call more than once; does not play.
 */
export function preload(url) {
  const el = ensureAudio();
  if (!el.src && url) el.src = url;
}

let primed = false;

/**
 * Prime the persistent element during a real user gesture (iOS autoplay
 * policy). Callers (audio-unlock.js's fan-out, a game's own tap feedback)
 * may invoke this on every single tap, same as music.js's unlock() — so
 * it must both (a) only ever run its play()-then-pause() round trip once,
 * and (b) never pause a real play() that a tap's own action started in the
 * meantime. Without both guards, priming on tap N+1 can race a play() that
 * tap N's own handler just started and silently pause it right back out —
 * the two calls share one element on purpose (see module header), so this
 * is the one seam where that sharing needs an explicit interlock.
 */
export function unlock() {
  const el = ensureAudio();
  if (primed || currentUrl || !el.src) return;
  primed = true;
  el.play().then(() => { if (!currentUrl) el.pause(); }).catch(() => {});
}

/**
 * Play (or seamlessly continue) a track. `key` identifies the track for
 * no-op detection — pass something stable like a continent id so repeated
 * calls for the same key while it's already playing do nothing.
 */
export function play(url, { key = url, fadeInMs = 900, fadeOutMs = 700, loopFadeOutMs: trackLoopFadeOutMs = 2500 } = {}) {
  const el = ensureAudio();
  if (key === currentKey && currentUrl === url && !el.paused) return;

  const gen = ++generation;
  el.removeEventListener('ended', onEnded);

  const startNew = () => {
    if (gen !== generation) return;
    currentUrl = url;
    currentKey = key;
    loopFadeOutMs = trackLoopFadeOutMs;
    fadeOutTriggered = false;
    el.src = url;
    el.currentTime = 0;
    el.volume = 0;
    el.addEventListener('ended', onEnded);
    el.play().catch(() => {});
    tweenVolumeTo(effectiveVolume(), fadeInMs);
  };

  if (currentUrl && !el.paused && el.volume > 0) {
    tweenVolumeTo(0, fadeOutMs, startNew);
  } else {
    startNew();
  }
}

/** Duck (or restore) the track's volume, ramped over `ms` — mirrors music.js's duck(). */
export function duck(level = 1, ms = 200) {
  duckFactor = Math.max(0, Math.min(1, level));
  if (!audio || muted) return;
  tweenVolumeTo(effectiveVolume(), ms);
}

/**
 * Duck under `promise` (e.g. a spoken line) and restore the moment it
 * settles — unless a newer duckDuring() call took over first.
 */
let duckDuringToken = 0;
export function duckDuring(promise, { down = 0.25, downMs = 120, upMs = 350 } = {}) {
  const token = ++duckDuringToken;
  duck(down, downMs);
  const restore = () => { if (token === duckDuringToken) duck(1, upMs); };
  Promise.resolve(promise).then(restore, restore);
  return promise;
}

export function setMuted(m) {
  muted = Boolean(m);
  if (!audio) return;
  tweenVolumeTo(effectiveVolume(), 150);
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (!audio || muted) return;
  tweenVolumeTo(effectiveVolume(), 150);
}

/** Fade out and stop — e.g. leaving the last continent for the world chooser. */
export function stop({ fadeOutMs = 1200 } = {}) {
  const gen = ++generation;
  if (!audio) return;
  audio.removeEventListener('ended', onEnded);
  tweenVolumeTo(0, fadeOutMs, () => {
    if (gen !== generation || !audio) return;
    audio.pause();
    currentUrl = null;
    currentKey = null;
  });
}

export function stats() {
  return {
    playing: !!audio && !audio.paused && currentUrl != null,
    key: currentKey,
    url: currentUrl,
    muted,
    volume,
    duckFactor,
    elementVolume: audio?.volume ?? 0,
  };
}
