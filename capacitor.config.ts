import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.edgefolio.app',
  appName: 'Edgefolio',
  webDir: 'dist',
  backgroundColor: '#000000',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // Route fetch/XHR through native HTTP on device so cross-origin calls
    // (Google OAuth/token endpoints, market data) aren't blocked by WebView CORS.
    CapacitorHttp: {
      enabled: true,
    },
    // Android notification icon: the app logo as a white silhouette (alpha
    // drawable ic_stat_logo, copied in by CI) + a gold tint, so Edgefolio's
    // alerts are recognisable in the status bar instead of a generic "i".
    LocalNotifications: {
      smallIcon: 'ic_stat_logo',
      iconColor: '#e8b458',
    },
  },
}

export default config
