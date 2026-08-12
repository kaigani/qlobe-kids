// Thin fetch shim so config.json stays the canonical, studio-editable content.
const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error('rhythm-copycat: config.json failed to load');
const config = await response.json();
export default config;
