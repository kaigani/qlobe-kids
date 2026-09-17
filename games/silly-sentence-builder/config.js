const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`Config load failed: ${response.status}`);
const config = await response.json();
export default config;
