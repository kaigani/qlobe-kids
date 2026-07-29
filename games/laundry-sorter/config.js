const config = await fetch(new URL('./config.json', import.meta.url))
  .then((response) => {
    if (!response.ok) throw new Error(`Laundry config failed: ${response.status}`);
    return response.json();
  });

export default config;
