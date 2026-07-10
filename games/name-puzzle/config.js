export default {
  id: 'name-puzzle',
  engine: 'sequence-order',
  title: 'Name Puzzle',
  splashEmoji: '🧩',
  voice: {
    intro: 'The names are jumbled! Put the letters in order.',
    nudge: 'Almost. Try another spot for that letter.',
    cheer: 'You fixed the names!',
    yums: [
      'Nice letter work!',
      'That letter fits!',
      'You are building the name!',
    ],
  },
  modes: [
    {
      id: 'friends',
      title: 'Fix the Names',
      rounds: 5,
      prompt: 'Can you fix the name?',
      sets: [
        {
          prompt: 'Can you fix Maya\'s name?',
          say: 'M-A-Y-A. Maya!',
          items: [
            { art: 'text:M', alt: 'M' },
            { art: 'text:A', alt: 'A' },
            { art: 'text:Y', alt: 'Y' },
            { art: 'text:A', alt: 'A' },
          ],
        },
        {
          prompt: 'Can you fix Leo\'s name?',
          say: 'L-E-O. Leo!',
          items: [
            { art: 'text:L', alt: 'L' },
            { art: 'text:E', alt: 'E' },
            { art: 'text:O', alt: 'O' },
          ],
        },
        {
          prompt: 'Can you fix Nia\'s name?',
          say: 'N-I-A. Nia!',
          items: [
            { art: 'text:N', alt: 'N' },
            { art: 'text:I', alt: 'I' },
            { art: 'text:A', alt: 'A' },
          ],
        },
        {
          prompt: 'Can you fix Sam\'s name?',
          say: 'S-A-M. Sam!',
          items: [
            { art: 'text:S', alt: 'S' },
            { art: 'text:A', alt: 'A' },
            { art: 'text:M', alt: 'M' },
          ],
        },
        {
          prompt: 'Can you fix Ravi\'s name?',
          say: 'R-A-V-I. Ravi!',
          items: [
            { art: 'text:R', alt: 'R' },
            { art: 'text:A', alt: 'A' },
            { art: 'text:V', alt: 'V' },
            { art: 'text:I', alt: 'I' },
          ],
        },
      ],
    },
    {
      id: 'words',
      title: 'Fix the Words',
      rounds: 4,
      difficultyRamp: true,
      prompt: 'Can you fix the word?',
      sets: [
        {
          say: 'C-A-T. Cat!',
          items: [
            { art: 'text:C', alt: 'C' },
            { art: 'text:A', alt: 'A' },
            { art: 'text:T', alt: 'T' },
          ],
        },
        {
          say: 'S-U-N. Sun!',
          items: [
            { art: 'text:S', alt: 'S' },
            { art: 'text:U', alt: 'U' },
            { art: 'text:N', alt: 'N' },
          ],
        },
        {
          say: 'D-O-G. Dog!',
          items: [
            { art: 'text:D', alt: 'D' },
            { art: 'text:O', alt: 'O' },
            { art: 'text:G', alt: 'G' },
          ],
        },
        {
          say: 'B-U-S. Bus!',
          items: [
            { art: 'text:B', alt: 'B' },
            { art: 'text:U', alt: 'U' },
            { art: 'text:S', alt: 'S' },
          ],
        },
      ],
    },
  ],
};
