export default {
  id: 'pouring-station',
  engine: 'coach-timer',
  title: 'Pouring Station',
  splashEmoji: 'emoji:🏺',
  voice: {
    intro: 'Let\'s practice slow, careful pouring.',
    praise: 'Careful hands. Nice work.',
    cheer: 'You practiced every pouring step!',
  },
  modes: [
    {
      id: 'water',
      title: 'Water Pouring',
      type: 'steps',
      praise: 'Careful hands. Nice work.',
      cheer: 'You practiced water pouring from start to finish!',
      endTitle: 'Water Pouring',
      endArt: 'emoji:💧',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🥤',
          say: 'Gather a pitcher and two cups.',
        },
        {
          art: 'emoji:🚰',
          say: 'Fill the pitcher just a little.',
        },
        {
          art: 'emoji:🥛',
          say: 'Pour slooowly into cup one.',
          timerSec: 30,
          after: 'That was slow, careful pouring.',
        },
        {
          art: 'emoji:🏺',
          say: 'Pour back the other way.',
          timerSec: 30,
          after: 'You kept your hands steady.',
        },
        {
          art: 'emoji:🧻',
          say: 'Wipe any drips. Wiping makes you a pouring pro.',
        },
      ],
    },
    {
      id: 'beans',
      title: 'Bean Pouring',
      type: 'steps',
      praise: 'Careful hands. Nice work.',
      cheer: 'You practiced bean pouring from start to finish!',
      endTitle: 'Bean Pouring',
      endArt: 'emoji:🫘',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🥤',
          say: 'Gather a pitcher and two cups for bean pouring.',
        },
        {
          art: 'emoji:🫘',
          say: 'Fill one cup with a few dry beans.',
        },
        {
          art: 'emoji:🫘',
          say: 'Beans are great for first-time pourers. Pour slowly and listen to the sound they make.',
          timerSec: 30,
          after: 'Nice slow bean pouring.',
        },
        {
          art: 'emoji:🏺',
          say: 'Pour the beans back the other way.',
          timerSec: 30,
          after: 'You listened and poured with care.',
        },
        {
          art: 'emoji:🧻',
          say: 'Scoop up any beans that spilled. Cleanup is part of the work.',
        },
      ],
    },
  ],
};
