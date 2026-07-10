export default {
  id: 'turn-taking-tower',
  engine: 'build-assemble',
  title: 'Turn-Taking Tower',
  splashEmoji: '🏗️',
  voice: {
    intro: 'Build the tower together. Listen for whose turn comes next.',
    nudge: 'That block comes later. Wait for the next turn.',
    wait: 'Find the next block for the tower.',
    cheer: 'Our tower is standing tall. We took turns together!',
  },
  modes: [
    {
      id: 'together',
      title: 'Our Tower',
      rounds: 4,
      prompt: 'Take turns building the tower.',
      builds: [
        tower('maya-five', 'Maya and you built a steady tower!', [
          block('emoji:🟥', 'Maya red bottom block', 'Maya places hers. Now it is your turn.', 500, 760, 190),
          block('emoji:🟦', 'your blue block', 'Your turn. Place the blue block.', 500, 640, 185),
          block('emoji:🟩', 'Maya green block', 'Maya takes a turn. Now wait for your turn.', 500, 520, 180),
          block('emoji:🟨', 'your yellow block', 'Your turn again. Add the yellow block.', 500, 400, 175),
          block('emoji:🟪', 'Maya purple top block', 'Maya adds the top. Together!', 500, 280, 165),
        ]),
        tower('sam-six', 'Sam and you built a careful tower!', [
          block('emoji:🟫', 'Sam brown bottom block', 'Sam places the first block.', 500, 800, 185),
          block('emoji:🟧', 'your orange block', 'Now it is your turn. Orange block.', 500, 690, 180),
          block('emoji:🟦', 'Sam blue block', 'Sam places his block. Wait, wait.', 500, 580, 175),
          block('emoji:🟩', 'your green block', 'Your turn. Green block.', 500, 470, 170),
          block('emoji:🟨', 'Sam yellow block', 'Sam takes a turn.', 500, 360, 165),
          block('emoji:🟥', 'your red top block', 'Your turn for the top block.', 500, 250, 160),
        ]),
        tower('nia-five', 'Nia and you made the tower balanced!', [
          block('emoji:🟪', 'Nia purple bottom block', 'Nia starts the tower.', 500, 760, 190),
          block('emoji:🟨', 'your yellow block', 'Your turn. Place yellow.', 500, 640, 185),
          block('emoji:🟥', 'Nia red block', 'Nia places red. Now wait.', 500, 520, 180),
          block('emoji:🟦', 'your blue block', 'Your turn. Place blue.', 500, 400, 175),
          block('emoji:🟩', 'Nia green top block', 'Nia finishes with green.', 500, 280, 165),
        ]),
        tower('ravi-six', 'Ravi and you built a proud tower!', [
          block('emoji:🟦', 'Ravi blue bottom block', 'Ravi places the bottom block.', 500, 800, 185),
          block('emoji:🟩', 'your green block', 'Your turn. Green goes next.', 500, 690, 180),
          block('emoji:🟨', 'Ravi yellow block', 'Ravi takes a turn. We wait.', 500, 580, 175),
          block('emoji:🟧', 'your orange block', 'Your turn. Add orange.', 500, 470, 170),
          block('emoji:🟥', 'Ravi red block', 'Ravi places red.', 500, 360, 165),
          block('emoji:🟪', 'your purple top block', 'Your turn for the purple top.', 500, 250, 160),
        ]),
      ],
    },
    {
      id: 'tall',
      title: 'Super Tower',
      rounds: 3,
      prompt: 'Build a super tower with two friends taking turns.',
      builds: [
        tower('maya-sam-seven', 'Maya, Sam, and you made a super tower!', [
          block('emoji:🟥', 'Maya red base block', 'Maya starts. Red block.', 500, 835, 170),
          block('emoji:🟦', 'your blue block', 'Your turn. Blue block.', 500, 730, 166),
          block('emoji:🟩', 'Sam green block', 'Sam takes a turn. We wait.', 500, 625, 162),
          block('emoji:🟨', 'your yellow block', 'Your turn. Yellow block.', 500, 520, 158),
          block('emoji:🟧', 'Maya orange block', 'Maya places orange.', 500, 415, 154),
          block('emoji:🟪', 'your purple block', 'Your turn. Purple block.', 500, 310, 150),
          block('emoji:🟫', 'Sam brown top block', 'Sam places the top. Together!', 500, 205, 146),
        ]),
        tower('nia-ravi-seven', 'Nia, Ravi, and you waited and built together!', [
          block('emoji:🟫', 'Nia brown base block', 'Nia starts with brown.', 500, 835, 170),
          block('emoji:🟧', 'your orange block', 'Your turn. Orange block.', 500, 730, 166),
          block('emoji:🟦', 'Ravi blue block', 'Ravi places blue. Wait for your turn.', 500, 625, 162),
          block('emoji:🟩', 'your green block', 'Your turn. Green block.', 500, 520, 158),
          block('emoji:🟥', 'Nia red block', 'Nia takes another turn.', 500, 415, 154),
          block('emoji:🟨', 'your yellow block', 'Your turn. Yellow block.', 500, 310, 150),
          block('emoji:🟪', 'Ravi purple top block', 'Ravi finishes the top.', 500, 205, 146),
        ]),
        tower('leo-maya-seven', 'Leo, Maya, and you built one careful block at a time!', [
          block('emoji:🟪', 'Leo purple base block', 'Leo places purple first.', 500, 835, 170),
          block('emoji:🟨', 'your yellow block', 'Your turn. Yellow block.', 500, 730, 166),
          block('emoji:🟥', 'Maya red block', 'Maya takes a turn. We wait.', 500, 625, 162),
          block('emoji:🟦', 'your blue block', 'Your turn. Blue block.', 500, 520, 158),
          block('emoji:🟩', 'Leo green block', 'Leo places green.', 500, 415, 154),
          block('emoji:🟧', 'your orange block', 'Your turn. Orange block.', 500, 310, 150),
          block('emoji:🟫', 'Maya brown top block', 'Maya places the top.', 500, 205, 146),
        ]),
      ],
    },
  ],
};

function tower(name, say, parts) {
  return { name, say, ordered: true, parts };
}

function block(art, alt, say, x, y, size) {
  return { art, alt, say, x, y, size };
}
