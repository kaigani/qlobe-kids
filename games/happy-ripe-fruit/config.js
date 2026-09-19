const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Happy Ripe Fruit config failed: ${response.status}`);
export default await response.json();
