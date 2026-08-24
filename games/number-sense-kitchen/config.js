const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Number Sense Kitchen config failed: ${response.status}`);
export default await response.json();
