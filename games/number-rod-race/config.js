export default {
  id: 'number-rod-race',
  engine: 'sequence-order',
  title: 'Number Rod Race',
  splashEmoji: '📏',
  voice: {
    intro: 'Number rods are ready. Put them in order.',
    nudge: 'Look at the length. Try another spot.',
    cheer: 'You ordered the number rods!',
    yums: [
      'Good comparing!',
      'That rod fits!',
      'Nice counting eyes!',
    ],
  },
  modes: [
    {
      id: 'short',
      title: 'Short to Long',
      rounds: 4,
      difficultyRamp: true,
      prompt: 'Put the rods from short to long.',
      sets: [
        {
          say: 'One! Two! Three! Short to long!',
          items: [
            { art: 'emoji:🟥', alt: 'one block rod' },
            { art: 'emoji:🟥🟥', alt: 'two block rod' },
            { art: 'emoji:🟥🟥🟥', alt: 'three block rod' },
          ],
        },
        {
          say: 'One! Two! Three! Four! Short to long!',
          items: [
            { art: 'emoji:🟥', alt: 'one block rod' },
            { art: 'emoji:🟥🟥', alt: 'two block rod' },
            { art: 'emoji:🟥🟥🟥', alt: 'three block rod' },
            { art: 'emoji:🟥🟥🟥🟥', alt: 'four block rod' },
          ],
        },
        {
          say: 'One! Two! Three! Four! Five! Short to long!',
          items: [
            { art: 'emoji:🟥', alt: 'one block rod' },
            { art: 'emoji:🟥🟥', alt: 'two block rod' },
            { art: 'emoji:🟥🟥🟥', alt: 'three block rod' },
            { art: 'emoji:🟥🟥🟥🟥', alt: 'four block rod' },
            { art: 'emoji:🟥🟥🟥🟥🟥', alt: 'five block rod' },
          ],
        },
        {
          say: 'Two! Three! Four! Five! Short to long!',
          items: [
            { art: 'emoji:🟥🟥', alt: 'two block rod' },
            { art: 'emoji:🟥🟥🟥', alt: 'three block rod' },
            { art: 'emoji:🟥🟥🟥🟥', alt: 'four block rod' },
            { art: 'emoji:🟥🟥🟥🟥🟥', alt: 'five block rod' },
          ],
        },
      ],
    },
    {
      id: 'long',
      title: 'Long to Short',
      rounds: 3,
      prompt: 'Put the rods from long to short.',
      sets: [
        {
          say: 'Five first! Four! Three! Two! One! Long to short!',
          items: [
            { art: 'emoji:🟥🟥🟥🟥🟥', alt: 'five block rod' },
            { art: 'emoji:🟥🟥🟥🟥', alt: 'four block rod' },
            { art: 'emoji:🟥🟥🟥', alt: 'three block rod' },
            { art: 'emoji:🟥🟥', alt: 'two block rod' },
            { art: 'emoji:🟥', alt: 'one block rod' },
          ],
        },
        {
          say: 'Four first! Three! Two! One! Longest first!',
          items: [
            { art: 'emoji:🟥🟥🟥🟥', alt: 'four block rod' },
            { art: 'emoji:🟥🟥🟥', alt: 'three block rod' },
            { art: 'emoji:🟥🟥', alt: 'two block rod' },
            { art: 'emoji:🟥', alt: 'one block rod' },
          ],
        },
        {
          say: 'Five! Three! Two! Long to short!',
          items: [
            { art: 'emoji:🟥🟥🟥🟥🟥', alt: 'five block rod' },
            { art: 'emoji:🟥🟥🟥', alt: 'three block rod' },
            { art: 'emoji:🟥🟥', alt: 'two block rod' },
          ],
        },
      ],
    },
  ],
};
