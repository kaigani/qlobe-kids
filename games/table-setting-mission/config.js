export default {
  id: 'table-setting-mission',
  engine: 'sort-into-bins',
  title: 'Table Setting Mission',
  splashEmoji: '🍽️',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Let\'s set the table. Put each thing in its place.',
    nudge: 'Almost. Look for the place where that table thing belongs.',
    roundCheer: 'This place setting is ready!',
    cheer: 'Table mission complete! Now you can set the real table tonight!',
    yums: [
      'That belongs there!',
      'You are setting the table!',
      'Careful helper hands!',
    ],
  },
  modes: [
    {
      id: 'places',
      title: 'Set the Table',
      prompt: 'Set the table. Plates, cups, and cutlery each have a place.',
      rounds: 3,
      itemsPerRound: 4,
      bins: [
        { id: 'plate', art: 'emoji:🍽️', alt: 'plate spot', say: 'the plate spot' },
        { id: 'cup', art: 'emoji:🥛', alt: 'cup spot', say: 'the cup spot' },
        { id: 'cutlery', art: 'emoji:🍴', alt: 'cutlery spot', say: 'the cutlery spot' },
      ],
      items: [
        { art: 'emoji:🥣', alt: 'bowl', say: 'A bowl goes on the plate spot.', bin: 'plate' },
        { art: 'emoji:🍞', alt: 'bread', say: 'Bread goes on the plate spot.', bin: 'plate' },
        { art: 'emoji:🥗', alt: 'salad', say: 'Salad goes on the plate spot.', bin: 'plate' },
        { art: 'emoji:🥛', alt: 'milk', say: 'Milk goes on the cup spot.', bin: 'cup' },
        { art: 'emoji:🧃', alt: 'juice box', say: 'Juice goes on the cup spot.', bin: 'cup' },
        { art: 'emoji:☕', alt: 'warm drink cup', say: 'A cup goes on the cup spot.', bin: 'cup' },
        { art: 'emoji:🥄', alt: 'spoon', say: 'A spoon goes on the cutlery spot.', bin: 'cutlery' },
        { art: 'emoji:🍴', alt: 'fork', say: 'A fork goes on the cutlery spot.', bin: 'cutlery' },
      ],
    },
  ],
};
