const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Failed to load Question Ball config (${response.status})`);
export default await response.json();
