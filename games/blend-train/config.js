export default {
  id: 'blend-train',
  engine: 'build-assemble',
  title: 'Blend Train',
  splashEmoji: '🚂',
  voice: {
    intro: 'Push the sound cars together. Listen to the word!',
    nudge: 'That car goes on another track. Try again.',
    wait: 'Listen for the first car.',
    cheer: 'The blend train is rolling!',
  },
  modes: [
    {
      id: 'couple',
      title: 'Couple the Cars',
      rounds: 5,
      prompt: 'Couple the sound cars. First sound, then word ending.',
      builds: [
        wordBuild('mat', 'm', 'at', 'mmm... aaat... MAT!'),
        wordBuild('cat', 'c', 'at', 'kuh... aaat... CAT!'),
        wordBuild('sun', 's', 'un', 'sss... uuun... SUN!'),
        wordBuild('dog', 'd', 'og', 'duh... aaag... DOG!'),
        wordBuild('pig', 'p', 'ig', 'puh... iiig... PIG!'),
      ],
    },
    {
      id: 'three',
      title: 'Three-Car Trains',
      rounds: 4,
      prompt: 'Build the three-car train. First sound, ending, then the whole word.',
      builds: [
        wordBuild('mat', 'm', 'at', 'mmm... aaat... MAT!', true),
        wordBuild('cat', 'c', 'at', 'kuh... aaat... CAT!', true),
        wordBuild('sun', 's', 'un', 'sss... uuun... SUN!', true),
        wordBuild('pig', 'p', 'ig', 'puh... iiig... PIG!', true),
      ],
    },
  ],
};

function wordBuild(word, onset, rime, say, includeWordCard = false) {
  const parts = [
    {
      art: `shared:letter-tiles/${onset}.png`,
      alt: `${onset} sound train car`,
      say: onsetSound(onset),
      x: 315,
      y: 500,
      size: 190,
    },
    {
      art: `shared:letter-tiles/${rime}.png`,
      alt: `${rime} sound train car`,
      say: rimeSound(rime),
      x: 500,
      y: 500,
      size: 190,
    },
  ];

  if (includeWordCard) {
    parts.push({
      art: `text:${word.toUpperCase()}`,
      alt: `${word} whole word caboose`,
      say: word,
      x: 685,
      y: 500,
      size: 190,
    });
  }

  return {
    name: `${word}-train`,
    ordered: true,
    say,
    parts,
  };
}

function onsetSound(onset) {
  return {
    c: 'kuh',
    d: 'duh',
    m: 'mmm',
    p: 'puh',
    s: 'sss',
  }[onset] || onset;
}

function rimeSound(rime) {
  return {
    at: 'aat',
    ig: 'ig',
    og: 'og',
    un: 'un',
  }[rime] || rime;
}
