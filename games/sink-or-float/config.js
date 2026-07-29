// config.js — thin shim so index.html/main.js keep a single import shape.
//
// The game's content (modes, the 18 objects and their honest densities, the
// voice script, the Field Journal theme) lives in config.json as plain data so
// QLOBE Studio can read and edit it. See templates/stub-game/config.js for why
// this is fetch + top-level await rather than a JSON import attribute.
const config = await fetch(new URL('./config.json', import.meta.url))
  .then((response) => {
    if (!response.ok) throw new Error(`Sink or Float config failed: ${response.status}`);
    return response.json();
  });

export default config;
