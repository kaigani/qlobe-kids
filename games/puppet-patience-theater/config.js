const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Could not load Puppet Patience Theater config (${response.status})`);

const config = await response.json();
export default config;
