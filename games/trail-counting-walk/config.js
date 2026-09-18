const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Trail Counting Walk config failed: ${response.status}`);
export default await response.json();
