// songs.js — the six culture songs as shared/js/music.js note data.
//
// Format (see the shared/js/music.js header): beats are 0-based across the
// WHOLE song (bar b, beat k = b*beatsPerBar + k) and may be fractional. Melody
// and bass entries are [beat, midi, durBeats]; chord entries are
// [beat, [midi...], durBeats]; perc entries are [beat, 'a'|'b'] ('a' = the
// open/deep stroke, 'b' = the crisp/rim stroke). Every song is 8 bars and loops
// seamlessly. `lead` ('keys'|'wind'|'strings'|'perc') steers mapBand so the
// same three instruments sound tune-led in one culture and drum-led in another.
//
// CRAFT NOTE — music.js OCTAVE-FOLDS every part into its instrument's own
// register, so any interval wider than an octave wraps and the contour is lost.
// The melodies here therefore live inside a ~10-semitone window and express
// "higher" or "lower" by CONTOUR, not by literal octave transposition. Bass and
// chord parts are allowed to wrap — octave-equivalent roots are exactly what a
// bass player does when a note falls off the end of the instrument.
//
// Densities are tuned for five-year-old ears: roughly 2–5 melody notes a bar,
// never a wall of sixteenths. The jig is the deliberate exception — its tune
// runs in triplets, which is what makes it a jig.

// tiny helpers to keep the song data readable
const N = (beat, midi, dur = 1) => [beat, midi, dur];
const bar = (b, beatsPerBar = 4) => b * beatsPerBar;

// one jig triplet group: the three eighths inside beat `b` (at 0, 1/3, 2/3)
const trip = (b, a, c, d) => [N(b, a, 0.333), N(b + 0.333, c, 0.333), N(b + 0.667, d, 0.333)];

// one repetition of the kathak tihai figure (two notes across 4/3 of a beat)
const tihai = (start) => [N(start, 69, 0.5), N(start + 0.667, 65, 0.667)];

// ------------------------------------------------------------------ India ---

// Kathak in kafi (C dorian): a tanpura root-and-fifth drone under an ornamented
// stepwise melody of quick neighbour-tone pairs, closing on a 3x tihai cadence.
const indiaKathak = {
  id: 'india-kathak', title: 'Kathak Twirl', bpm: 92, beatsPerBar: 4, bars: 8,
  lead: 'strings',
  scale: [60, 62, 63, 65, 67, 69, 70],
  parts: {
    melody: [
      // bars 1-2: drift down from the fifth and settle on the tonic
      N(0, 67), N(1, 69, 0.5), N(1.5, 70, 0.5), N(2, 69), N(3, 67),
      N(4, 65, 1.5), N(5.5, 63, 0.5), N(6, 62, 2),
      // bars 3-4: a low turn that keeps circling the flat third
      N(8, 63), N(9, 65, 0.5), N(9.5, 67, 0.5), N(10, 65, 2),
      N(12, 63), N(13, 62, 0.5), N(13.5, 63, 0.5), N(14, 65, 2),
      // bars 5-6: the climb to the upper tonic and back
      N(16, 67), N(17, 69, 0.5), N(17.5, 70, 0.5), N(18, 72, 2),
      N(20, 70), N(21, 72, 0.5), N(21.5, 70, 0.5), N(22, 69, 2),
      // bar 7: long descent. bar 8: tihai — one figure 3x, landing on the loop
      N(24, 70, 0.5), N(24.5, 69, 0.5), N(25, 67), N(26, 65), N(27, 63),
      ...tihai(28), ...tihai(29.333), ...tihai(30.667),
    ],
    bass: [
      // tanpura drone: a C pedal with an answering G, long and unhurried
      ...Array.from({ length: 8 }, (_, b) => [N(bar(b), 36, 3.5), N(bar(b) + 1.5, 43, 2.5)]).flat(),
    ],
    chord: [
      ...Array.from({ length: 8 }, (_, b) => {
        const hits = [[bar(b), [60, 67], 4]];
        if (b % 4 === 3) hits.push([bar(b) + 2, [60, 63, 67], 2]);   // Cm colour at the phrase ends
        return hits;
      }).flat(),
    ],
    perc: [
      // tabla-ish theka: open 'a' on the strong beats, crisp 'b' syncopations
      ...Array.from({ length: 7 }, (_, b) => [
        [bar(b), 'a'], [bar(b) + 1.5, 'b'], [bar(b) + 2, 'a'], [bar(b) + 2.75, 'b'], [bar(b) + 3.5, 'b'],
      ]).flat(),
      // bar 8 answers the melody's tihai with the same 3x grouping
      [28, 'a'], [28.667, 'b'], [29.333, 'a'], [30, 'b'], [30.667, 'a'], [31.333, 'b'],
    ],
  },
};

