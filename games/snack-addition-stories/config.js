// Studio-editable content lives in config.json. This fetch shim keeps the game
// compatible with older tablets that do not support JSON import attributes.
const fallback = Object.freeze({
  id: 'snack-addition-stories',
  engine: 'custom',
  title: 'Snack Addition Stories',
  music: { track: '../../shared/assets/music/mug-and-sunbeam.mp3', volume: 0.14 },
  assets: {
    backdrop: './assets/backdrop.webp',
    title: './assets/title.webp',
    foods: {},
    ui: {},
    characters: {},
  },
  voice: {},
  copy: {},
  modes: [],
  themes: [],
  counterRounds: [],
  picnic: { foods: [], limit: 6 },
});

const config = await fetch(new URL('./config.json', import.meta.url))
  .then((response) => {
    if (!response.ok) throw new Error(`Snack Addition Stories config failed: ${response.status}`);
    return response.json();
  })
  .catch((error) => {
    console.error(error);
    return fallback;
  });

export default config;
