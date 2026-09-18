const response = await fetch('./config.json');
if (!response.ok) throw new Error(`Instrument Detective config failed: ${response.status}`);
export default await response.json();
