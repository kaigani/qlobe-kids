// Studio-editable content lives in config.json. Top-level await keeps callers
// on the familiar `import config from './config.js'` contract on older iPads.
const config = await fetch(new URL('./config.json', import.meta.url))
  .then((response) => {
    if (!response.ok) throw new Error(`Secret Message Copy config failed: ${response.status}`);
    return response.json();
  });

export default config;
