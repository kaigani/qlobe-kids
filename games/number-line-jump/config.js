export default {
  id: 'number-line-jump',
  engine: 'tap-count',
  title: 'Number Line Jump',
  splashEmoji: '🐸',
  basketArt: 'emoji:🐸',
  copy: {
    basket: 'frog',
    creature: 'frog',
    items: 'lily pads',
  },
  voice: {
    intro: 'Help the frog hop and count each jump.',
    cheer: 'Frog hops complete!',
    leftQuestion: 'How many lily pads are left?',
    noneLeft: 'No lily pads left!',
    counts: ['One!', 'Two!', 'Three!', 'Four!', 'Five!', 'Six!', 'Seven!', 'Eight!', 'Nine!', 'Ten!'],
  },
  modes: [
    {
      id: 'hops',
      title: 'Frog Hops',
      type: 'collect',
      rounds: 5,
      difficultyRamp: true,
      basketArt: 'emoji:🐸',
      rounds_spec: [
        { count: 2, itemArt: 'emoji:🪷', itemAlt: 'lily pad', say: 'Can you do two big frog jumps?' },
        { count: 3, itemArt: 'emoji:🪷', itemAlt: 'lily pad', say: 'Can you do three big frog jumps?' },
        { count: 4, itemArt: 'emoji:🪷', itemAlt: 'lily pad', say: 'Can you do four big frog jumps?' },
        { count: 5, itemArt: 'emoji:🪷', itemAlt: 'lily pad', say: 'Can you do five big frog jumps?' },
        { count: 6, itemArt: 'emoji:🪷', itemAlt: 'lily pad', say: 'Can you do six big frog jumps?' },
      ],
    },
    {
      id: 'back',
      title: 'Hop Home',
      type: 'takeaway',
      rounds: 3,
      rounds_spec: [
        { start: 5, eat: 1, itemArt: 'emoji:🪷', itemAlt: 'lily pad', creatureArt: 'emoji:🐸', say: 'Hop back one pad! How many pads are left?' },
        { start: 5, eat: 2, itemArt: 'emoji:🪷', itemAlt: 'lily pad', creatureArt: 'emoji:🐸', say: 'Hop back two pads! How many pads are left?' },
        { start: 5, eat: 3, itemArt: 'emoji:🪷', itemAlt: 'lily pad', creatureArt: 'emoji:🐸', say: 'Hop back three pads! How many pads are left?' },
      ],
    },
  ],
};
