import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use relative base so the built assets work inside Electron (file://) and Capacitor (WebView).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Allow the e2b preview proxy host and any other host to reach the dev server.
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
})
