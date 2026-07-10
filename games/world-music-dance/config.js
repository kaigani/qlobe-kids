const answer = (emoji, alt, correct = false) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

export default {
  id: 'world-music-dance',
  engine: 'choose-one',
  title: 'World Music Dance',
  splashEmoji: '💃',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Music is traveling around the world! Listen, tap the place, then dance the beat.',
    nudge: 'Good listening. Try another card for this music.',
    cheer: 'World music dance party!',
    yums: [
      'Yes! Now sway with the music!',
      'You found it! Give a big stomp!',
      'Great ears! Spin around gently!',
      'That is the place! Bounce to the beat!',
    ],
  },
  modes: [
    {
      id: 'listen',
      title: "Where's That Music?",
      rounds: 5,
      items: [
        {
          say: 'Boom-cha, boom-cha! Big drums from West Africa. Tap the Africa card.',
          promptArt: 'emoji:🥁',
          promptAlt: 'big drum',
          answers: [answer('🌍', 'Africa map card', true), answer('🌵', 'Mexico map card'), answer('🏰', 'Scotland map card'), answer('🛕', 'India map card')],
        },
        {
          say: 'Bright trumpets and happy guitar! Mariachi music comes from Mexico. Tap the Mexico card.',
          promptArt: 'emoji:🎺',
          promptAlt: 'trumpet',
          answers: [answer('🌵', 'Mexico map card', true), answer('🌍', 'Africa map card'), answer('🗾', 'Japan map card'), answer('🏰', 'Scotland map card')],
        },
        {
          say: 'Breezy bagpipes across green hills! This music is loved in Scotland. Tap the Scotland card.',
          promptArt: 'emoji:🎒',
          promptAlt: 'bagpipe clue',
          answers: [answer('🏰', 'Scotland map card', true), answer('🛕', 'India map card'), answer('🌵', 'Mexico map card'), answer('🗾', 'Japan map card')],
        },
        {
          say: 'Twanga twanga, shimmering strings! The sitar is from India. Tap the India card.',
          promptArt: 'emoji:🪕',
          promptAlt: 'string instrument',
          answers: [answer('🛕', 'India map card', true), answer('🌍', 'Africa map card'), answer('🏰', 'Scotland map card'), answer('🗾', 'Japan map card')],
        },
        {
          say: 'Don! Don! Powerful taiko drums come from Japan. Tap the Japan card.',
          promptArt: 'emoji:🥁',
          promptAlt: 'taiko drum clue',
          answers: [answer('🗾', 'Japan map card', true), answer('🌵', 'Mexico map card'), answer('🛕', 'India map card'), answer('🌍', 'Africa map card')],
        },
      ],
    },
    {
      id: 'dance',
      title: 'Dance Along',
      rounds: 4,
      items: [
        {
          say: 'The drum beat is strong: boom, boom, boom. Which move fits best?',
          promptArt: 'emoji:🥁',
          promptAlt: 'strong drum beat',
          answers: [answer('🦶', 'stomp', true), answer('🌀', 'spin'), answer('👐', 'sway'), answer('🦘', 'bounce')],
        },
        {
          say: 'The melody floats slowly like a breeze. Which move fits best?',
          promptArt: 'emoji:🎶',
          promptAlt: 'floating melody',
          answers: [answer('👐', 'sway', true), answer('🦶', 'stomp'), answer('🦘', 'bounce'), answer('🌀', 'spin')],
        },
        {
          say: 'The music twirls faster and faster. Which move fits best?',
          promptArt: 'emoji:🎻',
          promptAlt: 'twirling music',
          answers: [answer('🌀', 'spin', true), answer('👐', 'sway'), answer('🦶', 'stomp'), answer('🦘', 'bounce')],
        },
        {
          say: 'The beat is bouncy: hop, hop, hop! Which move fits best?',
          promptArt: 'emoji:🪇',
          promptAlt: 'bouncy rhythm',
          answers: [answer('🦘', 'bounce', true), answer('🌀', 'spin'), answer('👐', 'sway'), answer('🦶', 'stomp')],
        },
      ],
    },
  ],
};
