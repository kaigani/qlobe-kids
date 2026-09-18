const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Calm Corner config failed: HTTP ${response.status}`);
const config = await response.json();
export default config;
