const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Sound Cylinder Match config failed: ${response.status}`);
export default await response.json();
