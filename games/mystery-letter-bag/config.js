const tile = (letter, correct = false) => ({
  art: `shared:letter-tiles/${letter}.png`,
  alt: `letter ${letter}`,
  ...(correct ? { correct: true } : {}),
});

const letterRound = (letter, sound, distractors) => ({
  say: `Something in the bag says ${sound}... ${sound}. Which letter is hiding?`,
  promptArt: 'emoji:👜',
  promptAlt: 'mystery bag',
  answers: [
    tile(letter, true),
    ...distractors.map((item) => tile(item)),
  ],
});

export default {
  id: 'mystery-letter-bag',
  engine: 'choose-one',
  title: 'Mystery Letter Bag',
  splashEmoji: '👜',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Reach into the mystery bag with your ears. Listen for the sound, then tap the letter.',
    nudge: 'Hmm, listen for the sound in the bag and try another letter.',
    cheer: 'The mystery bag is empty. You found the sounds!',
    yums: [
      'Yes! That letter makes the sound!',
      'Great listening ears!',
      'You found the mystery letter!',
    ],
  },
  modes: [
    {
      id: 'bag',
      title: 'What\'s in the Bag?',
      rounds: 6,
      difficultyRamp: true,
      items: [
        letterRound('b', 'buh', ['s', 'm', 't']),
        letterRound('s', 'sss', ['b', 'm', 'p']),
        letterRound('m', 'mmm', ['s', 't', 'c']),
        letterRound('t', 'tuh', ['m', 'c', 'p']),
        letterRound('c', 'kuh', ['s', 't', 'b']),
        letterRound('p', 'puh', ['c', 'm', 's']),
      ],
    },
    {
      id: 'tricky',
      title: 'Tricky Sounds',
      rounds: 4,
      items: [
        letterRound('b', 'buh', ['p', 'm']),
        letterRound('p', 'puh', ['b', 't']),
        letterRound('m', 'mmm', ['n', 's']),
        letterRound('n', 'nnn', ['m', 'p']),
        letterRound('c', 'kuh', ['g', 't']),
        letterRound('g', 'guh', ['c', 'b']),
      ],
    },
  ],
};
