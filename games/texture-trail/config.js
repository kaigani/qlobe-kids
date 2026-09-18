const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`Could not load Texture Trail config (${response.status})`);

const config = await response.json();
export default config;
