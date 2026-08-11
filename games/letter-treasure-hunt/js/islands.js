const LAYERED_SCENES = {
  a: {
    background: '../assets/papercraft/a-hunt/background.webp',
    celebration: '../assets/papercraft/a-celebration.webp',
    completionWord: 'Apple',
    targets: {
      ant: { art: '../assets/papercraft/a-hunt/ant.webp', x: 4, y: 46, w: 21, h: 35 },
      apple: { art: '../assets/papercraft/a-hunt/apple.webp', x: 28, y: 44, w: 21, h: 37 },
      alligator: { art: '../assets/papercraft/a-hunt/alligator.webp', x: 68, y: 58, w: 28, h: 27 },
    },
    distractors: [
      { id: 'distractor-a-ball', word: 'Ball', letter: 'B', feedbackKey: 'wrong-a-ball', narrationKey: 'wrong-a-ball', art: '../assets/papercraft/b-hunt/ball.webp', x: 52, y: 60, w: 12, h: 17 },
    ],
    decoy: { art: '../assets/papercraft/a-hunt/chest.webp', x: 76, y: 24, w: 20, h: 25 },
  },
  b: {
    background: '../assets/papercraft/b-hunt/background.webp',
    celebration: '../assets/papercraft/island-celebration.webp',
    completionWord: 'Ball',
    targets: {
      butterfly: { art: '../assets/papercraft/b-hunt/butterfly.webp', x: 6, y: 34, w: 22, h: 28 },
      ball: { art: '../assets/papercraft/b-hunt/ball.webp', x: 36, y: 47, w: 18, h: 25 },
      boat: { art: '../assets/papercraft/b-hunt/boat.webp', x: 7, y: 66, w: 27, h: 27 },
    },
    distractors: [
      { id: 'distractor-b-cat', word: 'Cat', letter: 'C', feedbackKey: 'wrong-b-cat', narrationKey: 'wrong-b-cat', art: '../assets/papercraft/c-hunt/cat.webp', x: 56, y: 55, w: 12, h: 23 },
    ],
    decoy: { art: '../assets/papercraft/b-hunt/chest.webp', x: 73, y: 44, w: 21, h: 27 },
  },
  c: {
    background: '../assets/papercraft/c-hunt/background.webp',
    celebration: '../assets/papercraft/c-celebration.webp',
    completionWord: 'Cupcake',
    targets: {
      cat: { art: '../assets/papercraft/c-hunt/cat.webp', x: 4, y: 43, w: 22, h: 38 },
      cupcake: { art: '../assets/papercraft/c-hunt/cupcake.webp', x: 29, y: 43, w: 20, h: 39 },
      car: { art: '../assets/papercraft/c-hunt/car.webp', x: 66, y: 54, w: 27, h: 28 },
    },
    distractors: [
      { id: 'distractor-c-apple', word: 'Apple', letter: 'A', feedbackKey: 'wrong-c-apple', narrationKey: 'wrong-c-apple', art: '../assets/papercraft/a-hunt/apple.webp', x: 52, y: 64, w: 11, h: 16 },
    ],
    decoy: { art: '../assets/papercraft/c-hunt/chest.webp', x: 77, y: 22, w: 19, h: 24 },
  },
};

const DZ_LAYOUT_URL = new URL('../data/dz-scene-layouts.json', import.meta.url);
let DZ_LAYOUT_DOCUMENT = null;
const layoutController = new AbortController();
const layoutTimeout = setTimeout(() => layoutController.abort(), 4000);
try {
  const response = await fetch(DZ_LAYOUT_URL, { cache: 'no-store', signal: layoutController.signal });
  if (!response.ok) throw new Error(`layout request returned ${response.status}`);
  const document = await response.json();
  if (![1, 2].includes(document?.version) || document?.coordinateSpace?.aspectRatio !== '4:3' || !document?.letters
      || (document.version === 2 && (document.coordinateSpace?.rectMeaning !== 'visible-alpha-bounds' || !document.artTrims))) {
    throw new Error('layout document has an unsupported schema');
  }
  DZ_LAYOUT_DOCUMENT = document;
} catch (error) {
  console.warn(`Letter Treasure Hunt: using built-in D-Z layouts (${error.message})`);
} finally {
  clearTimeout(layoutTimeout);
}

