// voice-clips.js — recorded-clip voice player with a Web Speech fallback.
// Promoted from games/lunchbox-pack/js/voice.js so every polished game gets
// recorded teacher voice + the talking-mouth onClip hook for free.
//
// Contract:
//   await voiceClips.init(manifestUrl, linesUrl, defaultLines);  // never rejects
//   voiceClips.say(key, fallbackText)  // recorded clip if present, else speech
//   voiceClips.onClip(cb)              // cb(key, audioEl) when a clip starts
//   voiceClips.unlock()                // call on every pointerdown (iOS)
//   voiceClips.stop()
//
// Recorded clips are optional: every fetch/play failure falls back cleanly to
// speech.js. Spoken fallback text comes from lines.json when present (so
// recorded and fallback voice always match), else the caller's fallbackText,
// else the game's defaultLines passed to init().

import * as speech from './speech.js';

let manifest = null; // { key: { file, dur } }
let lines = null;    // { key: "spoken text" }
let defaults = {};   // game-supplied safety net
let baseUrl = './assets/audio/';
let currentAudio = null;

async function loadJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Load the clip manifest and the spoken-lines table. Never rejects — a 404 on
 * either just means we run on the speech.js fallback.
 */
export async function init(
  manifestUrl = './assets/audio/manifest.json',
  linesUrl = './data/lines.json',
  defaultLines = {}
) {
  baseUrl = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  defaults = defaultLines || {};
  [manifest, lines] = await Promise.all([loadJson(manifestUrl), loadJson(linesUrl)]);
}

// Optional clip-start listeners (e.g. talking-mouth sync). cb(key, audioEl).
const clipListeners = new Set();
export function onClip(cb) { clipListeners.add(cb); return () => clipListeners.delete(cb); }

/**
 * Speak one line: the recorded clip when the manifest has it, otherwise
 * synthesized speech. Stops whatever was playing first. Resolves when done
 * (bounded — never hangs the game).
 */
export function say(key, fallbackText) {
  stop();
  const text = (lines && lines[key]) || fallbackText || defaults[key] || '';
  const entry = manifest && manifest[key];
  if (entry && entry.file) {
    return new Promise((resolve) => {
      const a = new Audio(baseUrl + entry.file);
      currentAudio = a;
      clipListeners.forEach((cb) => { try { cb(key, a); } catch { /* never break voice */ } });
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (currentAudio === a) currentAudio = null;
        resolve();
      };
      const fallback = () => {
        if (done) return;
        speech.speak(text).then(finish);
      };
      a.addEventListener('ended', finish);
      a.addEventListener('error', fallback);
      // safety guard: never hang if the element drops its events
      setTimeout(finish, (entry.dur ? entry.dur * 1000 : 4000) + 2000);
      a.play().catch(fallback);
    });
  }
  return speech.speak(text);
}

/**
 * Unlock recorded-clip playback on a user gesture (iOS autoplay policy):
 * play-then-pause a muted real manifest clip so later programmatic play()
 * calls — which often run after an async break, outside user activation —
 * are allowed. Self-limiting: stays armed until it has warmed a real clip
 * (the manifest may not be loaded on the very first tap; the silent-WAV
 * fallback still satisfies the gesture meanwhile).
 */
let unlocked = false;
export function unlock() {
  if (unlocked) return;
  try {
    let el = null;
    if (manifest) {
      const key = Object.keys(manifest).find((k) => manifest[k] && manifest[k].file);
      if (key) {
        el = new Audio(baseUrl + manifest[key].file);
        el.preload = 'auto';
        unlocked = true;
      }
    }
    if (!el) el = new Audio(SILENT_WAV);
    el.muted = true;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
      }).catch(() => { /* ignore — a later gesture retries */ });
    }
  } catch { /* ignore */ }
}

// 44-byte silent WAV used only before the manifest arrives. data: URI, no network.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/** Stop the current clip and any synthesized speech. */
export function stop() {
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {
      /* ignore */
    }
    currentAudio = null;
  }
  speech.stop();
}
