const CONFIG_URL = new URL('./config.json', import.meta.url);
export async function loadConfig() {
  const response = await fetch(CONFIG_URL);
  if (!response.ok) throw new Error(`Shadow Chase config failed: ${response.status}`);
  const config = await response.json();
  if (config.id !== 'shadow-chase' || config.modes?.length !== 3 || config.toys?.length !== 6 || config.sunTargets?.length !== 5) throw new Error('Invalid Shadow Chase config');
  return config;
}
export default loadConfig;
