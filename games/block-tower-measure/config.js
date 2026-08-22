const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`Block Tower Measure config failed to load (${response.status})`);
export default await response.json();
