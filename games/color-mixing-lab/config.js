const config = await fetch(new URL('./config.json', import.meta.url))
  .then((response) => {
    if (!response.ok) throw new Error(`Color Mixing Lab config failed: ${response.status}`);
    return response.json();
  });

export default config;
