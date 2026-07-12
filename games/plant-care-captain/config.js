export default {
  id: 'plant-care-captain',
  engine: 'coach-timer',
  title: 'Plant Care Captain',
  splashEmoji: 'emoji:🪴',
  // Storybook Rooms art world (docs/art-direction.md)
  theme: { world: 'storybook-rooms', background: './assets/bg.jpg' },
  voice: {
    intro: 'Captain, your plant crew is ready for gentle care. Let us look closely!',
    praise: 'Steady hands, Captain. Your plant crew feels cared for.',
    cheer: 'Care routine complete! You noticed what your plant needed today.',
  },
  modes: [
    {
      id: 'care',
      title: 'Care Round',
      type: 'steps',
      praise: 'Steady hands, Captain. Your plant crew feels cared for.',
      cheer: 'Care round complete! Your plant crew is ready for a bright day.',
      endTitle: 'Care Round',
      endArt: 'emoji:🪴',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🪴',
          say: 'Say good morning to your plant, Captain.',
        },
        {
          art: 'emoji:🔍',
          say: 'Look closely. Do you see any new leaves?',
          timerSec: 30,
          after: 'Excellent lookout. You gave every leaf time to be noticed.',
        },
        {
          art: 'emoji:👆',
          say: 'Gently put one finger in the soil. Does it feel wet or dry?',
        },
        {
          art: 'emoji:💧',
          say: 'If the soil is dry, water slooowly. Say stop when the soil drinks it up.',
          timerSec: 30,
          after: 'Watering watch complete. The soil has had time to drink.',
        },
        {
          art: 'emoji:☀️',
          say: 'Turn the pot toward the sun. All crew members need a little light.',
        },
      ],
    },
    {
      id: 'spa',
      title: 'Plant Spa Day',
      type: 'steps',
      praise: 'Steady hands, Captain. Your plant crew feels cared for.',
      cheer: 'Plant spa complete! Your leafy crew looks fresh and cared for.',
      endTitle: 'Plant Spa Day',
      endArt: 'emoji:💚',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🍃',
          say: 'Dust one leaf gently with a soft cloth.',
          timerSec: 40,
          after: 'That leaf is clean and shining, Captain.',
        },
        {
          art: 'emoji:💦',
          say: 'Mist gently around the leaves.',
          timerSec: 20,
          after: 'A soft mist for the leafy crew.',
        },
        {
          art: 'emoji:✂️',
          say: 'Ask a grown-up to help trim one brown bit.',
        },
        {
          art: 'emoji:💚',
          say: 'Tell your plant it looks great!',
        },
      ],
    },
  ],
};
