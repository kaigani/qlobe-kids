export default {
  id: 'clay-creature-studio',
  engine: 'build-assemble',
  title: 'Clay Creature Studio',
  splashEmoji: '🐲',
  voice: {
    intro: 'Squish the clay parts onto the ghost spots. Build a creature!',
    nudge: 'That clay part has another spot. Try again.',
    wait: 'Pick the next clay part.',
    cheer: 'Your clay creatures are ready. Squish a real one later!',
  },
  modes: [
    {
      id: 'creatures',
      title: 'Build a Creature',
      rounds: 4,
      prompt: 'Build the creature from clay parts.',
      builds: [
        build('monster', 'Your monster squeaks: meep meep!', [
          part('emoji:🟢', 'squishy monster body', 'squishy green body', 500, 535, 270),
          part('emoji:👀', 'monster googly eyes', 'googly eyes', 500, 420, 120),
          part('emoji:🦶', 'monster left foot', 'left foot', 420, 695, 120),
          part('emoji:🦶', 'monster right foot', 'right foot', 580, 695, 120),
        ]),
        build('dragon', 'Your dragon roars: raaaar!', [
          part('emoji:🟢', 'dragon clay body', 'dragon body', 500, 545, 265),
          part('emoji:👀', 'dragon googly eyes', 'googly eyes', 500, 420, 115),
          part('emoji:🔺', 'dragon top spike', 'top spike', 500, 300, 105),
          part('emoji:🔺', 'dragon left spike', 'left spike', 385, 350, 95),
          part('emoji:🔺', 'dragon right spike', 'right spike', 615, 350, 95),
          part('emoji:🦶', 'dragon stompy feet', 'stompy feet', 500, 720, 130),
        ]),
        build('caterpillar', 'Your caterpillar says wiggle wiggle!', [
          part('emoji:🟢', 'caterpillar first clay ball', 'first clay ball', 315, 555, 150),
          part('emoji:🟢', 'caterpillar second clay ball', 'second clay ball', 445, 555, 150),
          part('emoji:🟢', 'caterpillar third clay ball', 'third clay ball', 575, 555, 150),
          part('emoji:🟢', 'caterpillar fourth clay ball', 'fourth clay ball', 705, 555, 150),
          part('emoji:👀', 'caterpillar googly eyes', 'googly eyes', 255, 485, 105),
        ]),
        build('bird', 'Your clay bird chirps: cheep cheep!', [
          part('emoji:🟣', 'round bird body', 'round bird body', 500, 535, 250),
          part('emoji:👀', 'bird googly eyes', 'googly eyes', 500, 425, 112),
          part('emoji:🔺', 'bird beak', 'tiny beak', 500, 500, 100),
          part('emoji:🪽', 'left clay wing', 'left wing', 365, 545, 125),
          part('emoji:🪽', 'right clay wing', 'right wing', 635, 545, 125),
          part('emoji:🦶', 'bird little feet', 'little feet', 500, 705, 120),
        ]),
      ],
    },
    {
      id: 'silly',
      title: 'Mix-Up Creatures',
      rounds: 3,
      prompt: 'Build a mixed-up creature.',
      builds: [
        build('dragon-duck', 'A DRAGON-DUCK! It quacks a tiny roar!', [
          part('emoji:🟢', 'dragon duck body', 'dragon body', 500, 530, 255),
          part('emoji:👀', 'dragon duck eyes', 'googly eyes', 500, 420, 110),
          part('emoji:🔺', 'dragon duck spike', 'dragon spike', 500, 300, 100),
          part('emoji:🦆', 'duck feet for dragon', 'duck feet', 500, 715, 135),
        ]),
        build('monster-bird', 'A MONSTER-BIRD! It squeaks and flaps!', [
          part('emoji:🟢', 'monster bird body', 'monster body', 500, 540, 270),
          part('emoji:👀', 'monster bird eyes', 'googly eyes', 500, 425, 115),
          part('emoji:🪽', 'monster bird left wing', 'left bird wing', 365, 545, 130),
          part('emoji:🪽', 'monster bird right wing', 'right bird wing', 635, 545, 130),
          part('emoji:🔺', 'monster bird beak horn', 'beak horn', 500, 305, 100),
        ]),
        build('caterpillar-dragon', 'A CATERPILLAR-DRAGON! Wiggle roar!', [
          part('emoji:🟢', 'first caterdragon clay ball', 'first clay ball', 345, 555, 145),
          part('emoji:🟢', 'second caterdragon clay ball', 'second clay ball', 475, 555, 145),
          part('emoji:🟢', 'third caterdragon clay ball', 'third clay ball', 605, 555, 145),
          part('emoji:👀', 'caterdragon eyes', 'googly eyes', 285, 485, 105),
          part('emoji:🔺', 'caterdragon spike', 'dragon spike', 690, 475, 100),
          part('emoji:🦶', 'caterdragon little feet', 'little feet', 500, 705, 120),
        ]),
      ],
    },
  ],
};

function build(name, say, parts) {
  return { name, say, parts };
}

function part(art, alt, say, x, y, size) {
  return { art, alt, say, x, y, size };
}
