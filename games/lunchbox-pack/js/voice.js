// voice.js — Lunchbox Pack's voice channel, now a thin wrapper around the
// shared recorded-clip player (shared/js/voice-clips.js). The game-specific
// DEFAULT_LINES safety net stays here; everything else is the shared module.

import * as clips from '../../../shared/js/voice-clips.js';

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

export function init(
  manifestUrl = './assets/audio/manifest.json',
  linesUrl = './data/lines.json'
) {
  return clips.init(manifestUrl, linesUrl, DEFAULT_LINES);
}

export const say = clips.say;
export const stop = clips.stop;
export const unlock = clips.unlock;
export const onClip = clips.onClip;
