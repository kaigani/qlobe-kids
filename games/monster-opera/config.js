// Thin fetch shim; config.json is the canonical static content.
const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`monster-opera: config.json failed to load (${response.status})`);
const config = await response.json();
export default config;
