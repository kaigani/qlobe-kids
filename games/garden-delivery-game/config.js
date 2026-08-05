// Studio-editable Garden Delivery data lives in config.json. Fetch keeps this
// compatible with the tablet browsers we support without JSON import attributes.
const response = await fetch(new URL('./config.json', import.meta.url));
if (!response.ok) throw new Error(`Garden Delivery config failed: ${response.status}`);
export default await response.json();
