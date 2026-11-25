import app from "./app.js";
import { initializeBackend } from "./config/initialize.js";
import { isConnectionProblem } from "./utils/connectionProblem.js";

// Local development server only (Vercel imports app.js directly).
// Startup problems end the process with a clear message, so `npm run server` (scripts/dev.js)
// shows the failure instead of a server that claims to be listening but isn't. A database that can't be
// reached (network drop, Atlas waking up) is retried: exiting would leave the site answering 502 until a file changes.
const port = Number(process.env.PORT) || 4000;

const startBackend = async () => {
  for (;;) {
    try { return await initializeBackend(); }
    catch (error) {
      if (!isConnectionProblem(error)) throw error;
      console.error(`The database can't be reached (${error.message}). Trying again in 5 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

try {
  await startBackend();
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
