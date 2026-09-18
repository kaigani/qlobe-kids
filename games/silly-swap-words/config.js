const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Unable to load config.json (${response.status})`);
export default await response.json();
