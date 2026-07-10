const word = (name) => ({
  art: `shared:objects/${name}.png`,
  alt: name,
  say: name,
});

const rhymePair = (a, b) => ({
  say: `${capitalize(a)} rhymes with ${b}!`,
  a: word(a),
  b: word(b),
});

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default {
  id: 'rhyming-detective',
  engine: 'match-pairs',
  title: 'Rhyming Detective',
  splashEmoji: '🔍',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Detective ears ready. Find the two pictures that rhyme.',
    nudge: 'Hmm, listen to the ending sound and try another picture.',
    cheer: 'Case closed! You found the rhymes!',
    yums: [
      'Those ending sounds match!',
      'Great rhyming ears!',
      'You heard the rhyme!',
    ],
  },
  modes: [
    {
      id: 'classic',
      title: 'Find the Rhymes',
      rounds: 4,
      pairsPerRound: 3,
      difficultyRamp: true,
      prompt: 'Find the two pictures that rhyme.',
      pairs: [
        rhymePair('cat', 'hat'),
        rhymePair('dog', 'log'),
        rhymePair('sun', 'bun'),
        rhymePair('pig', 'wig'),
        rhymePair('van', 'pan'),
        rhymePair('box', 'fox'),
        rhymePair('jet', 'net'),
        rhymePair('mop', 'top'),
        rhymePair('bug', 'rug'),
        rhymePair('hen', 'pen'),
      ],
    },
    {
      id: 'tricky',
      title: 'Tricky Rhymes',
      rounds: 3,
      pairsPerRound: 4,
      prompt: 'Find the trickier rhyming pictures.',
      pairs: [
        rhymePair('rat', 'bat'),
        rhymePair('jam', 'ham'),
        rhymePair('cot', 'pot'),
        rhymePair('cub', 'tub'),
        rhymePair('bag', 'tag'),
        rhymePair('cap', 'nap'),
        rhymePair('hug', 'mug'),
        rhymePair('sad', 'mad'),
      ],
    },
  ],
};
