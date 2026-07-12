export default {
  id: 'emotion-voice-game',
  engine: 'observe-journal',
  title: 'Emotion Voice Game',
  splashEmoji: '🎭',
  // Story-corner backdrop, Story Screen art world (docs/art-direction.md)
  theme: { world: 'story-screen', background: './assets/bg.jpg' },
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'My Feelings Show',
    playAgain: 'Perform Again',
  },
  voice: {
    cheer: 'Bravo! Your voice showed so many feelings!',
    yum: 'What a performance!',
  },
  modes: [
    {
      id: 'lines',
      title: 'Say It With Feeling',
      prompt: 'Welcome, performer! Pick a feeling, listen to my voice, then copy the line that way!',
      rounds: 3,
      endTitle: 'Your Feelings Show',
      cheer: 'Bravo! You made the same words sparkle with different feelings!',
      pages: [
        {
          scene: 'emoji:🚀',
          alt: 'a rocket going to the moon',
          say: 'The line is: We are going to the moon! Pick a feeling, listen, then perform it!',
          stickers: [
            { art: 'emoji:😊', alt: 'happy', say: 'Happy voice: We are going to the moon! Hooray! Now you try it with a big smile!' },
            { art: 'emoji:😨', alt: 'scared', say: 'Scared voice: We are going to the moon? Oh my! Now you try it with a shaky voice!' },
            { art: 'emoji:🥳', alt: 'proud', say: 'Proud voice: We are going to the moon! We can do it! Now you try it standing tall!' },
            { art: 'emoji:😴', alt: 'sleepy', say: 'Sleepy voice: We are going to the moon... yawn. Now you try it slowly and softly!' },
          ],
        },
        {
          scene: 'emoji:👟',
          alt: 'a missing shoe',
          say: 'The line is: Where did my shoe go? Pick a feeling, listen, then perform it!',
          stickers: [
            { art: 'emoji:😊', alt: 'happy', say: 'Happy voice: Where did my shoe go? This is a fun mystery! Now you try it with a bright voice!' },
            { art: 'emoji:😨', alt: 'scared', say: 'Scared voice: Where did my shoe go? Is it hiding? Now you try it with a tiny tremble!' },
            { art: 'emoji:🥳', alt: 'proud', say: 'Proud voice: Where did my shoe go? I know I can find it! Now you try it with confidence!' },
            { art: 'emoji:😴', alt: 'sleepy', say: 'Sleepy voice: Where did my shoe go... maybe under the bed. Now you try it with a drowsy voice!' },
          ],
        },
        {
          scene: 'emoji:🍝',
          alt: 'a plate of dinner',
          say: 'The line is: Dinner is ready! Pick a feeling, listen, then perform it!',
          stickers: [
            { art: 'emoji:😊', alt: 'happy', say: 'Happy voice: Dinner is ready! Yum, yum! Now you try it with a cheerful voice!' },
            { art: 'emoji:😨', alt: 'scared', say: 'Scared voice: Dinner is ready? What could it be? Now you try it with a worried voice!' },
            { art: 'emoji:🥳', alt: 'proud', say: 'Proud voice: Dinner is ready! I helped make it! Now you try it with a strong, proud voice!' },
            { art: 'emoji:😴', alt: 'sleepy', say: 'Sleepy voice: Dinner is ready... I am coming. Now you try it with a slow, sleepy voice!' },
          ],
        },
      ],
    },
    {
      id: 'animals',
      title: 'Animal Feelings',
      prompt: 'Animal actors are taking the stage! Pick one, listen to its hello, then copy that feeling!',
      rounds: 2,
      endTitle: 'Your Animal Show',
      cheer: 'Bravo! Your bear, puppy, and mouse voices brought the animal stage to life!',
      pages: [
        {
          scene: ['emoji:🐻', 'emoji:🐶', 'emoji:🐭'],
          alt: 'three animal actors',
          say: 'Choose an animal actor. Listen to hello, then perform it the same way!',
          stickers: [
            { art: 'emoji:🐻', alt: 'grumpy bear', say: 'Grumpy bear voice: Hello! Hmph! Now you say hello with a low, grumbly voice!' },
            { art: 'emoji:🐶', alt: 'excited puppy', say: 'Excited puppy voice: Hello! Hello! I am so glad to see you! Now you say hello with a bouncy voice!' },
            { art: 'emoji:🐭', alt: 'shy mouse', say: 'Shy mouse voice: Oh... hello. Now you say hello with a quiet, gentle voice!' },
          ],
        },
        {
          scene: ['emoji:🎭', 'emoji:🐻', 'emoji:🐶', 'emoji:🐭'],
          alt: 'animal actors taking a bow',
          say: 'Encore! Choose an animal feeling and perform hello one more time!',
          stickers: [
            { art: 'emoji:🐻', alt: 'grumpy bear', say: 'Grumpy bear encore: Hello! Who woke me up? Now give us your biggest bear grumble!' },
            { art: 'emoji:🐶', alt: 'excited puppy', say: 'Excited puppy encore: Hello! Let us play! Now give us your happiest puppy hello!' },
            { art: 'emoji:🐭', alt: 'shy mouse', say: 'Shy mouse encore: Hello... it is nice to meet you. Now give us your softest mouse hello!' },
          ],
        },
      ],
    },
  ],
};
