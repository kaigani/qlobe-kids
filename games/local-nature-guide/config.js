export default {
  id: 'local-nature-guide',
  engine: 'coach-timer',
  title: 'Local Nature Guide',
  splashEmoji: 'emoji:🌲',
  // Field Journal art world (docs/art-direction.md)
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  voice: {
    intro: 'Welcome, Nature Guide! Every tiny treasure has a story to share.',
    praise: 'Wonderful guide work. You noticed something special!',
    cheer: 'Tour complete! You are your family\'s nature guide!',
  },
  modes: [
    {
      id: 'collect',
      title: 'Guide Training',
      type: 'steps',
      praise: 'Wonderful guide work. You noticed something special!',
      cheer: 'Guide training complete! Your nature treasures are ready for a tour!',
      endTitle: 'Guide Training Complete',
      endArt: 'emoji:🌲',
      againLabel: 'TRAIN AGAIN',
      doneLabel: 'FOUND IT',
      steps: [
        {
          art: 'emoji:🌰',
          say: 'Find one fallen pinecone or seed thing. Collect only what nature has finished using.',
        },
        {
          art: 'emoji:🪨',
          say: 'Find one special rock. What makes it museum-grade to you?',
          timerSec: 90,
          after: 'Rock found! Carry your tiny treasure gently.',
        },
        {
          art: 'emoji:🍁',
          say: 'Find one interesting fallen leaf. Leave growing leaves on their plants.',
        },
        {
          art: 'emoji:🔍',
          say: 'Study each treasure like a nature guide. Feel it, smell it safely, and look very close.',
          timerSec: 60,
          after: 'Excellent observing! You know your treasures better now.',
        },
        {
          art: 'emoji:🗣️',
          say: 'Practice a guide sentence for each treasure. Say what it is, where it comes from, and what someone can notice.',
          timerSec: 90,
          after: 'Your guide voice is ready for visitors!',
        },
      ],
    },
    {
      id: 'tour',
      title: 'Give the Tour',
      type: 'steps',
      praise: 'Your visitor is learning from a real nature guide!',
      cheer: 'Magnificent tour! It is time for your guide badge ceremony!',
      endTitle: 'Official Nature Guide',
      endArt: 'emoji:🏅',
      againLabel: 'TOUR AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🧺',
          say: 'Arrange your nature museum on a cloth. Give every treasure a special place.',
        },
        {
          art: 'emoji:🎟️',
          say: 'Invite your visitor to the museum. Welcome them like a warm park ranger!',
        },
        {
          art: 'emoji:🎤',
          say: 'Present each treasure with your guide sentence. For example: This is a pinecone. It comes from a pine tree. Feel how bumpy!',
          timerSec: 120,
          after: 'What a tour! Every treasure got its museum moment.',
        },
        {
          art: 'emoji:❓',
          say: 'Ask your visitor for one question. It is okay to say, I do not know yet. Let us wonder together!',
        },
        {
          art: 'emoji:🏅',
          say: 'Guide badge ceremony! Ask your visitor to place an imaginary badge on your shirt and cheer, Nature Guide!',
        },
      ],
    },
  ],
};
