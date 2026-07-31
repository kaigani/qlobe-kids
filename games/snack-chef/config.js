const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Snack Chef config failed: ${response.status}`);
export default await response.json();
