const answer = (emoji, alt, correct = true) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

export default {
  id: 'plan-do-review',
  engine: 'choose-one',
  title: 'Plan-Do-Review',
  splashEmoji: '📋',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Plan it, do it, review it. Every thoughtful plan can be a good plan.',
    nudge: 'That can work too. Pick the card that matches your idea.',
    cheer: 'Plan, do, review complete! You noticed your own work.',
    yums: [
      'Great plan. Go try it for a little bit, then come back and notice how it went.',
      'You did the doing part. That is real work.',
      'Good review. Noticing how it felt helps your next plan.',
      'That is a thoughtful choice. Tell someone your plan in your own words.',
    ],
  },
  modes: [
    {
      id: 'loop',
      title: 'Plan It, Do It!',
      rounds: 3,
      items: [
        {
          say: 'PLAN. Pick what you want to do. You can build, draw, look at a book, or dance.',
          promptArt: 'emoji:📋',
          promptAlt: 'planning board',
          answers: [answer('🏗️', 'build'), answer('🎨', 'draw'), answer('📚', 'look at a book'), answer('💃', 'dance')],
        },
        {
          say: 'DO. Pick your start card. Then go do your plan for a little while in the real room.',
          promptArt: 'char:maya',
          promptAlt: 'Maya ready to do a plan',
          answers: [answer('▶️', 'start now'), answer('👐', 'use your hands'), answer('👀', 'look closely'), answer('🎵', 'move your body')],
        },
        {
          say: 'REVIEW. How did it go? You can say you loved it, it was okay, or it was tricky.',
          promptArt: 'emoji:💭',
          promptAlt: 'review thought bubble',
          answers: [answer('😊', 'loved it'), answer('😐', 'it was okay'), answer('💪', 'it was tricky')],
        },
      ],
    },
    {
      id: 'tomorrow',
      title: 'Plan for Tomorrow',
      rounds: 2,
      items: [
        {
          say: 'Pick a plan for tomorrow. What might you want to do when you come back?',
          promptArt: 'emoji:🌅',
          promptAlt: 'tomorrow plan',
          answers: [answer('🏗️', 'build tomorrow'), answer('🎨', 'draw tomorrow'), answer('📚', 'read tomorrow'), answer('💃', 'dance tomorrow')],
        },
        {
          say: 'Who could you tell about your plan for tomorrow?',
          promptArt: 'emoji:🗣️',
          promptAlt: 'tell someone',
          answers: [answer('👩‍🏫', 'teacher'), answer('👨‍👩‍👧', 'family'), answer('🧑‍🤝‍🧑', 'friend'), answer('🙋', 'grown-up helper')],
        },
      ],
    },
  ],
};
