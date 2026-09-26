import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.edgefolio.app',
  appName: 'Edgefolio',
  webDir: 'dist',
  backgroundColor: '#08090c',
  android: {
    allowMixedContent: false,
  },
}

export default config
