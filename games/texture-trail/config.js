export default {
  id: 'texture-trail',
  engine: 'match-pairs',
  title: 'Texture Trail',
  splashEmoji: '🪨',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Let\'s match two things that feel the same.',
    nudge: 'Hmm, feel it in your imagination. Try another card.',
    cheer: 'Texture trail complete! Can you find something soft in your room?',
    yums: [
      'Nice texture match!',
      'You found two that feel alike!',
      'Your fingers are thinking!',
    ],
  },
  modes: [
    {
      id: 'feel',
      title: 'Feels the Same',
      prompt: 'Find two things that feel the same.',
      rounds: 4,
      pairsPerRound: 3,
      difficultyRamp: true,
      pairs: [
        {
          say: 'Soft... like a teddy and a cloud!',
          a: { art: 'emoji:🧸', alt: 'teddy bear', say: 'teddy bear' },
          b: { art: 'emoji:☁️', alt: 'cloud', say: 'cloud' },
        },
        {
          say: 'Hard... like a rock and a brick!',
          a: { art: 'emoji:🪨', alt: 'rock', say: 'rock' },
          b: { art: 'emoji:🧱', alt: 'brick', say: 'brick' },
        },
        {
          say: 'Bumpy... like an alligator and a pineapple!',
          a: { art: 'emoji:🐊', alt: 'alligator', say: 'alligator' },
          b: { art: 'emoji:🍍', alt: 'pineapple', say: 'pineapple' },
        },
        {
          say: 'Smooth... like an egg and a shiny ball!',
          a: { art: 'emoji:🥚', alt: 'egg', say: 'egg' },
          b: { art: 'emoji:🎱', alt: 'smooth ball', say: 'smooth ball' },
        },
        {
          say: 'Fluffy... like a sheep and a chick!',
          a: { art: 'emoji:🐑', alt: 'sheep', say: 'sheep' },
          b: { art: 'emoji:🐤', alt: 'chick', say: 'chick' },
        },
        {
          say: 'Prickly... like a cactus and a hedgehog!',
          a: { art: 'emoji:🌵', alt: 'cactus', say: 'cactus' },
          b: { art: 'emoji:🦔', alt: 'hedgehog', say: 'hedgehog' },
        },
      ],
    },
  ],
};
