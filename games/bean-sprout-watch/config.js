export default {
  id: 'bean-sprout-watch',
  engine: 'observe-journal',
  title: 'Bean Sprout Watch',
  splashEmoji: '🌱',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'Sprout Story',
    playAgain: 'Play Again',
  },
  voice: {
    cheer: 'Your bean sprout story grew page by page!',
    yum: 'Good sprout watching!',
  },
  modes: [
    {
      id: 'week',
      title: 'Sprout Diary',
      prompt: 'A real bean in a jar can change slowly. Look each day and stamp what changed.',
      rounds: 5,
      endTitle: 'My Sprout Diary',
      cheer: 'Bean, root, sprout, leaves, flower. You watched the growing story!',
      pages: [
        {
          scene: ['emoji:🫙', 'emoji:🫘'],
          prompts: [
            {
              say: 'Day one. The bean is tucked beside the wet paper. What do you see?',
              stickers: [
                { art: 'emoji:🫘', alt: 'bean', say: 'A bean is resting and getting ready to grow.' },
                { art: 'emoji:💧', alt: 'water', say: 'A little water helps the bean wake up.' },
                { art: 'emoji:☀️', alt: 'sun', say: 'Warm light can help plants grow.' },
              ],
            },
            {
              say: 'What does the bean need today?',
              stickers: [
                { art: 'emoji:💧', alt: 'water', say: 'Water keeps the paper damp, not splashy.' },
                { art: 'emoji:☀️', alt: 'sunlight', say: 'Sunlight gives the plant energy.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🫙', 'emoji:🫘', 'emoji:〰️'],
          prompts: [
            {
              say: 'Day two. A tiny pale root is poking out. What changed?',
              stickers: [
                { art: 'emoji:〰️', alt: 'root', say: 'Root! The root reaches down for water.' },
                { art: 'emoji:🫘', alt: 'bean coat', say: 'The bean coat is starting to split.' },
                { art: 'emoji:💧', alt: 'water', say: 'Water helps the root keep reaching.' },
              ],
            },
            {
              say: 'What could help the tiny root?',
              stickers: [
                { art: 'emoji:💧', alt: 'water', say: 'A damp home is just right for a new root.' },
                { art: 'emoji:🤲', alt: 'gentle hands', say: 'Gentle hands protect the tiny root.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🫙', 'emoji:🌱'],
          prompts: [
            {
              say: 'Day three. A green sprout is lifting up. Stamp what you notice.',
              stickers: [
                { art: 'emoji:🌱', alt: 'sprout', say: 'Sprout! The little stem is reaching up.' },
                { art: 'emoji:〰️', alt: 'root', say: 'The root keeps growing under the sprout.' },
                { art: 'emoji:☀️', alt: 'sun', say: 'Light helps the green sprout make food.' },
              ],
            },
            {
              say: 'What does the sprout need now?',
              stickers: [
                { art: 'emoji:💧', alt: 'water', say: 'A careful drink helps the sprout stand tall.' },
                { art: 'emoji:☀️', alt: 'sunlight', say: 'Sunlight helps the sprout turn green.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🫙', 'emoji:🌿'],
          prompts: [
            {
              say: 'Day four. The sprout has leaves. What can you stamp?',
              stickers: [
                { art: 'emoji:🌿', alt: 'leaves', say: 'Leaves! Leaves open like tiny green hands.' },
                { art: 'emoji:🌱', alt: 'taller stem', say: 'The stem is taller than before.' },
                { art: 'emoji:☀️', alt: 'sun', say: 'Leaves love gentle sunlight.' },
              ],
            },
            {
              say: 'What care helps the leaves?',
              stickers: [
                { art: 'emoji:💧', alt: 'water', say: 'A small drink can help the leaves stay perky.' },
                { art: 'emoji:🪟', alt: 'window', say: 'A bright window can be a cozy plant place.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🫙', 'emoji:🍃', 'emoji:🌸'],
          prompts: [
            {
              say: 'Day five. The plant is bigger. What changed in the story?',
              stickers: [
                { art: 'emoji:🍃', alt: 'new leaves', say: 'New leaves show the plant is still growing.' },
                { art: 'emoji:🌸', alt: 'pretend flower', say: 'A pretend flower marks the end of our sprout story.' },
                { art: 'emoji:📏', alt: 'measure', say: 'Measuring can show how much the plant changed.' },
              ],
            },
            {
              say: 'What could you do with a real bean next?',
              stickers: [
                { art: 'emoji:🫙', alt: 'jar', say: 'Try a real bean in a jar with a grown-up.' },
                { art: 'emoji:📅', alt: 'days', say: 'Check it a little each day and notice tiny changes.' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'care',
      title: 'What Does It Need?',
      prompt: 'Look at the plant face and stamp the care it might need.',
      rounds: 3,
      endTitle: 'Plant Care Notes',
      cheer: 'You noticed what a plant might need!',
      pages: [
        {
          scene: ['emoji:🥀', 'emoji:🫙'],
          say: 'This sprout looks droopy and thirsty. What care could help?',
          stickers: [
            { art: 'emoji:💧', alt: 'water', say: 'A little water can help a thirsty sprout perk up.' },
            { art: 'emoji:🤲', alt: 'gentle hands', say: 'Gentle care keeps tender stems safe.' },
            { art: 'emoji:🫙', alt: 'jar', say: 'A clear jar lets you watch the roots without pulling.' },
          ],
        },
        {
          scene: ['emoji:🌱', 'emoji:🌑'],
          say: 'This sprout is long and reaching in the dark. What might it need?',
          stickers: [
            { art: 'emoji:☀️', alt: 'sunlight', say: 'Sunlight helps a sprout grow strong and green.' },
            { art: 'emoji:🪟', alt: 'window', say: 'A bright window can help the sprout find light.' },
            { art: 'emoji:🔄', alt: 'turn jar', say: 'Turning the jar can help the plant grow more evenly.' },
          ],
        },
        {
          scene: ['emoji:🌿', 'emoji:🏜️'],
          say: 'The paper looks dry. What plant helper should we stamp?',
          stickers: [
            { art: 'emoji:💧', alt: 'water', say: 'A damp paper towel can help the roots drink.' },
            { art: 'emoji:👀', alt: 'look closely', say: 'Looking closely helps you know when the paper dries.' },
            { art: 'emoji:📅', alt: 'daily check', say: 'A quick daily check keeps the sprout from being forgotten.' },
          ],
        },
      ],
    },
  ],
};
