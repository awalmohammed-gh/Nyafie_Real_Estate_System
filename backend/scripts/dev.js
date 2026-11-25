import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync, watch } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * `npm run server`: runs the API and restarts it when its code is saved.
 *
 * It replaces `node --watch`, which on Windows also restarts when a file is only opened (Windows records
 * when a file was last opened, and Node reports that as a change). A library that loads a file on first
 * use then killed the server in the middle of that request: Google sign-in failed with a 502 that way.
 * Here a file counts as changed only when its saved time or size is different.
 */
const FOLDERS = ["config", "controllers", "middleware", "models", "routes", "utils"];
const FILES = ["app.js", "server.js", ".env", "package.json"];
const CRASH_AFTER_MS = 10000; // running at least this long, then stopping by itself: a crash, started again

// The server's own code (never node_modules, tests, seeds or scripts)
export const isServerFile = (path) => {
  const parts = String(path).split(/[\\/]+/).filter(Boolean);
  return parts.length === 1 ? FILES.includes(parts[0]) : FOLDERS.includes(parts[0]) && parts.at(-1).endsWith(".js");
};

const signature = (path) => {
  try { const { mtimeMs, size } = statSync(path); return `${mtimeMs}:${size}`; } catch { return "missing"; }
};

/** Remembers each file as it was; changed(path) is true only when it has really been saved since. */
export const createChanges = (root) => {
  const known = new Map();
  const remember = (folder = "") => {
    for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) { if (FOLDERS.includes(path.split(sep)[0])) remember(path); }
      else if (isServerFile(path)) known.set(path, signature(join(root, path)));
    }
  };
  remember();
  return {
    changed: (path) => {
      const name = String(path).split(/[\\/]+/).join(sep);
      if (!isServerFile(name)) return false;
      const now = signature(join(root, name));
      if (known.get(name) === now || (now === "missing" && !known.has(name))) return false;
      known.set(name, now);
      return true;
    },
  };
};

const run = (root, entry) => {
  const changes = createChanges(root);
  let child = null, startedAt = 0, restarting = false, timer;
  const start = () => {
    startedAt = Date.now();
    child = spawn(process.execPath, [entry], { cwd: root, stdio: "inherit" });
    child.on("exit", (code, signal) => {
      child = null;
      if (restarting) { restarting = false; return start(); }
      const crashed = Date.now() - startedAt >= CRASH_AFTER_MS;
      // A moment later, so that Ctrl+C (which stops both) says nothing
      setTimeout(() => {
        if (child) return;
        if (!crashed) return console.error("The server didn't start. Save a file to try again.");
        console.error(`The server stopped unexpectedly (${signal || `code ${code}`}). Starting it again...`);
        start();
      }, 1000);
    });
  };
  const restart = () => {
    console.log("Code saved: restarting the server...");
    if (!child) return start();
    restarting = true;
    child.kill();
  };
  watch(root, { recursive: true }, (_event, path) => {
    if (!path || !changes.changed(path)) return;
    clearTimeout(timer);
    timer = setTimeout(restart, 200); // several files saved together: one restart
  });
  const stop = () => { child?.kill(); process.exit(0); };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
  process.on("exit", () => child?.kill());
  start();
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), ".."));
  if (!existsSync(join(root, "server.js"))) { console.error(`No server.js in ${root}`); process.exit(1); }
  run(root, "server.js");
}
