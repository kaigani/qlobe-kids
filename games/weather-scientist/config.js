export default {
  id: 'weather-scientist',
  engine: 'observe-journal',
  title: 'Weather Scientist',
  splashEmoji: '🌦️',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'Weather Report',
    playAgain: 'Play Again',
  },
  voice: {
    cheer: 'Today\'s weather report is ready!',
    yum: 'Good weather observing!',
  },
  modes: [
    {
      id: 'today',
      title: 'Today\'s Weather',
      prompt: 'Be a weather scientist. Look out a real window, then stamp what you notice.',
      rounds: 3,
      endTitle: 'Today\'s Weather Report',
      cheer: 'Sunny or snowy, windy or still, you made a weather report!',
      pages: [
        {
          scene: ['emoji:🪟', 'emoji:🌤️', 'emoji:☁️'],
          say: 'Look out a real window. What is the sky doing today?',
          stickers: [
            { art: 'emoji:☀️', alt: 'sunny sky', say: 'Sunny sky. The sun is shining today!' },
            { art: 'emoji:☁️', alt: 'cloudy sky', say: 'Cloudy sky. Soft clouds are covering the blue.' },
            { art: 'emoji:🌧️', alt: 'rainy sky', say: 'Rainy sky. Drip drop, the clouds are sharing rain.' },
            { art: 'emoji:❄️', alt: 'snowy sky', say: 'Snowy sky. Tiny cold flakes are falling.' },
          ],
        },
        {
          scene: ['emoji:🪟', 'emoji:🌡️', 'emoji:🧥'],
          say: 'Think about outside. How does the air feel today?',
          stickers: [
            { art: 'emoji:🥵', alt: 'warm', say: 'Warm. Your weather report says the air feels warm.' },
            { art: 'emoji:🧥', alt: 'chilly', say: 'Chilly. A jacket could feel cozy today.' },
            { art: 'emoji:🥶', alt: 'freezing', say: 'Freezing. Brrr, that sounds very cold.' },
          ],
        },
        {
          scene: ['emoji:🪟', 'emoji:🌳', 'emoji:🍃'],
          say: 'Look for moving leaves or branches. What is the wind doing?',
          stickers: [
            { art: 'emoji:🍃', alt: 'breezy', say: 'Breezy. Little leaves can dance in a breeze.' },
            { art: 'emoji:🌪️', alt: 'windy', say: 'Windy. Whoosh, strong wind can push clouds along.' },
            { art: 'emoji:😌', alt: 'still', say: 'Still. The air is resting quietly.' },
          ],
        },
      ],
    },
    {
      id: 'dress',
      title: 'What to Wear?',
      prompt: 'Look out a real window, then choose something that could help with the weather.',
      rounds: 2,
      endTitle: 'Weather Clothes',
      cheer: 'You dressed for the weather like a scientist!',
      pages: [
        {
          scene: ['emoji:🪟', 'emoji:☀️', 'emoji:🌧️'],
          say: 'What could help your body in today\'s weather?',
          stickers: [
            { art: 'emoji:🩳', alt: 'shorts', say: 'Shorts can help when the day feels warm.' },
            { art: 'emoji:🧥', alt: 'coat', say: 'A coat can help keep warm air close.' },
            { art: 'emoji:☔', alt: 'umbrella', say: 'An umbrella can help keep raindrops off.' },
            { art: 'emoji:🧣', alt: 'scarf', say: 'A scarf can help cover your neck when it is cold.' },
          ],
        },
        {
          scene: ['emoji:🪟', 'emoji:🍃', 'emoji:❄️'],
          say: 'Stamp one more weather helper for your journal.',
          stickers: [
            { art: 'emoji:🩳', alt: 'shorts', say: 'Shorts are a light choice for a hot day.' },
            { art: 'emoji:🧥', alt: 'coat', say: 'A coat is a cozy choice for chilly air.' },
            { art: 'emoji:☔', alt: 'umbrella', say: 'An umbrella is a smart choice for rain.' },
            { art: 'emoji:🧣', alt: 'scarf', say: 'A scarf is a snug choice for cold wind.' },
          ],
        },
      ],
    },
  ],
};
