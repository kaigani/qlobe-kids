export default {
  id: 'snack-addition-stories',
  engine: 'tap-count',
  title: 'Snack Addition Stories',
  splashEmoji: '🍓',
  basketArt: 'emoji:🧺',
  copy: {
    basket: 'snack basket',
    items: 'snacks',
  },
  voice: {
    intro: 'Snack stories are ready. Listen, tap, and count the answer.',
    cheer: 'You solved the snack stories!',
    counts: ['One!', 'Two!', 'Three!', 'Four!', 'Five!', 'Six!'],
  },
  modes: [
    {
      id: 'stories',
      title: 'Snack Stories',
      type: 'collect',
      rounds: 5,
      difficultyRamp: true,
      basketArt: 'emoji:🧺',
      rounds_spec: [
        {
          count: 2,
          itemArt: 'shared:foods/grapes.png',
          itemAlt: 'grape',
          say: 'Maya has one grape, and one more grape. One and one more makes two. How many grapes?',
        },
        {
          count: 3,
          itemArt: 'shared:foods/strawberry.png',
          itemAlt: 'strawberry',
          say: 'Leo has two strawberries, and one more strawberry. Two and one more makes three. How many strawberries?',
        },
        {
          count: 4,
          itemArt: 'shared:foods/crackers.png',
          itemAlt: 'cracker',
          say: 'Nia has two crackers, and two more crackers. Two and two more makes four. How many crackers?',
        },
        {
          count: 4,
          itemArt: 'shared:foods/apple.png',
          itemAlt: 'apple',
          say: 'Sam has three apples, and one more apple. Three and one more makes four. How many apples?',
        },
        {
          count: 6,
          itemArt: 'shared:foods/banana.png',
          itemAlt: 'banana',
          say: 'Ravi has three bananas, and three more bananas. Three and three more makes six. How many bananas?',
        },
      ],
    },
  ],
};
