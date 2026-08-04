const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Emotion Voice Game config failed: ${response.status}`);
export default await response.json();
