export default {
  id: 'cleanup-timer-quest',
  engine: 'coach-timer',
  title: 'Cleanup Timer Quest',
  splashEmoji: 'emoji:⏱️',
  // Storybook Rooms art world (docs/art-direction.md)
  theme: { world: 'storybook-rooms', background: './assets/bg.jpg' },
  voice: {
    intro: 'Welcome to the cleanup quest! Pick a zone, sort the mess, and help every pile fly home.',
    praise: 'That pile is finding its home. Fast can still feel calm!',
    cheer: 'Quest complete! The clean room is your grand prize!',
  },
  modes: [
    {
      id: 'room',
      title: 'Room Rescue',
      type: 'steps',
      praise: 'That pile is finding its home. Fast can still feel calm!',
      cheer: 'Room rescued! Every pile made it home, and the clean space is the prize!',
      endTitle: 'Room Rescue',
      endArt: 'emoji:✨',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🗺️',
          say: 'Pick one messy zone for today’s room rescue.',
        },
        {
          art: 'emoji:🗂️',
          say: 'Make three piles: toys, clothes, and books.',
          timerSec: 90,
          after: 'Three teams are ready. Now we fly each team home!',
        },
        {
          art: 'emoji:🧸',
          say: 'Toy team, fly to your bin!',
          timerSec: 60,
          after: 'Toy team is home. What a landing!',
        },
        {
          art: 'emoji:👕',
          say: 'Clothes team, swoop into the basket!',
          timerSec: 45,
          after: 'Clothes team is home in the basket!',
        },
        {
          art: 'emoji:📚',
          say: 'Book team, glide back to the shelf!',
          timerSec: 45,
          after: 'Books are home on the shelf!',
        },
        {
          art: 'emoji:🌀',
          say: 'Victory spin in your clean space. You rescued the room!',
        },
      ],
    },
    {
      id: 'speed',
      title: 'Five-Minute Wonder',
      type: 'steps',
      praise: 'That pile is finding its home. Fast can still feel calm!',
      cheer: 'Five-minute wonder complete! Look at the room you changed!',
      endTitle: 'Five-Minute Wonder',
      endArt: 'emoji:🥁',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🥁',
          say: 'Five-minute wonder starts now! Clean one zone with quick, calm hands.',
          timerSec: 300,
          after: 'Final drumroll! Five-minute wonder complete!',
        },
      ],
    },
  ],
};
