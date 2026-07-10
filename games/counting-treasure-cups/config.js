export default {
  id: 'counting-treasure-cups',
  engine: 'tap-count',
  title: 'Counting Treasure Cups',
  splashEmoji: '🏴‍☠️',
  basketArt: 'emoji:🏆',
  copy: {
    basket: 'treasure cup',
    items: 'treasures',
  },
  voice: {
    intro: 'Pirate treasure! Put exactly the number in the cup.',
    cheer: 'Treasure counted! Yo ho ho!',
    counts: ['One!', 'Two!', 'Three!', 'Four!', 'Five!', 'Six!', 'Seven!', 'Eight!', 'Nine!', 'Ten!'],
  },
  modes: [
    {
      id: 'treasure',
      title: 'Fill the Cup',
      type: 'collect',
      rounds: 5,
      difficultyRamp: true,
      basketArt: 'emoji:🏆',
      rounds_spec: [
        { count: 2, itemArt: 'emoji:💎', itemAlt: 'gem', say: 'Can you put two gems in the treasure cup?' },
        { count: 3, itemArt: 'emoji:💎', itemAlt: 'gem', say: 'Can you put three gems in the treasure cup?' },
        { count: 4, itemArt: 'emoji:💎', itemAlt: 'gem', say: 'Can you put four gems in the treasure cup?' },
        { count: 5, itemArt: 'emoji:💎', itemAlt: 'gem', say: 'Can you put five gems in the treasure cup?' },
        { count: 6, itemArt: 'emoji:💎', itemAlt: 'gem', say: 'Can you put six gems in the treasure cup?' },
      ],
    },
    {
      id: 'more',
      title: 'Big Treasure',
      type: 'collect',
      rounds: 4,
      basketArt: 'emoji:🧰',
      rounds_spec: [
        { count: 6, itemArt: 'emoji:🪙', itemAlt: 'coin', say: 'Big treasure! Put six coins in the chest.' },
        { count: 7, itemArt: 'emoji:🪙', itemAlt: 'coin', say: 'Big treasure! Put seven coins in the chest.' },
        { count: 8, itemArt: 'emoji:🪙', itemAlt: 'coin', say: 'Big treasure! Put eight coins in the chest.' },
        { count: 10, itemArt: 'emoji:🪙', itemAlt: 'coin', say: 'Big treasure! Put ten coins in the chest.' },
      ],
    },
  ],
};
