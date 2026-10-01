// Simple, private app-lock (PIN). The PIN is never stored in plain text — only a
// salted SHA-256 hash is kept in localStorage, and verification happens locally.
// This is a convenience lock to keep a casual snooper out of your journal, not a
// cryptographic vault (all data still lives in the local database either way).

const KEY = 'edgefolio-lock'
const SALT = 'edgefolio-lock-v1:'

interface LockData { hash: string }

async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder().encode(SALT + pin)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function isLockEnabled(): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    return !!(raw && JSON.parse(raw).hash)
  } catch {
    return false
  }
}

export async function setPin(pin: string): Promise<void> {
  const data: LockData = { hash: await hashPin(pin) }
  localStorage.setItem(KEY, JSON.stringify(data))
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    const data: LockData = JSON.parse(raw)
    return data.hash === (await hashPin(pin))
  } catch {
    return false
  }
}

export function removeLock(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
