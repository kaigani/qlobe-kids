const sink = (correct = false) => ({
  art: 'emoji:⬇️💧',
  alt: 'sink',
  ...(correct ? { correct: true } : {}),
});

const float = (correct = false) => ({
  art: 'emoji:🛟',
  alt: 'float',
  ...(correct ? { correct: true } : {}),
});

const tubRound = (objectEmoji, objectAlt, clue, outcome) => ({
  say: `${clue} Does it sink or float?`,
  promptArt: `emoji:${objectEmoji}`,
  promptAlt: objectAlt,
  answers: outcome === 'sink' ? [sink(true), float()] : [sink(), float(true)],
});

export default {
  id: 'sink-or-float',
  engine: 'choose-one',
  title: 'Sink or Float',
  splashEmoji: '🛁',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Bathtub test! Look at the object, make a prediction, then tap sink or float.',
    nudge: 'Hmm, think about the water pushing up and try the other card.',
    cheer: 'You tested your ideas! Try it in the sink tonight!',
    yums: [
      'Good prediction! Water pushes up on things.',
      'Yes! Shape, air, and weight can change what happens.',
      'You are thinking like a scientist!',
    ],
  },
  modes: [
    {
      id: 'tub',
      title: 'Sink or Float?',
      rounds: 6,
      items: [
        tubRound('🪨', 'rock', 'A rock is packed tight and heavy for its size.', 'sink'),
        tubRound('🍃', 'leaf', 'A leaf is light and spreads out on top of the water.', 'float'),
        tubRound('🔑', 'key', 'A metal key is small, hard, and heavy for its size.', 'sink'),
        tubRound('🐤', 'rubber duck', 'A rubber duck is light and has air inside.', 'float'),
        tubRound('🪙', 'coin', 'A coin is metal and packed tight.', 'sink'),
        tubRound('🪵', 'wood cork', 'A piece of cork or wood has tiny spaces that hold air.', 'float'),
      ],
    },
    {
      id: 'tricky',
      title: 'Tricky Ones',
      rounds: 4,
      items: [
        tubRound('🍎', 'apple', 'An apple can feel heavy, but it has air spaces inside.', 'float'),
        tubRound('🍊', 'orange', 'An orange has a light peel and air spaces.', 'float'),
        tubRound('🥄', 'spoon', 'A metal spoon is packed tight and heavy for its size.', 'sink'),
        tubRound('⛵', 'boat', 'A boat can be heavy, but its wide shape holds air and pushes lots of water.', 'float'),
      ],
    },
  ],
};
