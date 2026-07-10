const soundPair = (id, alt, say, matchLine) => ({
  id,
  say: matchLine,
  a: {
    art: 'emoji:🥫',
    alt: `${alt} shaker one`,
    say,
  },
  b: {
    art: 'emoji:🥫',
    alt: `${alt} shaker two`,
    say,
  },
});

export default {
  id: 'sound-cylinder-match',
  engine: 'match-pairs',
  title: 'Sound Cylinder Match',
  splashEmoji: '🔊',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Listen with your ears. Find two shakers that sound the same.',
    nudge: 'Hmm, those sound different. Listen again and try another shaker.',
    cheer: 'You matched the mystery sounds!',
    yums: [
      'Same sound!',
      'Great listening ears!',
      'You heard the match!',
    ],
  },
  modes: [
    {
      id: 'listen',
      title: 'Same Sound',
      rounds: 3,
      pairsPerRound: 3,
      difficultyRamp: true,
      prompt: 'Tap shakers and find two that sound the same.',
      pairs: [
        soundPair('soft-shaker', 'soft shaker', 'shicka shicka!', 'Shicka shicka! Same soft shaker sound!'),
        soundPair('deep-drum', 'deep drum', 'boom boom!', 'Boom boom! Same deep drum sound!'),
        soundPair('tiny-bell', 'tiny bell', 'ting-a-ling!', 'Ting-a-ling! Same tiny bell sound!'),
        soundPair('sand', 'sand', 'shhh shhh!', 'Shhh shhh! Same sandy sound!'),
        soundPair('wood-blocks', 'wooden blocks', 'clack clack!', 'Clack clack! Same wooden block sound!'),
        soundPair('high-chime', 'high chime', 'ping!', 'Ping! Same high chime sound!'),
      ],
    },
  ],
};
