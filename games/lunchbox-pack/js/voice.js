// voice.js — recorded-clip voice player with a Web Speech fallback.
//
// Contract (see SPEC.md):
//   await voice.init('./assets/audio/manifest.json');  // resolves even on 404
//   voice.say(key, fallbackText)  // recorded clip if present, else speech
//   voice.stop()
//
// The recorded clips may not exist yet (they are generated separately): every
// fetch/play failure falls back cleanly to speech.js. Spoken fallback text
// comes from data/lines.json when present (so recorded and fallback voice
// always match), else the caller's fallbackText, else DEFAULT_LINES below.

import * as speech from '../../../shared/js/speech.js';

let manifest = null; // { key: { file, dur } }
let lines = null;    // { key: "spoken text" }
let baseUrl = './assets/audio/';
let currentAudio = null;

// Hardcoded safety net for every static key the game uses. Food-specific keys
// (req-<food>) get their fallback text passed in by game.js from foods.json.
const DEFAULT_LINES = {
  'intro-maya': "Hi, I'm Maya! Can you pack my lunch today?",
  'intro-leo': "Hey, I'm Leo! Will you pack my lunchbox?",
  'intro-nia': "Hello, I'm Nia! Can you help pack my lunch?",
  'intro-sam': "Hi, I'm Sam! Can you pack my lunchbox today?",
  'yum-1': 'Yummy!',
  'yum-2': 'Ooh, perfect!',
  'yum-3': "That's the one!",
  'yum-4': 'Delicious!',
  'hint-wrong': 'Hmm, not that one today. Try again!',
  'lid': 'All packed! Tap the lid to close it!',
  'cheer': 'Hooray! What a great lunch!',
  'cheer-healthy': 'Hooray! What a healthy lunch!',
  'bite': 'Munch munch! Can you take a big pretend bite?',
  'mode-healthy': "Let's pack a healthy lunch: a fruit, a veggie, a main, a drink, and one little treat!",
  'grp-fruit': 'A fruit!',
  'grp-veggie': 'A veggie!',
  'grp-main': 'A yummy main!',
  'grp-drink': 'A drink!',
  'grp-treat': 'A little treat!',
  'req-cat-fruit': 'Can you pack a fruit?',
  'req-cat-veggie': 'Can you pack a veggie?',
  'req-cat-main': 'Can you pack a main dish?',
  'req-cat-drink': 'Can you pack a drink?',
  'req-cat-treat': 'Can you pack a little treat?',
  'req-attr-red': 'Can you find something red?',
  'req-attr-yellow': 'Can you find something yellow?',
  'req-attr-green': 'Can you find something green?',
  'req-attr-orange': 'Can you find something orange?',
  'req-attr-purple': 'Can you find something purple?',
  'req-attr-crunchy': 'Can you find something crunchy?',
  'req-count-2': 'Can you pack two of these?',
  'req-count-3': 'Can you pack three of these?',
  'req-count-4': 'Can you pack four of these?',
  'req-count-5': 'Can you pack five of these?',
  'count-1': 'One!',
  'count-2': 'Two!',
  'count-3': 'Three!',
  'count-4': 'Four!',
  'count-5': 'Five!',
};

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
 * @param {string} [manifestUrl]
 * @param {string} [linesUrl]
 */
export async function init(
  manifestUrl = './assets/audio/manifest.json',
  linesUrl = './data/lines.json'
) {
  baseUrl = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  [manifest, lines] = await Promise.all([loadJson(manifestUrl), loadJson(linesUrl)]);
}

/**
 * Speak one line: the recorded clip when the manifest has it, otherwise
 * synthesized speech. Stops whatever was playing first. Resolves when done
 * (bounded — never hangs the game).
 * @param {string} key
 * @param {string} [fallbackText]
 * @returns {Promise<void>}
 */
// Optional clip-start listeners (e.g. talking-mouth sync). cb(key, audioEl).
const clipListeners = new Set();
export function onClip(cb) { clipListeners.add(cb); return () => clipListeners.delete(cb); }

export function say(key, fallbackText) {
  stop();
  const text = (lines && lines[key]) || fallbackText || DEFAULT_LINES[key] || '';
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
 * are allowed. Mirrors shared/js/audio.js. Self-limiting: stays armed until
 * it has warmed a real clip (the manifest may not be loaded on the very
 * first tap; the silent-WAV fallback still satisfies the gesture meanwhile).
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
