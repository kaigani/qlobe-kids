export default {
  id: 'nature-scavenger-hunt',
  engine: 'coach-timer',
  title: 'Nature Scavenger Hunt',
  splashEmoji: 'emoji:🔎',
  // Field Journal art world (docs/art-direction.md)
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  voice: {
    intro: 'Treasure hunters, look closely. We are hunting for nature clues!',
    praise: 'What a clever find! Tell me why it counts.',
    cheer: 'You found a whole collection of nature clues!',
  },
  modes: [
    {
      id: 'classic',
      title: 'Five Finds',
      type: 'steps',
      praise: 'What a clever find! Tell me why it counts.',
      cheer: 'Five fantastic finds! You noticed texture, color, shape, size, and sound.',
      endTitle: 'Five Finds',
      endArt: 'emoji:🔎',
      againLabel: 'HUNT AGAIN',
      doneLabel: 'FOUND IT',
      steps: [
        {
          art: 'emoji:🪨',
          say: 'Find something smooth. Hold it up and say why it counts.',
          timerSec: 90,
          after: 'Time to show your smooth treasure and say why it counts.',
        },
        {
          art: 'emoji:🍃',
          say: 'Find something green. Hold it up and say why it counts.',
        },
        {
          art: 'emoji:⚪',
          say: 'Find something round. Hold it up and say why it counts.',
        },
        {
          art: 'emoji:🐜',
          say: 'Find something tiny. Hold it up and say why it counts.',
        },
        {
          art: 'emoji:🎶',
          say: 'Find something that makes a sound when you shake it. Hold it up and say why it counts.',
        },
      ],
    },
    {
      id: 'texture',
      title: 'Feely Hunt',
      type: 'steps',
      praise: 'Ooh, what does your treasure feel like?',
      cheer: 'Feely hunt complete! Your fingertips discovered four textures.',
      endTitle: 'Feely Hunt',
      endArt: 'emoji:🪶',
      againLabel: 'FEEL AGAIN',
      doneLabel: 'FOUND IT',
      steps: [
        {
          art: 'emoji:🌰',
          say: 'Find something bumpy. Feel all the little bumps.',
        },
        {
          art: 'emoji:🪶',
          say: 'Find something soft. Touch it gently.',
        },
        {
          art: 'emoji:🧊',
          say: 'Find something cold. Touch it for just a moment.',
        },
        {
          art: 'emoji:🌾',
          say: 'Find something tickly. Now close your eyes and feel-test all your treasures.',
        },
      ],
    },
  ],
};
