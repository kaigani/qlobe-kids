// config.js — thin shim so index.html keeps a single import shape.
//
// Bug Hotel Observer keeps all of its content in config.json (plain data the
// studio and the QA harness can read and edit) and loads it through this shim,
// so index.html always does the same `import config from './config.js'`
// whether a game is data-in-JS or data-in-JSON.
//
// The shim uses fetch + top-level await unconditionally. JSON import attributes
// (`import config from './config.json' with { type: 'json' }`) were considered
// and REJECTED: they need iOS Safari 17.2+ / Firefox 138+, too new for a
// tablet-first audience on hand-me-down devices. Top-level await has been safe
// since Safari 15 / Chrome 89 / Firefox 89, so this form runs everywhere we ship.
const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`Bug Hotel Observer config failed: ${response.status}`);
export default await response.json();
