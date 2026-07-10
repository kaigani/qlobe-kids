export default {
  id: 'family-timeline',
  engine: 'sequence-order',
  title: 'Family Timeline',
  splashEmoji: 'emoji:👶',
  voice: {
    intro: 'Put the pictures from little to grown.',
    nudge: 'Try a different time spot.',
    cheer: 'You made the timelines!',
    yums: [
      'That is earlier.',
      'That comes later.',
      'Nice time order.',
    ],
  },
  modes: [
    {
      id: 'growing',
      title: 'Growing Up',
      rounds: 4,
      slotLabels: ['first', 'next', 'next', 'last'],
      prompt: 'Put the pictures from little to grown.',
      sets: [
        {
          say: 'Baby, kid, grown-up, grandparent — everybody grows!',
          items: [
            { art: 'emoji:👶', alt: 'baby' },
            { art: 'emoji:🧒', alt: 'kid' },
            { art: 'emoji:🧑', alt: 'grown-up' },
            { art: 'emoji:🧓', alt: 'grandparent' },
          ],
        },
        {
          say: 'Puppy, dog, older dog. Animals grow too!',
          items: [
            { art: 'emoji:🐶', alt: 'puppy' },
            { art: 'emoji:🐕', alt: 'dog' },
            { art: 'emoji:🦮', alt: 'older dog' },
          ],
        },
        {
          say: 'Kitten, cat, older cat. Little ones grow!',
          items: [
            { art: 'emoji:🐱', alt: 'kitten' },
            { art: 'emoji:🐈', alt: 'cat' },
            { art: 'emoji:😺', alt: 'older cat' },
          ],
        },
        {
          say: 'Egg, chick, hen. The chick grows up!',
          items: [
            { art: 'emoji:🥚', alt: 'egg' },
            { art: 'emoji:🐣', alt: 'chick' },
            { art: 'emoji:🐔', alt: 'hen' },
          ],
        },
      ],
    },
    {
      id: 'then-now',
      title: 'Long Ago to Today',
      rounds: 3,
      slotLabels: ['long ago', 'next', 'today'],
      prompt: 'Put the pictures from long ago to today.',
      sets: [
        {
          say: 'Horse cart, car, rocket. Travel changed over time!',
          items: [
            { art: 'emoji:🐎', alt: 'horse cart' },
            { art: 'emoji:🚗', alt: 'car' },
            { art: 'emoji:🚀', alt: 'rocket' },
          ],
        },
        {
          say: 'Letter, phone, video call. People found new ways to talk!',
          items: [
            { art: 'emoji:✉️', alt: 'letter' },
            { art: 'emoji:📞', alt: 'phone' },
            { art: 'emoji:📱', alt: 'video call' },
          ],
        },
        {
          say: 'Candle, lamp, light bulb. Light changed over time!',
          items: [
            { art: 'emoji:🕯️', alt: 'candle' },
            { art: 'emoji:🪔', alt: 'lamp' },
            { art: 'emoji:💡', alt: 'light bulb' },
          ],
        },
      ],
    },
  ],
};
