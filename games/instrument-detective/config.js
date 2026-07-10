export default {
  id: 'instrument-detective',
  engine: 'choose-one',
  title: 'Instrument Detective',
  splashEmoji: '🕵️',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Detective ears ready! Listen for the sound, then tap the instrument.',
    nudge: 'Hmm, listen closely and try another instrument.',
    cheer: 'Case closed! You found the instruments!',
    yums: [
      'Aha! That is the one!',
      'Great detective ears!',
      'You found the sound!',
    ],
  },
  modes: [
    {
      id: 'listen',
      title: 'Sound Detective',
      rounds: 6,
      difficultyRamp: true,
      items: [
        {
          say: 'Boom! Boom! Boom! Which one is the drum?',
          promptArt: 'emoji:🕵️',
          promptAlt: 'detective listening',
          answers: [
            { art: 'emoji:🥁', alt: 'drum', correct: true },
            { art: 'emoji:🔔', alt: 'bell' },
            { art: 'emoji:🎺', alt: 'trumpet' },
          ],
        },
        {
          say: 'Ding-a-ling-a-ling! Which one is the bell?',
          promptArt: 'emoji:🕵️',
          promptAlt: 'detective listening',
          answers: [
            { art: 'emoji:🔔', alt: 'bell', correct: true },
            { art: 'emoji:🥁', alt: 'drum' },
            { art: 'emoji:🎸', alt: 'guitar' },
          ],
        },
        {
          say: 'Shicka-shicka-shicka! Which one is the shaker?',
          promptArt: 'emoji:🕵️',
          promptAlt: 'detective listening',
          answers: [
            { art: 'emoji:🪇', alt: 'shaker', correct: true },
            { art: 'emoji:🎹', alt: 'piano' },
            { art: 'emoji:🥁', alt: 'drum' },
          ],
        },
        {
          say: 'Toot toot toooot! Which one is the trumpet?',
          promptArt: 'emoji:🕵️',
          promptAlt: 'detective listening',
          answers: [
            { art: 'emoji:🎺', alt: 'trumpet', correct: true },
            { art: 'emoji:🪇', alt: 'shaker' },
            { art: 'emoji:🎻', alt: 'violin' },
          ],
        },
        {
          say: 'Plink plink plonk! Which one is the piano?',
          promptArt: 'emoji:🕵️',
          promptAlt: 'detective listening',
          answers: [
            { art: 'emoji:🎹', alt: 'piano', correct: true },
            { art: 'emoji:🥁', alt: 'drum' },
            { art: 'emoji:🎺', alt: 'trumpet' },
          ],
        },
        {
          say: 'Strum strum strum! Which one is the guitar?',
          promptArt: 'emoji:🕵️',
          promptAlt: 'detective listening',
          answers: [
            { art: 'emoji:🎸', alt: 'guitar', correct: true },
            { art: 'emoji:🎻', alt: 'violin' },
            { art: 'emoji:🔔', alt: 'bell' },
          ],
        },
      ],
    },
    {
      id: 'families',
      title: 'Loud or Soft?',
      rounds: 4,
      items: [
        {
          say: 'Which one is LOUD like thunder?',
          promptArt: 'emoji:🕵️',
          promptAlt: 'detective listening',
          answers: [
            { art: 'emoji:🥁', alt: 'drum', correct: true },
            { art: 'emoji:🔔', alt: 'bell' },
            { art: 'emoji:🪈', alt: 'flute' },
          ],
        },
        {
          say: 'Which one is soft and gentle?',
          promptArt: 'emoji:🕵️',
          promptAlt: 'detective listening',
          answers: [
            { art: 'emoji:🪈', alt: 'flute', correct: true },
            { art: 'emoji:🥁', alt: 'drum' },
            { art: 'emoji:🎺', alt: 'trumpet' },
          ],
        },
        {
          say: 'Which one jingles?',
          promptArt: 'emoji:🕵️',
          promptAlt: 'detective listening',
          answers: [
            { art: 'emoji:🔔', alt: 'bell', correct: true },
            { art: 'emoji:🎸', alt: 'guitar' },
            { art: 'emoji:🎹', alt: 'piano' },
          ],
        },
        {
          say: 'Which one hums low like a bear?',
          promptArt: 'emoji:🕵️',
          promptAlt: 'detective listening',
          answers: [
            { art: 'emoji:🎻', alt: 'violin', correct: true },
            { art: 'emoji:🪇', alt: 'shaker' },
            { art: 'emoji:🔔', alt: 'bell' },
          ],
        },
      ],
    },
  ],
};
