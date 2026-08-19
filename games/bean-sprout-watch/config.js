// Standard runtime config shim for custom config.json games.
export default fetch(new URL('./config.json', import.meta.url)).then((response) => {
  if (!response.ok) throw new Error(`Unable to load game config (${response.status})`);
  return response.json();
});
