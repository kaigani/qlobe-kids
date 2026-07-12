export default {
  id: 'throwing-target-garden',
  engine: 'coach-timer',
  title: 'Throwing Target Garden',
  splashEmoji: 'emoji:🎯',
  // Field Journal art world (docs/art-direction.md)
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  voice: {
    intro: 'Welcome to the target garden! Grab beanbags, rolled socks, or soft balls.',
    praise: 'Great throw! Near-miss? You were SO close!',
    cheer: 'Target garden training complete! What fantastic throwing!',
  },
  modes: [
    {
      id: 'clinic',
      title: 'Throwing Clinic',
      type: 'steps',
      praise: 'Great throw! Near-miss? You were SO close!',
      cheer: 'Clinic complete! You practiced aim, force, and strong throwing form.',
      endTitle: 'Throwing Clinic',
      endArt: 'emoji:🏆',
      againLabel: 'THROW AGAIN',
      doneLabel: 'READY',
      steps: [
        {
          art: 'emoji:🪣',
          say: 'Build three safe targets: one near, one in the middle, and one far away.',
        },
        {
          art: 'emoji:🫳',
          say: 'Underhand lobs at the near target. Swing low and let go gently.',
          timerSec: 45,
          after: 'Nice underhand practice! Hits and near-misses both build your aim.',
        },
        {
          art: 'emoji:🦶',
          say: 'Throw at the middle target. Step with the foot opposite your throwing hand.',
          timerSec: 45,
          after: 'Strong step-and-throw practice! You were SO close!',
        },
        {
          art: 'emoji:🌈',
          say: 'Make big rainbow throws at the far target. Aim high and choose your force.',
          timerSec: 45,
          after: 'Those throws made giant rainbow shapes!',
        },
        {
          art: 'emoji:🏆',
          say: 'Pick your best throw and show it off like a champion.',
        },
      ],
    },
    {
      id: 'wacky',
      title: 'Trick Shots',
      type: 'steps',
      praise: 'What a wacky shot! Near-miss? You were SO close!',
      cheer: 'Trick-shot champion! Your brand-new throw deserves a name.',
      endTitle: 'Trick Shots',
      endArt: 'emoji:✨',
      againLabel: 'GET WACKY',
      doneLabel: 'SHOT DONE',
      steps: [
        {
          art: 'emoji:🙃',
          say: 'Try a backwards, over-the-shoulder trick shot. Check that the space behind you is clear.',
        },
        {
          art: 'emoji:🦵',
          say: 'Try an under-the-leg trick shot. Keep your throw soft and safe.',
        },
        {
          art: 'emoji:😴',
          say: 'Aim first, close your eyes, then make a gentle throw.',
        },
        {
          art: 'emoji:✨',
          say: 'Invent your own trick shot and give it an amazing name!',
        },
      ],
    },
  ],
};
