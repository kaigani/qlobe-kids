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
  // Story Screen art world (docs/art-direction.md): each Make Peace round
  // opens with a short felt-puppet vignette (Red and Blue) ending on the
  // conflict beat — the child picks the repair.
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
          say: 'Red puppet says, I had the truck first! Blue puppet says, But I want a turn! What can make peace?',
          promptArt: 'emoji:🚚',
          promptAlt: 'Red holds the truck while Blue asks for a turn',
          promptVideo: './assets/video/truck.mp4',
          answers: [answer('🤝', 'share'), answer('⏳', 'take turns'), answer('🗣️', 'use words'), answer('🙋', 'ask for help')],
        },
        {
          say: 'Red puppet says, My tower fell! Blue puppet says, I bumped it by accident. What can make peace?',
          promptArt: 'emoji:🧱',
          promptAlt: 'the block tower tumbles down',
          promptVideo: './assets/video/tower.mp4',
          answers: [answer('🗣️', 'use words'), answer('🤝', 'help rebuild'), answer('🙋', 'ask for help'), answer('⏳', 'take turns')],
        },
        {
          say: 'Red puppet says, I want to go first! Blue puppet says, I want first turn too! What can make peace?',
          promptArt: 'emoji:1️⃣',
          promptAlt: 'both puppets rush to the slide',
          promptVideo: './assets/video/first-turn.mp4',
          answers: [answer('⏳', 'take turns'), answer('🗣️', 'use words'), answer('🤝', 'share the game'), answer('🙋', 'ask for help')],
        },
        {
          say: 'Red puppet says, Ouch, you bumped me! Blue puppet says, It was an accident. What can make peace?',
          promptArt: 'emoji:🩹',
          promptAlt: 'Blue accidentally bumps Red',
          promptVideo: './assets/video/bump.mp4',
          answers: [answer('🗣️', 'say sorry and ask are you okay'), answer('🤝', 'gentle repair'), answer('🙋', 'ask for help'), answer('⏳', 'pause and wait')],
        },
        {
          say: 'Blue puppet says, Red is playing without me. Red puppet says, I did not know you wanted to join. What can make peace?',
          promptArt: 'emoji:🧸',
          promptAlt: 'Blue watches sadly from the side',
          promptVideo: './assets/video/left-out.mp4',
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
