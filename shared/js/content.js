// content.js — one accessor for the shared learning content: letters, their
// pronunciation, and the picture-word objects (with images + spoken audio).
//
// Everything resolves to real URLs under shared/, so any game can pull, e.g.,
// "the objects that start with B and their sounds" without knowing paths:
//
//   import * as content from '../../../shared/js/content.js';
//   await content.ready();
//   content.objectsStartingWith('b');
//     // → [{ word:'bat', char:'🦇', image:'…/objects/bat.png',
//     //      audio:'…/audio/words/bat.m4a', onsetSound:'…/fragments/b.m4a', … }, …]
//   content.letterSound('b');   // → { phonic:'buh', url:'…/fragments/b.m4a' }
//
// Data source of truth: shared/data/words.json (words = onset + rime, img, char)
// and shared/data/letters.json (canonical A–Z: phonic + soundClip + objectCount).
// Audio/image path conventions live here so they have exactly one home.

const SHARED = new URL('../', import.meta.url); // → shared/
const url = (rel) => new URL(rel, SHARED).href;

let _words = null;
let _letters = null;
let _byLetter = null;
let _ready = null;

/** Load words.json + letters.json once. Resolves (never rejects). */
export function ready() {
  if (!_ready) {
    _ready = (async () => {
      try {
        const [w, l] = await Promise.all([
          fetch(url('data/words.json')).then((r) => r.json()),
          fetch(url('data/letters.json')).then((r) => r.json()),
        ]);
        _words = w.words || [];
        _letters = l.letters || [];
      } catch {
        _words = _words || [];
        _letters = _letters || [];
      }
      _byLetter = {};
      for (const word of _words) {
        if (!_byLetter[word.onset]) _byLetter[word.onset] = [];
        _byLetter[word.onset].push(word);
      }
    })();
  }
  return _ready;
}

// ---- asset path resolvers (the one place these conventions are written) ----

/** Illustrated picture-card for a word (e.g. objectImage('cat')). */
export const objectImage = (word) => url(`assets/objects/${word}.png`);
/** Spoken word clip. */
export const wordAudio = (word) => url(`assets/audio/words/${word}.m4a`);
/** Word said with celebration prosody. */
export const wordCelebrate = (word) => url(`assets/audio/celebrate/${word}.m4a`);
/** "Can you find the …" style prompt clip. */
export const wordPrompt = (word) => url(`assets/audio/prompts/${word}.m4a`);
/** The phonic sound a letter makes (e.g. letterSoundUrl('b') → …/fragments/b.m4a). */
export const letterSoundUrl = (letter) => url(`assets/audio/fragments/${String(letter).toLowerCase()}.m4a`);

// ---- queries (call after `await ready()`) ----

/** All 26 canonical letter records (letter, vowel, phonic, soundClip, objectCount, objects). */
export function allLetters() { return _letters || []; }

/** One letter's record, plus a resolved `soundUrl`. */
export function letterInfo(letter) {
  const entry = (_letters || []).find((l) => l.letter === String(letter).toUpperCase());
  return entry ? { ...entry, soundUrl: url(entry.soundClip) } : null;
}

/** The phonic sound of a letter: { phonic, url }. */
export function letterSound(letter) {
  const entry = letterInfo(letter);
  return entry ? { phonic: entry.phonic, url: entry.soundUrl } : null;
}

/** Every object whose word starts with `letter`, each enriched with asset URLs. */
export function objectsStartingWith(letter) {
  const key = String(letter).toLowerCase();
  return ((_byLetter && _byLetter[key]) || []).map(enrich);
}

/** One word by name, enriched with asset URLs (or null). */
export function word(name) {
  const entry = (_words || []).find((x) => x.word === name);
  return entry ? enrich(entry) : null;
}

/** All words, enriched. */
export function allWords() { return (_words || []).map(enrich); }

function enrich(w) {
  return {
    word: w.word,
    char: w.char,          // emoji fallback
    img: w.img,            // illustration subject text
    type: w.type,
    onset: w.onset,        // starting letter/sound
    rime: w.rime,
    image: objectImage(w.word),
    audio: wordAudio(w.word),
    celebrate: wordCelebrate(w.word),
    prompt: wordPrompt(w.word),
    onsetSound: letterSoundUrl(w.onset),
  };
}
