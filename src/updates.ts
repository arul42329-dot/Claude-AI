// In-app update checker — compares the installed version against the newest
// GitHub Release of this repository and hands the user to the APK download.
// The GitHub API is keyless and CORS-enabled, so this works everywhere the
// app runs (CapacitorHttp on Android, direct fetch on web/desktop).

const REPO = 'arul42329-dot/Claude-AI'
const API = `https://api.github.com/repos/${REPO}/releases/latest`
const CACHE_KEY = 'edgefolio-update-check'
const CHECK_INTERVAL = 20 * 60 * 60 * 1000 // re-check at most every ~20h

export interface UpdateInfo {
  current: string
  latest: string
  newer: boolean
  apkUrl: string | null
  releaseUrl: string | null
  notes: string
  checkedAt: number
}

export function appVersion(): string {
  try { return __APP_VERSION__ } catch { return '0.0.0' }
}

function parseVersion(v: string): number[] {
  return v.replace(/^v/, '').split('.').map((p) => parseInt(p, 10) || 0)
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false
  }
  return false
}

function readCache(): UpdateInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  if (!force) {
    const c = readCache()
    if (c && Date.now() - c.checkedAt < CHECK_INTERVAL) return c
  }
  try {
    const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!r.ok) throw new Error('release lookup failed')
    const rel = await r.json()
    const latest = String(rel.tag_name || '').replace(/^v/, '')
    if (!latest) throw new Error('no tag on latest release')
    const apk = (rel.assets ?? []).find((a: any) => String(a.name || '').toLowerCase().endsWith('.apk'))
    const info: UpdateInfo = {
      current: appVersion(),
      latest,
      newer: isNewer(latest, appVersion()),
      apkUrl: apk?.browser_download_url ?? null,
      releaseUrl: rel.html_url ?? `https://github.com/${REPO}/releases/latest`,
      notes: String(rel.body || '').trim(),
      checkedAt: Date.now(),
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(info)) } catch { /* ignore */ }
    return info
  } catch {
    return readCache() // fall back to whatever we knew
  }
}

// Hand the APK download to the system browser (which downloads + offers the
// install). Inside the Capacitor WebView, external URLs open there by default.
export function openUpdateDownload(info: UpdateInfo): void {
  const url = info.apkUrl ?? info.releaseUrl
  if (!url) return
  try {
    const w = window.open(url, '_blank', 'noopener')
    if (!w) window.location.href = url
  } catch {
    window.location.href = url
  }
}
