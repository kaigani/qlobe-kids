export default {
  id: 'color-gradient-cards',
  engine: 'sequence-order',
  title: 'Color Gradient Cards',
  splashEmoji: '🎨',
  voice: {
    intro: 'Color chips are ready. Put them in order.',
    nudge: 'Look closely at the color. Try another spot.',
    cheer: 'You ordered the color cards!',
    yums: [
      'Beautiful looking!',
      'That shade fits!',
      'Careful color eyes!',
    ],
  },
  modes: [
    {
      id: 'blues',
      title: 'Light to Dark',
      rounds: 4,
      difficultyRamp: true,
      prompt: 'Put the color chips from light to dark.',
      sets: [
        {
          say: 'Lightest to darkest. Beautiful blues!',
          items: [
            { art: 'swatch:#dbeefe', alt: 'very light blue' },
            { art: 'swatch:#7fc2f2', alt: 'light blue' },
            { art: 'swatch:#2d7dd2', alt: 'blue' },
            { art: 'swatch:#17517e', alt: 'dark blue' },
            { art: 'swatch:#0b2c47', alt: 'very dark blue' },
          ],
        },
        {
          say: 'Lightest to darkest. Gorgeous greens!',
          items: [
            { art: 'swatch:#dff7d7', alt: 'very light green' },
            { art: 'swatch:#a8df93', alt: 'light green' },
            { art: 'swatch:#58a945', alt: 'green' },
            { art: 'swatch:#2f6f2c', alt: 'dark green' },
          ],
        },
        {
          say: 'Lightest to darkest. Pretty pinks!',
          items: [
            { art: 'swatch:#ffe0ef', alt: 'very light pink' },
            { art: 'swatch:#f9a7cf', alt: 'light pink' },
            { art: 'swatch:#ec5d9e', alt: 'pink' },
            { art: 'swatch:#b82768', alt: 'dark pink' },
            { art: 'swatch:#73133e', alt: 'very dark pink' },
          ],
        },
        {
          say: 'Lightest to darkest. Warm oranges!',
          items: [
            { art: 'swatch:#ffe5b8', alt: 'very light orange' },
            { art: 'swatch:#ffc36e', alt: 'light orange' },
            { art: 'swatch:#f59f36', alt: 'orange' },
            { art: 'swatch:#d46a1f', alt: 'dark orange' },
          ],
        },
      ],
    },
    {
      id: 'rainbow',
      title: 'Rainbow Order',
      rounds: 3,
      prompt: 'Make the rainbow order.',
      sets: [
        {
          say: 'Red, orange, yellow, green. Rainbow order!',
          items: [
            { art: 'swatch:#f25f5c', alt: 'red' },
            { art: 'swatch:#f59f36', alt: 'orange' },
            { art: 'swatch:#ffd166', alt: 'yellow' },
            { art: 'swatch:#58a945', alt: 'green' },
          ],
        },
        {
          say: 'Orange, yellow, green, blue, purple. Rainbow order!',
          items: [
            { art: 'swatch:#f59f36', alt: 'orange' },
            { art: 'swatch:#ffd166', alt: 'yellow' },
            { art: 'swatch:#58a945', alt: 'green' },
            { art: 'swatch:#2d7dd2', alt: 'blue' },
            { art: 'swatch:#7c4fc4', alt: 'purple' },
          ],
        },
        {
          say: 'Red, orange, yellow, green, blue. Rainbow order!',
          items: [
            { art: 'swatch:#f25f5c', alt: 'red' },
            { art: 'swatch:#f59f36', alt: 'orange' },
            { art: 'swatch:#ffd166', alt: 'yellow' },
            { art: 'swatch:#58a945', alt: 'green' },
            { art: 'swatch:#2d7dd2', alt: 'blue' },
          ],
        },
      ],
    },
  ],
};
