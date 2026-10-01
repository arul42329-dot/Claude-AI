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
    // Dev-only proxy so the Yahoo Finance candle feed (no CORS headers) can be
    // reached from the browser preview. In production the app calls Yahoo
    // directly (CapacitorHttp on Android, header injection in Electron).
    proxy: {
      '/yf': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/yf/, ''),
      },
      '/etnews': {
        target: 'https://economictimes.indiatimes.com',
        changeOrigin: true,
        rewrite: () => '/markets/rssfeeds/1977021501.cms',
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
})
