// Thin data shim for the production Story Repair Shop runtime.
const config = await fetch(new URL('./config.json', import.meta.url)).then((response) => {
  if (!response.ok) throw new Error(`Story Repair Shop config failed: ${response.status}`);
  return response.json();
});
export default config;
