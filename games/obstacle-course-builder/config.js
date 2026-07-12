export default {
  id: 'obstacle-course-builder',
  engine: 'coach-timer',
  title: 'Obstacle Course Builder',
  splashEmoji: 'emoji:🏗️',
  // Field Journal art world (docs/art-direction.md)
  theme: { world: 'field-journal', background: './assets/bg.jpg' },
  voice: {
    intro: 'Crew, helmets on! We are building and running a safe obstacle course.',
    praise: 'Station checked! That is pro course work.',
    cheer: 'Course complete! Builder, runner, and champion!',
  },
  modes: [
    {
      id: 'build',
      title: 'Build It',
      type: 'steps',
      praise: 'Station checked! Make sure it is steady and safe.',
      cheer: 'Construction complete! Your obstacle course is ready to run.',
      endTitle: 'Build It',
      endArt: 'emoji:🏗️',
      againLabel: 'BUILD AGAIN',
      doneLabel: 'BUILT',
      steps: [
        {
          art: 'emoji:⛰️',
          say: 'Build a low cushion mountain to climb over. Press it gently to check that it is steady.',
        },
        {
          art: 'emoji:⛺',
          say: 'Build a chair tunnel to crawl under. Ask a grown-up to check the chairs.',
          timerSec: 60,
          after: 'Safety check! The chair tunnel should feel steady with plenty of room to crawl.',
        },
        {
          art: 'emoji:🌊',
          say: 'Make a tape river on the floor to jump across. Keep it away from stairs and slippery spots.',
        },
        {
          art: 'emoji:🥄',
          say: 'Make a sock-ball carry zone. Choose a spoon or cup to carry the soft ball.',
        },
        {
          art: 'emoji:🏁',
          say: 'Add a finish-line flag or ribbon. Walk the whole course and do one final safety check.',
        },
      ],
    },
    {
      id: 'run',
      title: 'Run It',
      type: 'steps',
      praise: 'Station complete! Ready for the next challenge.',
      cheer: 'What a run! The course champion planned it, practiced it, and conquered it.',
      endTitle: 'Run It',
      endArt: 'emoji:🏆',
      againLabel: 'RUN AGAIN',
      doneLabel: 'STATION DONE',
      steps: [
        {
          art: 'emoji:⛰️',
          say: 'Climb over cushion mountain with careful hands and feet.',
          timerSec: 30,
          after: 'The champion has crossed cushion mountain!',
        },
        {
          art: 'emoji:⛺',
          say: 'Crawl through the chair tunnel. Stay low and move carefully.',
          timerSec: 30,
          after: 'The champion emerges safely from the tunnel!',
        },
        {
          art: 'emoji:🌊',
          say: 'Jump across the tape river. Bend, swing, and land softly.',
          timerSec: 20,
          after: 'A soft landing beyond the mighty river!',
        },
        {
          art: 'emoji:🥄',
          say: 'Carry the sock-ball through the carry zone. Balance it all the way.',
          timerSec: 40,
          after: 'The precious sock-ball makes it safely through!',
        },
        {
          art: 'emoji:🎬',
          say: 'Slow-motion champion replay! Our remarkable course runner approaches the mountain, glides through the tunnel, soars across the river, and carries the sock-ball toward the finish!',
        },
      ],
    },
  ],
};
