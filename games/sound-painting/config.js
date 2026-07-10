export default {
  id: 'sound-painting',
  engine: 'observe-journal',
  title: 'Sound Painting',
  splashEmoji: '🎶',
  copy: {
    home: 'Home',
    replay: 'Hear it again',
    recap: 'Sound Painting',
    playAgain: 'Play Again',
  },
  voice: {
    cheer: 'You painted the sounds with your feelings!',
    yum: 'That feeling belongs in your painting!',
  },
  modes: [
    {
      id: 'feelings',
      title: 'Paint the Sound',
      prompt: 'Listen with your imagination. There are no wrong feelings.',
      rounds: 4,
      endTitle: 'My Sound Painting',
      cheer: 'Every color and picture is part of your music feeling!',
      pages: [
        {
          scene: ['emoji:🎶', 'emoji:🌊'],
          prompts: [
            {
              say: 'Listen. Slow and soft, like floating. What color does it feel like?',
              stickers: [
                { art: 'swatch:#7ac7d8', alt: 'soft blue', say: 'Soft blue can float with the sound.' },
                { art: 'swatch:#b8e986', alt: 'gentle green', say: 'Gentle green can sway with the sound.' },
                { art: 'swatch:#f6d6ff', alt: 'pale pink', say: 'Pale pink can drift with the sound.' },
              ],
            },
            {
              say: 'What picture does the slow soft sound feel like?',
              stickers: [
                { art: 'emoji:🌊', alt: 'wave', say: 'A wave can move slowly and softly.' },
                { art: 'emoji:🦋', alt: 'butterfly', say: 'A butterfly can flutter quietly.' },
                { art: 'emoji:☁️', alt: 'cloud', say: 'A cloud can float with the music.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🎶', 'emoji:🐘'],
          prompts: [
            {
              say: 'Listen. Big and boomy, like giant steps. What color does it feel like?',
              stickers: [
                { art: 'swatch:#7c4fc4', alt: 'deep purple', say: 'Deep purple can boom with the sound.' },
                { art: 'swatch:#2d7dd2', alt: 'strong blue', say: 'Strong blue can feel big and bold.' },
                { art: 'swatch:#f25f5c', alt: 'loud coral', say: 'Loud coral can thump with the beat.' },
              ],
            },
            {
              say: 'What picture does the big boomy sound feel like?',
              stickers: [
                { art: 'emoji:🐘', alt: 'elephant', say: 'An elephant can step with a big boom.' },
                { art: 'emoji:⛰️', alt: 'mountain', say: 'A mountain can feel huge and strong.' },
                { art: 'emoji:🥁', alt: 'drum', say: 'A drum can make a round boomy sound.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🎶', 'emoji:⚡'],
          prompts: [
            {
              say: 'Listen. Fast and tickly, like tiny sparks. What color does it feel like?',
              stickers: [
                { art: 'swatch:#ffd166', alt: 'spark yellow', say: 'Spark yellow can tickle and zip.' },
                { art: 'swatch:#58a945', alt: 'bright green', say: 'Bright green can bounce with the sound.' },
                { art: 'swatch:#ff8c42', alt: 'quick orange', say: 'Quick orange can race with the music.' },
              ],
            },
            {
              say: 'What picture does the fast tickly sound feel like?',
              stickers: [
                { art: 'emoji:⚡', alt: 'lightning', say: 'Lightning can zip fast across the sky.' },
                { art: 'emoji:🦋', alt: 'butterfly', say: 'A butterfly can tickle through the air.' },
                { art: 'emoji:✨', alt: 'sparkles', say: 'Sparkles can flicker with tiny sounds.' },
              ],
            },
          ],
        },
        {
          scene: ['emoji:🎶', 'emoji:🌙'],
          prompts: [
            {
              say: 'Listen. Gentle and sleepy, like a bedtime hum. What color does it feel like?',
              stickers: [
                { art: 'swatch:#8fb8de', alt: 'sleepy blue', say: 'Sleepy blue can feel calm and cozy.' },
                { art: 'swatch:#cdb4db', alt: 'soft lavender', say: 'Soft lavender can rest with the sound.' },
                { art: 'swatch:#fff1a8', alt: 'moon yellow', say: 'Moon yellow can glow very gently.' },
              ],
            },
            {
              say: 'What picture does the gentle sleepy sound feel like?',
              stickers: [
                { art: 'emoji:🌙', alt: 'moon', say: 'The moon can shine softly over sleepy music.' },
                { art: 'emoji:🛌', alt: 'bed', say: 'A bed can feel cozy with a quiet hum.' },
                { art: 'emoji:🧸', alt: 'teddy bear', say: 'A teddy bear can cuddle with sleepy sound.' },
              ],
            },
          ],
        },
      ],
    },
  ],
};
