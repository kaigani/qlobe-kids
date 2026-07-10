const answer = (emoji, alt, correct = false) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

export default {
  id: 'question-ball',
  engine: 'choose-one',
  title: 'Question Ball',
  splashEmoji: '🏐',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Catch the question ball! Listen to who, what, where, or why, then tap the answer.',
    nudge: 'Boing! Listen to the question again and catch another answer.',
    cheer: 'Question ball caught! Now toss a REAL question to someone in your family!',
    yums: [
      'Caught it! That answers the question.',
      'Good listening for the question word!',
      'Yes! You matched the question to the answer.',
    ],
  },
  modes: [
    {
      id: 'wh',
      title: 'Catch the Question',
      rounds: 6,
      difficultyRamp: true,
      items: [
        {
          say: 'WHO says moo?',
          promptArt: 'emoji:🌾',
          promptAlt: 'farm scene',
          answers: [answer('🐄', 'cow', true), answer('🚗', 'car'), answer('🌳', 'tree')],
        },
        {
          say: 'WHERE do fish live?',
          promptArt: 'emoji:🐠',
          promptAlt: 'fish scene',
          answers: [answer('🌊', 'water', true), answer('🛏️', 'bed'), answer('✈️', 'airplane')],
        },
        {
          say: 'WHAT do you use in the rain?',
          promptArt: 'emoji:🌧️',
          promptAlt: 'rain scene',
          answers: [answer('☂️', 'umbrella', true), answer('🍕', 'pizza'), answer('📚', 'books')],
        },
        {
          say: 'WHO drives the bus?',
          promptArt: 'emoji:🚌',
          promptAlt: 'bus scene',
          answers: [answer('🧑‍✈️', 'driver', true), answer('🐸', 'frog'), answer('🎂', 'cake')],
        },
        {
          say: 'WHERE do you sleep?',
          promptArt: 'emoji:🌙',
          promptAlt: 'night scene',
          answers: [answer('🛏️', 'bed', true), answer('🌊', 'water'), answer('🚲', 'bike')],
        },
        {
          say: 'WHAT do you kick in a game?',
          promptArt: 'emoji:🥅',
          promptAlt: 'goal scene',
          answers: [answer('⚽', 'ball', true), answer('🥄', 'spoon'), answer('🌻', 'flower')],
        },
      ],
    },
    {
      id: 'why',
      title: 'Why Questions',
      rounds: 4,
      items: [
        {
          say: 'WHY do we wear coats? We wear coats because they help us stay warm.',
          promptArt: 'emoji:🧥',
          promptAlt: 'coat scene',
          answers: [answer('🥶', 'cold', true), answer('🎉', 'party'), answer('🐟', 'fish')],
        },
        {
          say: 'WHY do we brush teeth? We brush teeth because it helps keep them clean.',
          promptArt: 'emoji:🪥',
          promptAlt: 'toothbrush scene',
          answers: [answer('✨', 'clean', true), answer('🚀', 'rocket'), answer('🍩', 'donut')],
        },
        {
          say: 'WHY do plants need water? Plants need water because it helps them grow.',
          promptArt: 'emoji:🌱',
          promptAlt: 'plant scene',
          answers: [answer('🌿', 'grow', true), answer('🧦', 'sock'), answer('🎺', 'trumpet')],
        },
        {
          say: 'WHY do we wash hands? We wash hands because it helps rinse dirt away.',
          promptArt: 'emoji:🫧',
          promptAlt: 'washing hands scene',
          answers: [answer('🧼', 'soap', true), answer('🪁', 'kite'), answer('🍌', 'banana')],
        },
      ],
    },
  ],
};
