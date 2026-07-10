export default {
  id: 'story-sequence',
  engine: 'sequence-order',
  title: 'First, Next, Last',
  splashEmoji: 'emoji:📖',
  voice: {
    intro: 'Put the story pictures in order. First, next, last.',
    nudge: 'Hmm, that story part goes in a different spot.',
    cheer: 'You told the stories in order!',
    yums: [
      'Good first part.',
      'That comes next.',
      'Nice story order.',
    ],
  },
  modes: [
    {
      id: 'stories',
      title: 'First, Next, Last',
      rounds: 5,
      slotLabels: ['first', 'next', 'last'],
      prompt: 'Put the story pictures in order. First, next, last.',
      sets: [
        {
          say: 'First a seed, then a sprout, then a flower!',
          items: [
            { art: 'emoji:🌱', alt: 'seed' },
            { art: 'emoji:🌿', alt: 'sprout' },
            { art: 'emoji:🌻', alt: 'flower' },
          ],
        },
        {
          say: 'First an egg, then a chick, then a hen!',
          items: [
            { art: 'emoji:🥚', alt: 'egg' },
            { art: 'emoji:🐣', alt: 'chick' },
            { art: 'emoji:🐔', alt: 'hen' },
          ],
        },
        {
          say: 'First a caterpillar, then a cocoon, then a butterfly!',
          items: [
            { art: 'emoji:🐛', alt: 'caterpillar' },
            { art: 'emoji:🧶', alt: 'cocoon' },
            { art: 'emoji:🦋', alt: 'butterfly' },
          ],
        },
        {
          say: 'First a cloud, then rain, then a rainbow!',
          items: [
            { art: 'emoji:☁️', alt: 'cloud' },
            { art: 'emoji:🌧️', alt: 'rain' },
            { art: 'emoji:🌈', alt: 'rainbow' },
          ],
        },
        {
          say: 'First mixing, then baking, then cake!',
          items: [
            { art: 'emoji:🥣', alt: 'mixing bowl' },
            { art: 'emoji:🔥', alt: 'baking' },
            { art: 'emoji:🎂', alt: 'cake' },
          ],
        },
      ],
    },
    {
      id: 'daily',
      title: 'My Day',
      rounds: 4,
      difficultyRamp: true,
      slotLabels: ['first', 'next', 'next', 'last'],
      prompt: 'Put the day pictures in order. What happens first?',
      sets: [
        {
          say: 'Morning steps, one after another!',
          items: [
            { art: 'emoji:🛏️', alt: 'wake up' },
            { art: 'emoji:👕', alt: 'get dressed' },
            { art: 'emoji:🥣', alt: 'eat breakfast' },
            { art: 'emoji:🎒', alt: 'school bag' },
          ],
        },
        {
          say: 'Play, wash up, eat dinner, then sleep.',
          items: [
            { art: 'emoji:⚽', alt: 'play' },
            { art: 'emoji:🛁', alt: 'wash' },
            { art: 'emoji:🍽️', alt: 'dinner' },
            { art: 'emoji:😴', alt: 'sleep' },
          ],
        },
        {
          say: 'Brush teeth, put on pajamas, hear a story, then sleep.',
          items: [
            { art: 'emoji:🪥', alt: 'brush teeth' },
            { art: 'emoji:🧸', alt: 'pajamas' },
            { art: 'emoji:📖', alt: 'story time' },
            { art: 'emoji:😴', alt: 'sleep' },
          ],
        },
        {
          say: 'Arrive at school, play, clean up, then go home.',
          items: [
            { art: 'emoji:🎒', alt: 'arrive at school' },
            { art: 'emoji:🧩', alt: 'play' },
            { art: 'emoji:🧹', alt: 'clean up' },
            { art: 'emoji:🏠', alt: 'home' },
          ],
        },
      ],
    },
  ],
};
