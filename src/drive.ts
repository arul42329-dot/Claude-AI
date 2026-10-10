// Google Drive backup via the OAuth 2.0 Device Flow ("TVs and Limited Input
// devices"). This flow is uniquely suited to a pre-built app where the user
// pastes their own Client ID/secret at runtime: it needs no redirect URI, no
// SHA-1 fingerprint, no deep links, and no rebuild. The `drive.file` scope is
// supported by the device flow and lets us create/overwrite a single backup
// file that only this app can see. Refresh tokens are always returned for
// devices, so once connected we can back up silently once per day.
//
// On Android these cross-origin requests go through Capacitor's native HTTP
// layer (CapacitorHttp enabled in capacitor.config), so browser CORS never
// blocks the OAuth/token endpoints.

import { exportAll } from './db'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const BACKUP_FILENAME = 'edgefolio-backup.json'
const STATE_KEY = 'edgefolio-drive'

const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'

export interface DriveState {
  clientId: string
  clientSecret: string
  refreshToken: string
  fileId: string
  connected: boolean
  lastBackupAt: number | null
  lastBackupDay: string | null // YYYY-MM-DD (local)
  lastError: string | null
  // Health line shown in Settings: what the last backup contained.
  lastBackupTrades: number | null
  lastBackupBytes: number | null
}

const EMPTY: DriveState = {
  clientId: '', clientSecret: '', refreshToken: '', fileId: '',
  connected: false, lastBackupAt: null, lastBackupDay: null, lastError: null,
  lastBackupTrades: null, lastBackupBytes: null,
}

export function getDriveState(): DriveState {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) return { ...EMPTY, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...EMPTY }
}

function save(patch: Partial<DriveState>): DriveState {
  const next = { ...getDriveState(), ...patch }
  try { localStorage.setItem(STATE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  return next
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function form(obj: Record<string, string>): string {
  return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}

// ---- Device authorization ----
export interface DeviceCode {
  device_code: string
  user_code: string
  verification_url: string
  interval: number
  expires_in: number
}

export async function requestDeviceCode(clientId: string): Promise<DeviceCode> {
  const r = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: clientId.trim(), scope: SCOPE }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error_description || j.error || 'Could not start Google sign-in')
  return {
    device_code: j.device_code,
    user_code: j.user_code,
    verification_url: j.verification_url || j.verification_uri || 'https://www.google.com/device',
    interval: j.interval || 5,
    expires_in: j.expires_in || 1800,
  }
}

// Polls until the user approves (or the code expires). Resolves once connected.
export async function pollForToken(
  clientId: string,
  clientSecret: string,
  dc: DeviceCode,
  onWait?: (secondsLeft: number) => void,
): Promise<void> {
  const cid = clientId.trim()
  const secret = clientSecret.trim()
  let interval = dc.interval
  const deadline = Date.now() + dc.expires_in * 1000
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, interval * 1000))
    onWait?.(Math.max(0, Math.round((deadline - Date.now()) / 1000)))
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        client_id: cid,
        client_secret: secret,
        device_code: dc.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })
    const j = await r.json()
    if (r.ok && j.access_token) {
      if (!j.refresh_token) throw new Error('Google did not return a refresh token — try Disconnect then Connect again.')
      save({ clientId: cid, clientSecret: secret, refreshToken: j.refresh_token, connected: true, lastError: null })
      return
    }
    const err = j.error
    if (err === 'authorization_pending') continue
    if (err === 'slow_down') { interval += 5; continue }
    if (err === 'access_denied') throw new Error('Access was denied on the Google consent screen.')
    if (err === 'expired_token') throw new Error('The code expired before it was approved. Please try again.')
    throw new Error(j.error_description || err || 'Sign-in failed')
  }
  throw new Error('Timed out waiting for approval. Please try again.')
}

// ---- Token refresh ----
async function accessToken(): Promise<string> {
  const s = getDriveState()
  if (!s.refreshToken) throw new Error('Not connected to Google Drive')
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      client_id: s.clientId,
      client_secret: s.clientSecret,
      refresh_token: s.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) {
    // refresh_token revoked / invalid
    if (j.error === 'invalid_grant') {
      save({ connected: false, refreshToken: '', lastError: 'Google connection expired — please reconnect.' })
    }
    throw new Error(j.error_description || j.error || 'Could not refresh Google access')
  }
  return j.access_token
}

