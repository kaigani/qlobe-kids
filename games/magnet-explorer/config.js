export default {
  id: 'magnet-explorer',
  engine: 'sort-into-bins',
  title: 'Magnet Explorer',
  splashEmoji: '🧲',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Which things stick to a magnet? Sort each thing.',
    nudge: 'Almost. Think about what the thing is made of and try again.',
    roundCheer: 'Magnet test sorted!',
    cheer: 'Magnet explorer complete! You sorted what sticks and what does not stick!',
    yums: [
      'Good science thinking!',
      'You tested that material!',
      'Explorer eyes!',
    ],
  },
  modes: [
    {
      id: 'explore',
      title: 'Sticks or Not?',
      prompt: 'Sort each thing. Does it stick to a magnet?',
      rounds: 3,
      itemsPerRound: 4,
      bins: [
        { id: 'sticks', art: 'emoji:🧲', alt: 'sticks to magnet', say: 'sticks!' },
        { id: 'not', art: 'emoji:🧺', alt: 'does not stick basket', say: 'does not stick' },
      ],
      items: [
        { art: 'emoji:📎', alt: 'paperclip', say: 'A paperclip is metal. It sticks!', bin: 'sticks' },
        { art: 'emoji:🔑', alt: 'key', say: 'A key is metal. It sticks!', bin: 'sticks' },
        { art: 'emoji:🔩', alt: 'bolt', say: 'A bolt is metal. It sticks!', bin: 'sticks' },
        { art: 'emoji:✂️', alt: 'scissors', say: 'Scissors have metal. They stick!', bin: 'sticks' },
        { art: 'emoji:🥄', alt: 'spoon', say: 'A metal spoon sticks!', bin: 'sticks' },
        { art: 'emoji:🍃', alt: 'leaf', say: 'A leaf is from a plant. It does not stick.', bin: 'not' },
        { art: 'emoji:🖍️', alt: 'crayon', say: 'A crayon is wax. It does not stick.', bin: 'not' },
        { art: 'emoji:🧸', alt: 'teddy bear', say: 'A teddy is soft cloth. It does not stick.', bin: 'not' },
        { art: 'emoji:🐤', alt: 'plastic duck', say: 'A plastic duck is not metal. It does not stick.', bin: 'not' },
        { art: 'emoji:🪵', alt: 'wood block', say: 'A wood block is wood. It does not stick.', bin: 'not' },
      ],
    },
  ],
};
