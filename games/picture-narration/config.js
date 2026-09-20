const asset = (path) => `./assets/${path}`;

export const ui = {
  splash: asset('art/splash.webp'),
  title: asset('ui/title.webp'),
  home: asset('ui/home.webp'),
  back: asset('ui/back.webp'),
  sound: asset('ui/sound.webp'),
  soundOff: asset('ui/sound-off.webp'),
  mic: asset('ui/mic.webp'),
  replay: asset('ui/replay.webp'),
  next: asset('ui/next.webp'),
  storybook: asset('ui/storybook.webp'),
  star: asset('ui/star.webp'),
  sentenceRibbon: asset('ui/sentence-ribbon.webp'),
};

export const worlds = [
  {
    id: 'forest',
    title: 'Forest',
    storyTitle: "Pip's Forest Story",
    skill: 'name forest story clues and choose how Pip crosses the stream',
    background: asset('art/forest.webp'),
    protagonist: {
      id: 'pip',
      name: 'Pip',
      label: 'Pip the fox',
      art: asset('characters/fox.webp'),
    },
    intro: 'Pip the fox found a path with two surprises. Tap the glowing pictures and name what you see.',
    hotspots: [
      {
        id: 'fox', label: 'fox', pronunciation: 'FOX', art: asset('vocab/fox.webp'),
        x: 25, y: 57, line: 'Fox. Pip is a curious fox.',
      },
      {
        id: 'butterfly', label: 'butterfly', pronunciation: 'BUT-ter-fly', art: asset('vocab/butterfly.webp'),
        x: 71, y: 28, line: 'Butterfly. The blue butterfly flutters.',
      },
      {
        id: 'stream', label: 'stream', pronunciation: 'STREAM', art: asset('vocab/stream.webp'),
        x: 51, y: 61, line: 'Stream. The stream sparkles and splashes.',
      },
      {
        id: 'flowers', label: 'flowers', pronunciation: 'FLOW-ers', art: asset('vocab/flowers.webp'),
        x: 79, y: 70, line: 'Flowers. The flowers bloom in many colors.',
      },
    ],
    choicePrompts: [
      'What happens next? Will Pip cross the bridge, or sail in the leaf boat?',
      'Who will Pip meet? A little duck, or dancing fireflies?',
    ],
    choices: [
      [
        {
          id: 'bridge', label: 'Bridge', token: 'crossed the bridge', art: asset('choices/bridge.webp'),
          line: 'Pip padded across the little bridge.',
          sentencePart: 'crossed the stream on a little bridge',
        },
        {
          id: 'boat', label: 'Boat', token: 'sailed in a boat', art: asset('choices/boat.webp'),
          line: 'Pip sailed across in a tiny wooden boat.',
          sentencePart: 'sailed across the stream in a tiny boat',
        },
      ],
      [
        {
          id: 'duck', label: 'Duck', token: 'met a duck', art: asset('choices/duck.webp'),
          line: 'On the other side, Pip met a cheerful duck.',
          sentencePart: 'met a cheerful duck on the other side',
        },
        {
          id: 'fireflies', label: 'Fireflies', token: 'followed fireflies', art: asset('choices/fireflies.webp'),
          line: 'Glowing fireflies danced around Pip.',
          sentencePart: 'followed a dance of glowing fireflies',
        },
      ],
    ],
  },
  {
    id: 'ocean',
    title: 'Ocean',
    storyTitle: "Willa's Ocean Story",
    skill: 'name ocean story clues and choose Willa’s underwater adventure',
    background: asset('art/ocean.webp'),
    protagonist: {
      id: 'willa',
      name: 'Willa',
      label: 'Willa the whale',
      art: asset('characters/whale.webp'),
    },
    intro: 'Willa the whale found a sparkling reef. Tap the glowing pictures and name what you see.',
    hotspots: [
      {
        id: 'whale', label: 'whale', pronunciation: 'WHALE', art: asset('vocab/whale.webp'),
        x: 29, y: 47, line: 'Whale. Willa is a gentle whale.',
      },
      {
        id: 'coral', label: 'coral', pronunciation: 'COR-al', art: asset('vocab/coral.webp'),
        x: 20, y: 74, line: 'Coral. The coral makes a colorful sea garden.',
      },
      {
        id: 'turtle', label: 'turtle', pronunciation: 'TUR-tle', art: asset('vocab/turtle.webp'),
        x: 72, y: 58, line: 'Turtle. The sea turtle glides slowly.',
      },
      {
        id: 'bubbles', label: 'bubbles', pronunciation: 'BUB-bles', art: asset('vocab/bubbles.webp'),
        x: 59, y: 27, line: 'Bubbles. The bubbles float up, up, up.',
      },
    ],
    choicePrompts: [
      'What happens next? Will Willa follow the dolphins, or visit the turtle?',
      'What will Willa discover? A glowing pearl, or a fishy song?',
    ],
    choices: [
      [
        {
          id: 'dolphins', label: 'Dolphins', token: 'followed dolphins', art: asset('choices/dolphins.webp'),
          line: 'Willa followed two playful dolphins through the waves.',
          sentencePart: 'followed two playful dolphins through the waves',
        },
        {
          id: 'turtle', label: 'Sea turtle', token: 'swam with a turtle', art: asset('choices/turtle.webp'),
          line: 'Willa swam beside a wise sea turtle.',
          sentencePart: 'swam beside a wise sea turtle',
        },
      ],
      [
        {
          id: 'pearl', label: 'Pearl', token: 'found a pearl', art: asset('choices/pearl.webp'),
          line: 'Together they found a glowing pearl in a shell.',
          sentencePart: 'found a glowing pearl tucked inside a shell',
        },
        {
          id: 'song', label: 'Ocean song', token: 'sang a song', art: asset('choices/song.webp'),
          line: 'Together they sang a gentle song for the whole ocean.',
          sentencePart: 'sang a gentle song for the whole ocean',
        },
      ],
    ],
  },
  {
    id: 'moon',
    title: 'Moon',
    storyTitle: "Nova's Moon Story",
    skill: 'name moon story clues and choose Nova’s space adventure',
    background: asset('art/moon.webp'),
    protagonist: {
      id: 'nova',
      name: 'Nova',
      label: 'Nova the moon bunny',
      art: asset('characters/moon-bunny.webp'),
    },
    intro: 'Nova the moon bunny found a trail of stardust. Tap the glowing pictures and name what you see.',
    hotspots: [
      {
        id: 'bunny', label: 'bunny', pronunciation: 'BUN-ny', art: asset('vocab/bunny.webp'),
        x: 27, y: 58, line: 'Bunny. Nova is a brave moon bunny.',
      },
      {
        id: 'crater', label: 'crater', pronunciation: 'CRAY-ter', art: asset('vocab/crater.webp'),
        x: 64, y: 69, line: 'Crater. A crater is a round hollow on the moon.',
      },
      {
        id: 'rover', label: 'rover', pronunciation: 'RO-ver', art: asset('vocab/rover.webp'),
        x: 76, y: 45, line: 'Rover. The rover rolls over moon rocks.',
      },
      {
        id: 'star', label: 'star', pronunciation: 'STAR', art: asset('vocab/star.webp'),
        x: 55, y: 24, line: 'Star. The golden star twinkles hello.',
      },
    ],
    choicePrompts: [
      'What happens next? Will Nova moon-hop, or ride the rover?',
      'What will Nova find? A crystal cave, or a friendly star?',
    ],
    choices: [
      [
        {
          id: 'moon-hop', label: 'Moon hop', token: 'hopped high', art: asset('choices/moon-hop.webp'),
          line: 'Nova made giant, bouncy moon hops.',
          sentencePart: 'made giant, bouncy hops across the moon',
        },
        {
          id: 'rover', label: 'Moon rover', token: 'rode the rover', art: asset('choices/rover.webp'),
          line: 'Nova rode the little rover over silver hills.',
          sentencePart: 'rode a little rover over the silver hills',
        },
      ],
      [
        {
          id: 'crystal', label: 'Moon crystal', token: 'found a crystal', art: asset('choices/crystal.webp'),
          line: 'Nova found a crystal glowing under the moon dust.',
          sentencePart: 'found a crystal glowing under the moon dust',
        },
        {
          id: 'star-friend', label: 'Star friend', token: 'met a star friend', art: asset('choices/star-friend.webp'),
          line: 'Nova met a tiny star who became a new friend.',
          sentencePart: 'met a tiny star who became a new friend',
        },
      ],
    ],
  },
];

