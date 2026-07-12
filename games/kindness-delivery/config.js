const deliveryStickers = (recipient) => [
  { art: 'emoji:🖍️', alt: 'drawing', say: `A drawing for ${recipient}! Special delivery!` },
  { art: 'emoji:💌', alt: 'kind note', say: `A kind note for ${recipient}! Special delivery!` },
  { art: 'emoji:🌼', alt: 'flower', say: `A flower for ${recipient}! Special delivery!` },
  { art: 'emoji:🤝', alt: 'helping hands', say: `Helping hands for ${recipient}! Special delivery!` },
];

const heartPrompt = (say) => ({
  say: 'Delivery complete! Stamp a heart in your kindness journal.',
  stickers: [{ art: 'emoji:❤️', alt: 'kindness heart stamp', say }],
});

export default {
  id: 'kindness-delivery',
  engine: 'observe-journal',
  title: 'Kindness Delivery',
  splashEmoji: '💌',
  theme: { world: 'story-screen', background: './assets/bg.jpg' },
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'Kindness Journal',
    playAgain: 'Play Again',
  },
  voice: {
    cheer: 'The kindness post office is full of hearts!',
    yum: 'That kindness is ready to deliver!',
  },
  modes: [
    {
      id: 'deliveries',
      title: 'Make a Delivery',
      prompt: 'Welcome to the kindness post office. Let\'s make someone\'s WHOLE day!',
      rounds: 3,
      endTitle: 'Kindness Deliveries',
      cheer: 'Three heart stamps! Your kindness deliveries can make a whole day brighter!',
      pages: [
        {
          scene: ['emoji:🥱', 'emoji:📮'],
          say: 'A grown-up looks tired. What could we make to bring a smile?',
          prompts: [
            {
              say: 'A grown-up looks tired. What could we make to bring a smile?',
              stickers: deliveryStickers('the tired grown-up'),
            },
            heartPrompt('Heart stamped! Now make or do one of those kind things for a REAL grown-up.'),
          ],
        },
        {
          scene: ['emoji:🩹', 'emoji:📮'],
          say: 'A friend scraped their knee and feels sad. What caring delivery could we make?',
          prompts: [
            {
              say: 'A friend scraped their knee and feels sad. What caring delivery could we make?',
              stickers: deliveryStickers('your friend'),
            },
            heartPrompt('Heart stamped! Now make or do one of those kind things for a REAL friend.'),
          ],
        },
        {
          scene: ['emoji:🏠', 'emoji:📮'],
          say: 'A new neighbor just arrived. What could we deliver to say, welcome?',
          prompts: [
            {
              say: 'A new neighbor just arrived. What could we deliver to say, welcome?',
              stickers: deliveryStickers('the new neighbor'),
            },
            heartPrompt('Heart stamped! Now make a REAL welcome surprise for someone with a grown-up.'),
          ],
        },
      ],
    },
    {
      id: 'secret',
      title: 'Secret Kindness',
      prompt: 'Psst! Secret kindness mission. Let\'s make someone smile without being seen!',
      rounds: 2,
      endTitle: 'Secret Kindness Journal',
      cheer: 'The sneakiest smiles! Your secret kindness made two heart stamps!',
      pages: [
        {
          scene: ['emoji:🧸', 'emoji:🤫'],
          say: 'Secret mission: a toy needs tidying. Choose how you will help, then try it for REAL off the tablet!',
          prompts: [
            {
              say: 'Secret mission: a toy needs tidying. Choose your sneaky kindness plan!',
              stickers: [
                { art: 'emoji:🧸', alt: 'tidy one toy', say: 'Tidy one toy, quiet as a mouse.' },
                { art: 'emoji:🤝', alt: 'tidy together', say: 'Helping hands can tidy a toy.' },
              ],
            },
            heartPrompt('Secret heart stamped! Now put away a REAL toy without being asked!'),
          ],
        },
        {
          scene: ['emoji:🍪', 'emoji:🤫'],
          say: 'Secret mission: one last cookie is waiting. Choose a generous plan, then try that kindness for REAL!',
          prompts: [
            {
              say: 'Secret mission: one last cookie is waiting. Choose your sneaky kindness plan!',
              stickers: [
                { art: 'emoji:🍪', alt: 'save the last cookie', say: 'Save the last cookie for someone else.' },
                { art: 'emoji:💌', alt: 'leave a kind surprise', say: 'Leave a kind surprise beside it.' },
              ],
            },
            heartPrompt('Secret heart stamped! Now practice sharing something REAL!'),
          ],
        },
      ],
    },
  ],
};