function validRect(rect) {
  return rect && ['x', 'y', 'w', 'h'].every((key) => Number.isFinite(rect[key]))
    && rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0
    && rect.x + rect.w <= 100 && rect.y + rect.h <= 100;
}

function layoutRect(candidate, fallback) {
  return { ...(validRect(candidate) ? candidate : fallback) };
}

function artTrim(art) {
  const trim = DZ_LAYOUT_DOCUMENT?.version >= 2 ? DZ_LAYOUT_DOCUMENT?.artTrims?.[art] : null;
  return validRect(trim) ? { ...trim } : null;
}

// D-Z use the same layered construction as A-C: an empty island background,
// three independently interactive papercraft objects, a cross-letter choice,
// and a separate chest. The shared geometry keeps the expanded set readable
// while every visible choice remains a real raster layer.
const LAYERED_TARGET_POSITIONS = [
  { x: 3, y: 55, w: 27, h: 26 },
  { x: 36.5, y: 55, w: 27, h: 26 },
  { x: 70, y: 55, w: 27, h: 26 },
];

const COMPLETION_TARGET_POSITIONS = [
  { x: 4, y: 53, w: 20, h: 29 },
  { x: 27.5, y: 53, w: 20, h: 29 },
  { x: 51, y: 53, w: 20, h: 29 },
];

const DISTRACTOR_ART = {
  ant: { word: 'Ant', letter: 'A', art: '../assets/papercraft/a-hunt/ant.webp' },
  apple: { word: 'Apple', letter: 'A', art: '../assets/papercraft/a-hunt/apple.webp' },
  alligator: { word: 'Alligator', letter: 'A', art: '../assets/papercraft/a-hunt/alligator.webp' },
  ball: { word: 'Ball', letter: 'B', art: '../assets/papercraft/b-hunt/ball.webp' },
  boat: { word: 'Boat', letter: 'B', art: '../assets/papercraft/b-hunt/boat.webp' },
  butterfly: { word: 'Butterfly', letter: 'B', art: '../assets/papercraft/b-hunt/butterfly.webp' },
  car: { word: 'Car', letter: 'C', art: '../assets/papercraft/c-hunt/car.webp' },
  cat: { word: 'Cat', letter: 'C', art: '../assets/papercraft/c-hunt/cat.webp' },
  cupcake: { word: 'Cupcake', letter: 'C', art: '../assets/papercraft/c-hunt/cupcake.webp' },
};

// Grounded objects share the upper-sand baseline; water and flying choices
// sit nearer the shoreline so their placement matches what they are.
const DISTRACTOR_POSITIONS = {
  alligator: { x: 47, y: 34, w: 9, h: 15 },
  boat: { x: 47, y: 34, w: 9, h: 15 },
  butterfly: { x: 47, y: 25, w: 9, h: 14 },
  ground: { x: 47, y: 35, w: 9, h: 15 },
};

const LAYERED_SCENE_SETTINGS = {
  d: ['Drum', 'apple'], e: ['Elephant', 'ball'], f: ['Frog', 'cat'],
  g: ['Grapes', 'ant'], h: ['Horse', 'butterfly'], i: ['Ice Cream', 'cupcake'],
  j: ['Jellyfish', 'alligator'], k: ['Kite', 'boat'], l: ['Lemon', 'car'],
  m: ['Moon', 'apple'], n: ['Nest', 'ball'], o: ['Orange', 'cat'],
  p: ['Pineapple', 'ant'], q: ['Quilt', 'butterfly'], r: ['Rainbow', 'cupcake'],
  s: ['Starfish', 'alligator'], t: ['Train', 'boat'], u: ['Umbrella', 'car'],
  v: ['Violin', 'apple'], w: ['Watermelon', 'ball'], x: ['Xylophone', 'cat'],
  y: ['Yo-Yo', 'ant'], z: ['Zebra', 'butterfly'],
};

