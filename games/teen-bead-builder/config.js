const NUMBER_WORDS = {
  11: 'eleven',
  12: 'twelve',
  13: 'thirteen',
  14: 'fourteen',
  15: 'fifteen',
};

export default {
  id: 'teen-bead-builder',
  engine: 'build-assemble',
  title: 'Teen Bead Builder',
  splashEmoji: '🔟',
  voice: {
    intro: 'A ten bar and some ones make a teen number.',
    nudge: 'That bead has another spot. Try again.',
    wait: 'Pick a golden bead or the number card.',
    cheer: 'You built the teen numbers!',
  },
  modes: [
    {
      id: 'teens',
      title: 'Build a Teen',
      rounds: 5,
      prompt: 'Put the ten bar with the ones to make a teen.',
      builds: [
        teenBuild(11),
        teenBuild(13),
        teenBuild(15),
        teenBuild(12),
        teenBuild(14),
      ],
    },
  ],
};

function teenBuild(number) {
  const ones = number - 10;
  const parts = [
    {
      art: 'emoji:🟨',
      alt: `golden ten bar for ${number}`,
      say: 'ten',
      matchKey: 'ten-bar',
      x: 300,
      y: 510,
      size: 280,
    },
  ];

  for (let i = 0; i < ones; i++) {
    parts.push({
      art: 'emoji:🟡',
      alt: `golden one bead ${i + 1} for ${number}`,
      say: 'one more',
      matchKey: 'one-bead',
      x: 505 + (i % 3) * 105,
      y: 455 + Math.floor(i / 3) * 120,
      size: 105,
    });
  }

  parts.push({
    art: `text:${number}`,
    alt: `number card ${number}`,
    say: NUMBER_WORDS[number],
    matchKey: `card-${number}`,
    x: 785,
    y: 510,
    size: 165,
  });

  return {
    name: `teen-${number}`,
    say: `Ten and ${ones} more. ${NUMBER_WORDS[number]}!`,
    ordered: false,
    parts,
  };
}
