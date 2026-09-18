export const GAME_ID = 'nature-scavenger-hunt';

export const ASSETS = Object.freeze({
  forest: './assets/backgrounds/forest.webp',
  title: './assets/ui/title.webp',
  clipboard: './assets/ui/clipboard.webp',
  missionPlaque: './assets/ui/mission-plaque.webp',
  actionButton: './assets/ui/action-button.webp',
  questCard: './assets/ui/quest-card.webp',
  checkBadge: './assets/ui/check-badge.webp',
  foundHalo: './assets/ui/found-halo.webp',
  hedgehog: './assets/guide/hedgehog.webp',
});

export const ITEM_ASSETS = Object.freeze({
  leaf: './assets/items/leaf.webp',
  stone: './assets/items/stone.webp',
  berries: './assets/items/berries.webp',
  dewdrop: './assets/items/dewdrop.webp',
  flower: './assets/items/flower.webp',
  pinecone: './assets/items/pinecone.webp',
  feather: './assets/items/feather.webp',
  twig: './assets/items/twig.webp',
  acorn: './assets/items/acorn.webp',
  mushroom: './assets/items/mushroom.webp',
  shell: './assets/items/shell.webp',
  seed: './assets/items/seed.webp',
});

export const CLUES = Object.freeze({
  smooth: { id: 'smooth', title: 'Find something smooth', short: 'Something smooth', hint: 'Gently feel its surface.', voice: 'clue-smooth', item: 'stone', alt: 'A smooth gray clay pebble' },
  green: { id: 'green', title: 'Find something green', short: 'Something green', hint: 'Look closely. The tiniest bit of green counts.', voice: 'clue-green', item: 'leaf', alt: 'A bright green clay leaf' },
  round: { id: 'round', title: 'Find something round', short: 'Something round', hint: 'A berry, a pebble, or your own idea can count.', voice: 'clue-round', item: 'berries', alt: 'Three round red clay berries' },
  tiny: { id: 'tiny', title: 'Find something tiny', short: 'Something tiny', hint: 'Use your sharp explorer eyes.', voice: 'clue-tiny', item: 'seed', alt: 'Two tiny golden clay seeds' },
  sound: { id: 'sound', title: 'Find a gentle sound', short: 'A gentle sound', hint: 'Move it softly, then listen carefully.', voice: 'clue-sound', item: 'shell', alt: 'A small spiral clay shell' },
  long: { id: 'long', title: 'Find something long', short: 'Something long', hint: 'Compare it with your hand.', voice: 'clue-long', item: 'twig', alt: 'A long forked clay twig' },
  bumpy: { id: 'bumpy', title: 'Find something bumpy', short: 'Something bumpy', hint: 'Feel each little bump.', voice: 'clue-bumpy', item: 'pinecone', alt: 'A bumpy brown clay pinecone' },
  soft: { id: 'soft', title: 'Find something soft', short: 'Something soft', hint: 'Touch it very gently.', voice: 'clue-soft', item: 'feather', alt: 'A soft cream clay feather' },
  rough: { id: 'rough', title: 'Find something rough', short: 'Something rough', hint: 'Rub one finger across it.', voice: 'clue-rough', item: 'acorn', alt: 'A clay acorn with a rough bumpy cap' },
  bendy: { id: 'bendy', title: 'Find something bendy', short: 'Something bendy', hint: 'Ask a grown-up before you bend it.', voice: 'clue-bendy', item: 'twig', alt: 'A gently curved clay twig' },
  tickly: { id: 'tickly', title: 'Find something tickly', short: 'Something tickly', hint: 'Brush it softly on your hand.', voice: 'clue-tickly', item: 'feather', alt: 'A light cream clay feather' },
  red: { id: 'red', title: 'Find something red', short: 'Something red', hint: 'A little spot of red counts.', voice: 'clue-red', item: 'berries', alt: 'Three bright red clay berries' },
  orange: { id: 'orange', title: 'Find something orange', short: 'Something orange', hint: 'Look near flowers, leaves, or try your own idea.', voice: 'clue-orange', item: 'flower', alt: 'An orange clay flower' },
  brown: { id: 'brown', title: 'Find something brown', short: 'Something brown', hint: 'Look near the ground and on tree bark.', voice: 'clue-brown', item: 'pinecone', alt: 'A brown clay pinecone' },
  blue: { id: 'blue', title: 'Find something blue', short: 'Something blue', hint: 'Look up, look down, and look for a tiny patch.', voice: 'clue-blue', item: 'dewdrop', alt: 'A bright blue clay dewdrop' },
  golden: { id: 'golden', title: 'Find golden yellow', short: 'Golden yellow', hint: 'A seed, a flower, or your own idea can count.', voice: 'clue-golden', item: 'seed', alt: 'Two golden yellow clay seeds' },
});