function layeredScene(island) {
  const id = island.letter.toLowerCase();
  const settings = LAYERED_SCENE_SETTINGS[id];
  if (!settings) return null;
  const [completionWord, distractorId] = settings;
  const distractor = DISTRACTOR_ART[distractorId];
  const candidateLayout = DZ_LAYOUT_DOCUMENT?.letters?.[id];
  const targetArts = island.items.map(([itemId]) => `../assets/papercraft/${id}-hunt/${itemId}.webp`);
  const requiredArts = [...targetArts, distractor.art, '../assets/papercraft/a-hunt/chest.webp', '../assets/papercraft/shared/open-chest.webp'];
  const tightRectsReady = candidateLayout
    && island.items.every(([itemId]) => validRect(candidateLayout.hunt?.targets?.[itemId]) && validRect(candidateLayout.completion?.targets?.[itemId]))
    && validRect(candidateLayout.hunt?.distractor)
    && validRect(candidateLayout.hunt?.chest)
    && validRect(candidateLayout.completion?.chest);
  const tightLayoutReady = DZ_LAYOUT_DOCUMENT?.version === 2 && tightRectsReady && requiredArts.every((art) => artTrim(art));
  const authoredLayout = DZ_LAYOUT_DOCUMENT?.version === 1 || tightLayoutReady ? candidateLayout : null;
  const sceneTrim = (art) => tightLayoutReady ? artTrim(art) : null;
  if (DZ_LAYOUT_DOCUMENT?.version === 2 && !tightLayoutReady) console.warn(`Letter Treasure Hunt: using built-in ${id.toUpperCase()} layout because trim metadata is incomplete`);
  const targets = Object.fromEntries(island.items.map(([itemId], index) => [itemId, {
    art: `../assets/papercraft/${id}-hunt/${itemId}.webp`,
    trim: sceneTrim(`../assets/papercraft/${id}-hunt/${itemId}.webp`),
    ...layoutRect(authoredLayout?.hunt?.targets?.[itemId], LAYERED_TARGET_POSITIONS[index]),
  }]));
  return {
    background: `../assets/papercraft/${id}-hunt/background.webp`,
    celebration: `../assets/papercraft/${id}-hunt/background.webp`,
    completionWord,
    targets,
    completionTargets: island.items.map(([itemId], index) => ({
      id: itemId,
      art: targets[itemId].art,
      trim: targets[itemId].trim,
      ...layoutRect(authoredLayout?.completion?.targets?.[itemId], COMPLETION_TARGET_POSITIONS[index]),
    })),
    distractors: [{
      id: `distractor-${id}-${distractorId}`,
      ...distractor,
      feedbackKey: `wrong-${id}-${distractorId}`,
      narrationKey: `wrong-${id}-${distractorId}`,
      trim: sceneTrim(distractor.art),
      ...layoutRect(authoredLayout?.hunt?.distractor, DISTRACTOR_POSITIONS[distractorId] || DISTRACTOR_POSITIONS.ground),
    }],
    decoy: {
      art: '../assets/papercraft/a-hunt/chest.webp',
      trim: sceneTrim('../assets/papercraft/a-hunt/chest.webp'),
      ...layoutRect(authoredLayout?.hunt?.chest, { x: 78, y: 32, w: 17, h: 22 }),
    },
    completionDecoration: {
      art: '../assets/papercraft/shared/open-chest.webp',
      trim: sceneTrim('../assets/papercraft/shared/open-chest.webp'),
      ...layoutRect(authoredLayout?.completion?.chest, { x: 72, y: 52, w: 25, h: 35 }),
    },
  };
}

