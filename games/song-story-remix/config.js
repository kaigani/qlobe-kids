const answer = (emoji, alt, correct = false) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

export default {
  id: 'song-story-remix',
  engine: 'choose-one',
  title: 'Song Story Remix',
  splashEmoji: '🎤',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Let us remix a song story! Listen for the silly singer, then tap the card.',
    nudge: 'That one makes a funny song too. Listen again and tap this singer.',
    cheer: 'Remix concert complete!',
    yums: [
      'E-I-E-I-O! That remix sings!',
      'Round and round, sing the silly sound!',
      'Great remix! Sing it with me!',
    ],
  },
  modes: [
    {
      id: 'farm',
      title: 'Remix the Farm',
      rounds: 5,
      items: [
        {
          say: 'Old MacDonald had a farm. Today he has a T-Rex. Tap the T-Rex for stomp stomp here.',
          promptArt: 'emoji:🚜',
          promptAlt: 'farm song',
          answers: [answer('🦖', 'T-Rex', true), answer('🐙', 'octopus'), answer('🦁', 'lion'), answer('🐸', 'frog')],
        },
        {
          say: 'Old MacDonald had a farm. Today he has an octopus. Tap the octopus for splish splash here.',
          promptArt: 'emoji:🚜',
          promptAlt: 'farm song',
          answers: [answer('🐙', 'octopus', true), answer('🦆', 'duck'), answer('🦖', 'T-Rex'), answer('🐸', 'frog')],
        },
        {
          say: 'Old MacDonald had a farm. Today he has a lion. Tap the lion for roar roar here.',
          promptArt: 'emoji:🚜',
          promptAlt: 'farm song',
          answers: [answer('🦁', 'lion', true), answer('🐙', 'octopus'), answer('🦆', 'duck'), answer('🦖', 'T-Rex')],
        },
        {
          say: 'Old MacDonald had a farm. Today he has a frog. Tap the frog for ribbit ribbit here.',
          promptArt: 'emoji:🚜',
          promptAlt: 'farm song',
          answers: [answer('🐸', 'frog', true), answer('🦁', 'lion'), answer('🐙', 'octopus'), answer('🦆', 'duck')],
        },
        {
          say: 'Old MacDonald had a farm. Today he has a duck. Tap the duck for quack quack here.',
          promptArt: 'emoji:🚜',
          promptAlt: 'farm song',
          answers: [answer('🦆', 'duck', true), answer('🐸', 'frog'), answer('🦖', 'T-Rex'), answer('🦁', 'lion')],
        },
      ],
    },
    {
      id: 'bus',
      title: 'Remix the Bus',
      rounds: 4,
      items: [
        {
          say: 'The wheels on the bus go round and round. Who is trumpeting on the bus? Tap the elephant.',
          promptArt: 'emoji:🚌',
          promptAlt: 'bus song',
          answers: [answer('🐘', 'elephant', true), answer('👻', 'ghost'), answer('🤖', 'robot'), answer('🦖', 'T-Rex')],
        },
        {
          say: 'The wheels on the bus go round and round. Who is booing on the bus? Tap the ghost.',
          promptArt: 'emoji:🚌',
          promptAlt: 'bus song',
          answers: [answer('👻', 'ghost', true), answer('🐘', 'elephant'), answer('🤖', 'robot'), answer('🐸', 'frog')],
        },
        {
          say: 'The wheels on the bus go round and round. Who is beeping on the bus? Tap the robot.',
          promptArt: 'emoji:🚌',
          promptAlt: 'bus song',
          answers: [answer('🤖', 'robot', true), answer('🐘', 'elephant'), answer('👻', 'ghost'), answer('🦁', 'lion')],
        },
        {
          say: 'The wheels on the bus go round and round. Who is stomping on the bus? Tap the T-Rex.',
          promptArt: 'emoji:🚌',
          promptAlt: 'bus song',
          answers: [answer('🦖', 'T-Rex', true), answer('🤖', 'robot'), answer('👻', 'ghost'), answer('🐘', 'elephant')],
        },
      ],
    },
  ],
};
