const response = await fetch('./config.json');
if (!response.ok) throw new Error('Could not load Bead Path Builder configuration');
export default response.json();
