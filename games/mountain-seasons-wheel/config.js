const answer = (emoji, alt, correct = false) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

export default {
  id: 'mountain-seasons-wheel',
  engine: 'choose-one',
  title: 'Mountain Seasons Wheel',
  splashEmoji: '🏔️',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Spin the mountain seasons wheel! Listen for the season, then tap what belongs.',
    nudge: 'Almost! Look at the season and try another one.',
    cheer: 'The season wheel is complete!',
    yums: [
      'Yes! That belongs in this season.',
      'You matched the mountain weather!',
      'Great season thinking!',
    ],
  },
  modes: [
    {
      id: 'wheel',
      title: 'What Season?',
      rounds: 6,
      difficultyRamp: true,
      items: [
        {
          say: 'The wheel lands on winter. Brrr, winter is snowy! What belongs in winter?',
          promptArt: 'emoji:❄️',
          promptAlt: 'winter snowflake',
          answers: [answer('⛄', 'snowman', true), answer('🩴', 'sandals'), answer('🍉', 'watermelon'), answer('🌷', 'spring flower')],
        },
        {
          say: 'The wheel lands on winter. Cold wind is blowing! What helps you stay warm?',
          promptArt: 'emoji:❄️',
          promptAlt: 'winter snowflake',
          answers: [answer('🧣', 'warm scarf', true), answer('🩳', 'shorts'), answer('🪁', 'kite'), answer('🍂', 'falling leaf')],
        },
        {
          say: 'The wheel lands on spring. Tiny blossoms are opening! What belongs in spring?',
          promptArt: 'emoji:🌸',
          promptAlt: 'spring blossom',
          answers: [answer('🌷', 'spring flower', true), answer('⛄', 'snowman'), answer('🧤', 'mittens'), answer('🎃', 'pumpkin')],
        },
        {
          say: 'The wheel lands on spring. Rain helps new plants grow! What belongs in spring?',
          promptArt: 'emoji:🌸',
          promptAlt: 'spring blossom',
          answers: [answer('🌧️', 'spring rain cloud', true), answer('🛷', 'sled'), answer('🏖️', 'beach umbrella'), answer('🍁', 'maple leaf')],
        },
        {
          say: 'The wheel lands on summer. The sun is warm! What belongs in summer?',
          promptArt: 'emoji:☀️',
          promptAlt: 'summer sun',
          answers: [answer('🩴', 'sandals', true), answer('🧣', 'scarf'), answer('⛄', 'snowman'), answer('🍄', 'mushroom')],
        },
        {
          say: 'The wheel lands on summer. It is picnic weather! What fruit feels summery?',
          promptArt: 'emoji:☀️',
          promptAlt: 'summer sun',
          answers: [answer('🍉', 'watermelon', true), answer('🧤', 'mittens'), answer('🍂', 'falling leaves'), answer('☃️', 'snow person')],
        },
        {
          say: 'The wheel lands on autumn. Leaves are twirling down! What belongs in autumn?',
          promptArt: 'emoji:🍂',
          promptAlt: 'autumn leaves',
          answers: [answer('🍁', 'red leaf', true), answer('🌊', 'ocean wave'), answer('🌷', 'spring flower'), answer('🩴', 'sandals')],
        },
        {
          say: 'The wheel lands on autumn. The air is chilly and pumpkins are ready! What belongs in autumn?',
          promptArt: 'emoji:🍂',
          promptAlt: 'autumn leaves',
          answers: [answer('🎃', 'pumpkin', true), answer('🏄', 'surfboard'), answer('⛄', 'snowman'), answer('🌸', 'blossom')],
        },
      ],
    },
    {
      id: 'dress',
      title: 'Dress for It',
      rounds: 4,
      items: [
        {
          say: 'Snow is falling on the mountain. What should we wear?',
          promptArt: 'emoji:🌨️',
          promptAlt: 'snowy weather',
          answers: [answer('🧥', 'warm coat', true), answer('🩱', 'swimsuit'), answer('🩴', 'sandals')],
        },
        {
          say: 'Rain is tapping on the roof. What helps us stay dry?',
          promptArt: 'emoji:🌧️',
          promptAlt: 'rainy weather',
          answers: [answer('☂️', 'umbrella', true), answer('🕶️', 'sunglasses'), answer('🧦', 'socks')],
        },
        {
          say: 'The sun is bright and hot. What can shade your eyes?',
          promptArt: 'emoji:☀️',
          promptAlt: 'sunny weather',
          answers: [answer('🧢', 'sun hat', true), answer('🧤', 'mittens'), answer('🧣', 'scarf')],
        },
        {
          say: 'Autumn wind is whooshing. What cozy thing can you put on?',
          promptArt: 'emoji:🍂',
          promptAlt: 'windy autumn weather',
          answers: [answer('🧥', 'jacket', true), answer('👙', 'swimsuit'), answer('🩴', 'flip flops')],
        },
      ],
    },
  ],
};
