const CONFIG_URL = new URL('./config.json', import.meta.url);

export async function loadConfig() {
  const response = await fetch(CONFIG_URL);
  if (!response.ok) throw new Error(`Name Puzzle config failed: ${response.status}`);
  const config = await response.json();
  if (!Array.isArray(config.names) || config.names.length !== 20) {
    throw new Error('Name Puzzle requires exactly 20 names');
  }
  return config;
}

export default loadConfig;
