export default {
  id: 'sandpaper-number-match',
  engine: 'tap-count',
  title: 'Sandpaper Number Match',
  splashEmoji: '🔢',
  basketArt: 'emoji:🧺',
  copy: {
    basket: 'number tray',
    items: 'buttons',
  },
  voice: {
    intro: 'Meet each number, then tap that many.',
    cheer: 'You matched the numbers!',
    counts: ['One!', 'Two!', 'Three!', 'Four!', 'Five!', 'Six!', 'Seven!', 'Eight!', 'Nine!', 'Ten!'],
  },
  modes: [
    {
      id: 'meet',
      title: 'Meet the Numbers',
      type: 'collect',
      rounds: 5,
      difficultyRamp: true,
      basketArt: 'emoji:🧺',
      rounds_spec: [
        { count: 1, itemArt: 'emoji:🔘', itemAlt: 'button', say: 'This is one! Tap one button!' },
        { count: 2, itemArt: 'emoji:🔘', itemAlt: 'button', say: 'This is two! Tap two buttons!' },
        { count: 3, itemArt: 'emoji:🔘', itemAlt: 'button', say: 'This is three! Tap three buttons!' },
        { count: 4, itemArt: 'emoji:🔘', itemAlt: 'button', say: 'This is four! Tap four buttons!' },
        { count: 5, itemArt: 'emoji:🔘', itemAlt: 'button', say: 'This is five! Tap five buttons!' },
      ],
    },
    {
      id: 'big',
      title: 'Bigger Numbers',
      type: 'collect',
      rounds: 4,
      basketArt: 'emoji:🫙',
      rounds_spec: [
        { count: 6, itemArt: 'emoji:⭐', itemAlt: 'star', say: 'This is six! Tap six stars!' },
        { count: 7, itemArt: 'emoji:⭐', itemAlt: 'star', say: 'This is seven! Tap seven stars!' },
        { count: 8, itemArt: 'emoji:⭐', itemAlt: 'star', say: 'This is eight! Tap eight stars!' },
        { count: 9, itemArt: 'emoji:⭐', itemAlt: 'star', say: 'This is nine! Tap nine stars!' },
      ],
    },
  ],
};
