import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.edgefolio.app',
  appName: 'Edgefolio',
  webDir: 'dist',
  backgroundColor: '#0b1020',
  android: {
    allowMixedContent: false,
  },
}

export default config
