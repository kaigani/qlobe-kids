const pictureWordPair = (name) => ({
  say: `${capitalize(name)} matches ${name}.`,
  a: {
    art: `shared:objects/${name}.png`,
    alt: `${name} picture`,
    say: name,
  },
  b: {
    art: `text:${name}`,
    alt: `${name} word`,
    say: name,
  },
});

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default {
  id: 'picture-word-match',
  engine: 'match-pairs',
  title: 'Picture Word Match',
  splashEmoji: '🃏',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Tap a picture and tap the word that says the same thing.',
    nudge: 'Hmm, listen again and find the word that sounds the same.',
    cheer: 'You matched pictures and words!',
    yums: [
      'Picture and word match!',
      'You found the word!',
      'Great looking and listening!',
    ],
  },
  modes: [
    {
      id: 'easy',
      title: 'Match the Word',
      rounds: 4,
      pairsPerRound: 2,
      difficultyRamp: true,
      prompt: 'Match each picture to its word.',
      pairs: [
        pictureWordPair('cat'),
        pictureWordPair('dog'),
        pictureWordPair('sun'),
        pictureWordPair('bus'),
        pictureWordPair('hat'),
        pictureWordPair('box'),
        pictureWordPair('pig'),
        pictureWordPair('cup'),
      ],
    },
    {
      id: 'more',
      title: 'More Words',
      rounds: 4,
      pairsPerRound: 3,
      prompt: 'Match more pictures to words.',
      pairs: [
        pictureWordPair('fox'),
        pictureWordPair('jet'),
        pictureWordPair('mop'),
        pictureWordPair('hen'),
        pictureWordPair('bug'),
        pictureWordPair('van'),
        pictureWordPair('log'),
        pictureWordPair('net'),
      ],
    },
  ],
};
