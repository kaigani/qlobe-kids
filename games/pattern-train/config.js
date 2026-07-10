export default {
  id: 'pattern-train',
  engine: 'pattern-continue',
  title: 'Pattern Train',
  splashEmoji: '🚂',
  voice: {
    intro: 'The pattern train needs its next cars.',
    nudge: 'Listen to the train. Which car comes next?',
    cheer: 'Hooray! The pattern train is rolling!',
    yums: [
      'Chugga chugga, the pattern keeps going!',
      'Yes! That car fits!',
      'Nice train pattern!',
    ],
  },
  modes: [
    {
      id: 'colors',
      title: 'Color Cars',
      rounds: 5,
      difficultyRamp: true,
      prompt: 'What color car comes next? Watch the train!',
      rounds_spec: [
        {
          pattern: ['red', 'blue', 'red', 'blue', 'red'],
          missing: 1,
          units: {
            red: { art: 'emoji:🟥', alt: 'red train car', say: 'red', sfx: 'tick' },
            blue: { art: 'emoji:🟦', alt: 'blue train car', say: 'blue', sfx: 'pop' },
          },
          candidates: ['blue', 'red', 'yellow'],
        },
        {
          pattern: ['yellow', 'red', 'yellow', 'red', 'yellow', 'red'],
          missing: 1,
          units: {
            yellow: { art: 'emoji:🟨', alt: 'yellow train car', say: 'yellow', sfx: 'boing' },
            red: { art: 'emoji:🟥', alt: 'red train car', say: 'red', sfx: 'tick' },
            blue: { art: 'emoji:🟦', alt: 'blue train car', say: 'blue', sfx: 'pop' },
          },
          candidates: ['yellow', 'red', 'blue'],
        },
        {
          pattern: ['red', 'blue', 'yellow', 'red', 'blue', 'yellow', 'red'],
          missing: 1,
          units: {
            red: { art: 'emoji:🟥', alt: 'red train car', say: 'red', sfx: 'tick' },
            blue: { art: 'emoji:🟦', alt: 'blue train car', say: 'blue', sfx: 'pop' },
            yellow: { art: 'emoji:🟨', alt: 'yellow train car', say: 'yellow', sfx: 'boing' },
          },
          candidates: ['red', 'blue', 'yellow'],
        },
        {
          pattern: ['blue', 'yellow', 'red', 'blue', 'yellow', 'red', 'blue', 'yellow'],
          missing: 2,
          units: {
            blue: { art: 'emoji:🟦', alt: 'blue train car', say: 'blue', sfx: 'pop' },
            yellow: { art: 'emoji:🟨', alt: 'yellow train car', say: 'yellow', sfx: 'boing' },
            red: { art: 'emoji:🟥', alt: 'red train car', say: 'red', sfx: 'tick' },
          },
          candidates: ['blue', 'yellow', 'red'],
        },
        {
          pattern: ['red', 'red', 'blue', 'red', 'red', 'blue', 'red', 'red'],
          missing: 2,
          units: {
            red: { art: 'emoji:🟥', alt: 'red train car', say: 'red', sfx: 'tick' },
            blue: { art: 'emoji:🟦', alt: 'blue train car', say: 'blue', sfx: 'pop' },
            yellow: { art: 'emoji:🟨', alt: 'yellow train car', say: 'yellow', sfx: 'boing' },
          },
          candidates: ['red', 'blue', 'yellow'],
        },
      ],
    },
    {
      id: 'shapes',
      title: 'Shape Cars',
      rounds: 4,
      prompt: 'What shape car comes next? Watch the train!',
      rounds_spec: [
        {
          pattern: ['triangle', 'circle', 'triangle', 'circle', 'triangle'],
          missing: 1,
          units: {
            triangle: { art: 'emoji:🔺', alt: 'triangle train car', say: 'triangle', sfx: 'tick' },
            circle: { art: 'emoji:⚫️', alt: 'circle train car', say: 'circle', sfx: 'pop' },
            square: { art: 'emoji:⬛️', alt: 'square train car', say: 'square', sfx: 'boing' },
          },
          candidates: ['triangle', 'circle', 'square'],
        },
        {
          pattern: ['circle', 'square', 'circle', 'square', 'circle', 'square'],
          missing: 1,
          units: {
            circle: { art: 'emoji:⚫️', alt: 'circle train car', say: 'circle', sfx: 'pop' },
            square: { art: 'emoji:⬛️', alt: 'square train car', say: 'square', sfx: 'boing' },
            triangle: { art: 'emoji:🔺', alt: 'triangle train car', say: 'triangle', sfx: 'tick' },
          },
          candidates: ['circle', 'square', 'triangle'],
        },
        {
          pattern: ['triangle', 'circle', 'square', 'triangle', 'circle', 'square', 'triangle'],
          missing: 1,
          units: {
            triangle: { art: 'emoji:🔺', alt: 'triangle train car', say: 'triangle', sfx: 'tick' },
            circle: { art: 'emoji:⚫️', alt: 'circle train car', say: 'circle', sfx: 'pop' },
            square: { art: 'emoji:⬛️', alt: 'square train car', say: 'square', sfx: 'boing' },
          },
          candidates: ['triangle', 'circle', 'square'],
        },
        {
          pattern: ['square', 'square', 'circle', 'square', 'square', 'circle', 'square'],
          missing: 1,
          units: {
            square: { art: 'emoji:⬛️', alt: 'square train car', say: 'square', sfx: 'boing' },
            circle: { art: 'emoji:⚫️', alt: 'circle train car', say: 'circle', sfx: 'pop' },
            triangle: { art: 'emoji:🔺', alt: 'triangle train car', say: 'triangle', sfx: 'tick' },
          },
          candidates: ['square', 'circle', 'triangle'],
        },
      ],
    },
  ],
};
