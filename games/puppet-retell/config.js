const response = await fetch('./config.json', { cache: 'no-store' });
if (!response.ok) throw new Error(`Could not load Puppet Retell config: ${response.status}`);
export default await response.json();
