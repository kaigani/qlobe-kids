export default {
  id: 'then-now-sort',
  engine: 'match-pairs',
  title: 'Then & Now Sort',
  splashEmoji: '🕰️',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Let\'s match the old thing with the new thing.',
    nudge: 'Hmm, these do different jobs. Try another match.',
    cheer: 'Then and now, you matched them all!',
    yums: [
      'Old and new, same job!',
      'History helper!',
      'You found what they are for!',
    ],
  },
  modes: [
    {
      id: 'classic',
      title: 'Old and New',
      prompt: 'Match the old thing to the new thing.',
      rounds: 4,
      pairsPerRound: 3,
      difficultyRamp: true,
      pairs: [
        {
          say: 'A candle and a lightbulb. Both make light!',
          a: { art: 'emoji:🕯️', alt: 'candle', say: 'candle' },
          b: { art: 'emoji:💡', alt: 'lightbulb', say: 'lightbulb' },
        },
        {
          say: 'A quill and a pencil. Both help us write!',
          a: { art: 'emoji:🪶', alt: 'quill', say: 'quill' },
          b: { art: 'emoji:✏️', alt: 'pencil', say: 'pencil' },
        },
        {
          say: 'A horse and a car. Both help people travel!',
          a: { art: 'emoji:🐎', alt: 'horse', say: 'horse' },
          b: { art: 'emoji:🚗', alt: 'car', say: 'car' },
        },
        {
          say: 'A letter and a phone. Both send messages!',
          a: { art: 'emoji:✉️', alt: 'letter', say: 'letter' },
          b: { art: 'emoji:📱', alt: 'phone', say: 'phone' },
        },
        {
          say: 'A radio and headphones. Both let us hear music!',
          a: { art: 'emoji:📻', alt: 'radio', say: 'radio' },
          b: { art: 'emoji:🎧', alt: 'headphones', say: 'headphones' },
        },
        {
          say: 'A broom and a robot. Both sweep the floor!',
          a: { art: 'emoji:🧹', alt: 'broom', say: 'broom' },
          b: { art: 'emoji:🤖', alt: 'cleaning robot', say: 'cleaning robot' },
        },
      ],
    },
  ],
};
