// My Puppet Band — the game IS this data.
//
// Engine: shared/js/engines/puppet-band.js on shared/js/music.js (WebAudio,
// pitch-shifted real samples from shared/assets/instruments/) and the theater
// substrate. Build a band of 2–5 puppets, cycle their instruments, stage a
// rainbow concert. Songs are hand-authored note data: beats are 0-based
// across the song (bar b, beat k = b*4 + k) and may be fractional.
// The engine octave-folds every part into each instrument's register, so any
// band mix stays musical.

// tiny helpers to keep the song data readable
const N = (beat, midi, dur = 1) => [beat, midi, dur];
const bar = (b) => b * 4;

// ---------------------------------------------------------------- songs -----

const rainbowJam = {
  id: 'rainbow-jam', title: 'Rainbow Jam', bpm: 104, beatsPerBar: 4, bars: 8,
  scale: [60, 62, 64, 67, 69],
  introText: 'Here comes Rainbow Jam!',
  parts: {
    melody: [
      N(0, 72), N(1, 76), N(2, 79), N(3, 76),
      N(4, 74), N(5, 76), N(6, 74, 2),
      N(8, 72), N(9, 76), N(10, 79), N(11, 81),
      N(12, 79, 2), N(14, 76, 2),
      N(16, 72), N(17, 76), N(18, 79), N(19, 76),
      N(20, 74), N(21, 76), N(22, 74, 2),
      N(24, 79), N(25, 81), N(26, 79), N(27, 76),
      N(28, 72, 3),
    ],
    bass: [
      N(0, 48, 2), N(2, 55, 2), N(4, 45, 2), N(6, 52, 2),
      N(8, 41, 2), N(10, 48, 2), N(12, 43, 2), N(14, 50, 2),
      N(16, 48, 2), N(18, 55, 2), N(20, 45, 2), N(22, 52, 2),
      N(24, 43, 2), N(26, 50, 2), N(28, 48, 4),
    ],
    chord: [
      [0, [60, 64, 67], 2], [2, [60, 64, 67], 2],
      [4, [57, 60, 64], 2], [6, [57, 60, 64], 2],
      [8, [53, 57, 60], 2], [10, [53, 57, 60], 2],
      [12, [55, 59, 62], 2], [14, [55, 59, 62], 2],
      [16, [60, 64, 67], 2], [18, [60, 64, 67], 2],
      [20, [57, 60, 64], 2], [22, [57, 60, 64], 2],
      [24, [55, 59, 62], 2], [26, [55, 59, 62], 2],
      [28, [60, 64, 67], 4],
    ],
    perc: Array.from({ length: 32 }, (_, b) => [b, b % 2 ? 'b' : 'a']),
  },
};

