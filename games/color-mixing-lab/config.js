const colors = {
  red: '#e23d3d',
  yellow: '#ffd166',
  blue: '#2d7dd2',
  white: '#ffffff',
  orange: '#f59f36',
  green: '#58a945',
  purple: '#7c4fc4',
  pink: '#f7a6c8',
};

export default {
  id: 'color-mixing-lab',
  engine: 'build-assemble',
  title: 'Color Mixing Lab',
  splashEmoji: '🧪',
  voice: {
    intro: 'Put the paint blobs in the mixing pot. Then reveal the color.',
    nudge: 'That color has another spot. Try again.',
    wait: 'Pick the next paint blob.',
    cheer: 'The color mixing lab is sparkling!',
  },
  modes: [
    {
      id: 'mix',
      title: 'Mix Two Colors',
      rounds: 4,
      prompt: 'Drop two paint colors into the pot.',
      builds: [
        mix('orange', 'Red and yellow make orange!', 'red', 'yellow', 'orange'),
        mix('green', 'Blue and yellow make green!', 'blue', 'yellow', 'green'),
        mix('purple', 'Red and blue make purple!', 'red', 'blue', 'purple'),
        mix('pink', 'Red and white make pink!', 'red', 'white', 'pink'),
      ],
    },
    {
      id: 'guess',
      title: 'What Will It Make?',
      rounds: 3,
      prompt: 'Say your guess first. Then drop the colors in.',
      builds: [
        mix('guess-green', 'What do YOU think? Blue and yellow make green!', 'blue', 'yellow', 'green'),
        mix('guess-purple', 'What do YOU think? Red and blue make purple!', 'red', 'blue', 'purple'),
        mix('guess-orange', 'What do YOU think? Red and yellow make orange!', 'red', 'yellow', 'orange'),
      ],
    },
  ],
};

function mix(name, say, first, second, result) {
  return {
    name,
    say,
    ordered: true,
    parts: [
      swatch(first, 350, 405, 175),
      swatch(second, 650, 405, 175),
      { art: 'emoji:🫕', alt: 'mixing pot', say: 'mixing pot', x: 500, y: 610, size: 205 },
      swatch(result, 500, 780, 170, `${result} reveal`),
    ],
  };
}

function swatch(name, x, y, size, label = name) {
  return {
    art: `swatch:${colors[name]}`,
    alt: label,
    say: name,
    x,
    y,
    size,
  };
}