export const MODES = Object.freeze([
  { id: 'nature-mix', title: 'Nature Mix', subtitle: 'Look, listen, and notice', briefVoice: 'brief-nature-mix', completeVoice: 'complete-nature-mix', clues: ['smooth', 'green', 'round', 'tiny', 'sound', 'long'], preview: ['leaf', 'stone', 'seed'] },
  { id: 'texture-trail', title: 'Texture Trail', subtitle: 'Touch gently and compare', briefVoice: 'brief-texture-trail', completeVoice: 'complete-texture-trail', clues: ['bumpy', 'soft', 'rough', 'smooth', 'bendy', 'tickly'], preview: ['pinecone', 'feather', 'acorn'] },
  { id: 'color-quest', title: 'Color Quest', subtitle: 'Find a rainbow outdoors', briefVoice: 'brief-color-quest', completeVoice: 'complete-color-quest', clues: ['green', 'red', 'orange', 'brown', 'blue', 'golden'], preview: ['berries', 'dewdrop', 'flower'] },
]);

export const MODE_BY_ID = Object.freeze(Object.fromEntries(MODES.map((mode) => [mode.id, mode])));

export const VOICE_LINES = Object.freeze({
  welcome: 'Choose a trail, nature explorer!',
  'brief-nature-mix': "Let's find three nature treasures. Look closely, listen carefully, and take your time.",
  'brief-texture-trail': "Let's find three textures. Touch gently, and ask a grown-up before you pick anything up.",
  'brief-color-quest': "Let's find three colors in nature. Even a tiny spot of color counts.",
  'brief-ready': "Here are your three clues. Tap the big green button when you're ready.",
  'clue-smooth': 'Find something smooth. Gently feel its surface.',
  'clue-green': 'Find something green. Look closely. The tiniest bit of green counts.',
  'clue-round': 'Find something round. It can be a berry, a pebble, or your own idea.',
  'clue-tiny': 'Find something tiny. Use your sharp explorer eyes.',
  'clue-sound': 'Find something that makes a gentle sound when you move it. Listen carefully.',
  'clue-long': 'Find something long. Compare it with your hand.',
  'clue-bumpy': 'Find something bumpy. Feel each little bump.',
  'clue-soft': 'Find something soft. Touch it very gently.',
  'clue-rough': 'Find something rough. Rub one finger across it.',
  'clue-bendy': 'Find something bendy. Ask a grown-up before you bend it.',
  'clue-tickly': 'Find something tickly. Brush it softly on your hand.',
  'clue-red': 'Find something red. A little spot of red counts.',
  'clue-orange': 'Find something orange. Look near flowers, leaves, or your own idea.',
  'clue-brown': 'Find something brown. Look near the ground and on tree bark.',
  'clue-blue': 'Find something blue. Look up, look down, and look for a tiny patch.',
  'clue-golden': 'Find something golden yellow. A seed, a flower, or your own idea can count.',
  'praise-1': 'What a clever find!',
  'praise-2': 'Wonderful noticing!',
  'praise-3': 'You found a real nature clue!',
  'complete-nature-mix': 'Nature Mix complete! You used your eyes, ears, and hands.',
  'complete-texture-trail': 'Texture Trail complete! Your fingertips notice so much!',
  'complete-color-quest': 'Color Quest complete! You found a rainbow outside.',
  again: 'Ready for three new clues?',
});

export const PRAISE_KEYS = Object.freeze(['praise-1', 'praise-2', 'praise-3']);
export const RUNTIME_IMAGES = Object.freeze([...Object.values(ASSETS), ...Object.values(ITEM_ASSETS)]);
