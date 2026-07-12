export default {
  id: 'sweep-the-trail',
  engine: 'coach-timer',
  title: 'Sweep the Trail',
  splashEmoji: 'emoji:🧹',
  // Storybook Rooms art world (docs/art-direction.md)
  theme: { world: 'storybook-rooms', background: './assets/bg.jpg' },
  voice: {
    intro: 'Trail ranger, grab your broom. We are sweeping hidden treasure into one grand pile!',
    praise: 'Great trail work, ranger.',
    cheer: 'Trail cleared! You cared for this space from edge to finish.',
  },
  modes: [
    {
      id: 'indoor',
      title: 'Crumb Patrol',
      type: 'steps',
      praise: 'Great trail work, ranger.',
      cheer: 'Crumb treasure collected. Look at that clean floor!',
      endTitle: 'Crumb Patrol',
      endArt: 'emoji:✨',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:📦',
          say: 'With a grown-up, make a tape square on the floor. That is our treasure landing zone.',
        },
        {
          art: 'emoji:🧹',
          say: 'Sweep the edges toward the middle with steady strokes.',
          timerSec: 60,
          after: 'The treasure pile is growing in the middle!',
        },
        {
          art: 'emoji:🪥',
          say: 'Corners hide crumbs! Use little strokes to guide them out.',
          timerSec: 30,
          after: 'You found the hidden corner crumbs.',
        },
        {
          art: 'emoji:🗑️',
          say: 'Hold the dustpan still and sweep the treasure pile inside.',
        },
        {
          art: 'emoji:✨',
          say: 'Step back and admire the clean floor. Trail cleared!',
        },
      ],
    },
    {
      id: 'outdoor',
      title: 'Leaf Trail',
      type: 'steps',
      praise: 'Great trail work, ranger.',
      cheer: 'Leaf treasure collected. The path looks cared for!',
      endTitle: 'Leaf Trail',
      endArt: 'emoji:🍂',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:📦',
          say: 'With a grown-up, mark a landing zone on the path for our leaf treasure.',
        },
        {
          art: 'emoji:🍂',
          say: 'Sweep the leaves from the path edges toward the landing zone.',
          timerSec: 60,
          after: 'The leaf treasure pile is growing!',
        },
        {
          art: 'emoji:🪥',
          say: 'Corners hide little leaves! Use short strokes to bring them to the pile.',
          timerSec: 30,
          after: 'You found the hidden corner leaves.',
        },
        {
          art: 'emoji:🤸',
          say: 'Bonus step! Ask your grown-up, then jump into the leaf pile and hop back out.',
        },
        {
          art: 'emoji:🗑️',
          say: 'Gather the leaf treasure with the dustpan or your grown-up’s leaf container.',
        },
        {
          art: 'emoji:✨',
          say: 'Step back and admire the clear path. Trail cleared!',
        },
      ],
    },
  ],
};
