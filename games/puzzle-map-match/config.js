// Plain-data shim for QLOBE Studio and the static runtime.
const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`Puzzle Explorer config failed: ${response.status}`);
export default await response.json();
