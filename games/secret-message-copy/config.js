export default {
  id: 'secret-message-copy',
  engine: 'build-assemble',
  title: 'Secret Message Copy',
  splashEmoji: '🕵️‍♀️',
  voice: {
    intro: 'A secret message arrived. Copy the code!',
    nudge: 'That letter goes in another spot. Try again.',
    wait: 'Copy the code from left to right.',
    cheer: 'All the secret messages are sent!',
  },
  modes: [
    {
      id: 'secret',
      title: 'Copy the Code',
      rounds: 5,
      prompt: 'Copy the secret code. Start at the left.',
      builds: [
        messageBuild('CAT', 'C, A, T. Cat! Message sent!'),
        messageBuild('SUN', 'S, U, N. Sun! Message sent!'),
        messageBuild('DOG', 'D, O, G. Dog! Message sent!'),
        messageBuild('HAT', 'H, A, T. Hat! Message sent!'),
        messageBuild('BUS', 'B, U, S. Bus! Message sent!'),
      ],
    },
    {
      id: 'long',
      title: 'Longer Codes',
      rounds: 3,
      prompt: 'Copy the longer code. One letter at a time.',
      builds: [
        messageBuild('FROG', 'F, R, O, G. Frog! Message sent!'),
        messageBuild('CAKE', 'C, A, K, E. Cake! Message sent!'),
        messageBuild('FISH', 'F, I, S, H. Fish! Message sent!'),
      ],
    },
  ],
};

function messageBuild(word, say) {
  const letters = word.split('');
  const spacing = letters.length === 3 ? 180 : 150;
  const startX = 500 - ((letters.length - 1) * spacing) / 2;

  return {
    name: `${word.toLowerCase()}-message`,
    ordered: true,
    say,
    parts: letters.map((letter, index) => ({
      art: `text:${letter}`,
      alt: `${letter} code letter`,
      say: letterName(letter),
      x: startX + index * spacing,
      y: 500,
      size: 160,
    })),
  };
}

function letterName(letter) {
  return {
    A: 'A',
    B: 'B',
    C: 'C',
    D: 'D',
    E: 'E',
    F: 'F',
    G: 'G',
    H: 'H',
    I: 'I',
    K: 'K',
    N: 'N',
    O: 'O',
    R: 'R',
    S: 'S',
    T: 'T',
    U: 'U',
  }[letter] || letter;
}
