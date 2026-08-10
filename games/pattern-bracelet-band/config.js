const config = await fetch(new URL('./config.json', import.meta.url)).then((r) => r.json());
export default config;
