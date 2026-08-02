const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Clay Creature Studio config failed: ${response.status}`);
export default await response.json();
