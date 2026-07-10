let successLine = '';
const successLines = [];
Object.defineProperty(successLines, '0', {
  get() {
    return successLine || 'Now retell it your way with a real toy!';
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
  id: 'puppet-retell',
  engine: 'choose-one',
  title: 'Puppet Retell',
  splashEmoji: '🧸',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'The puppets mixed up the story! Listen, then tap what really happened.',
    nudge: 'That is a funny puppet mix-up. Listen again and fix the story.',
    cheer: 'The puppets remember now! Retell it your way with a real toy.',
    yums: successLines,
  },
  modes: [
    {
      id: 'fix',
      title: 'Fix the Story',
      rounds: 5,
      items: [
        {
          say: 'The puppet said Goldilocks ate the three chairs. What really happened?',
          promptArt: 'emoji:👧',
          promptAlt: 'goldilocks puppet card',
          answers: [
            answer('emoji:🥣', 'ate porridge', true, 'Yes. Goldilocks ate the porridge. Now retell it your way with a real toy!'),
            answer('emoji:🪑', 'ate chairs'),
            answer('emoji:🚲', 'rode a bicycle'),
          ],
        },
        {
          say: 'The puppet said the three pigs built houses from clouds. What really happened?',
          promptArt: 'shared:objects/pig.png',
          promptAlt: 'three pigs puppet card',
          answers: [
            answer('emoji:🧱', 'brick house', true, 'Yes. The pigs built houses, and the strongest one was brick. Now retell it your way!'),
            answer('emoji:☁️', 'cloud house'),
            answer('emoji:🍦', 'ice cream house'),
          ],
        },
        {
          say: 'The puppet said Red Riding Hood visited a dragon. What really happened?',
          promptArt: 'emoji:🧺',
          promptAlt: 'red riding hood puppet card',
          answers: [
            answer('emoji:🐺', 'wolf', true, 'Yes. Red Riding Hood met the wolf. Now retell it your way with a real toy!'),
            answer('emoji:🐉', 'dragon'),
            answer('emoji:🚀', 'rocket'),
          ],
        },
        {
          say: 'The puppet said the Gingerbread Man slowly took a nap. What really happened?',
          promptArt: 'emoji:🍪',
          promptAlt: 'gingerbread puppet card',
          answers: [
            answer('emoji:🏃', 'ran away', true, 'Yes. The Gingerbread Man ran away. Now retell it your way!'),
            answer('emoji:😴', 'took a nap'),
            answer('emoji:🎺', 'played trumpet'),
          ],
        },
        {
          say: 'The puppet said Baby Bear found a giant shoe in his chair. What really happened?',
          promptArt: 'emoji:🐻',
          promptAlt: 'three bears puppet card',
          answers: [
            answer('emoji:👧', 'found Goldilocks', true, 'Yes. Baby Bear found Goldilocks. Now retell it your way with a real toy!'),
            answer('emoji:👟', 'found a shoe'),
            answer('emoji:🐠', 'found a fish'),
          ],
        },
      ],
    },
    {
      id: 'who',
      title: "Whose Line?",
      rounds: 4,
      items: [
        {
          say: "Who said, I'll huff and I'll puff?",
          promptArt: 'emoji:💨',
          promptAlt: 'huff and puff line',
          answers: [
            answer('emoji:🐺', 'wolf', true, "Yes. The wolf said, I'll huff and I'll puff. Now say it in your puppet voice!"),
            answer('emoji:🐷', 'pig'),
            answer('emoji:👵', 'grandma'),
          ],
        },
        {
          say: 'Who said, run, run, as fast as you can?',
          promptArt: 'emoji:🏃',
          promptAlt: 'running line',
          answers: [
            answer('emoji:🍪', 'gingerbread man', true, 'Yes. The Gingerbread Man said, run, run, as fast as you can! Now say it in your puppet voice!'),
            answer('emoji:🐻', 'bear'),
            answer('emoji:🐔', 'chicken'),
          ],
        },
        {
          say: 'Who said, someone has been sitting in my chair?',
          promptArt: 'emoji:🪑',
          promptAlt: 'chair line',
          answers: [
            answer('emoji:🐻', 'bear', true, 'Yes. A bear said, someone has been sitting in my chair. Now say it in your puppet voice!'),
            answer('emoji:🐺', 'wolf'),
            answer('emoji:🧙', 'witch'),
          ],
        },
        {
          say: 'Who carried a basket through the woods?',
          promptArt: 'emoji:🧺',
          promptAlt: 'basket line',
          answers: [
            answer('emoji:👧', 'red riding hood', true, 'Yes. Red Riding Hood carried the basket through the woods. Now retell it your way!'),
            answer('emoji:🐷', 'pig'),
            answer('emoji:🍪', 'gingerbread man'),
          ],
        },
      ],
    },
  ],
};
