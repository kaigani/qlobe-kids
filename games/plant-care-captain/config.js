// Studio-editable Plant Care Captain data lives in config.json.
const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`Plant Care Captain config failed: ${response.status}`);
export default await response.json();
