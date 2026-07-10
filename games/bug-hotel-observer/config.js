export default {
  id: 'bug-hotel-observer',
  engine: 'observe-journal',
  title: 'Bug Hotel Observer',
  splashEmoji: '🐞',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'Bug Notes',
    playAgain: 'Play Again',
  },
  voice: {
    cheer: 'You watched the tiny guests with gentle eyes!',
    yum: 'Nice quiet observing!',
  },
  modes: [
    {
      id: 'guests',
      title: 'Who\'s Home?',
      prompt: 'Shhh. Look closely at the bug hotel and stamp who checked in.',
      rounds: 4,
      endTitle: 'Bug Hotel Guest Book',
      cheer: 'Ladybug, caterpillar, ant, spider, snail. Your bug hotel has visitors!',
      pages: [
        {
          scene: ['emoji:🏨', 'emoji:🪵', 'emoji:🍂'],
          say: 'A tiny red guest is near the leaf. Who might be home?',
          stickers: [
            { art: 'emoji:🐞', alt: 'ladybug', say: 'Ladybug! Ladybugs can help by eating tiny plant pests.' },
            { art: 'emoji:🍃', alt: 'leaf', say: 'A leaf can be a quiet place for a small bug to rest.' },
            { art: 'emoji:👀', alt: 'look closely', say: 'Slow looking helps you see tiny moving dots.' },
          ],
        },
        {
          scene: ['emoji:🏨', 'emoji:🐛', 'emoji:🍃'],
          say: 'A soft long guest is on the green leaf. Who checked in today?',
          stickers: [
            { art: 'emoji:🐛', alt: 'caterpillar', say: 'Caterpillar! Caterpillars munch leaves and can grow into moths or butterflies.' },
            { art: 'emoji:🍃', alt: 'leaf', say: 'Leaves can be caterpillar food.' },
            { art: 'emoji:🤫', alt: 'quiet', say: 'Quiet watching helps small creatures feel safe.' },
          ],
        },
        {
          scene: ['emoji:🏨', 'emoji:🐜', 'emoji:🚶'],
          say: 'A tiny line of workers is marching by the sticks. Who is home?',
          stickers: [
            { art: 'emoji:🐜', alt: 'ant', say: 'Ant! Ants can follow scent trails and work together.' },
            { art: 'emoji:🚶', alt: 'marching', say: 'Marching ants often travel in busy lines.' },
            { art: 'emoji:🪵', alt: 'sticks', say: 'Sticks and holes can make hiding places for tiny guests.' },
          ],
        },
        {
          scene: ['emoji:🏨', 'emoji:🕷️', 'emoji:🐌'],
          say: 'Two quiet guests are near the damp corner. Who do you notice?',
          stickers: [
            { art: 'emoji:🕷️', alt: 'spider', say: 'Spider! Spiders have eight legs and can wait very still.' },
            { art: 'emoji:🐌', alt: 'snail', say: 'Snail! Snails carry a shell and like damp places.' },
            { art: 'emoji:💧', alt: 'damp place', say: 'A damp shady spot can help a snail stay moist.' },
          ],
        },
      ],
    },
    {
      id: 'doing',
      title: 'What Are They Doing?',
      prompt: 'Watch gently. Bugs move, rest, munch, and march in their own small ways.',
      rounds: 3,
      endTitle: 'Bug Behavior Notes',
      cheer: 'You noticed tiny bug actions!',
      pages: [
        {
          scene: ['emoji:🐛', 'emoji:🍃'],
          say: 'This little guest is beside a leaf. What might it be doing?',
          stickers: [
            { art: 'emoji:🍃', alt: 'munching', say: 'Munching! Some bugs nibble leaves for food.' },
            { art: 'emoji:👀', alt: 'watching', say: 'Watching slowly helps you notice tiny bites.' },
            { art: 'emoji:🤲', alt: 'gentle hands', say: 'Gentle hands keep small bugs safe.' },
          ],
        },
        {
          scene: ['emoji:🐞', 'emoji:😴'],
          say: 'This guest is very still. What could be happening?',
          stickers: [
            { art: 'emoji:😴', alt: 'resting', say: 'Resting! Small creatures need quiet pauses too.' },
            { art: 'emoji:🤫', alt: 'quiet', say: 'Quiet bodies make it easier to watch without scaring bugs.' },
            { art: 'emoji:🍂', alt: 'leaf shelter', say: 'A leaf can make a cozy little shelter.' },
          ],
        },
        {
          scene: ['emoji:🐜', 'emoji:🚶', 'emoji:🚶'],
          say: 'These tiny guests are moving in a line. What are they doing?',
          stickers: [
            { art: 'emoji:🚶', alt: 'marching', say: 'Marching! Ants can follow a trail together.' },
            { art: 'emoji:🐜', alt: 'ant', say: 'Ants can carry crumbs much bigger than their bodies.' },
            { art: 'emoji:🔎', alt: 'look under leaf', say: 'Sometime, look under a real leaf slowly with a grown-up.' },
          ],
        },
      ],
    },
  ],
};
