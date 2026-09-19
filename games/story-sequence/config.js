export const sequenceLabels = ['FIRST', 'NEXT', 'LAST'];

export const stories = [
  {
    id: 'slide',
    title: 'The Slide',
    menuLabel: 'SLIDE',
    menuPrompt: 'Climb, zoom, cheer!',
    coverStep: 'last',
    steps: [
      {
        id: 'slide-first',
        caption: 'Climb the ladder',
        narration: 'First, Kai climbs up the slide ladder.',
      },
      {
        id: 'slide-next',
        caption: 'Zoom down',
        narration: 'Next, he zooms down the slide.',
      },
      {
        id: 'slide-last',
        caption: 'Cheer at the bottom',
        narration: 'Last, Kai cheers at the bottom. Whee!',
      },
    ],
  },
  {
    id: 'bake',
    title: 'Warm Muffins',
    menuLabel: 'BAKE',
    menuPrompt: 'Mix, bake, share!',
    coverStep: 'last',
    steps: [
      {
        id: 'bake-first',
        caption: 'Mix the batter',
        narration: 'First, Maya mixes the blueberry batter.',
      },
      {
        id: 'bake-next',
        caption: 'A grown-up bakes',
        narration: 'Next, a grown-up bakes the muffins safely.',
      },
      {
        id: 'bake-last',
        caption: 'Share warm muffins',
        narration: 'Last, Maya shares six warm muffins. Yum!',
      },
    ],
  },
  {
    id: 'plant',
    title: 'Sunflower Surprise',
    menuLabel: 'PLANT',
    menuPrompt: 'Plant, water, bloom!',
    coverStep: 'last',
    steps: [
      {
        id: 'plant-first',
        caption: 'Tuck in the seed',
        narration: 'First, Nia tucks a sunflower seed into the soil.',
      },
      {
        id: 'plant-next',
        caption: 'Water the sprout',
        narration: 'Next, she gives the little sprout a drink.',
      },
      {
        id: 'plant-last',
        caption: 'A sunflower blooms',
        narration: 'Last, a bright sunflower blooms. Hello, sunshine!',
      },
    ],
  },
  {
    id: 'brush',
    title: 'Sparkly Smile',
    menuLabel: 'BRUSH',
    menuPrompt: 'Paste, brush, sparkle!',
    coverStep: 'last',
    steps: [
      {
        id: 'brush-first',
        caption: 'Add toothpaste',
        narration: 'First, Leo puts a little toothpaste on his brush.',
      },
      {
        id: 'brush-next',
        caption: 'Brush in circles',
        narration: 'Next, he brushes every tooth in gentle circles.',
      },
      {
        id: 'brush-last',
        caption: 'A clean smile',
        narration: "Last, Leo's clean smile sparkles. All done!",
      },
    ],
  },
];

export const voiceLines = {
  welcome: 'Welcome, storyteller! Choose a little story.',
  'select-story': 'Choose a story to put in order.',
  'prompt-first': 'What happens first?',
  'wrong-slot': 'Almost! Try that picture in a different story spot.',
  'correct-first': 'Yes! That happens first.',
  'correct-next': 'Nice thinking! That happens next.',
  'correct-last': 'You found the last part.',
  'story-ready': 'Your story is ready. Tap Watch My Story!',
  'great-story': 'You did it! What a great story!',
  'all-stories': 'Four wonderful stories! You are a Storyteller Star!',
};

for (const story of stories) {
  for (const step of story.steps) voiceLines[step.id] = step.narration;
}

export const assets = {
  library: './assets/art/backdrops/library.webp',
  meadow: './assets/art/backdrops/meadow.webp',
  storybook: './assets/art/decor/storybook.webp',
  star: './assets/art/decor/storyteller-star.webp',
  check: './assets/art/decor/correct-check.webp',
  confetti: './assets/art/decor/confetti.webp',
};

export const storageKey = 'qlobe:first-next-last:v1';
