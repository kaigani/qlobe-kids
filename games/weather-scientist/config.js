// The JSON file is deliberately the source of truth so production content can
// be audited without following runtime code.
const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`Weather Scientist config failed to load (${response.status})`);

export default await response.json();