export function storySentence(world, selectedChoices) {
  const first = world.choices[0].find((choice) => choice.id === selectedChoices[0]);
  const second = world.choices[1].find((choice) => choice.id === selectedChoices[1]);
  if (!first || !second) return `${world.protagonist.label} began a wonderful adventure.`;
  return `${world.protagonist.label} ${first.sentencePart}, and ${second.sentencePart}.`;
}

export const audioLines = Object.fromEntries([
  ['welcome', "Welcome, storyteller! Let's make a tale together."],
  ['choose-world', 'Forest, ocean, or moon. Where shall our story begin?'],
  ['all-clues', 'You found every story word. Now choose what happens next!'],
  ['story-ready', 'Your story is ready. Tell it in your own words.'],
  ['record-ready', 'Press and hold the red microphone while you tell your story. It stays on this device.'],
  ['recording', "I'm listening. Tell your story!"],
  ['recorded', 'Your recording stays here until you leave this story. Tap replay to hear it.'],
  ['mic-fallback', 'No microphone? No problem. Tell your story out loud to someone nearby.'],
  ['guided-finish', 'Wonderful telling! You made a brand new story.'],
  ...worlds.flatMap((world) => [
    [`intro-${world.id}`, world.intro],
    ...world.hotspots.map((hotspot) => [`word-${world.id}-${hotspot.id}`, hotspot.line]),
    ...world.choicePrompts.map((line, index) => [`prompt-${world.id}-${index + 1}`, line]),
    ...world.choices.flatMap((choices, step) => choices.map((choice) => [
      `choice-${world.id}-${step + 1}-${choice.id}`,
      choice.line,
    ])),
  ]),
]);

export default {
  id: 'picture-narration',
  title: 'TaleTeller',
  ui,
  worlds,
  audioLines,
};
