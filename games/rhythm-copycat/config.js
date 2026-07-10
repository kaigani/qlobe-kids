export default {
  id: 'rhythm-copycat',
  engine: 'pattern-continue',
  title: 'Rhythm Copycat',
  splashEmoji: '👏',
  voice: {
    intro: 'Copy the rhythm pattern.',
    nudge: 'Listen to the beat. Which sound comes next?',
    cheer: 'You copied the rhythms!',
    yums: [
      'Now do the pattern with your body!',
    ],
  },
  modes: [
    {
      id: 'copycat',
      title: 'Clap and Stomp',
      rounds: 5,
      difficultyRamp: true,
      prompt: 'What body beat comes next? Watch and listen!',
      rounds_spec: [
        {
          pattern: ['clap', 'stomp', 'clap', 'stomp', 'clap'],
          missing: 1,
          units: {
            clap: { art: 'emoji:👏', alt: 'clap hands', say: 'clap!', sfx: 'pop' },
            stomp: { art: 'emoji:🦶', alt: 'stomp foot', say: 'stomp!', sfx: 'boing' },
            pat: { art: 'emoji:🙌', alt: 'pat hands', say: 'pat!', sfx: 'tick' },
          },
          candidates: ['clap', 'stomp', 'pat'],
        },
        {
          pattern: ['stomp', 'clap', 'stomp', 'clap', 'stomp', 'clap'],
          missing: 1,
          units: {
            stomp: { art: 'emoji:🦶', alt: 'stomp foot', say: 'stomp!', sfx: 'boing' },
            clap: { art: 'emoji:👏', alt: 'clap hands', say: 'clap!', sfx: 'pop' },
            pat: { art: 'emoji:🙌', alt: 'pat hands', say: 'pat!', sfx: 'tick' },
          },
          candidates: ['stomp', 'clap', 'pat'],
        },
        {
          pattern: ['clap', 'stomp', 'pat', 'clap', 'stomp', 'pat', 'clap'],
          missing: 1,
          units: {
            clap: { art: 'emoji:👏', alt: 'clap hands', say: 'clap!', sfx: 'pop' },
            stomp: { art: 'emoji:🦶', alt: 'stomp foot', say: 'stomp!', sfx: 'boing' },
            pat: { art: 'emoji:🙌', alt: 'pat hands', say: 'pat!', sfx: 'tick' },
          },
          candidates: ['clap', 'stomp', 'pat'],
        },
        {
          pattern: ['pat', 'clap', 'stomp', 'pat', 'clap', 'stomp', 'pat'],
          missing: 1,
          units: {
            pat: { art: 'emoji:🙌', alt: 'pat hands', say: 'pat!', sfx: 'tick' },
            clap: { art: 'emoji:👏', alt: 'clap hands', say: 'clap!', sfx: 'pop' },
            stomp: { art: 'emoji:🦶', alt: 'stomp foot', say: 'stomp!', sfx: 'boing' },
          },
          candidates: ['pat', 'clap', 'stomp'],
        },
        {
          pattern: ['clap', 'pat', 'stomp', 'clap', 'pat', 'stomp', 'clap'],
          missing: 1,
          units: {
            clap: { art: 'emoji:👏', alt: 'clap hands', say: 'clap!', sfx: 'pop' },
            pat: { art: 'emoji:🙌', alt: 'pat hands', say: 'pat!', sfx: 'tick' },
            stomp: { art: 'emoji:🦶', alt: 'stomp foot', say: 'stomp!', sfx: 'boing' },
          },
          candidates: ['clap', 'pat', 'stomp'],
        },
      ],
    },
    {
      id: 'animals',
      title: 'Animal Beats',
      rounds: 4,
      prompt: 'What animal beat comes next? Watch and listen!',
      rounds_spec: [
        {
          pattern: ['frog', 'bird', 'frog', 'bird', 'frog'],
          missing: 1,
          units: {
            frog: { art: 'emoji:🐸', alt: 'frog beat', say: 'ribbit!', sfx: 'silly' },
            bird: { art: 'emoji:🐦', alt: 'bird beat', say: 'tweet!', sfx: 'sparkle' },
            lion: { art: 'emoji:🦁', alt: 'lion beat', say: 'roar!', sfx: 'whoosh' },
          },
          candidates: ['frog', 'bird', 'lion'],
        },
        {
          pattern: ['lion', 'frog', 'lion', 'frog', 'lion', 'frog'],
          missing: 1,
          units: {
            lion: { art: 'emoji:🦁', alt: 'lion beat', say: 'roar!', sfx: 'whoosh' },
            frog: { art: 'emoji:🐸', alt: 'frog beat', say: 'ribbit!', sfx: 'silly' },
            bird: { art: 'emoji:🐦', alt: 'bird beat', say: 'tweet!', sfx: 'sparkle' },
          },
          candidates: ['lion', 'frog', 'bird'],
        },
        {
          pattern: ['frog', 'bird', 'lion', 'frog', 'bird', 'lion', 'frog'],
          missing: 1,
          units: {
            frog: { art: 'emoji:🐸', alt: 'frog beat', say: 'ribbit!', sfx: 'silly' },
            bird: { art: 'emoji:🐦', alt: 'bird beat', say: 'tweet!', sfx: 'sparkle' },
            lion: { art: 'emoji:🦁', alt: 'lion beat', say: 'roar!', sfx: 'whoosh' },
          },
          candidates: ['frog', 'bird', 'lion'],
        },
        {
          pattern: ['bird', 'lion', 'frog', 'bird', 'lion', 'frog', 'bird'],
          missing: 1,
          units: {
            bird: { art: 'emoji:🐦', alt: 'bird beat', say: 'tweet!', sfx: 'sparkle' },
            lion: { art: 'emoji:🦁', alt: 'lion beat', say: 'roar!', sfx: 'whoosh' },
            frog: { art: 'emoji:🐸', alt: 'frog beat', say: 'ribbit!', sfx: 'silly' },
          },
          candidates: ['bird', 'lion', 'frog'],
        },
      ],
    },
  ],
};
