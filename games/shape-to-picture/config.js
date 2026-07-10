export default {
  id: 'shape-to-picture',
  engine: 'build-assemble',
  title: 'Shape-to-Picture Challenge',
  splashEmoji: '🖼️',
  voice: {
    intro: 'Put the shapes on the ghost spots. Watch the picture appear.',
    nudge: 'That shape has another spot. Try again.',
    wait: 'Pick the next shape.',
    cheer: 'Your shape pictures are complete!',
  },
  modes: [
    {
      id: 'pictures',
      title: 'Shape Pictures',
      rounds: 4,
      prompt: 'Build the picture from shapes.',
      builds: [
        build('caterpillar', 'The circles became a caterpillar!', [
          part('emoji:🟢', 'first green circle', 'circle', 300, 520, 145),
          part('emoji:🟢', 'second green circle', 'circle', 430, 520, 145),
          part('emoji:🟢', 'third green circle', 'circle', 560, 520, 145),
          part('emoji:🟢', 'fourth green circle', 'circle', 690, 520, 145),
          part('emoji:👀', 'caterpillar eyes', 'eyes', 248, 460, 105),
        ]),
        build('sailboat', 'The shapes became a sailboat!', [
          part('emoji:🔺', 'left sail triangle', 'triangle', 440, 410, 190),
          part('emoji:🔺', 'right sail triangle', 'triangle', 585, 430, 170),
          part('emoji:🟫', 'square hull', 'square', 510, 640, 230),
          part('emoji:🌊', 'water waves', 'waves', 510, 765, 175),
        ]),
        build('ice-cream', 'The shapes became ice cream!', [
          part('emoji:🔻', 'cone triangle', 'triangle', 500, 640, 215),
          part('emoji:🟠', 'orange scoop circle', 'circle', 440, 430, 160),
          part('emoji:🟣', 'purple scoop circle', 'circle', 560, 430, 160),
          part('emoji:🍒', 'cherry top', 'cherry', 500, 305, 110),
        ]),
        build('snowman', 'The circles became a snowman!', [
          part('emoji:⚪', 'bottom white circle', 'circle', 500, 690, 210),
          part('emoji:⚪', 'middle white circle', 'circle', 500, 515, 170),
          part('emoji:⚪', 'top white circle', 'circle', 500, 365, 135),
          part('emoji:🎩', 'snowman hat', 'hat', 500, 245, 120),
        ]),
      ],
    },
    {
      id: 'faces',
      title: 'Shape Faces',
      rounds: 3,
      prompt: 'Build the face from shapes.',
      builds: [
        build('robot-face', 'The shapes became a robot face!', [
          part('emoji:⬛', 'robot square head', 'square', 500, 500, 300),
          part('emoji:🟦', 'left blue eye square', 'square', 420, 455, 105),
          part('emoji:🟦', 'right blue eye square', 'square', 580, 455, 105),
          part('emoji:▫️', 'robot mouth rectangle', 'rectangle', 500, 585, 145),
        ]),
        build('cat-face', 'The shapes became a cat face!', [
          part('emoji:🔺', 'left cat ear triangle', 'triangle', 395, 325, 140),
          part('emoji:🔺', 'right cat ear triangle', 'triangle', 605, 325, 140),
          part('emoji:🟠', 'cat face circle', 'circle', 500, 515, 280),
          part('emoji:👀', 'cat eyes', 'eyes', 500, 470, 125),
          part('emoji:〰️', 'cat mouth', 'mouth', 500, 585, 120),
        ]),
        build('monster-face', 'The shapes became a silly monster!', [
          part('emoji:🟩', 'monster head square', 'square', 500, 500, 300),
          part('emoji:🟣', 'big round eye', 'circle', 455, 455, 115),
          part('emoji:🟡', 'small round eye', 'circle', 570, 465, 95),
          part('emoji:🔻', 'triangle tooth', 'triangle', 500, 610, 110),
          part('emoji:⚡', 'zigzag hair', 'hair', 500, 315, 125),
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
