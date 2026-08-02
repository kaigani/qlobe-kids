const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Sound Basket config failed: ${response.status}`);
export default await response.json();
