export default {
  id: 'waiting-muscle-game',
  engine: 'coach-timer',
  title: 'Waiting Muscle Game',
  splashEmoji: 'emoji:💪',
  theme: { world: 'story-screen', background: './assets/bg.jpg' },
  voice: {
    intro: 'Welcome to the waiting workout! Every wait makes your waiting muscle stronger.',
    praise: 'Rep complete! Your waiting muscle just got stronger.',
    cheer: 'Waiting workout complete! You are a self-control champion!',
  },
  modes: [
    {
      id: 'train',
      title: 'Waiting Workout',
      type: 'steps',
      praise: 'Great waiting rep! Your muscle is growing.',
      cheer: 'You used three waiting tricks and got stronger!',
      endTitle: 'Waiting Champion',
      endArt: 'emoji:🏆',
      againLabel: 'TRAIN AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:🍪',
          say: 'Place one small treat or favorite toy where you can see it.',
        },
        {
          art: 'emoji:🙌',
          say: 'Ten-second wait! Put your hands on your knees and make them strong and still.',
          timerSec: 10,
          after: 'Ten seconds! Your waiting muscle did its first rep.',
        },
        {
          art: 'emoji:👀',
          say: 'Twenty-second wait! Look away from the treat and count slowly in your head.',
          timerSec: 20,
          after: 'Twenty seconds! The look-away trick made waiting easier.',
        },
        {
          art: 'emoji:🎵',
          say: 'Thirty-second wait! Sing a favorite song inside your head.',
          timerSec: 30,
          after: 'Thirty seconds! Your waiting muscle is powerful.',
        },
        {
          art: 'emoji:🏆',
          say: 'EAT or PLAY — you earned it, champion! And the bigger win is this: you just got stronger.',
        },
      ],
    },
    {
      id: 'master',
      title: 'Waiting Master',
      type: 'steps',
      praise: 'Master rep complete! Your muscle is GROWING.',
      cheer: 'You made a strong choice! Taking it now or waiting again can both be celebrated.',
      endTitle: 'Waiting Master',
      endArt: 'emoji:🎉',
      againLabel: 'MASTER AGAIN',
      doneLabel: 'DONE',
      steps: [
        {
          art: 'emoji:💪',
          say: 'The one-minute grand wait begins! Choose your best waiting trick for the first fifteen seconds.',
          timerSec: 15,
          after: 'Fifteen seconds! Your muscle is GROWING.',
        },
        {
          art: 'emoji:🙌',
          say: 'Keep going for fifteen more seconds. Sit on your hands or keep them strong on your knees.',
          timerSec: 15,
          after: 'Thirty seconds! Your muscle is GROWING. You are halfway, Waiting Master.',
        },
        {
          art: 'emoji:👀',
          say: 'Fifteen more seconds. Look away and count slowly in your head.',
          timerSec: 15,
          after: 'Forty-five seconds! Your muscle is GROWING.',
        },
        {
          art: 'emoji:🎵',
          say: 'Final fifteen seconds! Sing inside your head all the way to the finish.',
          timerSec: 15,
          after: 'One whole minute! Your waiting muscle is stronger than ever.',
        },
        {
          art: 'emoji:🤔',
          say: 'Now choose: enjoy the treat, or wait again to make it two. Both choices are strong choices.',
        },
        {
          art: 'emoji:🎉',
          say: 'You chose for yourself! Celebrate your strong waiting muscle!',
        },
      ],
    },
  ],
};
