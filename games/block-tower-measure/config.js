export default {
  id: 'block-tower-measure',
  engine: 'build-assemble',
  title: 'Block Tower Measure',
  splashEmoji: '🗼',
  voice: {
    intro: 'Stack the tower. Biggest block first!',
    nudge: 'That block goes in another spot. Try again.',
    wait: 'Find the biggest block that comes next.',
    cheer: 'You measured the towers!',
  },
  modes: [
    {
      id: 'stack',
      title: 'Stack It Tall',
      rounds: 4,
      prompt: 'Stack it tall. Biggest block first!',
      builds: [
        towerBuild('three-block-tower', 3, 500, 'One, two, three blocks tall!'),
        towerBuild('four-block-tower', 4, 500, 'One, two, three, four blocks tall!'),
        towerBuild('five-block-tower', 5, 500, 'One, two, three, four, five blocks tall!'),
        towerBuild('wide-four-block-tower', 4, 500, 'Biggest to smallest. Four blocks tall!'),
      ],
    },
    {
      id: 'compare',
      title: 'Two Towers',
      rounds: 3,
      prompt: 'Build the short tower and the tall tower.',
      builds: [
        compareBuild('red-towers', 'The red tower is TALLER!'),
        compareBuild('side-towers', 'One tower is short. One tower is tall!'),
        compareBuild('measure-towers', 'Two blocks and four blocks. The four-block tower is taller!'),
      ],
    },
  ],
};

function towerBuild(name, count, centerX, say) {
  const blocks = [];
  const baseY = 720;
  const sizes = [260, 225, 190, 155, 125];
  for (let i = 0; i < count; i++) {
    blocks.push({
      art: 'emoji:🟥',
      alt: `${name} block ${i + 1}`,
      say: blockSay(i, count),
      x: centerX,
      y: baseY - i * 118,
      size: sizes[i],
    });
  }
  return {
    name,
    ordered: true,
    say,
    parts: blocks,
  };
}

function compareBuild(name, say) {
  return {
    name,
    ordered: true,
    say,
    parts: [
      { art: 'emoji:🟥', alt: `${name} short tower bottom block`, say: 'short tower bottom', x: 340, y: 720, size: 215 },
      { art: 'emoji:🟥', alt: `${name} short tower top block`, say: 'short tower top', x: 340, y: 595, size: 175 },
      { art: 'emoji:🟥', alt: `${name} tall tower bottom block`, say: 'tall tower bottom', x: 660, y: 720, size: 245 },
      { art: 'emoji:🟥', alt: `${name} tall tower second block`, say: 'tall tower second', x: 660, y: 590, size: 210 },
      { art: 'emoji:🟥', alt: `${name} tall tower third block`, say: 'tall tower third', x: 660, y: 470, size: 175 },
      { art: 'emoji:🟥', alt: `${name} tall tower top block`, say: 'tall tower top', x: 660, y: 360, size: 145 },
    ],
  };
}

function blockSay(index, count) {
  if (index === 0) return 'biggest block';
  if (index === count - 1) return 'top block';
  return 'next smaller block';
}
