export default {
  id: 'silly-swap-words',
  engine: 'build-assemble',
  title: 'Silly Swap Words',
  splashEmoji: '🔄',
  voice: {
    intro: 'Swap one sound. Make a brand new word!',
    nudge: 'That sound goes in a different spot. Try again.',
    wait: 'Start with the first sound, then add the ending.',
    cheer: 'Silly swaps made new words!',
  },
  modes: [
    {
      id: 'swap',
      title: 'Swap a Sound',
      rounds: 5,
      prompt: 'Build the new word. One sound changed!',
      builds: [
        swapBuild('hat', 'h', 'at', 'cat', 'c', 'Swap the C for an H. HAT! The cat became a hat!'),
        swapBuild('bun', 'b', 'un', 'sun', 's', 'Swap the S for a B. BUN! The sun became a bun!'),
        swapBuild('log', 'l', 'og', 'dog', 'd', 'Swap the D for an L. LOG! The dog became a log!'),
        swapBuild('wig', 'w', 'ig', 'pig', 'p', 'Swap the P for a W. WIG! The pig became a wig!'),
        swapBuild('top', 't', 'op', 'mop', 'm', 'Swap the M for a T. TOP! The mop became a top!'),
      ],
    },
    {
      id: 'chain',
      title: 'Word Chains',
      rounds: 3,
      prompt: 'Build the next word in the chain.',
      builds: [
        swapBuild('cat', 'c', 'at', 'start', '', 'Start the chain. CAT!'),
        swapBuild('hat', 'h', 'at', 'cat', 'c', 'Swap the C for an H. HAT! Cat became hat!'),
        swapBuild('ham', 'h', 'am', 'hat', 'at', 'Swap AT for AM. HAM! Hat became ham!'),
      ],
    },
  ],
};

function swapBuild(word, onset, rime, fromWord, oldPart, say) {
  return {
    name: `${fromWord}-to-${word}`,
    ordered: true,
    say,
    parts: [
      {
        art: `shared:letter-tiles/${onset}.png`,
        alt: `${onset} sound tile`,
        say: soundFor(onset),
        x: 405,
        y: 500,
        size: 190,
      },
      {
        art: `shared:letter-tiles/${rime}.png`,
        alt: `${rime} word-ending tile`,
        say: soundFor(rime),
        x: 595,
        y: 500,
        size: 190,
      },
    ],
    swapFrom: oldPart,
  };
}

function soundFor(part) {
  return {
    am: 'am',
    at: 'at',
    b: 'buh',
    c: 'kuh',
    d: 'duh',
    h: 'huh',
    ig: 'ig',
    l: 'lll',
    m: 'mmm',
    og: 'og',
    op: 'op',
    p: 'puh',
    s: 'sss',
    t: 'tuh',
    un: 'un',
    w: 'wuh',
  }[part] || part;
}
