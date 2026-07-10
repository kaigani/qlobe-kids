const objectCard = (word, correct = false) => ({
  art: `shared:objects/${word}.png`,
  alt: word,
  ...(correct ? { correct: true } : {}),
});

const treasureRound = (letter, sound, correctWord, distractors) => ({
  say: `Find something that starts with ${sound}.`,
  promptArt: `shared:letter-tiles/${letter}.png`,
  promptAlt: `letter ${letter}`,
  answers: [
    objectCard(correctWord, true),
    ...distractors.map((word) => objectCard(word)),
  ],
});

export default {
  id: 'letter-treasure-hunt',
  engine: 'choose-one',
  title: 'Letter Treasure Hunt',
  splashEmoji: '🏴‍☠️',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Treasure ears ready. Listen for the first sound, then tap the picture treasure.',
    nudge: 'Hmm, listen to the first sound and try another treasure.',
    cheer: 'Treasure found! You heard the starting sounds!',
    yums: [
      'Yes! That word starts with the sound!',
      'Great treasure ears!',
      'You found the sound treasure!',
    ],
  },
  modes: [
    {
      id: 'hunt',
      title: 'Sound Treasure',
      rounds: 6,
      difficultyRamp: true,
      items: [
        treasureRound('b', 'buh', 'bat', ['sun', 'map']),
        treasureRound('s', 'sss', 'sun', ['bat', 'cat']),
        treasureRound('m', 'mmm', 'map', ['pig', 'top']),
        treasureRound('c', 'kuh', 'cat', ['sun', 'pig']),
        treasureRound('p', 'puh', 'pig', ['map', 'top']),
        treasureRound('t', 'tuh', 'top', ['cat', 'bat']),
      ],
    },
    {
      id: 'two',
      title: 'Two Treasures',
      rounds: 4,
      items: [
        treasureRound('b', 'buh', 'bat', ['pig', 'pan']),
        treasureRound('p', 'puh', 'pig', ['bat', 'bun']),
        treasureRound('c', 'kuh', 'cat', ['gum', 'gem']),
        treasureRound('m', 'mmm', 'map', ['net', 'nut']),
      ],
    },
  ],
};
