const config = await fetch(new URL('./config.json', import.meta.url)).then((response) => response.json());
export default config;
