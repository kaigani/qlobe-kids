const answer = (emoji, alt, correct = false) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

export default {
  id: 'grace-courtesy-theater',
  engine: 'choose-one',
  title: 'Grace & Courtesy Theater',
  splashEmoji: '🎩',
  // Art-world backdrop (docs/art-direction.md)
  theme: {
    world: 'story-screen-stage',
    background: './assets/bg.jpg',
  },
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Welcome to the tiny manners theater. Listen to the scene, then tap the kind choice.',
    nudge: 'Hmm, how would THAT feel? Listen again and choose the kind way.',
    cheer: 'Curtain call for kind words! Try one today with your family.',
    yums: [
      'That sounds kind and gentle.',
      'Warm words help everyone feel safe.',
      'Yes, that is grace and courtesy.',
      'Kind choice. The theater claps softly.',
    ],
  },
  modes: [
    {
      id: 'manners',
      title: 'What Do We Say?',
      rounds: 6,
      difficultyRamp: true,
      items: [
        {
          say: 'Leo wants a turn on the swing. What should he SAY? Please may I have a turn?',
          promptArt: 'char:leo',
          promptAlt: 'Leo',
          answers: [answer('🙏', 'please may I have a turn', true), answer('😤', 'grab'), answer('🤫', 'say nothing')],
        },
        {
          say: 'Maya gets help tying a shoe. What should she SAY? Thank you for helping me.',
          promptArt: 'char:maya',
          promptAlt: 'Maya',
          answers: [answer('💛', 'thank you', true), answer('🙄', 'look away'), answer('🏃', 'run away')],
        },
        {
          say: 'Nia needs to walk past two friends. What should she SAY? Excuse me, please.',
          promptArt: 'char:nia',
          promptAlt: 'Nia',
          answers: [answer('🫶', 'excuse me please', true), answer('🚧', 'push through'), answer('📣', 'shout')],
        },
        {
          say: 'Sam wants a block Ravi is using. What should Sam SAY? May I have it when you are done?',
          promptArt: 'char:sam',
          promptAlt: 'Sam',
          answers: [answer('⏳', 'wait and ask', true), answer('🫳', 'snatch'), answer('😡', 'frown and stomp')],
        },
        {
          say: 'Ravi bumps Leo by accident. What should Ravi SAY? I am sorry. Are you okay?',
          promptArt: 'char:ravi',
          promptAlt: 'Ravi',
          answers: [answer('🌷', 'sorry are you okay', true), answer('🙈', 'hide'), answer('🧱', 'keep walking')],
        },
        {
          say: 'Leo wants the blue crayon. What should he SAY? May I use blue after you?',
          promptArt: 'char:leo',
          promptAlt: 'Leo',
          answers: [answer('🖍️', 'ask for a turn', true), answer('💥', 'take the crayon'), answer('😢', 'cry loudly')],
        },
      ],
    },
    {
      id: 'helping',
      title: 'Kind or Not?',
      rounds: 4,
      items: [
        {
          say: 'Nia drops her crayons. Which action is kind?',
          promptArt: 'char:nia',
          promptAlt: 'Nia',
          answers: [answer('🤲', 'help pick them up', true), answer('😂', 'laugh'), answer('👟', 'walk away')],
        },
        {
          say: 'Ravi is sitting alone. Which action is kind?',
          promptArt: 'char:ravi',
          promptAlt: 'Ravi',
          answers: [answer('👋', 'invite Ravi to play', true), answer('🙅', 'turn away'), answer('🤐', 'keep quiet')],
        },
        {
          say: 'Sam builds a tower and it falls. Which action is kind?',
          promptArt: 'char:sam',
          promptAlt: 'Sam',
          answers: [answer('🧱', 'help rebuild', true), answer('🥾', 'stomp blocks'), answer('🙃', 'make a face')],
        },
        {
          say: 'Maya is waiting in line. Which action is kind?',
          promptArt: 'char:maya',
          promptAlt: 'Maya',
          answers: [answer('🌬️', 'take a calm breath and wait', true), answer('👉', 'push ahead'), answer('📢', 'yell me first')],
        },
      ],
    },
  ],
};
