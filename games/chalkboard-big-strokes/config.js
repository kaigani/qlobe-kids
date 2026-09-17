// Thin fetch shim: editable paths and spoken copy stay in config.json while
// the runtime imports an ordinary module on iPads without JSON import attrs.
const config = await fetch(new URL('./config.json', import.meta.url))
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load Chalkboard Big Strokes (${response.status}).`);
    return response.json();
  });

export default config;
