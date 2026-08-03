const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Globe Spin Stories config failed: ${response.status}`);
export default await response.json();
