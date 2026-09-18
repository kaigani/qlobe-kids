const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`Family Story Interview config failed: ${response.status}`);
const config = await response.json();
export default config;
