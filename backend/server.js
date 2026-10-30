import app from "./app.js";
import { initializeBackend } from "./config/initialize.js";

try {
  await initializeBackend();
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`NyaFie API listening on port ${port}`));
} catch (error) {
  console.error("Startup failed:", error.message);
  process.exitCode = 1;
}
