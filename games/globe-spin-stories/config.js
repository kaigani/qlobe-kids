export default {
  id: 'globe-spin-stories',
  engine: 'observe-journal',
  title: 'Globe Spin Stories',
  splashEmoji: '🌍',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'Globe Story',
    playAgain: 'Play Again',
  },
  voice: {
    cheer: 'Your globe story traveled to wonderful places!',
    yum: 'Wonderful imagining!',
  },
  modes: [
    {
      id: 'spin',
      title: 'Where Did We Land?',
      prompt: 'Spin the globe in your imagination. We can wonder about places together.',
      rounds: 4,
      endTitle: 'Where We Landed',
      cheer: 'Icy, leafy, sandy, splashy. What a curious globe story!',
      pages: [
        {
          scene: ['emoji:🌍', 'emoji:❄️', 'emoji:🧊'],
          say: 'Spin, spin. Brrr, we landed somewhere icy! Who or what might live here?',
          stickers: [
            { art: 'emoji:🐧', alt: 'penguin', say: 'Penguins slide on their tummies in icy places!' },
            { art: 'emoji:🐻‍❄️', alt: 'polar bear', say: 'Polar bears have thick fur for cold places.' },
            { art: 'emoji:🦭', alt: 'seal', say: 'Seals can rest on ice and swim in cold water.' },
            { art: 'emoji:🧊', alt: 'ice', say: 'Ice can sparkle and crackle in the cold.' },
          ],
        },
        {
          scene: ['emoji:🌍', 'emoji:🌴', 'emoji:🌿'],
          say: 'Spin, spin. We landed somewhere leafy and wet! Who might live in the jungle?',
          stickers: [
            { art: 'emoji:🐒', alt: 'monkey', say: 'Monkeys can swing through jungle trees.' },
            { art: 'emoji:🦜', alt: 'parrot', say: 'Parrots can flash bright colors in the leaves.' },
            { art: 'emoji:🐍', alt: 'snake', say: 'Snakes can slither quietly under jungle plants.' },
            { art: 'emoji:🌿', alt: 'leaf', say: 'Jungle leaves can be wide and shiny from rain.' },
          ],
        },
        {
          scene: ['emoji:🌍', 'emoji:🏜️', 'emoji:☀️'],
          say: 'Spin, spin. Whew, we landed somewhere hot and dry! What might we find in the desert?',
          stickers: [
            { art: 'emoji:🐫', alt: 'camel', say: 'Camels can carry water and walk across sand.' },
            { art: 'emoji:🦎', alt: 'lizard', say: 'Lizards can warm their bodies on sunny rocks.' },
            { art: 'emoji:🌵', alt: 'cactus', say: 'Cactuses can hold water inside their stems.' },
            { art: 'emoji:☀️', alt: 'sun', say: 'The desert sun can feel bright and hot.' },
          ],
        },
        {
          scene: ['emoji:🌍', 'emoji:🌊', 'emoji:🐋'],
          say: 'Spin, spin. Splash, we landed somewhere wet and deep! Who might live in the ocean?',
          stickers: [
            { art: 'emoji:🐋', alt: 'whale', say: 'Whales can sing and swim through deep ocean water.' },
            { art: 'emoji:🐙', alt: 'octopus', say: 'Octopuses have eight arms for exploring ocean rocks.' },
            { art: 'emoji:🐠', alt: 'fish', say: 'Fish can dart and shimmer in the water.' },
            { art: 'emoji:🌊', alt: 'wave', say: 'Ocean waves can roll and splash.' },
          ],
        },
      ],
    },
  ],
};
