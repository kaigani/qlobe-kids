export default {
  id: 'neighborhood-map-walk',
  engine: 'coach-timer',
  title: 'Neighborhood Map Walk',
  splashEmoji: 'emoji:🗺️',
  // Field Journal art world (docs/art-direction.md)
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  voice: {
    intro: 'Mapmaker, your neighborhood expedition begins now!',
    praise: 'Excellent mapmaking! Your map shows what matters to you.',
    cheer: 'Expedition complete! You made the map of your neighborhood!',
  },
  modes: [
    {
      id: 'map',
      title: 'Make Your Map',
      type: 'steps',
      praise: 'Excellent mapmaking! Your map shows what matters to you.',
      cheer: 'Your neighborhood map is complete, Mapmaker!',
      endTitle: 'Your Neighborhood Map',
      endArt: 'emoji:🗺️',
      againLabel: 'MAP AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🏠',
          say: 'Draw your home in the middle of a big piece of paper. This is the center of your map!',
        },
        {
          art: 'emoji:🛣️',
          say: 'Which way does your door face? Draw the street that goes past your home.',
        },
        {
          art: 'emoji:🌳',
          say: 'Think of the first thing you see when you step outside. Add it to your map.',
          timerSec: 60,
          after: 'First landmark spotted and mapped!',
        },
        {
          art: 'emoji:🏪',
          say: 'Add two more favorite landmarks. Maybe a big tree, a shop, or a postbox.',
          timerSec: 90,
          after: 'Your neighborhood is filling the page!',
        },
        {
          art: 'emoji:➿',
          say: 'Draw the route from home to your favorite place as a dotted line. Your streets can look your way!',
        },
      ],
    },
    {
      id: 'walk',
      title: 'Walk and Spot',
      type: 'steps',
      praise: 'Great spotting, Explorer!',
      cheer: 'Walk mission complete! Your new landmarks belong on your map!',
      endTitle: 'Spotting Mission Complete',
      endArt: 'emoji:🖍️',
      againLabel: 'WALK AGAIN',
      doneLabel: 'SPOTTED',
      steps: [
        {
          art: 'emoji:🔴',
          say: 'Take a grown-up on your expedition, or look safely from a window. Spot something red!',
        },
        {
          art: 'emoji:🔢',
          say: 'Spot a number on a door or building.',
        },
        {
          art: 'emoji:📏',
          say: 'Spot something taller than a grown-up.',
        },
        {
          art: 'emoji:🌱',
          say: 'Spot something that grows.',
        },
        {
          art: 'emoji:🖍️',
          say: 'Back at home, add every thing you spotted to your map. You choose the best place for each one!',
          timerSec: 180,
          after: 'Mission mapped! Your expedition discoveries are now part of the map.',
        },
      ],
    },
  ],
};
