const CONFIG_URL = new URL('./config.json', import.meta.url);

const configResponse = await fetch(CONFIG_URL);
if (!configResponse.ok) throw new Error(`Board Game Reset Ritual config failed: ${configResponse.status}`);
const config = await configResponse.json();

export { config };
export default config;
