// Red Light, Green Light — timing config for the game-local caller engine
// (js/game.js). The caller ROSTER lives in js/callers.js; this file only
// describes the signal timing/modes. States reference a caller video by
// `videoKey` (green|red|yellow) and carry a spoken `say` fallback + `motion`
// (loop = keep bopping through the window; hold = freeze on the last frame).
export default {
  id: 'red-green-light',
  title: 'Red Light, Green Light',
  splashEmoji: '🚦',
  selectPrompt: 'Pick your caller!',
  modePrompt: 'How shall we play?',
  voice: {
    cheer: 'You stopped and went with your whole body!',
  },
  modes: [
    {
      id: 'classic',
      title: 'Classic',
      rounds: 5,
      cheer: 'You listened and froze like a statue!',
      endTitle: 'Great Listening',
      endArt: '🚦',
      againLabel: 'AGAIN',
      states: [
        { id: 'go',   videoKey: 'green', motion: 'loop', color: '#58a945', sfx: 'pop',   say: 'Green light! Go, go, go!',   durSec: [3, 8] },
        { id: 'stop', videoKey: 'red',   motion: 'hold', color: '#c9503a', sfx: 'boing', say: 'Red light! Freeze!',          durSec: [2, 5] },
      ],
    },
    {
      id: 'silly',
      title: 'Silly Switch',
      rounds: 5,
      cheer: 'You switched your body in silly ways!',
      endTitle: 'Silly Switch',
      endArt: '🚦',
      againLabel: 'AGAIN',
      states: [
        { id: 'go',     videoKey: 'green',  motion: 'loop', color: '#58a945', sfx: 'pop',   say: 'Green light! Go, go, go!',        durSec: [3, 8] },
        { id: 'wiggle', videoKey: 'yellow', motion: 'loop', color: '#f4c53d', sfx: 'silly', say: 'Yellow light! Wiggle, wiggle!',   durSec: [2, 4] },
        { id: 'stop',   videoKey: 'red',    motion: 'hold', color: '#c9503a', sfx: 'boing', say: 'Red light! Freeze!',              durSec: [2, 5] },
      ],
    },
  ],
};
