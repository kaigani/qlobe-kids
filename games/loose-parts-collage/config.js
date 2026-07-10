export default {
  id: 'loose-parts-collage',
  engine: 'build-assemble',
  title: 'Loose Parts Collage',
  splashEmoji: '🍂',
  voice: {
    intro: 'Place the loose parts on the ghost spots. Make nature art!',
    nudge: 'That loose part has another spot. Try again.',
    wait: 'Pick the next loose part.',
    cheer: 'Your loose-parts art is complete. Hunt for real parts later!',
  },
  modes: [
    {
      id: 'nature',
      title: 'Nature Pictures',
      rounds: 4,
      prompt: 'Make a picture from loose parts.',
      builds: [
        build('leaf-sun', 'A leaf-ray sun! Warm and bright!', [
          part('emoji:🟡', 'round sun center', 'sun center', 500, 500, 170),
          part('emoji:🍃', 'top leaf ray', 'top leaf ray', 500, 295, 105),
          part('emoji:🍃', 'left leaf ray', 'left leaf ray', 315, 500, 105),
          part('emoji:🍃', 'right leaf ray', 'right leaf ray', 685, 500, 105),
          part('emoji:🍃', 'bottom leaf ray', 'bottom leaf ray', 500, 705, 105),
          part('emoji:🍃', 'corner leaf ray', 'corner leaf ray', 635, 355, 95),
        ]),
        build('button-flower', 'A button flower! Petals all around!', [
          part('emoji:🔘', 'top button petal', 'top button petal', 500, 335, 120),
          part('emoji:🔘', 'left button petal', 'left button petal', 385, 430, 120),
          part('emoji:🔘', 'right button petal', 'right button petal', 615, 430, 120),
          part('emoji:🟡', 'flower button center', 'flower center', 500, 430, 120),
          part('emoji:🟢', 'green loose stem', 'green stem', 500, 640, 170),
          part('emoji:🍃', 'leaf on stem', 'stem leaf', 610, 610, 100),
        ]),
        build('yarn-rainbow', 'A yarn rainbow! Color curves!', [
          part('emoji:🧶', 'red yarn arc', 'red yarn arc', 500, 345, 210),
          part('emoji:🧶', 'yellow yarn arc', 'yellow yarn arc', 500, 455, 195),
          part('emoji:🧶', 'blue yarn arc', 'blue yarn arc', 500, 565, 180),
          part('emoji:☁️', 'left cotton cloud', 'left cloud', 340, 705, 145),
          part('emoji:☁️', 'right cotton cloud', 'right cloud', 660, 705, 145),
        ]),
        build('pinecone-owl', 'A pinecone owl! Hoo hoo!', [
          part('emoji:🌰', 'pinecone owl body', 'pinecone body', 500, 560, 265),
          part('emoji:👀', 'owl button eyes', 'button eyes', 500, 435, 120),
          part('emoji:🔺', 'tiny seed beak', 'tiny seed beak', 500, 520, 92),
          part('emoji:🍃', 'left leaf wing', 'left leaf wing', 365, 560, 115),
          part('emoji:🍃', 'right leaf wing', 'right leaf wing', 635, 560, 115),
          part('emoji:🟫', 'twig feet', 'twig feet', 500, 730, 115),
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
