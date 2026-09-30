// Biometric unlock (Android) — fingerprint / face / device PIN via a tiny
// first-party Capacitor plugin (native/android/EdgefolioBiometricPlugin.java,
// injected into the Android build by CI). The web/desktop build has no native
// side, so every call degrades to "unavailable" there.

import { registerPlugin } from '@capacitor/core'
import { isNativePlatform } from './candles'

interface BiometricResult {
  ok: boolean
  code?: number
  message?: string
}

interface EdgefolioBiometric {
  isAvailable(): Promise<{ available: boolean; code: number }>
  verify(options: { title?: string; subtitle?: string }): Promise<BiometricResult>
  openNotificationSettings(): Promise<void>
  openExactAlarmSettings(): Promise<void>
  exactAlarmState(): Promise<{ exact: boolean }>
}

const plugin = registerPlugin<EdgefolioBiometric>('EdgefolioBiometric')

/** Can this device show a biometric / device-credential prompt right now? */
export async function biometricAvailable(): Promise<boolean> {
  if (!isNativePlatform()) return false
  try {
    const r = await plugin.isAvailable()
    return !!r.available
  } catch {
    return false // plugin not implemented (web/Electron) or native error
  }
}

/** Show the system unlock prompt. Resolves { ok: false } on cancel/failure. */
export async function biometricVerify(title: string, subtitle?: string): Promise<BiometricResult> {
  try {
    return await plugin.verify({ title, subtitle })
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Biometric unlock unavailable' }
  }
}

// ---------------- Notification / alarm device helpers ----------------
// (same first-party plugin — deep links into Android system settings)

/** Open this app's notification page in the phone's system settings. */
export async function openNotificationSettings(): Promise<void> {
  try { await plugin.openNotificationSettings() } catch { /* ignore */ }
}

/** Open the "Alarms & reminders" (exact alarm) permission page. */
export async function openExactAlarmSettings(): Promise<void> {
  try { await plugin.openExactAlarmSettings() } catch { /* ignore */ }
}

/** True when exact alarms are allowed (always true below Android 12). */
export async function exactAlarmsAllowed(): Promise<boolean> {
  try {
    const r = await plugin.exactAlarmState()
    return !!r.exact
  } catch {
    return true
  }
}
