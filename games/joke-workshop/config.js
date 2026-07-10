let successLine = '';
const successLines = [];
Object.defineProperty(successLines, '0', {
  get() {
    return successLine || 'That joke landed!';
  },
});

const answer = (art, alt, correct = false, line = '') => {
  const card = { art, alt };
  if (correct) {
    // choose-one supports mode-level praise; this getter keeps the game data
    // round-specific without changing the shared engine.
    Object.defineProperty(card, 'correct', {
      enumerable: true,
      get() {
        successLine = line;
        return true;
      },
    });
  }
  return card;
};

export default {
  id: 'joke-workshop',
  engine: 'choose-one',
  title: 'Joke Workshop',
  splashEmoji: '🤡',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Welcome to Joke Workshop! Listen to the joke setup, then tap the picture punchline.',
    nudge: "Hmm, that's not it - but it IS silly! Listen again.",
    cheer: 'The joke workshop is roaring! Tell one of these jokes to someone nearby.',
    yums: successLines,
  },
  modes: [
    {
      id: 'jokes',
      title: 'Finish the Joke',
      rounds: 5,
      items: [
        {
          say: 'Why did the banana go to the doctor? Pick the punchline picture.',
          promptArt: 'emoji:🍌',
          promptAlt: 'banana joke card',
          answers: [
            answer('emoji:🍌🩹', 'banana with a bandage', true, 'Why did the banana go to the doctor? Because it was not peeling well!'),
            answer('emoji:🚲', 'bicycle'),
            answer('emoji:🌧️', 'rain cloud'),
          ],
        },
        {
          say: 'What do you call a cow with no legs? Pick the punchline picture.',
          promptArt: 'emoji:🐄',
          promptAlt: 'cow joke card',
          answers: [
            answer('emoji:🐄', 'cow on the ground', true, 'What do you call a cow with no legs? Ground beef!'),
            answer('emoji:🚀', 'rocket'),
            answer('emoji:🎩', 'top hat'),
          ],
        },
        {
          say: 'Why did the chicken cross the road? Pick the punchline picture.',
          promptArt: 'emoji:🐔',
          promptAlt: 'chicken joke card',
          answers: [
            answer('emoji:🐔🛣️', 'chicken and road', true, 'Why did the chicken cross the road? To get to the other side!'),
            answer('emoji:🛁', 'bathtub'),
            answer('emoji:🎺', 'trumpet'),
          ],
        },
        {
          say: 'What do you call cheese that is not yours? Pick the punchline picture.',
          promptArt: 'emoji:🧀',
          promptAlt: 'cheese joke card',
          answers: [
            answer('emoji:🧀', 'nacho cheese', true, 'What do you call cheese that is not yours? Nacho cheese!'),
            answer('emoji:🧦', 'sock'),
            answer('emoji:🪁', 'kite'),
          ],
        },
        {
          say: 'Why did the scarecrow win an award? Pick the punchline picture.',
          promptArt: 'emoji:🌾',
          promptAlt: 'scarecrow joke card',
          answers: [
            answer('emoji:🌾', 'field', true, 'Why did the scarecrow win an award? Because he was outstanding in his field!'),
            answer('emoji:🐟', 'fish'),
            answer('emoji:🛌', 'bed'),
          ],
        },
      ],
    },
    {
      id: 'knock',
      title: 'Knock Knock',
      rounds: 4,
      items: [
        {
          say: 'Knock knock. Who is there? Lettuce. Lettuce who? Pick the picture for let us in!',
          promptArt: 'emoji:🚪',
          promptAlt: 'door joke card',
          answers: [
            answer('emoji:🥬🚪', 'lettuce at the door', true, 'Knock knock. Who is there? Lettuce. Lettuce who? Lettuce in!'),
            answer('emoji:🐘', 'elephant'),
            answer('emoji:🛼', 'skate'),
          ],
        },
        {
          say: 'Knock knock. Who is there? Boo. Boo who? Pick the picture for do not cry!',
          promptArt: 'emoji:🚪',
          promptAlt: 'door joke card',
          answers: [
            answer('emoji:👻😢', 'boo hoo ghost', true, 'Knock knock. Who is there? Boo. Boo who? Do not cry, it is only a joke!'),
            answer('emoji:🍕', 'pizza'),
            answer('emoji:🌳', 'tree'),
          ],
        },
        {
          say: 'Knock knock. Who is there? Cow says. Cow says who? Pick the picture for no, a cow says moo!',
          promptArt: 'emoji:🚪',
          promptAlt: 'door joke card',
          answers: [
            answer('emoji:🐄💬', 'cow saying moo', true, 'Knock knock. Who is there? Cow says. Cow says who? No, a cow says moo!'),
            answer('emoji:🚗', 'car'),
            answer('emoji:🎂', 'cake'),
          ],
        },
        {
          say: 'Knock knock. Who is there? Olive. Olive who? Pick the picture for I love you!',
          promptArt: 'emoji:🚪',
          promptAlt: 'door joke card',
          answers: [
            answer('emoji:🫒❤️', 'olive love', true, 'Knock knock. Who is there? Olive. Olive who? Olive you!'),
            answer('emoji:🪑', 'chair'),
            answer('emoji:🧤', 'mitten'),
          ],
        },
      ],
    },
  ],
};
