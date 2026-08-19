const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Failed to load Joke Workshop config (${response.status})`);
export default await response.json();