// ---- File handling (single file, overwritten each time) ----
async function ensureFileId(token: string): Promise<string> {
  const existing = getDriveState().fileId
  if (existing) {
    // verify it still exists
    const chk = await fetch(`${DRIVE_FILES_URL}/${existing}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (chk.ok) {
      const j = await chk.json()
      if (j.id && !j.trashed) return existing
    }
  }
  // search for a previously-created backup file
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`)
  const sr = await fetch(`${DRIVE_FILES_URL}?q=${q}&spaces=drive&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (sr.ok) {
    const j = await sr.json()
    if (j.files && j.files.length > 0) {
      save({ fileId: j.files[0].id })
      return j.files[0].id
    }
  }
  // create a fresh metadata-only file
  const cr = await fetch(DRIVE_FILES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BACKUP_FILENAME, mimeType: 'application/json' }),
  })
  const cj = await cr.json()
  if (!cr.ok || !cj.id) throw new Error(cj.error?.message || 'Could not create backup file in Drive')
  save({ fileId: cj.id })
  return cj.id
}

// How many dated backup versions to keep in Drive.
export const BACKUP_VERSIONS = 7

// Runs a full backup: refresh -> write a DATED file (one version per day,
// re-running on the same day overwrites that day's file) -> prune to the
// newest BACKUP_VERSIONS versions. Versioning means a bad database can never
// overwrite the last good backup — you can always restore yesterday's.
export async function runBackup(): Promise<DriveState> {
  const token = await accessToken()
  const data = await exportAll()
  const body = JSON.stringify(data)
  const name = `edgefolio-backup-${todayKey()}.json`

  // Find today's file (if a backup already ran today) so we overwrite it
  // instead of piling up duplicates of the same date.
  const q = encodeURIComponent(`name='${name}' and trashed=false`)
  const sr = await fetch(`${DRIVE_FILES_URL}?q=${q}&spaces=drive&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  let fileId = ''
  if (sr.ok) {
    const j = await sr.json()
    fileId = j.files?.[0]?.id || ''
  }

  if (fileId) {
    const up = await fetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    })
    if (!up.ok) {
      const j = await up.json().catch(() => ({}))
      throw new Error(j.error?.message || 'Upload to Google Drive failed')
    }
  } else {
    // multipart create: metadata + content in one request
    const meta = JSON.stringify({ name, mimeType: 'application/json' })
    const boundary = 'edgefolio' + Date.now()
    const cr = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body:
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
    })
    if (!cr.ok) {
      const j = await cr.json().catch(() => ({}))
      throw new Error(j.error?.message || 'Could not create the backup file in Drive')
    }
  }

  // Prune: keep the newest N dated versions (plus the legacy single file).
  try { await pruneOldBackups(token) } catch { /* pruning is best-effort */ }

  return save({
    lastBackupAt: Date.now(), lastBackupDay: todayKey(), lastError: null,
    lastBackupTrades: Array.isArray((data as any)?.trades) ? (data as any).trades.length : null,
    lastBackupBytes: body.length,
  })
}

// Delete all but the newest BACKUP_VERSIONS dated backups.
async function pruneOldBackups(token: string): Promise<void> {
  const q = encodeURIComponent("name contains 'edgefolio-backup-2' and trashed=false")
  const r = await fetch(`${DRIVE_FILES_URL}?q=${q}&spaces=drive&fields=files(id,name)&pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return
  const j = await r.json()
  const files: { id: string; name: string }[] = j.files || []
  // date-named files sort lexicologically = chronologically
  const dated = files.filter((f) => /^edgefolio-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.name))
    .sort((a, b) => b.name.localeCompare(a.name))
  for (const f of dated.slice(BACKUP_VERSIONS)) {
    await fetch(`${DRIVE_FILES_URL}/${f.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
  }
}

// Called on app open: backs up at most once per day, silently.
export async function maybeDailyBackup(): Promise<void> {
  const s = getDriveState()
  if (!s.connected || !s.refreshToken) return
  if (s.lastBackupDay === todayKey()) return
  try {
    await runBackup()
  } catch (e: any) {
    save({ lastError: e?.message || 'Auto-backup failed' })
  }
}

export async function disconnect(): Promise<void> {
  const s = getDriveState()
  if (s.refreshToken) {
    try {
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(s.refreshToken)}`, { method: 'POST' })
    } catch { /* ignore */ }
  }
  try { localStorage.removeItem(STATE_KEY) } catch { /* ignore */ }
}
