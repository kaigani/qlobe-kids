export default {
  id: 'melting-race',
  engine: 'coach-timer',
  title: 'Melting Race',
  splashEmoji: 'emoji:🧊',
  // Field Journal art world (docs/art-direction.md)
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  voice: {
    intro: 'Scientists, take your places. The melting race is about to begin!',
    praise: 'Great race check. Keep observing!',
    cheer: 'What a finish! You watched heat change ice!',
  },
  modes: [
    {
      id: 'race',
      title: 'The Big Melt',
      type: 'steps',
      praise: 'Great race check. Keep observing!',
      cheer: 'The Big Melt is complete! Crown your melting champion!',
      endTitle: 'Melting Champion',
      endArt: 'emoji:🏆',
      againLabel: 'RACE AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🧊',
          say: 'Get four ice cubes and put each one on its own little plate.',
        },
        {
          art: 'emoji:📍',
          say: 'Put one in the sun, one in the shade, hold one in a warm hand, and wrap one in a cozy cloth.',
          timerSec: 60,
          after: 'Setup complete! All four racers are in position.',
        },
        {
          art: 'emoji:🗣️',
          say: 'Call your prediction out loud! Which ice cube will melt first? You can say, Sunny is winning!',
        },
        {
          art: 'emoji:🔍',
          say: 'First check-in! Watch all four racers closely. Which ice cube is smallest now?',
          timerSec: 120,
          after: 'Time to compare! Point to the smallest ice cube.',
        },
        {
          art: 'emoji:🏆',
          say: 'Final check! Which ice cube melted the most? Crown the winner and call the race out loud!',
        },
      ],
    },
    {
      id: 'rescue',
      title: 'Ice Rescue',
      type: 'steps',
      praise: 'The rescue team is doing careful science!',
      cheer: 'Rescue complete! Your toy is free from the ice!',
      endTitle: 'Toy Rescued',
      endArt: 'emoji:🎉',
      againLabel: 'RESCUE AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🥶',
          say: 'With a grown-up, freeze a tiny waterproof toy in a cup of water the night before.',
        },
        {
          art: 'emoji:🤲',
          say: 'Rescue round one! Warm the ice with your hands.',
          timerSec: 60,
          after: 'Hands off for a check. Did the ice change?',
        },
        {
          art: 'emoji:💧',
          say: 'Rescue round two! Ask a grown-up for warm water, then drip it slowly over the ice.',
          timerSec: 60,
          after: 'Rescue check! Look for cracks and wiggle the toy gently.',
        },
        {
          art: 'emoji:🎉',
          say: 'Victory! When the toy pops free, give your rescue team a giant cheer!',
        },
      ],
    },
  ],
};
