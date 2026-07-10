export default {
  id: 'land-water-tray',
  engine: 'build-assemble',
  title: 'Land & Water Tray',
  splashEmoji: '🏝️',
  voice: {
    intro: 'Place land and water pieces on the tray.',
    nudge: 'That piece belongs on another tray spot. Try again.',
    wait: 'Pick a land piece or a water piece.',
    cheer: 'You shaped land and water!',
  },
  modes: [
    {
      id: 'forms',
      title: 'Make the Landform',
      rounds: 4,
      prompt: 'Shape the landform on the tray.',
      builds: [
        build('island', 'An island is land with water all around it.', [
          tile('emoji:🟦', 'water above the island', 'water', 'water', 500, 330, 190),
          tile('emoji:🟦', 'water left of the island', 'water', 'water', 355, 505, 190),
          tile('emoji:🟩', 'land in the middle for island', 'land in the middle', 'land', 500, 505, 205),
          tile('emoji:🟦', 'water right of the island', 'water', 'water', 645, 505, 190),
          tile('emoji:🟦', 'water below the island', 'water', 'water', 500, 680, 190),
        ]),
        build('lake', 'A lake is water with land all around it.', [
          tile('emoji:🟩', 'land above the lake', 'land', 'land', 500, 330, 190),
          tile('emoji:🟩', 'land left of the lake', 'land', 'land', 355, 505, 190),
          tile('emoji:🟦', 'water in the middle for lake', 'water in the middle', 'water', 500, 505, 205),
          tile('emoji:🟩', 'land right of the lake', 'land', 'land', 645, 505, 190),
          tile('emoji:🟩', 'land below the lake', 'land', 'land', 500, 680, 190),
        ]),
        build('peninsula', 'A peninsula is land with water around three sides.', [
          tile('emoji:🟦', 'water above the peninsula', 'water', 'water', 500, 330, 190),
          tile('emoji:🟩', 'land base for peninsula', 'land', 'land', 360, 505, 205),
          tile('emoji:🟩', 'land arm into water', 'land reaching out', 'land', 510, 505, 205),
          tile('emoji:🟦', 'water beside the land arm', 'water', 'water', 660, 505, 190),
          tile('emoji:🟦', 'water below the peninsula', 'water', 'water', 500, 680, 190),
        ]),
        build('bay', 'A bay is water with land around three sides.', [
          tile('emoji:🟩', 'land above the bay', 'land', 'land', 500, 330, 190),
          tile('emoji:🟩', 'land left of the bay', 'land', 'land', 355, 505, 190),
          tile('emoji:🟦', 'water notch for bay', 'water reaching in', 'water', 510, 505, 205),
          tile('emoji:🟩', 'land right of the bay', 'land', 'land', 665, 505, 190),
          tile('emoji:🟩', 'land below the bay', 'land', 'land', 500, 680, 190),
        ]),
      ],
    },
  ],
};

function build(name, say, parts) {
  return { name, say, ordered: false, parts };
}

function tile(art, alt, say, matchKey, x, y, size) {
  return { art, alt, say, matchKey, x, y, size };
}
