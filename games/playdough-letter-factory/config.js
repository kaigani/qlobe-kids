const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Could not load Playdough Letter Factory config (${response.status})`);
export default await response.json();