const bubblePop = {
  id: 'bubble-pop', title: 'Bubble Pop', bpm: 112, beatsPerBar: 4, bars: 8,
  scale: [60, 62, 64, 67, 69],
  introText: 'Time for Bubble Pop!',
  parts: {
    melody: [
      // 2-bar hook ×3 + turnaround ending
      N(0, 72, 0.5), N(0.5, 72, 0.5), N(1, 76), N(1.5, 74, 0.5), N(2, 72), N(3, 79),
      N(4, 76, 1.5), N(5.5, 74, 0.5), N(6, 72, 2),
      N(8, 72, 0.5), N(8.5, 72, 0.5), N(9, 76), N(9.5, 74, 0.5), N(10, 72), N(11, 79),
      N(12, 76, 1.5), N(13.5, 74, 0.5), N(14, 72, 2),
      N(16, 72, 0.5), N(16.5, 72, 0.5), N(17, 76), N(17.5, 74, 0.5), N(18, 72), N(19, 79),
      N(20, 76, 1.5), N(21.5, 74, 0.5), N(22, 72, 2),
      N(24, 74), N(25, 76), N(26, 79, 2),
      N(28, 81), N(29, 79), N(30, 76), N(31, 72),
    ],
    bass: [
      // C  G  Am F ×2, pumping quarters
      ...[48, 43, 45, 41, 48, 43, 45, 41].flatMap((r, i) =>
        [N(bar(i), r), N(bar(i) + 1, r), N(bar(i) + 2, r + 7), N(bar(i) + 3, r)]),
    ],
    chord: [
      ...[[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60],
          [60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
        .flatMap((c, i) => [[bar(i) + 0.5, c, 1], [bar(i) + 2.5, c, 1]]),
    ],
    perc: Array.from({ length: 8 }, (_, b) => [
      [bar(b), 'a'], [bar(b) + 1, 'b'], [bar(b) + 1.5, 'b'],
      [bar(b) + 2, 'a'], [bar(b) + 3, 'b'], [bar(b) + 3.5, 'b'],
    ]).flat(),
  },
};

const sleepyCatSwing = {
  id: 'sleepy-cat', title: 'Sleepy Cat Swing', bpm: 96, beatsPerBar: 4, bars: 8,
  swing: 0.6,
  scale: [57, 60, 62, 64, 67],
  introText: 'Now for Sleepy Cat Swing!',
  parts: {
    melody: [
      N(0, 69, 1), N(1.5, 67, 0.5), N(2, 64, 2),
      N(5, 62), N(5.5, 64, 0.5), N(6, 67, 2),
      N(8, 69, 1), N(9.5, 72, 0.5), N(10, 69, 1), N(11, 67, 1),
      N(12, 64, 3),
      N(16, 69, 1), N(17.5, 67, 0.5), N(18, 64, 2),
      N(21, 62), N(21.5, 60, 0.5), N(22, 57, 2),
      N(24, 60, 1), N(25.5, 62, 0.5), N(26, 64, 1), N(27, 67, 1),
      N(28, 69, 3),
    ],
    bass: [
      // lazy walking quarters
      ...[[45, 48, 50, 52], [45, 48, 43, 45], [50, 52, 53, 55], [45, 48, 50, 52],
          [45, 48, 50, 52], [41, 43, 45, 47], [50, 52, 53, 55], [45, 43, 41, 45]]
        .flatMap((w, i) => w.map((n, k) => N(bar(i) + k, n))),
    ],
    chord: [
      ...[[57, 60, 64], [57, 60, 64], [50, 53, 57], [57, 60, 64],
          [57, 60, 64], [53, 57, 60], [50, 53, 57], [57, 60, 64]]
        .flatMap((c, i) => [[bar(i) + 1, c, 1], [bar(i) + 3, c, 1]]),
    ],
    perc: Array.from({ length: 8 }, (_, b) => [
      [bar(b), 'a'], [bar(b) + 1, 'a'], [bar(b) + 1.5, 'b'],
      [bar(b) + 2, 'a'], [bar(b) + 3, 'a'], [bar(b) + 3.5, 'b'],
    ]).flat(),
  },
};

const dinoStomp = {
  id: 'dino-stomp', title: 'Dino Stomp', bpm: 120, beatsPerBar: 4, bars: 8,
  scale: [52, 55, 57, 59, 62],
  introText: 'Get ready for Dino Stomp!',
  parts: {
    melody: [
      N(0, 64), N(1, 64), N(2, 67), N(3, 64),
      N(4, 69), N(5, 67), N(6, 64, 2),
      N(8, 64), N(9, 64), N(10, 67), N(11, 69),
      N(12, 71, 2), N(14, 67, 2),
      N(16, 64), N(17, 64), N(18, 67), N(19, 64),
      N(20, 69), N(21, 67), N(22, 64, 2),
      N(24, 62), N(25, 64), N(26, 67), N(27, 69),
      N(28, 64, 4),
    ],
    bass: [
      // stomping riff, lives right in the guitar's E2 register
      ...Array.from({ length: 7 }, (_, i) => [
        N(bar(i), 40), N(bar(i) + 1, 40, 0.5), N(bar(i) + 1.5, 43, 0.5),
        N(bar(i) + 2, 40), N(bar(i) + 3, 45, 0.5), N(bar(i) + 3.5, 43, 0.5),
      ]).flat(),
      N(28, 40), N(29, 43), N(30, 45), N(31, 40),
    ],
    chord: [
      // power fifths
      ...Array.from({ length: 8 }, (_, i) => [
        [bar(i), [52, 59], 1], [bar(i) + 2.5, [52, 59], 1],
      ]).flat(),
    ],
    perc: Array.from({ length: 8 }, (_, b) => [
      [bar(b), 'a'], [bar(b) + 1, 'b'], [bar(b) + 2, 'a'], [bar(b) + 2.5, 'a'], [bar(b) + 3, 'b'],
    ]).flat(),
  },
};

const teddyParade = {
  id: 'teddy-parade', title: 'Teddy Bear Parade', bpm: 108, beatsPerBar: 4, bars: 8,
  scale: [60, 62, 64, 67, 69],
  introText: 'March along with Teddy Bear Parade!',
  parts: {
    melody: [
      N(0, 67), N(1, 67), N(2, 72, 2),
      N(4, 69), N(5, 67), N(6, 64, 2),
      N(8, 67), N(9, 69), N(10, 71), N(11, 72),
      N(12, 74, 2), N(14, 67, 2),
      N(16, 67), N(17, 67), N(18, 72, 2),
      N(20, 69), N(21, 67), N(22, 64, 2),
      N(24, 74), N(25, 72), N(26, 71), N(27, 67),
      N(28, 72, 4),
    ],
    bass: [
      // proud oom-pah: root-fifth on every beat, C F G C by pairs of bars
      ...[48, 48, 41, 41, 43, 43, 48, 48].flatMap((r, i) =>
        [N(bar(i), r), N(bar(i) + 1, r + 7), N(bar(i) + 2, r), N(bar(i) + 3, r + 7)]),
    ],
    chord: [
      ...[[60, 64, 67], [60, 64, 67], [53, 57, 60], [53, 57, 60],
          [55, 59, 62], [55, 59, 62], [60, 64, 67], [60, 64, 67]]
        .flatMap((c, i) => [[bar(i) + 1, c, 1], [bar(i) + 3, c, 1]]),
    ],
    perc: Array.from({ length: 8 }, (_, b) => {
      const hits = [[bar(b), 'a'], [bar(b) + 1, 'b'], [bar(b) + 2, 'a'], [bar(b) + 3, 'b']];
      if (b % 2 === 1) hits.push([bar(b) + 3.5, 'b']);   // little parade fill
      return hits;
    }).flat(),
  },
};

const cloudWaltz = {
  id: 'cloud-waltz', title: 'Cloud Waltz', bpm: 90, beatsPerBar: 3, bars: 8,
  scale: [60, 62, 64, 67, 69],
  introText: 'Time to twirl! It\'s Cloud Waltz!',
  parts: {
    // 3/4: bar b starts at b*3
    melody: [
      N(0, 64, 2), N(2, 67),
      N(3, 72, 3),
      N(6, 71, 2), N(8, 69),
      N(9, 67, 3),
      N(12, 64, 2), N(14, 67),
      N(15, 74, 3),
      N(18, 72, 2), N(20, 69),
      N(21, 72, 3),
    ],
    bass: [
      ...[48, 45, 43, 48, 48, 41, 43, 48].map((r, i) => N(i * 3, r, 1.5)),
    ],
    chord: [
      ...[[60, 64, 67], [57, 60, 64], [55, 59, 62], [60, 64, 67],
          [60, 64, 67], [53, 57, 60], [55, 59, 62], [60, 64, 67]]
        .flatMap((c, i) => [[i * 3 + 1, c, 0.9], [i * 3 + 2, c, 0.9]]),
    ],
    perc: Array.from({ length: 8 }, (_, b) => [
      [b * 3, 'a'], [b * 3 + 2, 'b'],
    ]).flat(),
  },
};

const robotDisco = {
  id: 'robot-disco', title: 'Robot Disco', bpm: 116, beatsPerBar: 4, bars: 8,
  scale: [57, 60, 62, 64, 67],
  introText: 'Beep boop! Robot Disco!',
  parts: {
    melody: [
      N(0.5, 69, 0.5), N(1.5, 69, 0.5), N(2.5, 67, 0.5), N(3, 64),
      N(4.5, 62, 0.5), N(5.5, 64, 0.5), N(6, 67, 2),
      N(8.5, 69, 0.5), N(9.5, 69, 0.5), N(10.5, 72, 0.5), N(11, 69),
      N(12, 67, 1.5), N(13.5, 64, 0.5), N(14, 57, 2),
      N(16.5, 69, 0.5), N(17.5, 69, 0.5), N(18.5, 67, 0.5), N(19, 64),
      N(20.5, 62, 0.5), N(21.5, 64, 0.5), N(22, 67, 2),
      N(24, 72), N(25, 69), N(26, 67), N(27, 64),
      N(28, 57, 4),
    ],
    bass: [
      // pumping octave eighths, A A F G
      ...[45, 45, 41, 43, 45, 45, 41, 43].flatMap((r, i) =>
        Array.from({ length: 4 }, (_, k) => [
          N(bar(i) + k, r, 0.5), N(bar(i) + k + 0.5, r + 12, 0.5),
        ]).flat()),
    ],
    chord: [
      ...[[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62],
          [57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]]
        .flatMap((c, i) => [[bar(i) + 1.5, c, 0.5], [bar(i) + 3.5, c, 0.5]]),
    ],
    perc: Array.from({ length: 8 }, (_, b) => [
      [bar(b), 'a'], [bar(b) + 0.5, 'b'], [bar(b) + 1, 'a'], [bar(b) + 1.5, 'b'],
      [bar(b) + 2, 'a'], [bar(b) + 2.5, 'b'], [bar(b) + 3, 'a'], [bar(b) + 3.5, 'b'],
    ]).flat(),
  },
};

const lullabyMoon = {
  id: 'lullaby-moon', title: 'Lullaby Moon', bpm: 72, beatsPerBar: 4, bars: 8,
  scale: [60, 62, 64, 67, 69],
  introText: 'Shhh... here comes Lullaby Moon.',
  parts: {
    melody: [
      N(0, 64, 2), N(2, 62, 2),
      N(4, 60, 3),
      N(8, 64, 2), N(10, 67, 2),
      N(12, 64, 3),
      N(16, 69, 2), N(18, 67, 2),
      N(20, 64, 2), N(22, 62, 2),
      N(24, 62, 2), N(26, 60, 2),
      N(28, 60, 4),
    ],
    bass: [
      ...[48, 45, 41, 43, 48, 45, 43, 48].map((r, i) => N(bar(i), r, 3.5)),
    ],
    chord: [
      ...[[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62],
          [60, 64, 67], [57, 60, 64], [55, 59, 62], [60, 64, 67]]
        .map((c, i) => [bar(i) + 0.5, c, 3]),
    ],
    perc: Array.from({ length: 8 }, (_, b) =>
      b % 2 ? [[bar(b), 'a'], [bar(b) + 2, 'b']] : [[bar(b), 'a']]).flat(),
  },
};

const seoulSparkle = {
  // K-Pop: bright four-on-floor with the classic borrowed-chord lift —
  // bars 5–6 leave C major for Ab and Bb (bVI→bVII→I) before the chorus lands
  id: 'seoul-sparkle', title: 'Seoul Sparkle', bpm: 124, beatsPerBar: 4, bars: 8,
  scale: [60, 62, 64, 67, 69],
  introText: 'Lights up! It\'s Seoul Sparkle!',
  parts: {
    melody: [
      N(0, 72, 0.5), N(0.5, 74, 0.5), N(1, 76), N(2, 74, 0.5), N(2.5, 72, 0.5), N(3, 79),
      N(4, 76, 1.5), N(5.5, 74, 0.5), N(6, 72, 2),
      N(8, 72, 0.5), N(8.5, 74, 0.5), N(9, 76), N(10, 74, 0.5), N(10.5, 72, 0.5), N(11, 79),
      N(12, 76, 0.5), N(12.5, 79, 0.5), N(13, 81, 2), N(15, 79),
      N(16, 72), N(17, 75), N(18, 72, 2),          // Ab colour
      N(20, 74), N(21, 77), N(22, 74, 2),          // Bb colour
      N(24, 79, 0.5), N(24.5, 79, 0.5), N(25, 81), N(26, 79), N(27, 76),
      N(28, 72, 4),
    ],
    bass: [
      ...[48, 43, 45, 41, 44, 46, 48, 48].flatMap((r, i) => [
        N(bar(i), r), N(bar(i) + 1, r, 0.5), N(bar(i) + 1.5, r + 12, 0.5),
        N(bar(i) + 2, r), N(bar(i) + 3, r + 7),
      ]),
    ],
    chord: [
      ...[[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60],
          [56, 60, 63], [58, 62, 65], [60, 64, 67], [60, 64, 67]]
        .flatMap((c, i) => [[bar(i) + 0.5, c, 1], [bar(i) + 2.5, c, 1]]),
    ],
    perc: Array.from({ length: 8 }, (_, b) => [
      [bar(b), 'a'], [bar(b) + 0.5, 'b'], [bar(b) + 1, 'b'], [bar(b) + 1.5, 'b'],
      [bar(b) + 2, 'a'], [bar(b) + 2.5, 'b'], [bar(b) + 3, 'b'], [bar(b) + 3.5, 'b'],
    ]).flat(),
  },
};

const gamelanGarden = {
  // Indonesian gamelan: slendro-ish five notes, interlocking (kotekan) eighths
  // between melody and chord parts, shimmering parallel fourths, a low "gong"
  // marking each cycle. No western cadence at all.
  id: 'gamelan-garden', title: 'Gamelan Garden', bpm: 100, beatsPerBar: 4, bars: 8,
  scale: [60, 62, 65, 67, 69],
  introText: 'Ding dong! Welcome to Gamelan Garden!',
  parts: {
    melody: [
      // on-beat half of the interlock
      ...Array.from({ length: 4 }, (_, i) => [
        N(bar(i * 2), 72, 0.5), N(bar(i * 2) + 1, 74, 0.5), N(bar(i * 2) + 2, 77, 0.5), N(bar(i * 2) + 3, 74, 0.5),
        N(bar(i * 2) + 4, 74, 0.5), N(bar(i * 2) + 5, 77, 0.5), N(bar(i * 2) + 6, 79, 0.5), N(bar(i * 2) + 7, 77, 0.5),
      ]).flat(),
    ],
    chord: [
      // off-beat half: parallel fourths answering between the melody notes
      ...Array.from({ length: 8 }, (_, b) => [
        [bar(b) + 0.5, [65, 72], 0.5], [bar(b) + 1.5, [67, 74], 0.5],
        [bar(b) + 2.5, [65, 72], 0.5], [bar(b) + 3.5, [62, 69], 0.5],
      ]).flat(),
    ],
    bass: [
      // gong cycle: deep stroke at each bar, answering fifth mid-bar
      ...Array.from({ length: 8 }, (_, b) => [N(bar(b), 48, 3), N(bar(b) + 2, 55, 1.5)]).flat(),
    ],
    perc: Array.from({ length: 8 }, (_, b) => [
      [bar(b), 'a'], [bar(b) + 2.5, 'b'],
    ]).flat(),
  },
};

const desertCaravan = {
  // Middle-Eastern hijaz: E drone with the signature augmented-second step
  // (F → G#), a snaking modal melody, drone-fifth chords rubbing against an
  // F-major cluster, and a maqsum-style drum pattern.
  id: 'desert-caravan', title: 'Desert Caravan', bpm: 108, beatsPerBar: 4, bars: 8,
  scale: [52, 53, 56, 57, 59, 60],
  introText: 'Ride along with Desert Caravan!',
  parts: {
    melody: [
      N(0, 64), N(1, 65, 0.5), N(1.5, 68, 0.5), N(2, 69, 2),
      N(4, 71), N(5, 69, 0.5), N(5.5, 68, 0.5), N(6, 65), N(7, 64),
      N(8, 64, 0.5), N(8.5, 65, 0.5), N(9, 68, 0.5), N(9.5, 69, 0.5), N(10, 71, 2),
      N(12, 72, 1.5), N(13.5, 71, 0.5), N(14, 69, 2),
      N(16, 71), N(17, 72, 0.5), N(17.5, 71, 0.5), N(18, 69), N(19, 68),
      N(20, 69), N(21, 68, 0.5), N(21.5, 65, 0.5), N(22, 64, 2),
      N(24, 64, 0.5), N(24.5, 65, 0.5), N(25, 68), N(26, 69, 0.5), N(26.5, 71, 0.5), N(27, 72),
      N(28, 64, 4),
    ],
    bass: [
      ...Array.from({ length: 8 }, (_, b) => [
        N(bar(b), 40), N(bar(b) + 1.5, 40, 0.5), N(bar(b) + 2, 47), N(bar(b) + 3, 40),
      ]).flat(),
    ],
    chord: [
      ...Array.from({ length: 8 }, (_, b) => (b % 2 === 0
        ? [[bar(b), [52, 59], 2], [bar(b) + 2, [52, 59], 2]]
        : [[bar(b), [53, 57, 60], 2], [bar(b) + 2, [52, 59], 2]])).flat(),
    ],
    perc: Array.from({ length: 8 }, (_, b) => [
      [bar(b), 'a'], [bar(b) + 1, 'b'], [bar(b) + 1.5, 'b'], [bar(b) + 2, 'a'], [bar(b) + 3, 'b'],
    ]).flat(),
  },
};

const sambaSunshine = {
  // Brazilian samba/bossa: rootless seventh-chord voicings (maj7s and m7s —
  // the harmony floats), anticipated bass, and a syncopated partido-alto
  // groove with hits landing off the grid.
  id: 'samba-sunshine', title: 'Samba Sunshine', bpm: 116, beatsPerBar: 4, bars: 8,
  scale: [60, 62, 64, 67, 69],
  introText: 'Shake it! Samba Sunshine!',
  parts: {
    melody: [
      N(0, 76, 1.5), N(1.5, 74, 0.5), N(2, 72), N(3.5, 69, 0.5),
      N(4, 71, 1.5), N(5.5, 72, 0.5), N(6, 74, 2),
      N(8, 76, 1.5), N(9.5, 74, 0.5), N(10, 72), N(11.5, 74, 0.5),
      N(12, 71, 1.5), N(13.5, 69, 0.5), N(14, 67, 2),
      N(16, 72, 1.5), N(17.5, 74, 0.5), N(18, 76), N(19.5, 79, 0.5),
      N(20, 76, 1.5), N(21.5, 74, 0.5), N(22, 71, 2),
      N(24, 69, 1.5), N(25.5, 71, 0.5), N(26, 72), N(27, 74),
      N(28, 72, 3),
    ],
    bass: [
      ...[48, 50, 48, 50, 48, 45, 50, 48].flatMap((r, i) => [
        N(bar(i), r), N(bar(i) + 1.5, r + 7, 0.5), N(bar(i) + 2, r), N(bar(i) + 3.5, r + 7, 0.5),
      ]),
    ],
    chord: [
      // Cmaj7 | Dm7 G7 | Cmaj7 Am7 | Dm7 G7, rootless voicings on the offbeats
      ...[[[64, 67, 71]], [[65, 69, 72], [59, 62, 65]], [[64, 67, 71], [64, 67, 72]], [[65, 69, 72], [59, 62, 65]],
          [[64, 67, 71]], [[65, 69, 72], [59, 62, 65]], [[64, 67, 71], [64, 67, 72]], [[65, 69, 72], [59, 62, 65]]]
        .flatMap((voicings, i) => (voicings.length === 1
          ? [[bar(i) + 0.5, voicings[0], 1.5], [bar(i) + 2.75, voicings[0], 1]]
          : [[bar(i) + 0.5, voicings[0], 1.5], [bar(i) + 2.75, voicings[1], 1]])),
    ],
    perc: Array.from({ length: 8 }, (_, b) => [
      [bar(b), 'a'], [bar(b) + 0.75, 'b'], [bar(b) + 1.5, 'b'],
      [bar(b) + 2, 'a'], [bar(b) + 2.75, 'b'], [bar(b) + 3.5, 'b'],
    ]).flat(),
  },
};

// ---------------------------------------------------------------- config ----

export default {
  id: 'my-puppet-band',
  engine: 'puppet-band',
  title: 'My Puppet Band',
  menu: {
    splashBackdrop: './assets/bg/menu-sky-gpt-image-2.png',
    buildBackdrop: './assets/bg/builder-blue-gpt-image-2.png',
    mascots: [],
  },
  stageBackdrop: './assets/bg/rainbow-stage.png',
  cast: ['bear', 'doggy', 'fox', 'frog', 'rabbit', 'unicorn', 'princess-lily', 'princess-zoe'],
  instruments: [
    { id: 'piano', emoji: '🎹', floor: true, color: '#2d7dd2' },
    { id: 'guitar', emoji: '🎸', color: '#a8763e' },
    { id: 'trumpet', emoji: '🎺', color: '#f4c53d' },
    { id: 'saxophone', emoji: '🎷', color: '#d6a44a' },
    { id: 'clarinet', emoji: '🎵', color: '#444a58' },
    { id: 'flute', emoji: '🪈', color: '#9fb4c8' },
    { id: 'horn', emoji: '📯', color: '#e0a53a' },
    { id: 'vibraphone', emoji: '🎼', floor: true, color: '#8a5bc4' },
    { id: 'drum', emoji: '🥁', floor: true, color: '#e05252' },
    { id: 'bongos', emoji: '🪘', floor: true, color: '#b0762f' },
    { id: 'cymbal', emoji: '🔔', color: '#f0c53d' },
    { id: 'maracas', emoji: '🪇', color: '#58a945' },
  ],
  defaultInstrumentByChar: {
    bear: 'bongos',
    doggy: 'drum',
    fox: 'clarinet',
    frog: 'saxophone',
    rabbit: 'trumpet',
    unicorn: 'vibraphone',
    'princess-lily': 'flute',
    'princess-zoe': 'piano',
  },
  defaultBand: [
    { char: 'princess-zoe', instr: 'piano' },
    { char: 'fox', instr: 'guitar' },
    { char: 'bear', instr: 'drum' },
  ],
  props: {
    piano: './assets/props/piano.png',
    guitar: './assets/props/guitar.png',
    trumpet: './assets/props/trumpet.png',
    saxophone: './assets/props/saxophone.png',
    clarinet: './assets/props/clarinet.png',
    flute: './assets/props/flute.png',
    horn: './assets/props/horn.png',
    vibraphone: './assets/props/vibraphone.png',
    drum: './assets/props/drum.png',
    bongos: './assets/props/bongos.png',
    cymbal: './assets/props/cymbal.png',
    maracas: './assets/props/maracas.png',
  },
  voice: {
    intro: 'Welcome to your puppet band!',
    buildJoin: 'Tap a friend to join the band!',
    buildInstrument: 'Tap an instrument to hear it!',
    buildReady: 'Ready? Tap Play Show!',
    fullBand: 'Your band is full! Tap Play Show!',
    soloHint: 'Tap a puppet for a solo!',
    showCheer: 'What a wonderful band!',
  },
  songs: [rainbowJam, bubblePop, sleepyCatSwing, dinoStomp, teddyParade, cloudWaltz, robotDisco, lullabyMoon,
          seoulSparkle, gamelanGarden, desertCaravan, sambaSunshine],
};
