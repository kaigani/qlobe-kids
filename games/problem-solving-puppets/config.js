const answer = (emoji, alt, correct = true) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

const feeling = (emoji, alt, correct = false) => answer(emoji, alt, correct);

export default {
  id: 'problem-solving-puppets',
  engine: 'choose-one',
  title: 'Problem-Solving Puppets',
  splashEmoji: '🤝',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'The puppets need help making peace. Listen to the problem, then tap a kind repair choice.',
    nudge: 'That does not match this puppet feeling yet. Listen again and try another one.',
    cheer: 'Peace helpers complete! You can use kind repair words today.',
    yums: [
      'Good repair. Sharing can make room for both friends.',
      'Kind choice. Taking turns gives everyone a fair chance.',
      'Yes. Using words helps friends understand each other.',
      'That helps. A grown-up can keep everyone safe and heard.',
    ],
  },
  modes: [
    {
      id: 'peace',
      title: 'Make Peace',
      rounds: 5,
      items: [
        {
          say: 'Maya puppet says, I had the red crayon first! Leo puppet says, But I need red too! What can make peace?',
          promptArt: 'emoji:🖍️',
          promptAlt: 'red crayon conflict',
          answers: [answer('🤝', 'share'), answer('⏳', 'take turns'), answer('🗣️', 'use words'), answer('🙋', 'ask for help')],
        },
        {
          say: 'Nia puppet says, My tower fell! Sam puppet says, I bumped it by accident. What can make peace?',
          promptArt: 'emoji:🧱',
          promptAlt: 'fallen block tower',
          answers: [answer('🗣️', 'use words'), answer('🤝', 'help rebuild'), answer('🙋', 'ask for help'), answer('⏳', 'take turns')],
        },
        {
          say: 'Ravi puppet says, I want to go first! Maya puppet says, I want first turn too! What can make peace?',
          promptArt: 'emoji:1️⃣',
          promptAlt: 'both want first turn',
          answers: [answer('⏳', 'take turns'), answer('🗣️', 'use words'), answer('🤝', 'share the game'), answer('🙋', 'ask for help')],
        },
        {
          say: 'Leo puppet says, Ouch, you bumped me! Nia puppet says, It was an accident. What can make peace?',
          promptArt: 'emoji:🩹',
          promptAlt: 'accidental bump',
          answers: [answer('🗣️', 'say sorry and ask are you okay'), answer('🤝', 'gentle repair'), answer('🙋', 'ask for help'), answer('⏳', 'pause and wait')],
        },
        {
          say: 'Sam puppet says, Everyone is playing without me. Ravi puppet says, I did not know you wanted to join. What can make peace?',
          promptArt: 'emoji:🧸',
          promptAlt: 'puppet feels left out',
          answers: [answer('🗣️', 'invite with words'), answer('🤝', 'make room'), answer('🙋', 'ask for help'), answer('⏳', 'wait for a turn')],
        },
      ],
    },
    {
      id: 'feelings',
      title: 'How Do They Feel?',
      rounds: 4,
      difficultyRamp: true,
      items: [
        {
          say: 'Freeze the puppet scene. Maya is holding the crayon tight and her eyebrows are squeezed. How does Maya feel?',
          promptArt: 'char:maya',
          promptAlt: 'Maya puppet in a conflict',
          answers: [feeling('😤', 'frustrated', true), feeling('😊', 'happy'), feeling('😌', 'calm'), feeling('🥳', 'proud')],
        },
        {
          say: 'Freeze the puppet scene. Leo sees his tower knocked down and his shoulders drop. How does Leo feel?',
          promptArt: 'char:leo',
          promptAlt: 'Leo puppet near a fallen tower',
          answers: [feeling('😢', 'sad', true), feeling('😊', 'happy'), feeling('😌', 'calm'), feeling('🥳', 'proud')],
        },
        {
          say: 'Freeze the puppet scene. Sam is waiting for a turn and his tummy feels jumpy. How does Sam feel?',
          promptArt: 'char:sam',
          promptAlt: 'Sam puppet waiting for a turn',
          answers: [feeling('😨', 'worried', true), feeling('😤', 'frustrated'), feeling('😊', 'happy'), feeling('😌', 'calm')],
        },
        {
          say: 'Freeze the puppet scene. Ravi is sitting alone and looking at the game. How does Ravi feel?',
          promptArt: 'char:ravi',
          promptAlt: 'Ravi puppet feeling left out',
          answers: [feeling('😢', 'left out and sad', true), feeling('🥳', 'proud'), feeling('😌', 'calm'), feeling('😊', 'happy')],
        },
      ],
    },
  ],
};
