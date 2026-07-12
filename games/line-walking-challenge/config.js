export default {
  id: 'line-walking-challenge',
  engine: 'coach-timer',
  title: 'Line Walking Challenge',
  splashEmoji: 'emoji:🧘',
  // Field Journal art world (docs/art-direction.md)
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  voice: {
    intro: 'Let\'s move as slowly and quietly as a snail.',
    praise: 'So slow and steady. Beautiful work.',
    cheer: 'You walked with calm, careful balance!',
  },
  modes: [
    {
      id: 'line',
      title: 'The Quiet Line',
      type: 'steps',
      praise: 'So slow and steady. Beautiful work.',
      cheer: 'You finished the quiet line with grace!',
      endTitle: 'The Quiet Line',
      endArt: 'emoji:🙇',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:➰',
          say: 'Ask a grown-up to make an ellipse or a long line with tape.',
        },
        {
          art: 'emoji:🐌',
          say: 'Walk heel to toe, as slowly as a snail. Slowness is the skill.',
          timerSec: 60,
          after: 'The snail says, that was wonderfully slow.',
        },
        {
          art: 'emoji:🧍',
          say: 'Walk the line again with your hands behind your back.',
          timerSec: 60,
          after: 'Your careful feet stayed in charge.',
        },
        {
          art: 'emoji:😌',
          say: 'Stop halfway. Close your eyes and take three slow breaths.',
        },
        {
          art: 'emoji:🙇',
          say: 'Finish the line slowly, then take a graceful bow.',
        },
      ],
    },
    {
      id: 'carry',
      title: 'Carry Challenge',
      type: 'steps',
      praise: 'So slow and steady. Beautiful work.',
      cheer: 'You carried everything with calm, careful balance!',
      endTitle: 'Carry Challenge',
      endArt: 'emoji:🎩',
      againLabel: 'AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🧢',
          say: 'Balance a beanbag on your head and walk the line very slowly.',
          timerSec: 60,
          after: 'Your head was a calm little beanbag shelf.',
        },
        {
          art: 'emoji:🔔',
          say: 'Carry a bell along the line. Move so gently that it stays silent.',
          timerSec: 60,
          after: 'What quiet, careful carrying.',
        },
        {
          art: 'emoji:🥤',
          say: 'Carry a plastic cup with a little water. A tiny splash is just fine.',
          timerSec: 90,
          after: 'Careful beats fast, and you moved with care.',
        },
        {
          art: 'emoji:🎩',
          say: 'Grand combo! Balance the beanbag and carry the cup along the line.',
        },
      ],
    },
  ],
};
