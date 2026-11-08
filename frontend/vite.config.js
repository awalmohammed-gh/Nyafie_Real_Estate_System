import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from "path"
import crypto from "crypto"
import fs from "fs"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The admin console's private address (ADMIN_ENTRY_PATH, the same value as the backend's) is never
// put in the bundle: only its SHA-256 hash is, so the app can recognise it but nobody can read it.
// Without it there is no admin console, in development too: /admin is never the console.
const adminEntryHash = (env) => {
  const entry = (env.ADMIN_ENTRY_PATH || "").trim()
  if (!entry) console.warn("ADMIN_ENTRY_PATH is not set: there is no admin console.")
  return entry ? crypto.createHash("sha256").update(entry).digest("hex") : ""
}

// The dev proxy follows the backend's PORT (backend/.env), so changing it in one place is enough.
// Only that one line is read; API_PROXY_TARGET in frontend/.env overrides it (e.g. a remote API).
const backendPort = () => {
  try {
    const line = fs.readFileSync(path.resolve(__dirname, "../backend/.env"), "utf8").split(/\r?\n/).find((text) => /^\s*PORT\s*=/.test(text))
    const port = Number(line?.split("=")[1]?.trim())
    if (Number.isInteger(port) && port > 0) return port
  } catch { /* no backend/.env (frontend-only checkout): use the default */ }
  return 4000
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "")
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __ADMIN_ENTRY_HASH__: JSON.stringify(adminEntryHash(env)),
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      open: false,
      proxy: { '/api': { target: env.API_PROXY_TARGET || `http://localhost:${backendPort()}`, changeOrigin: true } },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
