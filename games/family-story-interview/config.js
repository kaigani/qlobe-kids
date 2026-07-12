const interviewStickers = (topic) => [
  { art: 'emoji:🤝', alt: 'same as me', say: `Same as me! You and your grown-up share something about ${topic}. Tell them what is the same.` },
  { art: 'emoji:🔀', alt: 'different from me', say: `Different! ${topic} changed from then to now. Tell your grown-up what is different.` },
  { art: 'emoji:😲', alt: 'surprising', say: `This just in: a surprising story about ${topic}! Say the surprising part back.` },
  { art: 'emoji:😂', alt: 'funny', say: `Breaking news: a funny story about ${topic}! Tell the funny part in your own words.` },
];

export default {
  id: 'family-story-interview',
  engine: 'observe-journal',
  title: 'Family Story Interview',
  splashEmoji: '🎙️',
  theme: { world: 'story-screen', background: './assets/bg.jpg' },
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'Family News Story',
    playAgain: 'Play Again',
  },
  voice: {
    cheer: 'This just in! Your family interview is ready!',
    yum: 'Excellent listening, reporter!',
  },
  modes: [
    {
      id: 'childhood',
      title: 'When You Were Five',
      prompt: 'This just in! Sit with a grown-up. Listen to each question, ask it slowly, then listen to their whole answer.',
      rounds: 3,
      endTitle: 'When You Were Five',
      cheer: 'This just in! You asked, listened, and reported three stories from when your grown-up was five!',
      pages: [
        {
          scene: ['emoji:🪀', 'emoji:🎙️'],
          say: 'Reporter question. Ask slowly: What games did you play when you were five? Listen, then stamp what you learned.',
          stickers: interviewStickers('games'),
        },
        {
          scene: ['emoji:🍲', 'emoji:🎙️'],
          say: 'Reporter question. Ask slowly: What food did you love when you were five? Listen, then stamp what you learned.',
          stickers: interviewStickers('food'),
        },
        {
          scene: ['emoji:🎒', 'emoji:🎙️'],
          say: 'Reporter question. Ask slowly: What was school like when you were five? Listen, then stamp what you learned.',
          stickers: interviewStickers('school'),
        },
      ],
    },
    {
      id: 'places',
      title: 'Where You Lived',
      prompt: 'Newsroom update! Ask a grown-up about places from long ago. Repeat each question slowly, then listen closely.',
      rounds: 2,
      endTitle: 'Places From Long Ago',
      cheer: 'Breaking news! You reported a home story and a journey story from long ago!',
      pages: [
        {
          scene: ['emoji:🏡', 'emoji:🎙️'],
          say: 'Reporter question. Ask slowly: What was your home like when you were five? Listen, then stamp what you learned.',
          stickers: interviewStickers('homes'),
        },
        {
          scene: ['emoji:🚂', 'emoji:🎙️'],
          say: 'Reporter question. Ask slowly: Where did you journey when you were little, and how did you get there? Listen, then stamp what you learned.',
          stickers: interviewStickers('journeys'),
        },
      ],
    },
  ],
};
