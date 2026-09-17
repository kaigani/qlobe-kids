const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Sweep the Trail config failed: ${response.status}`);
export default await response.json();
