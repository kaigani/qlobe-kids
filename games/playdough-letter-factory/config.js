export default {
  id: 'playdough-letter-factory',
  engine: 'build-assemble',
  title: 'Playdough Letter Factory',
  splashEmoji: '🟣',
  voice: {
    intro: 'Squish the dough pieces onto the ghost spots.',
    nudge: 'That dough piece has another spot. Try again.',
    wait: 'Pick the next squishy piece.',
    cheer: 'The letter factory is full of squishy letters!',
  },
  modes: [
    {
      id: 'letters',
      title: 'Squish a Letter',
      rounds: 4,
      prompt: 'Build the letter with playdough parts.',
      builds: [
        build('letter-l', 'A tall snake and a sleeping snake. You made L!', [
          dough('emoji:▮', 'tall purple snake for L', 'a big snake for the back', 'l-back', 430, 500, 300),
          dough('emoji:➖', 'bottom purple snake for L', 'a sleeping snake for the bottom', 'l-bottom', 560, 665, 270),
        ]),
        build('letter-o', 'Two soft curves make a round O!', [
          dough('emoji:◖', 'left orange curve for O', 'left curve', 'o-left', 440, 505, 285),
          dough('emoji:◗', 'right orange curve for O', 'right curve', 'o-right', 560, 505, 285),
        ]),
        build('letter-t', 'A sleeping snake and a tall snake. You made T!', [
          dough('emoji:➖', 'top purple snake for T', 'top snake', 't-top', 500, 340, 315),
          dough('emoji:▮', 'middle purple snake for T', 'down snake', 't-stem', 500, 535, 330),
        ]),
        build('letter-b', 'A big snake for the back, two little curves for the tummy. You made B!', [
          dough('emoji:▮', 'back purple snake for B', 'big snake for the back', 'b-back', 395, 505, 350),
          dough('emoji:◜', 'top purple curve for B', 'little curve for the top tummy', 'b-top', 545, 425, 215),
          dough('emoji:◟', 'bottom purple curve for B', 'little curve for the bottom tummy', 'b-bottom', 545, 585, 215),
        ]),
      ],
    },
    {
      id: 'numbers',
      title: 'Squish a Number',
      rounds: 3,
      prompt: 'Build the number with playdough parts.',
      builds: [
        build('number-one', 'A tiny cap and a tall snake. You made one!', [
          dough('emoji:➖', 'small top snake for one', 'little cap', 'one-cap', 455, 330, 175),
          dough('emoji:▮', 'tall purple snake for one', 'tall snake', 'one-stem', 500, 525, 340),
        ]),
        build('number-seven', 'Top snake, slanty snake. You made seven!', [
          dough('emoji:➖', 'top purple snake for seven', 'top snake', 'seven-top', 500, 335, 320),
          dough('emoji:╲', 'slant purple snake for seven', 'slanty snake', 'seven-slant', 548, 525, 340),
        ]),
        build('number-zero', 'Two soft curves make a round zero!', [
          dough('emoji:◖', 'left orange curve for zero', 'left curve', 'zero-left', 440, 505, 285),
          dough('emoji:◗', 'right orange curve for zero', 'right curve', 'zero-right', 560, 505, 285),
        ]),
      ],
    },
  ],
};

function build(name, say, parts) {
  return { name, say, ordered: true, parts };
}

function dough(art, alt, say, matchKey, x, y, size) {
  return { art, alt, say, matchKey, x, y, size };
}
