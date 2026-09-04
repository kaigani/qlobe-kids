const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`Sound Hopscotch config failed: ${response.status}`);
export default await response.json();
