// config.js — thin shim so index.html keeps a single import shape.
//
// Canonical game content lives in config.json (plain data QLOBE Studio can
// read and edit); this shim fetches it with top-level await (safe since
// Safari 15) so no JSON import attributes are needed.
const config = await fetch(new URL('./config.json', import.meta.url))
  .then((r) => r.json());
export default config;
