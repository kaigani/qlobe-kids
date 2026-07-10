export default {
  id: 'smell-jars',
  engine: 'observe-journal',
  title: 'Smell Jars',
  splashEmoji: '👃',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'Smell Notes',
    playAgain: 'Play Again',
  },
  voice: {
    cheer: 'You were the nose and made a smell journal!',
    yum: 'That smell note belongs to you!',
  },
  modes: [
    {
      id: 'sniff',
      title: 'Be the Nose',
      prompt: 'Grown-up helper, open a real kitchen smell. I have no nose! You be the nose!',
      rounds: 4,
      endTitle: 'My Smell Notes',
      cheer: 'Lemon, mint, cocoa, cinnamon, or a surprise. Your nose did the noticing!',
      pages: [
        {
          scene: ['emoji:🫙', 'emoji:🍋'],
          prompts: [
            {
              say: 'Grown-up, open lemon or another safe kitchen smell. Sniff gently. What might it be?',
              stickers: [
                { art: 'emoji:🍋', alt: 'lemon', say: 'Lemon can smell bright, sour, and zippy.' },
                { art: 'emoji:🌿', alt: 'mint', say: 'Mint can smell cool and leafy.' },
                { art: 'emoji:❓', alt: 'mystery smell', say: 'Mystery smell! Your nose is gathering clues.' },
              ],
            },
            {
              say: 'How did that smell feel to you?',
              stickers: [
                { art: 'emoji:😍', alt: 'love it', say: 'You loved it. Smell likes are personal.' },
                { art: 'emoji:🙂', alt: 'it is okay', say: 'It was okay. That is a real smell opinion.' },
                { art: 'emoji:😖', alt: 'too strong', say: 'Too strong! Some smells are big for a nose.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🫙', 'emoji:🌿'],
          prompts: [
            {
              say: 'Grown-up, try mint, basil, or a safe leafy smell. I still have no nose. What do you think?',
              stickers: [
                { art: 'emoji:🌿', alt: 'mint or herb', say: 'A green herb can smell cool, fresh, or leafy.' },
                { art: 'emoji:🍋', alt: 'lemon', say: 'Lemon is a bright guess. Noses compare clues.' },
                { art: 'emoji:❓', alt: 'mystery smell', say: 'Mystery is allowed. You can sniff again gently.' },
              ],
            },
            {
              say: 'Stamp your smell feeling.',
              stickers: [
                { art: 'emoji:😍', alt: 'love it', say: 'You loved it. That is your nose opinion.' },
                { art: 'emoji:🙂', alt: 'it is okay', say: 'Okay is a fine answer for a smell.' },
                { art: 'emoji:😖', alt: 'too strong', say: 'Too strong means your nose noticed a lot.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🫙', 'emoji:🍫'],
          prompts: [
            {
              say: 'Grown-up, offer cocoa, chocolate, or another safe pantry smell. Sniff, then stamp a guess.',
              stickers: [
                { art: 'emoji:🍫', alt: 'cocoa or chocolate', say: 'Cocoa can smell warm, roasty, and sweet.' },
                { art: 'emoji:🧂', alt: 'spice', say: 'A spice can smell strong and cozy.' },
                { art: 'emoji:❓', alt: 'mystery smell', say: 'Mystery guess. The tablet cannot smell, but you can!' },
              ],
            },
            {
              say: 'How did that smell land in your nose?',
              stickers: [
                { art: 'emoji:😍', alt: 'love it', say: 'You loved that smell today.' },
                { art: 'emoji:🙂', alt: 'it is okay', say: 'It was okay for your nose today.' },
                { art: 'emoji:😖', alt: 'too strong', say: 'Too strong is useful noticing.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🫙', 'emoji:🧂', 'emoji:❓'],
          prompts: [
            {
              say: 'Grown-up, bring any safe mystery smell from the kitchen. You are the nose detective!',
              stickers: [
                { art: 'emoji:🧂', alt: 'spice', say: 'Spice guess! Some spices smell warm or tickly.' },
                { art: 'emoji:🍎', alt: 'fruit', say: 'Fruit guess! Some fruits smell juicy or sweet.' },
                { art: 'emoji:❓', alt: 'surprise', say: 'Surprise smell! Your nose can hold the clue.' },
              ],
            },
            {
              say: 'Stamp how your nose felt about it.',
              stickers: [
                { art: 'emoji:😍', alt: 'love it', say: 'Loved it. Your nose voted yes.' },
                { art: 'emoji:🙂', alt: 'it is okay', say: 'Okay. Your nose is allowed to be in the middle.' },
                { art: 'emoji:😖', alt: 'too strong', say: 'Too strong. You can move it farther away.' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'guess',
      title: 'Sniff and Guess',
      prompt: 'Grown-up, hide a safe smell. The tablet cannot peek or sniff, so the child is the nose.',
      rounds: 3,
      endTitle: 'Mystery Smell Reveals',
      cheer: 'You sniffed, guessed, and revealed the mystery smells!',
      pages: [
        {
          scene: ['emoji:🫙', 'emoji:❓'],
          prompts: [
            {
              say: 'Mystery jar one. Sniff gently, then stamp your best guess.',
              stickers: [
                { art: 'emoji:🍋', alt: 'lemon', say: 'Lemon guess. Bright and sour is a helpful clue.' },
                { art: 'emoji:🌿', alt: 'herb', say: 'Herb guess. Green smells can be cool or leafy.' },
                { art: 'emoji:🍫', alt: 'cocoa', say: 'Cocoa guess. Warm sweet smells can feel cozy.' },
              ],
            },
            {
              say: 'Grown-up, reveal the smell. Stamp how the reveal felt.',
              stickers: [
                { art: 'emoji:🎉', alt: 'matched it', say: 'Matched it or got close. Nice nose detective work!' },
                { art: 'emoji:🤔', alt: 'surprised', say: 'Surprise! Noses learn from surprises too.' },
                { art: 'emoji:🙂', alt: 'okay reveal', say: 'Okay reveal. You gathered smell clues.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🫙', 'emoji:👃', 'emoji:❓'],
          prompts: [
            {
              say: 'Mystery jar two. Take a small sniff. What does your nose guess?',
              stickers: [
                { art: 'emoji:🧂', alt: 'spice', say: 'Spice guess. Some spices smell warm and strong.' },
                { art: 'emoji:🍎', alt: 'fruit', say: 'Fruit guess. Fruit can smell sweet or juicy.' },
                { art: 'emoji:🥖', alt: 'bread', say: 'Bread guess. Bread can smell toasty or yeasty.' },
              ],
            },
            {
              say: 'Reveal time. What happened?',
              stickers: [
                { art: 'emoji:🎉', alt: 'matched it', say: 'Your guess matched or came close.' },
                { art: 'emoji:🤔', alt: 'surprised', say: 'A surprise smell helps your brain make a new clue.' },
                { art: 'emoji:😖', alt: 'too strong', say: 'Too strong after reveal. You can sniff less next time.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🫙', 'emoji:✨', 'emoji:❓'],
          prompts: [
            {
              say: 'Final mystery smell. I have no nose, so I am counting on yours.',
              stickers: [
                { art: 'emoji:🍋', alt: 'lemon', say: 'Bright guess. Your nose heard a zippy clue.' },
                { art: 'emoji:🌿', alt: 'leafy', say: 'Leafy guess. Your nose heard a green clue.' },
                { art: 'emoji:🧂', alt: 'spice', say: 'Spice guess. Your nose heard a cozy clue.' },
              ],
            },
            {
              say: 'Grown-up, reveal it. Stamp the ending.',
              stickers: [
                { art: 'emoji:🎉', alt: 'celebrate', say: 'You played the smelling game with a real nose!' },
                { art: 'emoji:🤔', alt: 'interesting', say: 'Interesting smells teach the nose new clues.' },
                { art: 'emoji:😍', alt: 'favorite', say: 'Favorite ending. That smell can go in your smell memory.' },
              ],
            },
          ],
        },
      ],
    },
  ],
};
