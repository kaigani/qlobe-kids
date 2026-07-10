const ending = (emoji, alt, correct = false) => ({
  art: `emoji:${emoji}`,
  alt,
  ...(correct ? { correct: true } : {}),
});

export default {
  id: 'story-repair-shop',
  engine: 'choose-one',
  title: 'Story Repair Shop',
  splashEmoji: '🔧',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
  },
  voice: {
    intro: 'Stories are in the repair shop. Listen, then tap the ending that fixes the story.',
    nudge: 'Hmm, would that really happen? Listen again and try another ending.',
    cheer: 'All fixed! The stories make sense again!',
    yums: [
      'That ending fixes the story!',
      'Good story thinking!',
      'Yes, that makes sense!',
    ],
  },
  modes: [
    {
      id: 'repair',
      title: 'Fix the Ending',
      rounds: 5,
      items: [
        {
          say: 'Nia planted a seed. She watered it every day. What happened next?',
          promptArt: 'emoji:🌱',
          promptAlt: 'seedling story',
          answers: [
            ending('🌻', 'flower', true),
            ending('🚀', 'rocket'),
            ending('🧦', 'sock'),
          ],
        },
        {
          say: 'Leo got caught in the rain. He had no coat. What happened next?',
          promptArt: 'emoji:🌧️',
          promptAlt: 'rain story',
          answers: [
            ending('💦', 'got wet', true),
            ending('🦖', 'dinosaur'),
            ending('🍦', 'ice cream'),
          ],
        },
        {
          say: 'Maya built a tall block tower. The little cat bumped it. What happened next?',
          promptArt: 'emoji:🧱',
          promptAlt: 'block tower story',
          answers: [
            ending('💥', 'tower fell down', true),
            ending('🌙', 'moon'),
            ending('🥕', 'carrot'),
          ],
        },
        {
          say: 'Sam put bread in the toaster. He waited for breakfast. What happened next?',
          promptArt: 'emoji:🍞',
          promptAlt: 'toast story',
          answers: [
            ending('🍞', 'toast popped up', true),
            ending('🎈', 'balloon'),
            ending('👟', 'shoe'),
          ],
        },
        {
          say: 'A puppy chased the red ball. The ball rolled under the chair. What happened next?',
          promptArt: 'emoji:🐶',
          promptAlt: 'puppy story',
          answers: [
            ending('🪑', 'looked under the chair', true),
            ending('🛸', 'flying saucer'),
            ending('🎂', 'cake'),
          ],
        },
      ],
    },
    {
      id: 'silly',
      title: 'Silly or Real?',
      rounds: 4,
      items: [
        {
          say: 'Now pick the SILLY one. The fish swam in the bowl. Then it...',
          promptArt: 'emoji:🐠',
          promptAlt: 'fish story',
          answers: [
            ending('🚲', 'rode a bicycle', true),
            ending('💧', 'splashed water'),
            ending('🌿', 'hid by a plant'),
          ],
        },
        {
          say: 'Now pick the SILLY one. The baby was sleepy. Then the baby...',
          promptArt: 'emoji:🛏️',
          promptAlt: 'bedtime story',
          answers: [
            ending('🎺', 'played a trumpet', true),
            ending('😴', 'fell asleep'),
            ending('🧸', 'held a teddy bear'),
          ],
        },
        {
          say: 'Now pick the SILLY one. Dad opened an umbrella in the rain. Then he...',
          promptArt: 'emoji:☂️',
          promptAlt: 'umbrella story',
          answers: [
            ending('🌭', 'turned into a hot dog', true),
            ending('🙂', 'stayed dry'),
            ending('🚶', 'walked home'),
          ],
        },
        {
          say: 'Now pick the SILLY one. The child brushed their teeth. Then the teeth...',
          promptArt: 'emoji:🪥',
          promptAlt: 'toothbrushing story',
          answers: [
            ending('🕺', 'started dancing', true),
            ending('✨', 'looked clean'),
            ending('😁', 'had a big smile'),
          ],
        },
      ],
    },
  ],
};
