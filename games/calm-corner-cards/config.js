const answer = (emoji, alt, correct = true) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

export default {
  id: 'calm-corner-cards',
  engine: 'choose-one',
  title: 'Calm Corner Cards',
  splashEmoji: '🧘',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Welcome to the calm corner. Big feelings need tools. Pick one calm tool.',
    nudge: 'That helps sometimes. Right now, let us try a calm tool together.',
    cheer: 'Your calm corner is ready. Use one slow breath whenever you need it.',
    yums: [
      'Try it now. Breathe in slowly, and breathe out slowly.',
      'Good calming. Let your shoulders drop a little.',
      'Nice tool choice. Feel your feet, soft and steady.',
      'One more gentle breath in, and out.',
    ],
  },
  modes: [
    {
      id: 'tools',
      title: 'Pick a Calm Tool',
      rounds: 4,
      items: [
        {
          say: 'Maya feels too loud inside. Pick a calm-down tool.',
          promptArt: 'char:maya',
          promptAlt: 'Maya',
          answers: [answer('🫁', 'balloon breaths'), answer('🤗', 'self-hug squeeze'), answer('🔢', 'count to five'), answer('🎨', 'quiet drawing')],
        },
        {
          say: 'Leo is frustrated because the tower fell. Pick a calm-down tool.',
          promptArt: 'char:leo',
          promptAlt: 'Leo',
          answers: [answer('🤗', 'self-hug squeeze'), answer('🫁', 'balloon breaths'), answer('🔢', 'count to five'), answer('🎨', 'quiet drawing')],
        },
        {
          say: 'Nia is worried at the busy doorway. Pick a calm-down tool.',
          promptArt: 'char:nia',
          promptAlt: 'Nia',
          answers: [answer('🔢', 'count to five'), answer('🫁', 'balloon breaths'), answer('🤗', 'self-hug squeeze'), answer('🎨', 'quiet drawing')],
        },
        {
          say: 'Ravi needs quiet after a noisy game. Pick a calm-down tool.',
          promptArt: 'char:ravi',
          promptAlt: 'Ravi',
          answers: [answer('🎨', 'quiet drawing'), answer('🫁', 'balloon breaths'), answer('🤗', 'self-hug squeeze'), answer('🔢', 'count to five')],
        },
      ],
    },
    {
      id: 'breathe',
      title: 'Balloon Breathing',
      rounds: 3,
      items: [
        {
          say: 'Balloon breath one. Breathe in and make the balloon small, medium, or big.',
          promptArt: 'emoji:🎈',
          promptAlt: 'balloon',
          answers: [answer('🔴', 'small balloon'), answer('🟠', 'medium balloon'), answer('🟡', 'big balloon')],
        },
        {
          say: 'Balloon breath two. Breathe in slowly. Choose the next balloon.',
          promptArt: 'emoji:🎈',
          promptAlt: 'balloon',
          answers: [answer('🟢', 'small balloon'), answer('🔵', 'medium balloon'), answer('🟣', 'big balloon')],
        },
        {
          say: 'Last balloon breath. Breathe in, hold softly, and let it float out.',
          promptArt: 'emoji:🎈',
          promptAlt: 'balloon',
          answers: [answer('⚪', 'small balloon'), answer('🟤', 'medium balloon'), answer('🟣', 'big balloon')],
        },
      ],
    },
  ],
};
