export default {
  id: 'button-zipper-lab',
  engine: 'coach-timer',
  title: 'Button-Zipper Lab',
  splashEmoji: 'emoji:🧥',
  // Storybook Rooms art world (docs/art-direction.md)
  theme: { world: 'storybook-rooms', background: './assets/bg.jpg' },
  voice: {
    intro: 'Welcome to the getting-dressed laboratory! Slow hands make excellent experiments.',
    praise: 'Excellent experiment. Take your time.',
    cheer: 'Laboratory victory! You practiced every motion with patient hands.',
  },
  modes: [
    {
      id: 'buttons',
      title: 'Button Lab',
      type: 'steps',
      praise: 'Excellent experiment. Take your time.',
      cheer: 'Button experiment complete. You did a solo victory button!',
      endTitle: 'Button Lab',
      endArt: 'emoji:🏅',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:👕',
          say: 'Experiment number one! Find a shirt with big buttons and lay it in front of you.',
        },
        {
          art: 'emoji:🔘',
          say: 'Experiment number two! Push one button halfway through the door. Go slowly.',
          timerSec: 30,
          after: 'Halfway through the door. The experiment is working!',
        },
        {
          art: 'emoji:🤏',
          say: 'Pinch the button and pull it the rest of the way through. Patient fingers can do it.',
          timerSec: 30,
          after: 'Push, pinch, pull. One button is through!',
        },
        {
          art: 'emoji:🧵',
          say: 'Now do the whole row slowly, one button at a time. Rest your hands whenever they need it.',
          timerSec: 90,
          after: 'The whole row is buttoned. Careful science!',
        },
        {
          art: 'emoji:🏅',
          say: 'Solo victory button! Choose one button and do the whole push, pinch, and pull by yourself.',
        },
      ],
    },
    {
      id: 'zippers',
      title: 'Zipper Lab',
      type: 'steps',
      praise: 'Excellent experiment. Take your time.',
      cheer: 'Zipper experiment complete. Your zipper car made the full trip!',
      endTitle: 'Zipper Lab',
      endArt: 'emoji:🏎️',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🧥',
          say: 'Experiment number one! Find a jacket and place it in front of you.',
        },
        {
          art: 'emoji:🚂',
          say: 'Experiment number two! Click the zipper car onto its track. The little car needs its track, so take your time.',
          timerSec: 30,
          after: 'Click! The zipper car found its track.',
        },
        {
          art: 'emoji:⬆️',
          say: 'Hold the bottom steady and zip up slowly.',
          timerSec: 20,
          after: 'The zipper car traveled all the way up!',
        },
        {
          art: 'emoji:⬇️',
          say: 'Now guide the zipper car back down slowly.',
        },
        {
          art: 'emoji:🏎️',
          say: 'Final experiment! Click in, hold steady, and do one full zip at your real speed.',
        },
      ],
    },
  ],
};
