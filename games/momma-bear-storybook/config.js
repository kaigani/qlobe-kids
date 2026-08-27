// Thin fetch shim: editable story content stays in config.json while the game
// imports one ordinary ES module on older iPads that do not support JSON import
// attributes.
const config = await fetch(new URL('./config.json', import.meta.url))
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load Momma Bear's storybook (${response.status}).`);
    return response.json();
  });

export default config;
