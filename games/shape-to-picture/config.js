/** Load the canonical, Studio-editable game data without bundling. */
export async function loadConfig(url = './config.json') {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Shape Surprise config failed (${response.status})`);
  const config = await response.json();
  if (config?.format !== 'qlobe-shape-surprise-config' || !Array.isArray(config.modes)) {
    throw new Error('Shape Surprise config has an unsupported format');
  }
  return config;
}

export default loadConfig;
