const [configResponse, linesResponse] = await Promise.all([
  fetch(new URL('./config.json', import.meta.url)),
  fetch(new URL('./assets/audio/lines.json', import.meta.url)),
]);

if (!configResponse.ok) throw new Error(`Throwing Target Garden config failed: ${configResponse.status}`);
if (!linesResponse.ok) throw new Error(`Throwing Target Garden lines failed: ${linesResponse.status}`);

const [config, lines] = await Promise.all([configResponse.json(), linesResponse.json()]);
export default { ...config, lines };
