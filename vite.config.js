/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// One id per build. It is compiled into the bundle (__APP_BUILD_ID__) and written to
// dist/version.json, so an already-open tab can detect that a newer build is live.
const BUILD_ID = process.env.VITE_BUILD_ID || Date.now().toString(36)

function emitVersionFile() {
  return {
    name: 'emit-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId: BUILD_ID, builtAt: new Date().toISOString() }),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), emitVersionFile()],
  define: { __APP_BUILD_ID__: JSON.stringify(BUILD_ID) },
})
