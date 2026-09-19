const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Unable to load config (${response.status})`);
const config = await response.json();
export default config;
