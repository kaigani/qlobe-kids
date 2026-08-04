const [configResponse, talesResponse] = await Promise.all([
  fetch(new URL('./config.json', import.meta.url)),
  fetch(new URL('./tales.json', import.meta.url)),
]);
if (!configResponse.ok) throw new Error(`Tangram Tales config failed: ${configResponse.status}`);
if (!talesResponse.ok) throw new Error(`Tangram Tales tales failed: ${talesResponse.status}`);
const [config, tales] = await Promise.all([configResponse.json(), talesResponse.json()]);
export default { ...config, tales };