// ----------------------------------------------------------------- Brazil ---

// Carnival samba: a bright C-major-pentatonic tune over a surdo bass that
// anticipates beat 2, with rootless seventh stabs on the offbeats and a
// partido-alto groove landing at +0.75, +2.75 and +3.5.
const brazilSamba = (() => {
  const roots = [48, 45, 50, 43, 48, 45, 50, 43];               // C Am Dm G, twice
  const voicings = [
    [64, 67, 69], [64, 67, 72], [65, 69, 72], [59, 62, 65],     // C6/9 Am7 Dm7 G7, rootless
    [64, 67, 69], [64, 67, 72], [65, 69, 72], [59, 62, 65],
  ];
  return {
    id: 'brazil-samba', title: 'Carnival Samba', bpm: 118, beatsPerBar: 4, bars: 8,
    lead: 'strings',
    scale: [60, 62, 64, 67, 69],
    parts: {
      melody: [
        N(0, 76), N(1, 74, 0.5), N(1.5, 72), N(2.5, 74, 0.5), N(3.5, 76, 0.5),
        N(4, 72, 1.5), N(5.5, 69, 0.5), N(6, 72, 2),
        N(8, 69), N(9, 72, 0.5), N(9.5, 74), N(11.5, 72, 0.5),
        N(12, 74, 1.5), N(13.5, 72, 0.5), N(14, 71, 2),
        N(16, 76), N(17, 79, 0.5), N(17.5, 76), N(18.5, 74, 0.5), N(19.5, 72, 0.5),
        N(20, 74, 1.5), N(21.5, 72, 0.5), N(22, 69, 2),
        N(24, 72), N(25, 74, 0.5), N(25.5, 76), N(26.5, 74, 0.5), N(27.5, 72, 0.5),
        N(28, 71, 1.5), N(29.5, 74, 0.5), N(30, 72, 2),
      ],
      bass: [
        // surdo: the weight lands EARLY — beat 2 is struck at 1.5, and the next
        // bar's root is anticipated on the "and" of 4
        ...roots.flatMap((r, i) => [
          N(bar(i), r, 0.5), N(bar(i) + 1.5, r, 1),
          N(bar(i) + 2.5, r + 7, 0.5), N(bar(i) + 3.5, roots[(i + 1) % 8], 0.5),
        ]),
      ],
      chord: [
        ...voicings.flatMap((c, i) => [[bar(i) + 0.75, c, 0.5], [bar(i) + 2.5, c, 0.5]]),
      ],
      perc: Array.from({ length: 8 }, (_, b) => [
        [bar(b), 'a'], [bar(b) + 0.75, 'b'], [bar(b) + 1.5, 'b'],
        [bar(b) + 2, 'a'], [bar(b) + 2.75, 'b'], [bar(b) + 3.5, 'b'],
      ]).flat(),
    },
  };
})();

// ------------------------------------------------------------------ Japan ---

// Bon Odori in miyako-bushi (A Bb D E F, taken up an octave into flute
// register): taiko don-don on 1 and 3 with ka accents between, a melody in long
// unhurried notes, and chords that are only open fourths and fifths.
const japanBonOdori = (() => {
  const roots = [45, 45, 50, 45, 45, 45, 50, 45];               // A A D A, twice
  return {
    id: 'japan-bon-odori', title: 'Bon Odori Lanterns', bpm: 100, beatsPerBar: 4, bars: 8,
    lead: 'wind',
    scale: [57, 58, 62, 64, 65],
    parts: {
      melody: [
        N(0, 69, 2), N(2, 74, 2),
        N(4, 76, 2), N(6, 74, 2),
        N(8, 76, 2), N(10, 74), N(11, 70),
        N(12, 69, 3), N(15, 74),
        N(16, 76, 2), N(18, 77, 2),
        N(20, 76, 3), N(23, 74),
        N(24, 74, 2), N(26, 70), N(27, 69),
        N(28, 74, 2), N(30, 69, 2),
      ],
      bass: [
        ...roots.flatMap((r, i) => [N(bar(i), r, 2), N(bar(i) + 2, r + 7, 1.5)]),
      ],
      chord: [
        ...roots.flatMap((r, i) => {
          const open = r === 50 ? [62, 69] : [57, 64];            // D-A or A-E
          const hits = [[bar(i), open, 3]];
          if (i % 4 === 3) hits.push([bar(i) + 2, [57, 62], 1.5]); // an A-D fourth to close
          return hits;
        }),
      ],
      perc: Array.from({ length: 8 }, (_, b) => {
        const hits = [
          [bar(b), 'a'], [bar(b) + 0.5, 'b'],                     // don ... ka
          [bar(b) + 2, 'a'], [bar(b) + 2.5, 'b'], [bar(b) + 3.5, 'b'],
        ];
        if (b % 4 === 3) hits.push([bar(b) + 3.75, 'b']);         // a small fill into the next phrase
        return hits;
      }).flat(),
    },
  };
})();

