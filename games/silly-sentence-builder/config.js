export default {
  id: 'silly-sentence-builder',
  engine: 'build-assemble',
  title: 'Silly Sentence Builder',
  splashEmoji: '🤪',
  voice: {
    intro: 'Build the silly sentence. Put each picture on its ghost.',
    nudge: 'That card has a different ghost spot. Try again.',
    wait: 'Pick the next card in the sentence.',
    cheer: 'Those silly sentences are ready!',
  },
  modes: [
    {
      id: 'silly',
      title: 'Make a Silly Sentence',
      rounds: 4,
      prompt: 'Build a who, a does, and a where.',
      builds: [
        sentence('moon-dance', 'The penguin dances on the moon!', [
          card('emoji:🐧', 'the penguin', 'the penguin', 240, 470, 185),
          card('emoji:💃', 'dances', 'dances', 500, 470, 185),
          card('emoji:🌕', 'on the moon', 'on the moon', 760, 470, 185),
        ]),
        sentence('dino-bath', 'The dinosaur eats spaghetti in the bathtub!', [
          card('emoji:🦖', 'the dinosaur', 'the dinosaur', 240, 470, 185),
          card('emoji:🍝', 'eats spaghetti', 'eats spaghetti', 500, 470, 185),
          card('emoji:🛁', 'in the bathtub', 'in the bathtub', 760, 470, 185),
        ]),
        sentence('grandma-castle', 'The grandma toots a trumpet in the castle!', [
          card('emoji:👵', 'the grandma', 'the grandma', 240, 470, 185),
          card('emoji:🎺', 'toots a trumpet', 'toots a trumpet', 500, 470, 185),
          card('emoji:🏰', 'in the castle', 'in the castle', 760, 470, 185),
        ]),
        sentence('robot-puddle', 'The robot wiggles in a puddle!', [
          card('emoji:🤖', 'the robot', 'the robot', 240, 470, 185),
          card('emoji:🕺', 'wiggles', 'wiggles', 500, 470, 185),
          card('emoji:💧', 'in a puddle', 'in a puddle', 760, 470, 185),
        ]),
      ],
    },
    {
      id: 'sillier',
      title: 'Even Sillier',
      rounds: 3,
      prompt: 'Build a who, a does, a where, and a how.',
      builds: [
        sentence('frog-fast', 'The frog paints on the moon super fast!', [
          card('emoji:🐸', 'the frog', 'the frog', 185, 470, 165),
          card('emoji:🎨', 'paints', 'paints', 395, 470, 165),
          card('emoji:🌕', 'on the moon', 'on the moon', 605, 470, 165),
          card('emoji:⚡', 'super fast', 'super fast', 815, 470, 165),
        ]),
        sentence('baby-sneaky', 'The baby plays a trumpet in the bathtub sneakily!', [
          card('emoji:👶', 'the baby', 'the baby', 185, 470, 165),
          card('emoji:🎺', 'plays a trumpet', 'plays a trumpet', 395, 470, 165),
          card('emoji:🛁', 'in the bathtub', 'in the bathtub', 605, 470, 165),
          card('emoji:🤫', 'sneakily', 'sneakily', 815, 470, 165),
        ]),
        sentence('unicorn-slow', 'The unicorn eats noodles in the castle slowly!', [
          card('emoji:🦄', 'the unicorn', 'the unicorn', 185, 470, 165),
          card('emoji:🍜', 'eats noodles', 'eats noodles', 395, 470, 165),
          card('emoji:🏰', 'in the castle', 'in the castle', 605, 470, 165),
          card('emoji:🐌', 'slowly', 'slowly', 815, 470, 165),
        ]),
      ],
    },
  ],
};

function sentence(name, say, parts) {
  return { name, say, ordered: true, parts };
}

function card(art, alt, say, x, y, size) {
  return { art, alt, say, x, y, size };
}
