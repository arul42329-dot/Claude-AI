import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.claudeai.fxjournal',
  appName: 'FX Journal',
  webDir: 'dist',
  backgroundColor: '#0b1020',
  android: {
    allowMixedContent: false,
  },
}

export default config