// ------------------------------------------------------------------ Ghana ---

// Kpanlogo, drum-led (lead:'perc'): a son-clave-adjacent bell pattern carries
// the whole song while an F-pentatonic tune trades a 2-bar call for a 2-bar
// answer — the drum asks, the dancer answers.
const ghanaKpanlogo = (() => {
  const roots = [41, 41, 48, 41, 41, 41, 48, 41];               // F pedal, C under the answers
  return {
    id: 'ghana-kpanlogo', title: 'Kpanlogo Drums', bpm: 112, beatsPerBar: 4, bars: 8,
    lead: 'perc',
    scale: [65, 67, 69, 72, 74],
    parts: {
      melody: [
        // call (bars 1-2) — low, asking
        N(0, 65), N(1, 67, 0.5), N(1.5, 69, 0.5), N(2, 67, 2),
        N(4, 65), N(5, 67), N(6, 65, 2),
        // answer (bars 3-4) — up at the top of the register
        N(8, 72), N(9, 74, 0.5), N(9.5, 72, 0.5), N(10, 69, 2),
        N(12, 72), N(13, 69), N(14, 67, 2),
        // second call (bars 5-6) — reaching further this time
        N(16, 65), N(17, 69, 0.5), N(17.5, 67, 0.5), N(18, 65, 2),
        N(20, 67), N(21, 69), N(22, 72, 2),
        // second answer (bars 7-8) — landing home
        N(24, 74), N(25, 72, 0.5), N(25.5, 69, 0.5), N(26, 72, 2),
        N(28, 69), N(29, 67), N(30, 65, 2),
      ],
      bass: [
        // sparse: the 1 and the "and of 3", leaving the bell all the room
        ...roots.flatMap((r, i) => [N(bar(i), r), N(bar(i) + 2.5, r + 7, 0.75)]),
      ],
      chord: [
        ...roots.flatMap((r, i) => {
          const c = r === 48 ? [67, 72, 76] : [65, 69, 72];
          return [[bar(i) + 1.5, c, 0.5], [bar(i) + 3, c, 0.5]];
        }),
      ],
      perc: Array.from({ length: 8 }, (_, b) => [
        [bar(b), 'a'], [bar(b) + 1, 'b'], [bar(b) + 1.5, 'b'],
        [bar(b) + 2.5, 'a'], [bar(b) + 3, 'b'], [bar(b) + 3.5, 'b'],
      ]).flat(),
    },
  };
})();

// ----------------------------------------------------------------- Mexico ---

// Folklórico huapango in G: straight 3/4 bars alternate with hemiola PAIRS
// where perc, bass and melody accents all regroup the six beats into three 2s —
// the sesquialtera that makes the skirts swirl. Trumpet sings in thirds.
const mexicoFolklorico = {
  id: 'mexico-folklorico', title: 'Folklórico Ribbons', bpm: 140, beatsPerBar: 3, bars: 8,
  lead: 'wind',
  scale: [67, 69, 71, 74, 76],
  parts: {
    melody: [
      // bars 1-2 straight: G, then C
      N(bar(0, 3), 71), N(1, 74), N(2, 79),
      N(bar(1, 3), 76), N(4, 74), N(5, 72),
      // bars 3-4 hemiola: accents at 6, 8, 10 — third, single, third
      N(6, [74, 78], 2), N(8, 76, 2), N(10, [71, 74], 2),
      // bars 5-6 straight
      N(bar(4, 3), 79), N(13, 78, 0.5), N(13.5, 76, 0.5), N(14, 74),
      N(bar(5, 3), [72, 76], 2), N(17, 74),
      // bars 7-8 hemiola: D7 leaning home to G, with a pickup back into the loop
      N(18, [72, 76], 2), N(20, [74, 78], 2), N(22, [71, 74]), N(23, 79),
    ],
    bass: [
      // straight bars: guitar bass on beat 1, its fifth on beat 2
      N(bar(0, 3), 43), N(1, 50),
      N(bar(1, 3), 48), N(4, 55),
      // hemiola bars 3-4: one accent every TWO beats, straight across the barline
      N(6, 50, 2), N(8, 57, 2), N(10, 43, 2),
      N(bar(4, 3), 43), N(13, 50),
      N(bar(5, 3), 48), N(16, 55),
      // hemiola bars 7-8
      N(18, 50, 2), N(20, 57, 2), N(22, 43, 2),
    ],
    chord: [
      // straight bars: mariachi upstrokes on 2 and 3
      [1, [55, 59, 62], 0.9], [2, [55, 59, 62], 0.9],
      [4, [60, 64, 67], 0.9], [5, [60, 64, 67], 0.9],
      // hemiola bars: the offbeat of each 2-group instead of the 3-grid
      [7, [62, 66, 69], 0.9], [9, [55, 59, 62], 0.9], [11, [55, 59, 62], 0.9],
      [13, [55, 59, 62], 0.9], [14, [55, 59, 62], 0.9],
      [16, [60, 64, 67], 0.9], [17, [60, 64, 67], 0.9],
      [19, [62, 66, 72], 0.9], [21, [55, 59, 62], 0.9], [23, [55, 59, 62], 0.9],
    ],
    perc: [
      // straight bars 1, 2, 5, 6 — ONE two three
      ...[0, 1, 4, 5].flatMap((b) => [
        [bar(b, 3), 'a'], [bar(b, 3) + 1, 'b'], [bar(b, 3) + 2, 'b'],
      ]),
      // hemiola bars 3-4 and 7-8 — ONE two ONE two ONE two
      ...[6, 18].flatMap((start) => [
        [start, 'a'], [start + 1, 'b'], [start + 2, 'a'],
        [start + 3, 'b'], [start + 4, 'a'], [start + 5, 'b'],
      ]),
    ],
  },
};

