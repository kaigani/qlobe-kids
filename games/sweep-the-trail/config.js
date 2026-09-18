// config.js — thin shim so index.html keeps a single import shape.
// Content lives in config.json (plain data QLOBE Studio can read and edit).
// See templates/stub-game/config.js for the full rationale.
const config = await fetch(new URL('./config.json', import.meta.url))
  .then((r) => r.json());
export default config;
