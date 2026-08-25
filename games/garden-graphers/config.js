const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Garden Graphers config failed: ${response.status}`);
export default await response.json();
