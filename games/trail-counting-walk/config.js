export default {
  id: 'trail-counting-walk',
  engine: 'coach-timer',
  title: 'Trail Counting Walk',
  splashEmoji: 'emoji:🔢',
  // Field Journal art world (docs/art-direction.md)
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  voice: {
    intro: 'This is the counting desk. Today, every number is big news!',
    praise: 'Number collected! That is today\'s latest headline.',
    cheer: 'Breaking news! You counted your whole walk!',
  },
  modes: [
    {
      id: 'walk',
      title: 'Counting Walk',
      type: 'steps',
      praise: 'Number collected! That is today\'s latest headline.',
      cheer: 'Breaking news! Your counting walk has a grand total!',
      endTitle: 'Counting Walk',
      endArt: 'emoji:📊',
      againLabel: 'AGAIN',
      doneLabel: 'COUNTED',
      steps: [
        {
          art: 'emoji:🪜',
          say: 'First mission: count every stair or step. Remember your number for check-in.',
          timerSec: 120,
          after: 'Counting desk check-in! Say your stair or step number out loud.',
        },
        {
          art: 'emoji:🐦',
          say: 'Bird report! Count every bird you see or hear. Remember your number.',
          timerSec: 120,
          after: 'Bird desk check-in! Say your bird number out loud.',
        },
        {
          art: 'emoji:🚪',
          say: 'Color mission! Count only red doors. Other colors do not join this total.',
          timerSec: 120,
          after: 'Red door check-in! Announce your red door number.',
        },
        {
          art: 'emoji:🎯',
          say: 'You choose the headline. Pick one thing to count and remember your number.',
          timerSec: 120,
          after: 'Reporter check-in! Tell us what you counted and your number.',
        },
        {
          art: 'emoji:📊',
          say: 'Grand total ceremony! Say all your numbers, biggest first.',
        },
      ],
    },
    {
      id: 'race',
      title: 'Number Race',
      type: 'steps',
      praise: 'Target counted! You found the number.',
      cheer: 'Headline: every number target has been found!',
      endTitle: 'Number Race',
      endArt: 'emoji:🏁',
      againLabel: 'AGAIN',
      doneLabel: 'FOUND',
      steps: [
        {
          art: 'emoji:⚪',
          say: 'Find and count five round things.',
        },
        {
          art: 'emoji:🌱',
          say: 'Find and count four growing things.',
        },
        {
          art: 'emoji:🛞',
          say: 'Find and count three things with wheels.',
        },
        {
          art: 'emoji:🏛️',
          say: 'Find and count two things that might be older than grandma.',
        },
        {
          art: 'emoji:😊',
          say: 'Find one thing that makes you smile.',
        },
      ],
    },
  ],
};
