export default {
  id: 'laundry-sorter',
  engine: 'sort-into-bins',
  title: 'Laundry Sorter',
  splashEmoji: '🧦',
  // Storybook Rooms art world (docs/art-direction.md): the laundry room is the
  // stage; baskets and clothes are cut-out sprites sitting directly on it.
  theme: {
    world: 'storybook-rooms',
    background: './assets/room.jpg',
    binPanel: 'none',
    itemPanel: 'none',
  },
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
        { id: 'red', art: 'shared:storybook/basket-red.png', alt: 'red basket', say: 'red basket' },
        { id: 'blue', art: 'shared:storybook/basket-blue.png', alt: 'blue basket', say: 'blue basket' },
      ],
      items: [
        { art: 'shared:storybook/sock-red.png', alt: 'red sock', say: 'a red sock!', bin: 'red' },
        { art: 'shared:storybook/shirt-red.png', alt: 'red shirt', say: 'a red shirt!', bin: 'red' },
        { art: 'shared:storybook/scarf-red.png', alt: 'red scarf', say: 'a red scarf!', bin: 'red' },
        { art: 'shared:storybook/cap-blue.png', alt: 'blue cap', say: 'a blue cap!', bin: 'blue' },
        { art: 'shared:storybook/mitten-blue.png', alt: 'blue mitten', say: 'a blue mitten!', bin: 'blue' },
        { art: 'shared:storybook/jeans-blue.png', alt: 'blue jeans', say: 'blue jeans!', bin: 'blue' },
      ],
    },
    {
      id: 'kinds',
      title: 'Socks and Shirts',
      prompt: 'Sort the laundry by kind. Socks go with socks. Shirts go with shirts.',
      rounds: 3,
      itemsPerRound: 4,
      bins: [
        { id: 'socks', art: 'shared:storybook/basket-socks.png', alt: 'sock basket', say: 'sock basket' },
        { id: 'shirts', art: 'shared:storybook/basket-shirts.png', alt: 'shirt basket', say: 'shirt basket' },
      ],
      items: [
        { art: 'shared:storybook/sock-red.png', alt: 'red sock', say: 'a red sock', bin: 'socks' },
        { art: 'shared:storybook/sock-blue.png', alt: 'blue sock', say: 'a blue sock', bin: 'socks' },
        { art: 'shared:storybook/sock-yellow.png', alt: 'yellow sock', say: 'a yellow sock', bin: 'socks' },
        { art: 'shared:storybook/sock-green.png', alt: 'green sock', say: 'a green sock', bin: 'socks' },
        { art: 'shared:storybook/shirt-red.png', alt: 'red shirt', say: 'a red shirt', bin: 'shirts' },
        { art: 'shared:storybook/shirt-blue.png', alt: 'blue shirt', say: 'a blue shirt', bin: 'shirts' },
        { art: 'shared:storybook/shirt-yellow.png', alt: 'yellow shirt', say: 'a yellow shirt', bin: 'shirts' },
        { art: 'shared:storybook/shirt-green.png', alt: 'green shirt', say: 'a green shirt', bin: 'shirts' },
      ],
    },
  ],
};
