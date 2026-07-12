export default {
  id: 'snack-chef',
  engine: 'coach-timer',
  title: 'Snack Chef',
  splashEmoji: 'emoji:🥪',
  // Storybook Rooms art world (docs/art-direction.md)
  theme: { world: 'storybook-rooms', background: './assets/bg.jpg' },
  voice: {
    intro: 'Welcome, sous-chef! A grown-up stays nearby while we make our snack slowly and safely.',
    praise: 'Nicely done, sous-chef.',
    cheer: 'Snack complete! Celebrate with a delicious taste.',
  },
  modes: [
    {
      id: 'banana',
      title: 'Banana Coins',
      type: 'steps',
      praise: 'Nicely done, sous-chef.',
      cheer: 'Banana coins are ready to eat. Bon appétit, chef!',
      endTitle: 'Banana Coins',
      endArt: 'emoji:🍌',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🧼',
          say: 'Wash your hands with soap for twenty seconds.',
          timerSec: 20,
          after: 'Clean hands are ready to cook.',
        },
        {
          art: 'emoji:🍌',
          say: 'Peel the banana.',
        },
        {
          art: 'emoji:🔪',
          say: 'Your grown-up watches. Curl your fingers like a claw, then slice banana coins with a butter knife.',
          timerSec: 45,
          after: 'Slow slices and curled fingers. Safe chef work!',
        },
        {
          art: 'emoji:🍽️',
          say: 'Arrange the banana coins on the plate.',
        },
        {
          art: 'emoji:🧻',
          say: 'Wipe the counter. Cleanup is part of cooking.',
        },
      ],
    },
    {
      id: 'toast',
      title: 'Spread It',
      type: 'steps',
      praise: 'Nicely done, sous-chef.',
      cheer: 'Your toast is ready. Time for the chef taste test!',
      endTitle: 'Spread It',
      endArt: 'emoji:🍞',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🧼',
          say: 'Wash your hands with soap.',
        },
        {
          art: 'emoji:🍞',
          say: 'Spread soft butter or jam slowly, all the way from corner to corner.',
          timerSec: 40,
          after: 'Corner to corner. That is careful spreading!',
        },
        {
          art: 'emoji:🔺',
          say: 'With your grown-up nearby, cut the toast into triangles with a butter knife.',
        },
        {
          art: 'emoji:😋',
          say: 'Taste test! Take a bite and enjoy what you made.',
        },
        {
          art: 'emoji:🧽',
          say: 'Carry the dishes to the sink. Cleanup completes the recipe.',
        },
      ],
    },
  ],
};
