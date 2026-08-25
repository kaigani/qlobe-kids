export default async function loadConfig() {
  const response = await fetch('./config.json');
  if (!response.ok) throw new Error(`Post Office Letters config failed: ${response.status}`);
  return response.json();
}
