export const MATERIALS = {
  sand: {
    id: 'sand', label: 'Golden Sand', word: 'sand',
    base: '#edac24', light: '#ffd267', dark: '#9b6414', grain: '#ffe495',
    swatch: '#edac24', filter: 780, soundGain: 0.055,
  },
  salt: {
    id: 'salt', label: 'White Salt', word: 'salt',
    base: '#e8eef0', light: '#ffffff', dark: '#aeb9bd', grain: '#ffffff',
    swatch: '#f4f7f7', filter: 1900, soundGain: 0.045,
  },
  flour: {
    id: 'flour', label: 'Soft Flour', word: 'flour',
    base: '#eee3cf', light: '#fffaf0', dark: '#b8a993', grain: '#ffffff',
    swatch: '#f4ead9', filter: 420, soundGain: 0.035,
  },
};

// Board coordinates are normalized to a 1000 × 700 writing area. Each nested
// array is one ordered stroke, matching early-handwriting formation cues.
export const LETTERS = [
  {
    id: 'A', sound: 'A says ah.', success: 'Amazing A!',
    strokes: [
      [[230,610],[300,485],[365,360],[430,235],[500,95]],
      [[500,95],[570,235],[635,360],[700,485],[770,610]],
      [[345,430],[500,430],[655,430]],
    ],
  },
  {
    id: 'C', sound: 'C says cuh.', success: 'Clever C!',
    strokes: [[
      [735,190],[655,120],[535,88],[400,105],[290,175],[220,285],
      [195,410],[230,525],[315,610],[430,650],[565,642],[675,590],[745,525],
    ]],
  },
  {
    id: 'L', sound: 'L says lll.', success: 'Lovely L!',
    strokes: [
      [[380,95],[380,230],[380,365],[380,500],[380,610]],
      [[380,610],[520,610],[660,610]],
    ],
  },
  {
    id: 'O', sound: 'O says oh.', success: 'Outstanding O!',
    strokes: [[
      [500,88],[620,105],[710,180],[765,295],[770,420],[720,540],
      [620,625],[500,650],[375,625],[275,540],[225,420],[230,290],
      [290,175],[380,105],[500,88],
    ]],
  },
  {
    id: 'S', sound: 'S says sss.', success: 'Super S!',
    strokes: [[
      [710,165],[625,105],[510,88],[390,110],[305,175],[285,265],
      [335,340],[430,385],[555,420],[665,470],[710,545],[680,610],
      [590,650],[460,650],[350,620],[285,570],
    ]],
  },
  {
    id: 'U', sound: 'U says uh.', success: 'Unbelievable U!',
    strokes: [[
      [285,105],[285,235],[285,365],[300,500],[360,600],[455,645],
      [545,645],[640,600],[700,500],[715,365],[715,235],[715,105],
    ]],
  },
];