export const ISLANDS = [
  { letter: 'A', name: 'Apple Island', items: [['ant', 'Ant'], ['apple', 'Apple'], ['alligator', 'Alligator']] },
  { letter: 'B', name: 'Beach Ball Island', items: [['butterfly', 'Butterfly'], ['ball', 'Ball'], ['boat', 'Boat']] },
  { letter: 'C', name: 'Cupcake Island', items: [['cat', 'Cat'], ['cupcake', 'Cupcake'], ['car', 'Car']] },
  { letter: 'D', name: 'Drum Island', items: [['dog', 'Dog'], ['drum', 'Drum'], ['duck', 'Duck']] },
  { letter: 'E', name: 'Elephant Island', items: [['elephant', 'Elephant'], ['egg', 'Egg'], ['envelope', 'Envelope']] },
  { letter: 'F', name: 'Frog Island', items: [['fish', 'Fish'], ['flower', 'Flower'], ['frog', 'Frog']] },
  { letter: 'G', name: 'Grape Island', items: [['goat', 'Goat'], ['grapes', 'Grapes'], ['guitar', 'Guitar']] },
  { letter: 'H', name: 'Horse Island', items: [['hat', 'Hat'], ['horse', 'Horse'], ['house', 'House']] },
  { letter: 'I', name: 'Ice Cream Island', items: [['ice-cream', 'Ice Cream'], ['igloo', 'Igloo'], ['insect', 'Insect']] },
  { letter: 'J', name: 'Jellyfish Island', items: [['jacket', 'Jacket'], ['jellyfish', 'Jellyfish'], ['juice', 'Juice']] },
  { letter: 'K', name: 'Kite Island', items: [['kite', 'Kite'], ['key', 'Key'], ['kangaroo', 'Kangaroo']] },
  { letter: 'L', name: 'Lemon Island', items: [['lion', 'Lion'], ['leaf', 'Leaf'], ['lemon', 'Lemon']] },
  { letter: 'M', name: 'Moon Island', items: [['monkey', 'Monkey'], ['moon', 'Moon'], ['muffin', 'Muffin']] },
  { letter: 'N', name: 'Nest Island', items: [['nest', 'Nest'], ['noodles', 'Noodles'], ['nose', 'Nose']] },
  { letter: 'O', name: 'Orange Island', items: [['owl', 'Owl'], ['orange', 'Orange'], ['octopus', 'Octopus']] },
  { letter: 'P', name: 'Pineapple Island', items: [['penguin', 'Penguin'], ['pineapple', 'Pineapple'], ['pizza', 'Pizza']] },
  { letter: 'Q', name: 'Quilt Island', items: [['queen', 'Queen'], ['quilt', 'Quilt'], ['quail', 'Quail']] },
  { letter: 'R', name: 'Rainbow Island', items: [['rabbit', 'Rabbit'], ['rainbow', 'Rainbow'], ['robot', 'Robot']] },
  { letter: 'S', name: 'Starfish Island', items: [['sun', 'Sun'], ['starfish', 'Starfish'], ['shell', 'Shell']] },
  { letter: 'T', name: 'Train Island', items: [['tiger', 'Tiger'], ['turtle', 'Turtle'], ['train', 'Train']] },
  { letter: 'U', name: 'Umbrella Island', items: [['umbrella', 'Umbrella'], ['unicorn', 'Unicorn'], ['ukulele', 'Ukulele']] },
  { letter: 'V', name: 'Violin Island', items: [['violin', 'Violin'], ['volcano', 'Volcano'], ['van', 'Van']] },
  { letter: 'W', name: 'Watermelon Island', items: [['whale', 'Whale'], ['watermelon', 'Watermelon'], ['wagon', 'Wagon']] },
  { letter: 'X', name: 'Xylophone Island', items: [['xylophone', 'Xylophone'], ['x-ray', 'X-ray'], ['x-mark', 'X Marks the Spot']] },
  { letter: 'Y', name: 'Yo-Yo Island', items: [['yak', 'Yak'], ['yo-yo', 'Yo-Yo'], ['yarn', 'Yarn']] },
  { letter: 'Z', name: 'Zebra Island', items: [['zebra', 'Zebra'], ['zipper', 'Zipper'], ['zucchini', 'Zucchini']] },
].map((island, index) => ({
  ...island,
  id: island.letter.toLowerCase(),
  index,
  art: `../assets/islands/${island.letter.toLowerCase()}.webp`,
  color: ['#ef6548', '#1766ad', '#087f88', '#bb5a34'][index % 4],
  scene: LAYERED_SCENES[island.letter.toLowerCase()] || layeredScene(island),
  items: island.items.map(([id, word], itemIndex) => ({
    id,
    word,
    layout: island.letter === 'B' && itemIndex === 2 ? 'lower-left' : ['left', 'center', 'right'][itemIndex],
  })),
  decoy: {
    id: `decoy-${island.letter.toLowerCase()}`,
    word: island.letter === 'T' ? 'Boat' : 'Treasure Chest',
    visual: 'chest',
    layout: 'decoy',
  },
}));

export const ISLAND_BY_ID = new Map(ISLANDS.map((island) => [island.id, island]));
