const answer = (emoji, alt, correct = false) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

export default {
  id: 'feelings-charades',
  engine: 'choose-one',
  title: 'Feelings Charades',
  splashEmoji: '🎭',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Let us play feelings charades. Listen to the acting voice, then tap the feeling face.',
    nudge: 'That face does not match yet. Listen to the acting voice again.',
    cheer: 'Feelings charades finished! Now act one feeling with your whole body.',
    yums: [
      'You named the feeling.',
      'Good listening to the body clues.',
      'Yes, that face matches the feeling.',
      'Now show that feeling big, then let it soften.',
    ],
  },
  modes: [
    {
      id: 'guess',
      title: 'Guess the Feeling',
      rounds: 6,
      difficultyRamp: true,
      items: [
        {
          say: 'I am stomping my feet. My arms are crossed. Hmph! What feeling is this?',
          promptArt: 'char:leo',
          promptAlt: 'Leo acting frustrated',
          answers: [answer('😤', 'frustrated', true), answer('😊', 'happy'), answer('😌', 'calm'), answer('🥳', 'proud')],
        },
        {
          say: 'My eyes are bright. I am smiling and bouncing. Hooray! What feeling is this?',
          promptArt: 'char:maya',
          promptAlt: 'Maya acting happy',
          answers: [answer('😊', 'happy', true), answer('😢', 'sad'), answer('😨', 'worried'), answer('😤', 'frustrated')],
        },
        {
          say: 'My shoulders are low. My voice is tiny. I miss my toy. What feeling is this?',
          promptArt: 'char:nia',
          promptAlt: 'Nia acting sad',
          answers: [answer('😢', 'sad', true), answer('🥳', 'proud'), answer('😌', 'calm'), answer('😊', 'happy')],
        },
        {
          say: 'My tummy feels jumpy. My eyebrows are squeezed. What if I cannot find it? What feeling is this?',
          promptArt: 'char:sam',
          promptAlt: 'Sam acting worried',
          answers: [answer('😨', 'worried', true), answer('😊', 'happy'), answer('😤', 'frustrated'), answer('🥳', 'proud')],
        },
        {
          say: 'My body is still. I breathe in slowly, and out slowly. What feeling is this?',
          promptArt: 'char:ravi',
          promptAlt: 'Ravi acting calm',
          answers: [answer('😌', 'calm', true), answer('😢', 'sad'), answer('😨', 'worried'), answer('🥳', 'proud')],
        },
        {
          say: 'I worked hard and did it. My chest feels tall. Ta-da! What feeling is this?',
          promptArt: 'char:maya',
          promptAlt: 'Maya acting proud',
          answers: [answer('🥳', 'proud', true), answer('😤', 'frustrated'), answer('😢', 'sad'), answer('😌', 'calm')],
        },
      ],
    },
    {
      id: 'show',
      title: 'Show the Feeling',
      rounds: 4,
      items: [
        {
          say: 'When might you feel proud?',
          promptArt: 'emoji:🥳',
          promptAlt: 'proud face',
          answers: [answer('🏆', 'finished a hard puzzle', true), answer('🥦', 'dropped broccoli'), answer('🛏️', 'bedtime')],
        },
        {
          say: 'When might you feel worried?',
          promptArt: 'emoji:😨',
          promptAlt: 'worried face',
          answers: [answer('🔎', 'cannot find a favorite toy', true), answer('🎂', 'birthday cake'), answer('🏖️', 'sand castle')],
        },
        {
          say: 'When might you feel calm?',
          promptArt: 'emoji:😌',
          promptAlt: 'calm face',
          answers: [answer('🌬️', 'slow quiet breathing', true), answer('📣', 'loud shouting'), answer('⚡', 'rushing fast')],
        },
        {
          say: 'When might you feel frustrated?',
          promptArt: 'emoji:😤',
          promptAlt: 'frustrated face',
          answers: [answer('🧩', 'a puzzle piece will not fit yet', true), answer('🎈', 'a balloon parade'), answer('🍪', 'cookie snack')],
        },
      ],
    },
  ],
};