// ---------------------------------------------------------------- Ireland ---

// A D-dorian jig: the melody runs in triplets (0, 1/3, 2/3 of every beat) over
// an open-fifth D-A drone, with an A-part (bars 1-4, hovering low around the
// tonic) answered by a B-part (bars 5-8, sitting up around the fifth).
const irelandJig = {
  id: 'ireland-jig', title: 'Quick Feet Jig', bpm: 112, beatsPerBar: 4, bars: 8,
  lead: 'wind',
  scale: [62, 64, 65, 67, 69, 71, 72, 74],
  parts: {
    melody: [
      // --- A part: bars 1-4, circling D ---
      ...trip(0, 62, 64, 65), ...trip(1, 67, 65, 64), ...trip(2, 62, 62, 64), ...trip(3, 65, 67, 69),
      ...trip(4, 69, 67, 65), ...trip(5, 67, 65, 64), N(6, 62), ...trip(7, 62, 64, 65),
      ...trip(8, 67, 69, 71), ...trip(9, 72, 71, 69), ...trip(10, 71, 69, 67), N(11, 69),
      ...trip(12, 65, 67, 69), ...trip(13, 67, 65, 64), N(14, 62, 2),
      // --- B part: bars 5-8, the same shapes answered up around A ---
      ...trip(16, 69, 71, 72), ...trip(17, 71, 69, 67), ...trip(18, 69, 69, 71), ...trip(19, 72, 71, 69),
      ...trip(20, 71, 69, 67), ...trip(21, 69, 67, 65), N(22, 67), ...trip(23, 67, 69, 71),
      ...trip(24, 72, 71, 72), ...trip(25, 71, 69, 67), ...trip(26, 69, 71, 72), N(27, 71),
      ...trip(28, 69, 67, 69), ...trip(29, 67, 65, 64), N(30, 62, 2),
    ],
    bass: [
      // a D pedal, with one bar of C — the dorian bVII — to tilt the B part
      ...[38, 38, 38, 38, 38, 36, 38, 38].flatMap((r, i) => [
        N(bar(i), r, 2), N(bar(i) + 2, r + 7, 1.5),
      ]),
    ],
    chord: [
      // open fifths only: the drone a piper would hold under the tune
      ...[62, 62, 62, 62, 62, 60, 62, 62].flatMap((r, i) => [
        [bar(i), [r, r + 7], 2], [bar(i) + 2, [r, r + 7], 2],
      ]),
    ],
    perc: Array.from({ length: 8 }, (_, b) => {
      const hits = [[bar(b), 'a'], [bar(b) + 1, 'b'], [bar(b) + 2, 'a'], [bar(b) + 3, 'b']];
      if (b % 2 === 1) hits.push([bar(b) + 3.667, 'b']);          // a triplet pickup on the way over
      return hits;
    }).flat(),
  },
};

// ------------------------------------------------------------------ export --

export const songs = {
  'india-kathak': indiaKathak,
  'brazil-samba': brazilSamba,
  'japan-bon-odori': japanBonOdori,
  'ghana-kpanlogo': ghanaKpanlogo,
  'mexico-folklorico': mexicoFolklorico,
  'ireland-jig': irelandJig,
};

/** Scaffold contract (js/screens/dance.js imports this name). Same object. */
export const SONGS = songs;

/** Look a song up by its config.json `song` id. Null (not a throw) when unknown. */
export function songById(id) {
  return songs[id] || null;
}

export default songs;
