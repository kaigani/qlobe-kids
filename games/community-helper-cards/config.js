export default {
  id: 'community-helper-cards',
  engine: 'match-pairs',
  title: 'Community Helper Cards',
  splashEmoji: '🚒',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Let\'s match each helper with what they use.',
    nudge: 'Hmm, that helper uses something else. Try another card.',
    cheer: 'Helper cards complete! So many people help our community!',
    yums: [
      'That helper uses that!',
      'Good community helper match!',
      'You found the helper tool!',
    ],
  },
  modes: [
    {
      id: 'helpers',
      title: 'Who Uses What?',
      prompt: 'Match each helper with what they use.',
      rounds: 4,
      pairsPerRound: 3,
      difficultyRamp: true,
      pairs: [
        {
          say: 'The firefighter uses the fire extinguisher!',
          a: { art: 'emoji:🧑‍🚒', alt: 'firefighter', say: 'firefighter' },
          b: { art: 'emoji:🧯', alt: 'fire extinguisher', say: 'fire extinguisher' },
        },
        {
          say: 'The doctor uses the stethoscope!',
          a: { art: 'emoji:🧑‍⚕️', alt: 'doctor', say: 'doctor' },
          b: { art: 'emoji:🩺', alt: 'stethoscope', say: 'stethoscope' },
        },
        {
          say: 'The chef uses the pan!',
          a: { art: 'emoji:🧑‍🍳', alt: 'chef', say: 'chef' },
          b: { art: 'emoji:🍳', alt: 'pan', say: 'pan' },
        },
        {
          say: 'The teacher uses the books!',
          a: { art: 'emoji:🧑‍🏫', alt: 'teacher', say: 'teacher' },
          b: { art: 'emoji:📚', alt: 'books', say: 'books' },
        },
        {
          say: 'The farmer uses the tractor!',
          a: { art: 'emoji:🧑‍🌾', alt: 'farmer', say: 'farmer' },
          b: { art: 'emoji:🚜', alt: 'tractor', say: 'tractor' },
        },
        {
          say: 'The police officer uses the police car!',
          a: { art: 'emoji:👮', alt: 'police officer', say: 'police officer' },
          b: { art: 'emoji:🚓', alt: 'police car', say: 'police car' },
        },
        {
          say: 'The mailbox holds letters for delivery!',
          a: { art: 'emoji:📮', alt: 'mailbox', say: 'mailbox' },
          b: { art: 'emoji:✉️', alt: 'letter', say: 'letter' },
        },
        {
          say: 'The builder uses the hammer!',
          a: { art: 'emoji:👷', alt: 'builder', say: 'builder' },
          b: { art: 'emoji:🔨', alt: 'hammer', say: 'hammer' },
        },
      ],
    },
    {
      id: 'places',
      title: 'Where Do They Work?',
      prompt: 'Match each helper with a work buddy.',
      rounds: 3,
      pairsPerRound: 3,
      pairs: [
        {
          say: 'The astronaut rides the rocket!',
          a: { art: 'emoji:🧑‍🚀', alt: 'astronaut', say: 'astronaut' },
          b: { art: 'emoji:🚀', alt: 'rocket', say: 'rocket' },
        },
        {
          say: 'The dentist helps teeth!',
          a: { art: 'emoji:🧑‍⚕️', alt: 'dentist', say: 'dentist' },
          b: { art: 'emoji:🦷', alt: 'tooth', say: 'tooth' },
        },
        {
          say: 'The pilot flies the plane!',
          a: { art: 'emoji:🧑‍✈️', alt: 'pilot', say: 'pilot' },
          b: { art: 'emoji:✈️', alt: 'plane', say: 'plane' },
        },
        {
          say: 'The veterinarian helps the dog!',
          a: { art: 'emoji:🧑‍⚕️', alt: 'veterinarian', say: 'veterinarian' },
          b: { art: 'emoji:🐶', alt: 'dog', say: 'dog' },
        },
      ],
    },
  ],
};
