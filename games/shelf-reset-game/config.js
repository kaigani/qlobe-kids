export default {
  id: 'shelf-reset-game',
  engine: 'coach-timer',
  title: 'Shelf Reset Game',
  splashEmoji: 'emoji:🧺',
  // Storybook Rooms art world (docs/art-direction.md)
  theme: { world: 'storybook-rooms', background: './assets/bg.jpg' },
  voice: {
    intro: 'Choose calmly, work with care, and leave the shelf ready for the next person.',
    praise: 'Quiet, careful work. You are finishing what you started.',
    cheer: 'The shelf is ready again. That is the whole work cycle, beautifully finished.',
  },
  modes: [
    {
      id: 'cycle',
      title: 'One Full Cycle',
      type: 'steps',
      praise: 'Quiet, careful work. You are finishing what you started.',
      cheer: 'One full cycle complete. The next friend will find everything ready.',
      endTitle: 'One Full Cycle',
      endArt: 'emoji:🏠',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🧺',
          say: 'Walk the shelf slowly and choose one tray.',
        },
        {
          art: 'emoji:🙌',
          say: 'Carry the tray with two hands to your work spot.',
        },
        {
          art: 'emoji:🧩',
          say: 'Use the work with your whole attention.',
          timerSec: 180,
          after: 'Your attention stayed with one work. Now the reset begins.',
        },
        {
          art: 'emoji:🔄',
          say: 'Put every piece back on the tray, exactly as you found it.',
          timerSec: 60,
          after: 'Every piece has a place. The tray is ready to return.',
        },
        {
          art: 'emoji:🏠',
          say: 'Return the tray to its exact shelf home. The next friend will find it perfect.',
        },
      ],
    },
    {
      id: 'inspector',
      title: 'Shelf Inspector',
      type: 'steps',
      praise: 'Quiet, careful work. You are finishing what you started.',
      cheer: 'Inspection complete. The shelf is peaceful, ordered, and ready.',
      endTitle: 'Shelf Inspector',
      endArt: 'emoji:✨',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🔍',
          say: 'Choose one messy spot on the shelf to inspect.',
        },
        {
          art: 'emoji:🤔',
          say: 'Sort what belongs here and what wandered from another home.',
          timerSec: 60,
          after: 'You noticed what belongs and what wandered.',
        },
        {
          art: 'emoji:🚶',
          say: 'Walk the wanderers back to their exact homes.',
          timerSec: 60,
          after: 'Every wanderer found its home.',
        },
        {
          art: 'emoji:✨',
          say: 'Stand back quietly and admire the shelf you reset.',
        },
      ],
    },
  ],
};
