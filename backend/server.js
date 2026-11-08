import app from "./app.js";
import { initializeBackend } from "./config/initialize.js";

// Local development server only (Vercel imports app.js directly).
// Startup problems end the process with a clear message, so a watcher such as `node --watch`
// shows the failure instead of a server that claims to be listening but isn't.
const port = Number(process.env.PORT) || 4000;

try {
  await initializeBackend();
  // Express 5 passes a failed listen (e.g. the port is taken) to this callback as an error
  app.listen(port, (error) => {
    if (!error) return console.log(`NyaFie API listening on port ${port}`);
    console.error(error.code === "EADDRINUSE"
      ? `Startup failed: port ${port} is already used by another program (another dev server?). Stop it, or set another PORT in backend/.env (the frontend dev proxy follows it).`
      : `Startup failed: ${error.message}`);
    process.exit(1);
  });
} catch (error) {
  console.error("Startup failed:", error.message);
  process.exit(1); // an open database connection would otherwise keep a half-started process alive
}
