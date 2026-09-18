const response = await fetch('./config.json');
if (!response.ok) {
  throw new Error(`Unable to load Magnet Explorer config (${response.status})`);
}

export default await response.json();
