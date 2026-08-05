const config = await fetch('./config.json').then((response) => {
  if (!response.ok) throw new Error(`Little Artist config failed: ${response.status}`);
  return response.json();
});

export default config;
