import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The admin console's private address (ADMIN_ENTRY_PATH, the same value as the backend's) is never
// put in the bundle: only its SHA-256 hash is, so the app can recognise it but nobody can read it.
// The local dev server falls back to /admin; a production build without it has no admin console.
const adminEntryHash = (command, env) => {
  const entry = (env.ADMIN_ENTRY_PATH || "").trim() || (command === "serve" ? "admin" : "")
  if (!entry) console.warn("ADMIN_ENTRY_PATH is not set: this build has no admin console.")
  return entry ? crypto.createHash("sha256").update(entry).digest("hex") : ""
}

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    __ADMIN_ENTRY_HASH__: JSON.stringify(adminEntryHash(command, loadEnv(mode, __dirname, ""))),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
