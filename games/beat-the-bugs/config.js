const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Beat the Bugs config failed: ${response.status}`);
export default await response.json();
