import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.edgefolio.app',
  appName: 'Edgefolio',
  webDir: 'dist',
  backgroundColor: '#08090c',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // Route fetch/XHR through native HTTP on device so cross-origin calls
    // (Google OAuth/token endpoints, market data) aren't blocked by WebView CORS.
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
