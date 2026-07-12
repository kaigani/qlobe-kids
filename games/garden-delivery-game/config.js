export default {
  id: 'garden-delivery-game',
  engine: 'coach-timer',
  title: 'Garden Delivery Game',
  splashEmoji: 'emoji:🚚',
  // Field Journal art world (docs/art-direction.md)
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  voice: {
    intro: 'Garden dispatch calling! The thirsty plants are ready for careful deliveries.',
    praise: 'Delivery received! Careful beats fast.',
    cheer: 'Dispatch report: the garden is happy and hydrated!',
  },
  modes: [
    {
      id: 'delivery',
      title: 'Water Delivery',
      type: 'steps',
      praise: 'Delivery received! Careful beats fast.',
      cheer: 'Five-star news! The thirsty plant loved every careful delivery.',
      endTitle: 'Water Delivery',
      endArt: 'emoji:⭐',
      againLabel: 'AGAIN',
      doneLabel: 'DELIVERED',
      steps: [
        {
          art: 'emoji:🪴',
          say: 'Set up the water source on one side and a thirsty plant on the other.',
        },
        {
          art: 'emoji:🥤',
          say: 'Small-cup delivery! Fill, carry slowly, pour for the plant, and return.',
          timerSec: 60,
          after: 'The plant says, tiny cup, giant care. Thank you!',
        },
        {
          art: 'emoji:🥛',
          say: 'Big-cup delivery! Use two steady hands and let careful feet lead.',
          timerSec: 60,
          after: 'The plant says, smooth delivery. My roots are cheering!',
        },
        {
          art: 'emoji:🌀',
          say: 'Wobble route! Go around a chair and over the tape river without rushing.',
          timerSec: 90,
          after: 'Route complete! You stayed careful through every wobble.',
        },
        {
          art: 'emoji:⭐',
          say: 'The plant leaves a five-star review: careful carrier, wonderful service!',
        },
      ],
    },
    {
      id: 'express',
      title: 'Express Round',
      type: 'steps',
      praise: 'Delivery received! Careful beats fast.',
      cheer: 'Three careful deliveries complete! You earned the Delivery Star badge!',
      endTitle: 'Express Round',
      endArt: 'emoji:🏅',
      againLabel: 'AGAIN',
      doneLabel: 'DELIVERED',
      steps: [
        {
          art: 'emoji:🚚',
          say: 'Express delivery one! Fill, carry, pour, and return. Careful is the fastest way.',
          timerSec: 90,
          after: 'Delivery one received. The plant says, excellent service!',
        },
        {
          art: 'emoji:🪴',
          say: 'Express delivery two! Fill, carry, pour, and return with steady hands.',
          timerSec: 90,
          after: 'Delivery two received. The plant says, my leaves feel brighter!',
        },
        {
          art: 'emoji:🫖',
          say: 'Teapot special! Use two hands to fill, carry, pour, and return.',
          timerSec: 90,
          after: 'Delivery three received. The plant says, two-hand service is five-star service!',
        },
        {
          art: 'emoji:🧻',
          say: 'Any spills get a friendly cleanup pit stop. Wipe them, then roll on.',
        },
        {
          art: 'emoji:🏅',
          say: 'Delivery Star badge awarded for careful garden service!',
        },
      ],
    },
  ],
};
