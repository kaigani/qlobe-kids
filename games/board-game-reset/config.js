const answer = (emoji, alt, correct = false) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

export default {
  id: 'board-game-reset',
  engine: 'choose-one',
  title: 'Board Game Reset',
  splashEmoji: '🎲',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Games end, and that is a skill. Pick the good-sport move.',
    nudge: 'That might hurt feelings. Listen again and choose the good-sport move.',
    cheer: 'Board game reset complete! Good games end with kind words and clean pieces.',
    yums: [
      'Good game words help everyone feel proud.',
      'Losing feels wobbly. Asking kindly for a rematch can help.',
      'Kind reset. The game is ready for next time.',
      'Nice clean-up choice. Pieces, box, shelf.',
    ],
  },
  modes: [
    {
      id: 'sport',
      title: 'Good Sport',
      rounds: 5,
      difficultyRamp: true,
      items: [
        {
          say: 'You won the board game. What is the good-sport move?',
          promptArt: 'emoji:🏆',
          promptAlt: 'winning a board game',
          answers: [answer('🤝', 'say good game', true), answer('😜', 'tease'), answer('📣', 'shout I am best')],
        },
        {
          say: 'You lost the game. Losing feels wobbly. What helps?',
          promptArt: 'emoji:🎲',
          promptAlt: 'losing a board game',
          answers: [answer('🔁', 'ask rematch nicely', true), answer('😭', 'throw pieces'), answer('🙈', 'hide the board')],
        },
        {
          say: 'A friend knocked the board by accident. What is the good-sport move?',
          promptArt: 'emoji:🧩',
          promptAlt: 'board bumped by accident',
          answers: [answer('🤗', 'say it is okay and reset', true), answer('😡', 'get very mad'), answer('👋', 'quit forever')],
        },
        {
          say: 'Your friend won and feels proud. What can you say?',
          promptArt: 'char:nia',
          promptAlt: 'friend won the game',
          answers: [answer('👏', 'nice playing', true), answer('🙄', 'that was just luck'), answer('🫳', 'grab the trophy')],
        },
        {
          say: 'The game is done and pieces are everywhere. What is the good-sport move?',
          promptArt: 'emoji:🧺',
          promptAlt: 'game pieces to clean up',
          answers: [answer('🧹', 'help clean up', true), answer('🏃', 'run away'), answer('🧱', 'leave pieces out')],
        },
      ],
    },
    {
      id: 'reset',
      title: 'Clean-Up Crew',
      rounds: 3,
      items: [
        {
          say: 'Clean-up crew. What goes back first? Tiny pieces go in the box first.',
          promptArt: 'emoji:🎲',
          promptAlt: 'loose game pieces',
          answers: [answer('🔴', 'pieces first', true), answer('📦', 'closed box'), answer('🧸', 'toy shelf')],
        },
        {
          say: 'The pieces are in. What comes next? Close the box so nothing spills.',
          promptArt: 'emoji:📦',
          promptAlt: 'game box',
          answers: [answer('📦', 'box next', true), answer('🎲', 'more loose pieces'), answer('🪑', 'chair first')],
        },
        {
          say: 'The box is closed. What goes last? Put the game on the shelf.',
          promptArt: 'emoji:🧺',
          promptAlt: 'board game ready for shelf',
          answers: [answer('🧸', 'shelf last', true), answer('🔴', 'pieces on floor'), answer('🛝', 'outside')],
        },
      ],
    },
  ],
};
