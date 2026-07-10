export default {
  id: 'laundry-sorter',
  engine: 'sort-into-bins',
  title: 'Laundry Sorter',
  splashEmoji: '🧦',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Let\'s sort the laundry into the right basket.',
    nudge: 'Almost. Look at what kind of laundry it is and try another basket.',
    roundCheer: 'Laundry basket sorted!',
    cheer: 'Laundry sorted! Can you help sort real socks today?',
    yums: [
      'Helpful sorting!',
      'That laundry belongs there!',
      'Home helper hands!',
    ],
  },
  modes: [
    {
      id: 'colors',
      title: 'Sort by Color',
      prompt: 'Sort the laundry by color. Red basket or blue basket.',
      rounds: 3,
      itemsPerRound: 4,
      bins: [
        { id: 'red', art: 'swatch:#e23d3d', alt: 'red basket', say: 'red basket' },
        { id: 'blue', art: 'swatch:#2d7dd2', alt: 'blue basket', say: 'blue basket' },
      ],
      items: [
        { art: 'emoji:🧦', alt: 'red sock', say: 'a red sock!', bin: 'red' },
        { art: 'emoji:👕', alt: 'red shirt', say: 'a red shirt!', bin: 'red' },
        { art: 'emoji:🧣', alt: 'red scarf', say: 'a red scarf!', bin: 'red' },
        { art: 'emoji:🧢', alt: 'blue cap', say: 'a blue cap!', bin: 'blue' },
        { art: 'emoji:🧤', alt: 'blue mitten', say: 'a blue mitten!', bin: 'blue' },
        { art: 'emoji:👖', alt: 'blue jeans', say: 'blue jeans!', bin: 'blue' },
      ],
    },
    {
      id: 'kinds',
      title: 'Socks and Shirts',
      prompt: 'Sort the laundry by kind. Socks go with socks. Shirts go with shirts.',
      rounds: 3,
      itemsPerRound: 4,
      bins: [
        { id: 'socks', art: 'emoji:🧦', alt: 'sock basket', say: 'sock basket' },
        { id: 'shirts', art: 'emoji:👕', alt: 'shirt basket', say: 'shirt basket' },
      ],
      items: [
        { art: 'emoji:🧦', alt: 'red sock', say: 'a red sock', bin: 'socks' },
        { art: 'emoji:🧦', alt: 'blue sock', say: 'a blue sock', bin: 'socks' },
        { art: 'emoji:🧦', alt: 'yellow sock', say: 'a yellow sock', bin: 'socks' },
        { art: 'emoji:🧦', alt: 'green sock', say: 'a green sock', bin: 'socks' },
        { art: 'emoji:👕', alt: 'red shirt', say: 'a red shirt', bin: 'shirts' },
        { art: 'emoji:👕', alt: 'blue shirt', say: 'a blue shirt', bin: 'shirts' },
        { art: 'emoji:👕', alt: 'yellow shirt', say: 'a yellow shirt', bin: 'shirts' },
        { art: 'emoji:👕', alt: 'green shirt', say: 'a green shirt', bin: 'shirts' },
      ],
    },
  ],
};
