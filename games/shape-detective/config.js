const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Shape Detective config failed: ${response.status}`);
export default await response.json();
