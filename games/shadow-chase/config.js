const shadowStickers = (moment) => [
  { art: 'emoji:📏', alt: 'long shadow', say: `Long shadow! Your ${moment} shadow stretches far. Now chase to its tip!` },
  { art: 'emoji:🤏', alt: 'short shadow', say: `Short shadow! Your ${moment} shadow stays close. Make your body tall and check again!` },
  { art: 'emoji:〰️', alt: 'wiggly shadow', say: `Wiggly shadow! Your ${moment} shadow bends with you. Wiggle together!` },
  { art: 'emoji:🙈', alt: 'hiding shadow', say: `Hiding shadow! Your ${moment} shadow is hard to find. Move to a sunnier spot with a grown-up!` },
];

export default {
  id: 'shadow-chase',
  engine: 'observe-journal',
  title: 'Shadow Chase',
  splashEmoji: '🌤️',
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'Shadow Diary',
    playAgain: 'Play Again',
  },
  voice: {
    cheer: 'Field report complete! Your shadow diary is ready!',
    yum: 'Great shadow noticing!',
  },
  modes: [
    {
      id: 'morning',
      title: 'Morning Shadows',
      prompt: 'Field scientists, head outside with a grown-up. Let\'s move, look, and stamp your shadow diary!',
      rounds: 3,
      endTitle: 'Morning Shadow Diary',
      cheer: 'You chased, shaped, and spotted shadows like a field scientist!',
      pages: [
        {
          scene: ['emoji:🧍', 'emoji:☀️'],
          say: 'Stand outside with a grown-up. Where is YOUR shadow? Chase it, then stamp what you see!',
          stickers: shadowStickers('body'),
        },
        {
          scene: ['emoji:🤸', 'emoji:☀️'],
          say: 'Stretch, crouch, and make a shadow shape. What shape does your moving shadow make?',
          stickers: shadowStickers('shape'),
        },
        {
          scene: ['emoji:🌳', 'emoji:☀️'],
          say: 'Walk to a tree or another safe thing. Find its shadow, move around it, and stamp what you notice!',
          stickers: shadowStickers('thing'),
        },
      ],
    },
    {
      id: 'day',
      title: 'All-Day Watch',
      prompt: 'This is an all-day shadow watch. Visit the same safe shadow with a grown-up, move beside it, and notice what changes!',
      rounds: 3,
      endTitle: 'All-Day Shadow Diary',
      cheer: 'Morning, noon, and evening: you discovered that shadows change across the day!',
      pages: [
        {
          scene: ['emoji:☀️', 'emoji:🧍'],
          say: 'Morning shadow check! Stand beside your shadow. Is it long, short, wiggly, or hiding?',
          stickers: shadowStickers('morning'),
        },
        {
          scene: ['emoji:🕛', 'emoji:🧍'],
          say: 'Noon shadow check! Stand in the same safe place. Move your arms. What changed since morning?',
          stickers: shadowStickers('noon'),
        },
        {
          scene: ['emoji:🌇', 'emoji:🧍'],
          say: 'Evening shadow check! Stand beside it one more time. What changed since noon?',
          stickers: shadowStickers('evening'),
        },
      ],
    },
  ],
};
