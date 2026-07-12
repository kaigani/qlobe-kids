export default {
  id: 'picture-narration',
  engine: 'observe-journal',
  title: 'Picture Narration',
  splashEmoji: '🖼️',
  // Story-corner backdrop, Story Screen art world (docs/art-direction.md)
  theme: { world: 'story-screen', background: './assets/bg.jpg' },
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'My Noticing Story',
    playAgain: 'Explore Again',
  },
  voice: {
    cheer: 'You noticed so many wonderful details!',
    yum: 'You found something!',
  },
  modes: [
    {
      id: 'park',
      title: 'At the Park',
      prompt: 'Let us explore the park together. Point, pick, and say the name of everything you notice!',
      rounds: 3,
      endTitle: 'Our Park Story',
      cheer: 'You looked closely and told a wonderful park story!',
      pages: [
        {
          scene: 'emoji:🏞️',
          alt: 'a busy park scene',
          prompts: [
            {
              say: 'Find something that flies. Say what it is!',
              stickers: [
                { art: 'emoji:🪁', alt: 'kite', say: 'A kite! It dances in the wind! Say, I see a kite!' },
                { art: 'emoji:🦆', alt: 'duck', say: 'A duck! It flaps above the pond! Say, I see a duck!' },
              ],
            },
            {
              say: 'Find a living thing. Name it out loud!',
              stickers: [
                { art: 'emoji:🐕', alt: 'dog', say: 'A dog! It trots across the grass! Say, I see a dog!' },
                { art: 'emoji:🌳', alt: 'tree', say: 'A tree! Its leafy branches stretch up high! Say, I see a tree!' },
                { art: 'emoji:🦆', alt: 'duck', say: 'A duck! It paddles through the water! Say, I see a duck!' },
              ],
            },
          ],
        },
        {
          scene: 'emoji:🏞️',
          alt: 'a busy park scene',
          prompts: [
            {
              say: 'Find something with water. Say its name!',
              stickers: [
                { art: 'emoji:⛲', alt: 'fountain', say: 'A fountain! The water splashes up and tumbles down! Say, I see a fountain!' },
                { art: 'emoji:🦆', alt: 'duck', say: 'A duck! Water drips from its feathers! Say, I see a duck!' },
              ],
            },
            {
              say: 'Find something that can move. Tell me what it does!',
              stickers: [
                { art: 'emoji:🐕', alt: 'dog', say: 'A dog! It can run and wag its tail! Say what the dog is doing!' },
                { art: 'emoji:🪁', alt: 'kite', say: 'A kite! It can swoop and spin! Say what the kite is doing!' },
                { art: 'emoji:🦆', alt: 'duck', say: 'A duck! It can waddle and swim! Say what the duck is doing!' },
              ],
            },
          ],
        },
        {
          scene: 'emoji:🏞️',
          alt: 'a busy park scene',
          prompts: [
            {
              say: 'Find something tall. Name it in a full sentence!',
              stickers: [
                { art: 'emoji:🌳', alt: 'tree', say: 'A tall tree! It shades the park! Say, the tree is tall!' },
                { art: 'emoji:⛲', alt: 'fountain', say: 'A tall fountain! Its water reaches toward the sky! Say, the fountain is tall!' },
              ],
            },
            {
              say: 'Choose one last park detail. Say what you see, then tell the whole picture story!',
              stickers: [
                { art: 'emoji:🐕', alt: 'dog', say: 'A playful dog! Add the dog to your park story!' },
                { art: 'emoji:🪁', alt: 'kite', say: 'A bright kite! Add the kite to your park story!' },
                { art: 'emoji:🦆', alt: 'duck', say: 'A waddling duck! Add the duck to your park story!' },
                { art: 'emoji:⛲', alt: 'fountain', say: 'A splashing fountain! Add the fountain to your park story!' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'market',
      title: 'At the Market',
      prompt: 'Let us explore the market together. Point, pick, and say the name of everything you notice!',
      rounds: 3,
      endTitle: 'Our Market Story',
      cheer: 'You hunted for details and told a delicious market story!',
      pages: [
        {
          scene: 'emoji:🧺',
          alt: 'a busy market scene',
          prompts: [
            {
              say: 'Find something red or orange. Say what it is!',
              stickers: [
                { art: 'emoji:🍎', alt: 'apple', say: 'An apple! It is round, shiny, and red! Say, I see an apple!' },
                { art: 'emoji:🥕', alt: 'carrot', say: 'A carrot! It is long, crunchy, and orange! Say, I see a carrot!' },
              ],
            },
            {
              say: 'Find a food that grows from a plant. Name it out loud!',
              stickers: [
                { art: 'emoji:🍎', alt: 'apple', say: 'An apple! It grows on a tree! Say, I see an apple!' },
                { art: 'emoji:🥕', alt: 'carrot', say: 'A carrot! It grows under the soil! Say, I see a carrot!' },
                { art: 'emoji:🌽', alt: 'corn', say: 'Corn! It grows tall in a field! Say, I see corn!' },
              ],
            },
          ],
        },
        {
          scene: 'emoji:🧺',
          alt: 'a busy market scene',
          prompts: [
            {
              say: 'Find something yellow. Say its name!',
              stickers: [
                { art: 'emoji:🧀', alt: 'cheese', say: 'Cheese! It is a creamy yellow wedge! Say, I see cheese!' },
                { art: 'emoji:🌽', alt: 'corn', say: 'Corn! Its kernels are sunny yellow! Say, I see corn!' },
              ],
            },
            {
              say: 'Find something you could hear at the market. Name it and make its sound!',
              stickers: [
                { art: 'emoji:🐓', alt: 'chicken', say: 'A chicken! Cluck, cluck, it calls across the market! Say, I hear a chicken!' },
                { art: 'emoji:🌽', alt: 'corn', say: 'Corn! Crunch, crunch, it makes a crisp sound! Say, I hear corn crunch!' },
                { art: 'emoji:🍎', alt: 'apple', say: 'An apple! Crunch, it sounds juicy! Say, I hear an apple crunch!' },
              ],
            },
          ],
        },
        {
          scene: 'emoji:🧺',
          alt: 'a busy market scene',
          prompts: [
            {
              say: 'Find something with an interesting shape. Describe it out loud!',
              stickers: [
                { art: 'emoji:🍎', alt: 'apple', say: 'A round apple! It could roll across the stall! Say, the apple is round!' },
                { art: 'emoji:🥕', alt: 'carrot', say: 'A pointy carrot! It is wide at the top and narrow at the tip! Say, the carrot is pointy!' },
                { art: 'emoji:🧀', alt: 'cheese', say: 'A triangle of cheese! It has corners and flat sides! Say, the cheese is a triangle!' },
              ],
            },
            {
              say: 'Choose one last market detail. Say what you see, then tell the whole picture story!',
              stickers: [
                { art: 'emoji:🍎', alt: 'apple', say: 'A shiny apple! Add the apple to your market story!' },
                { art: 'emoji:🥕', alt: 'carrot', say: 'A crunchy carrot! Add the carrot to your market story!' },
                { art: 'emoji:🧀', alt: 'cheese', say: 'A creamy cheese wedge! Add the cheese to your market story!' },
                { art: 'emoji:🌽', alt: 'corn', say: 'Sunny corn! Add the corn to your market story!' },
                { art: 'emoji:🐓', alt: 'chicken', say: 'A clucking chicken! Add the chicken to your market story!' },
              ],
            },
          ],
        },
      ],
    },
  ],
};
