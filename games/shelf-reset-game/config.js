const CONFIG_URL = new URL('./config.json', import.meta.url);

const response = await fetch(CONFIG_URL);
if (!response.ok) throw new Error(`Shelf Reset config failed: ${response.status}`);

const config = await response.json();
export { config };
export default config;
