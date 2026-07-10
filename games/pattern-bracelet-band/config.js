export default {
  id: 'pattern-bracelet-band',
  engine: 'pattern-continue',
  title: 'Pattern Bracelet Band',
  splashEmoji: '📿',
  voice: {
    intro: 'String the bead pattern.',
    nudge: 'Look at the beads. Which color comes next?',
    cheer: 'You could make a real one with beads or pasta!',
    yums: [
      'Sparkle! The bracelet closes!',
      'That bead belongs!',
      'The pattern bracelet shines!',
    ],
  },
  modes: [
    {
      id: 'beads',
      title: 'String the Beads',
      rounds: 5,
      difficultyRamp: true,
      prompt: 'What bead comes next? Watch the pattern!',
      rounds_spec: [
        {
          pattern: ['red', 'yellow', 'red', 'yellow', 'red'],
          missing: 1,
          units: {
            red: { art: 'swatch:#e23d3d', alt: 'red bead', say: 'red', sfx: 'pop' },
            yellow: { art: 'swatch:#f4c53d', alt: 'yellow bead', say: 'yellow', sfx: 'tick' },
            blue: { art: 'swatch:#2d7dd2', alt: 'blue bead', say: 'blue', sfx: 'sparkle' },
          },
          candidates: ['red', 'yellow', 'blue'],
        },
        {
          pattern: ['blue', 'purple', 'blue', 'purple', 'blue', 'purple'],
          missing: 1,
          units: {
            blue: { art: 'swatch:#2d7dd2', alt: 'blue bead', say: 'blue', sfx: 'sparkle' },
            purple: { art: 'swatch:#8a5bc4', alt: 'purple bead', say: 'purple', sfx: 'pop' },
            red: { art: 'swatch:#e23d3d', alt: 'red bead', say: 'red', sfx: 'tick' },
          },
          candidates: ['blue', 'purple', 'red'],
        },
        {
          pattern: ['red', 'yellow', 'blue', 'red', 'yellow', 'blue', 'red'],
          missing: 1,
          units: {
            red: { art: 'swatch:#e23d3d', alt: 'red bead', say: 'red', sfx: 'pop' },
            yellow: { art: 'swatch:#f4c53d', alt: 'yellow bead', say: 'yellow', sfx: 'tick' },
            blue: { art: 'swatch:#2d7dd2', alt: 'blue bead', say: 'blue', sfx: 'sparkle' },
          },
          candidates: ['red', 'yellow', 'blue'],
        },
        {
          pattern: ['purple', 'red', 'yellow', 'purple', 'red', 'yellow', 'purple', 'red'],
          missing: 2,
          units: {
            purple: { art: 'swatch:#8a5bc4', alt: 'purple bead', say: 'purple', sfx: 'pop' },
            red: { art: 'swatch:#e23d3d', alt: 'red bead', say: 'red', sfx: 'tick' },
            yellow: { art: 'swatch:#f4c53d', alt: 'yellow bead', say: 'yellow', sfx: 'sparkle' },
          },
          candidates: ['purple', 'red', 'yellow'],
        },
        {
          pattern: ['blue', 'purple', 'purple', 'blue', 'purple', 'purple', 'blue', 'purple'],
          missing: 2,
          units: {
            blue: { art: 'swatch:#2d7dd2', alt: 'blue bead', say: 'blue', sfx: 'sparkle' },
            purple: { art: 'swatch:#8a5bc4', alt: 'purple bead', say: 'purple', sfx: 'pop' },
            yellow: { art: 'swatch:#f4c53d', alt: 'yellow bead', say: 'yellow', sfx: 'tick' },
          },
          candidates: ['blue', 'purple', 'yellow'],
        },
      ],
    },
  ],
};
