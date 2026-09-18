const response = await fetch("./config.json");
if (!response.ok)
  throw new Error(
    `Failed to load Community Helper Cards config (${response.status})`,
  );
export default await response.json();
