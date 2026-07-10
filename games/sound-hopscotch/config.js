const stone = (letter, correct = false) => ({
  art: `shared:letter-tiles/${letter}.png`,
  alt: `letter ${letter}`,
  ...(correct ? { correct: true } : {}),
});

const soundRound = (letter, sound, distractors) => ({
  say: `Hop to ${sound}! Which letter stone says ${sound}?`,
  promptArt: 'emoji:🦘',
  promptAlt: 'kangaroo hopping',
  answers: [
    stone(letter, true),
    ...distractors.map((item) => stone(item)),
  ],
});

export default {
  id: 'sound-hopscotch',
  engine: 'choose-one',
  title: 'Sound Hopscotch',
  splashEmoji: '🦘',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Hopscotch with your ears! Listen for the sound, then tap the matching letter stone.',
    nudge: 'Hmm, listen for the sound and hop to another letter stone.',
    cheer: 'You hopped to the sounds! Now HOP three times for real!',
    yums: [
      'Hop! That letter makes the sound!',
      'Great listening jump!',
      'Yes! Your ears found the sound!',
    ],
  },
  modes: [
    {
      id: 'hop',
      title: 'Hop to the Sound',
      rounds: 6,
      difficultyRamp: true,
      items: [
        soundRound('b', 'buh', ['m', 's', 't']),
        soundRound('m', 'mmm', ['b', 's', 'c']),
        soundRound('s', 'sss', ['m', 't', 'p']),
        soundRound('t', 'tuh', ['s', 'c', 'd']),
        soundRound('c', 'kuh', ['t', 'p', 'g']),
        soundRound('p', 'puh', ['b', 't', 'd']),
        soundRound('d', 'duh', ['b', 'g', 'p']),
        soundRound('g', 'guh', ['c', 'd', 'b']),
      ],
    },
    {
      id: 'fast',
      title: 'Quick Hops',
      rounds: 5,
      items: [
        soundRound('b', 'buh', ['d', 'p', 'm']),
        soundRound('d', 'duh', ['b', 'g', 't']),
        soundRound('m', 'mmm', ['n', 's', 'b']),
        soundRound('n', 'nnn', ['m', 'd', 'p']),
        soundRound('c', 'kuh', ['g', 't', 's']),
        soundRound('g', 'guh', ['c', 'd', 'b']),
      ],
    },
  ],
};
