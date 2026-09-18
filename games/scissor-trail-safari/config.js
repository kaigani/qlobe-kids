// Studio-editable data lives in config.json. Keep this fetch shim for older iPads.
const config = await fetch(new URL('./config.json', import.meta.url))
  .then((response) => response.json());

export default config;
