export default {
  id: 'bead-path-builder',
  engine: 'build-assemble',
  title: 'Bead Path Builder',
  splashEmoji: '🧵',
  voice: {
    intro: 'String the beads along the cord.',
    nudge: 'That bead belongs on another spot. Try again.',
    wait: 'Start at the left side of the cord.',
    cheer: 'The bead paths are complete!',
  },
  modes: [
    {
      id: 'string',
      title: 'String the Beads',
      rounds: 4,
      prompt: 'String each bead from left to right.',
      builds: [
        beadBuild('four-bead-arc', [
          bead('swatch:#e23d3d', 'red bead', 'one red bead'),
          bead('swatch:#f4c53d', 'yellow bead', 'two yellow bead'),
          bead('swatch:#2d7dd2', 'blue bead', 'three blue bead'),
          bead('swatch:#58a945', 'green bead', 'four green bead'),
        ], 'One, two, three, four. The beads are on the cord!'),
        beadBuild('five-bead-curve', [
          bead('emoji:🔴', 'red round bead', 'one red bead'),
          bead('emoji:🟡', 'yellow round bead', 'two yellow bead'),
          bead('emoji:🔵', 'blue round bead', 'three blue bead'),
          bead('emoji:🟢', 'green round bead', 'four green bead'),
          bead('emoji:🟣', 'purple round bead', 'five purple bead'),
        ], 'One, two, three, four, five. The cord is full!'),
        beadBuild('six-bead-wave', [
          bead('swatch:#f25f5c', 'coral bead', 'one coral bead'),
          bead('swatch:#ffd166', 'gold bead', 'two gold bead'),
          bead('swatch:#06d6a0', 'mint bead', 'three mint bead'),
          bead('swatch:#2d7dd2', 'blue bead', 'four blue bead'),
          bead('swatch:#7c4fc4', 'purple bead', 'five purple bead'),
          bead('swatch:#ef476f', 'pink bead', 'six pink bead'),
        ], 'One, two, three, four, five, six. A wavy string!'),
        beadBuild('craft-charms', [
          bead('emoji:❤️', 'heart bead', 'one heart bead'),
          bead('emoji:⭐', 'star bead', 'two star bead'),
          bead('emoji:🔷', 'diamond bead', 'three diamond bead'),
          bead('emoji:🔶', 'orange diamond bead', 'four diamond bead'),
          bead('emoji:💚', 'green heart bead', 'five heart bead'),
        ], 'The charm beads are strung!'),
      ],
    },
    {
      id: 'fancy',
      title: 'Fancy Strings',
      rounds: 3,
      prompt: 'Match the fancy bead spots on the curvy cord.',
      builds: [
        beadBuild('red-star-red-star', [
          bead('emoji:🔴', 'red bead', 'red bead'),
          bead('emoji:⭐', 'star bead', 'star bead'),
          bead('emoji:🔴', 'red bead', 'red bead'),
          bead('emoji:⭐', 'star bead', 'star bead'),
        ], 'Red, star, red, star. Fancy string!', false),
        beadBuild('blue-heart-blue-heart', [
          bead('emoji:🔵', 'blue bead', 'blue bead'),
          bead('emoji:💛', 'heart bead', 'heart bead'),
          bead('emoji:🔵', 'blue bead', 'blue bead'),
          bead('emoji:💛', 'heart bead', 'heart bead'),
          bead('emoji:🔵', 'blue bead', 'blue bead'),
        ], 'Blue, heart, blue, heart, blue. The pattern shines!', false),
        beadBuild('moon-dot-moon-dot', [
          bead('emoji:🌙', 'moon bead', 'moon bead'),
          bead('emoji:🟢', 'green bead', 'green bead'),
          bead('emoji:🌙', 'moon bead', 'moon bead'),
          bead('emoji:🟢', 'green bead', 'green bead'),
          bead('emoji:🌙', 'moon bead', 'moon bead'),
          bead('emoji:🟢', 'green bead', 'green bead'),
        ], 'Moon, green, moon, green. A fancy cord!', false),
      ],
    },
  ],
};

function bead(art, alt, say) {
  return { art, alt, say };
}

function beadBuild(name, beads, say, ordered = true) {
  const count = beads.length;
  const step = count > 1 ? 520 / (count - 1) : 0;
  const startX = 240;

  return {
    name,
    ordered,
    say,
    parts: beads.map((part, index) => {
      const progress = count === 1 ? 0 : index / (count - 1);
      const curve = Math.sin(progress * Math.PI * 1.35) * 95;
      return {
        ...part,
        x: startX + index * step,
        y: 505 - curve,
        size: 130,
      };
    }),
  };
}
