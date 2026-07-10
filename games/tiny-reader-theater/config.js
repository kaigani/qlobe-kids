let successLine = '';
const successLines = [];
Object.defineProperty(successLines, '0', {
  get() {
    return successLine || 'That belongs in the story!';
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
  id: 'tiny-reader-theater',
  engine: 'choose-one',
  title: 'Tiny Reader Theater',
  splashEmoji: '🎭',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Welcome to Tiny Reader Theater! Listen to the story line, then tap the word that belongs.',
    nudge: 'That word makes a funny story. Listen again and try another card.',
    cheer: 'Curtain call! Now act out one tiny story line.',
    yums: successLines,
  },
  modes: [
    {
      id: 'stories',
      title: 'Fill the Story',
      rounds: 5,
      items: [
        {
          say: 'The blank sat on the mat. Which word completes the story?',
          promptArt: 'shared:objects/cat.png',
          promptAlt: 'cat story card',
          answers: [
            answer('text:cat', 'cat', true, 'The cat sat on the mat. Now YOU sit like the cat!'),
            answer('text:sun', 'sun'),
            answer('text:bus', 'bus'),
          ],
        },
        {
          say: 'The blank is hot in the sky. Which word completes the story?',
          promptArt: 'shared:objects/sun.png',
          promptAlt: 'sun story card',
          answers: [
            answer('text:sun', 'sun', true, 'The sun is hot in the sky. Now YOU shine like the sun!'),
            answer('text:hat', 'hat'),
            answer('text:pig', 'pig'),
          ],
        },
        {
          say: 'The blank went down the road. Which word completes the story?',
          promptArt: 'shared:objects/bus.png',
          promptAlt: 'bus story card',
          answers: [
            answer('text:bus', 'bus', true, 'The bus went down the road. Now YOU roll like the bus!'),
            answer('text:dog', 'dog'),
            answer('text:hen', 'hen'),
          ],
        },
        {
          say: 'The blank ran in the mud. Which word completes the story?',
          promptArt: 'shared:objects/dog.png',
          promptAlt: 'dog story card',
          answers: [
            answer('text:dog', 'dog', true, 'The dog ran in the mud. Now YOU stomp like the big dog!'),
            answer('text:fox', 'fox'),
            answer('text:hat', 'hat'),
          ],
        },
        {
          say: 'The blank sat on my head. Which word completes the story?',
          promptArt: 'shared:objects/hat.png',
          promptAlt: 'hat story card',
          answers: [
            answer('text:hat', 'hat', true, 'The hat sat on my head. Now YOU tip your fancy hat!'),
            answer('text:mud', 'mud'),
            answer('text:cat', 'cat'),
          ],
        },
      ],
    },
    {
      id: 'act',
      title: 'Act It Out',
      rounds: 4,
      items: [
        {
          say: 'Who stomped through the mud? Pick who to act out.',
          promptArt: 'shared:objects/mud.png',
          promptAlt: 'mud action card',
          answers: [
            answer('emoji:🐕', 'big dog', true, 'The big dog stomped through the mud. Now YOU stomp like the big dog!'),
            answer('emoji:🐟', 'fish'),
            answer('emoji:🦋', 'butterfly'),
          ],
        },
        {
          say: 'Who tiptoed past the sleeping cat? Pick who to act out.',
          promptArt: 'shared:objects/cat.png',
          promptAlt: 'sleeping cat action card',
          answers: [
            answer('emoji:🦊', 'fox', true, 'The fox tiptoed past the sleeping cat. Now YOU tiptoe like the fox!'),
            answer('emoji:🐄', 'cow'),
            answer('emoji:🚂', 'train'),
          ],
        },
        {
          say: 'Who flapped up to the red bus? Pick who to act out.',
          promptArt: 'shared:objects/bus.png',
          promptAlt: 'bus action card',
          answers: [
            answer('emoji:🐔', 'hen', true, 'The hen flapped up to the red bus. Now YOU flap like the hen!'),
            answer('emoji:🐌', 'snail'),
            answer('emoji:🧸', 'teddy bear'),
          ],
        },
        {
          say: 'Who splashed in the sunny puddle? Pick who to act out.',
          promptArt: 'shared:objects/sun.png',
          promptAlt: 'sunny puddle action card',
          answers: [
            answer('emoji:🐷', 'pig', true, 'The pig splashed in the sunny puddle. Now YOU splash like the pig!'),
            answer('emoji:👑', 'crown'),
            answer('emoji:🚌', 'bus'),
          ],
        },
      ],
    },
  ],
};
