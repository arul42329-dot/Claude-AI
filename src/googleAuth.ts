// Google Sign-In (optional) — identifies the Google account using this
// installation. Uses the same OAuth 2.0 device flow as Google Drive backup:
// no server, no Firebase, and it works inside the Android WebView because
// these requests go through Capacitor's native HTTP layer.
//
// Signing in does NOT move your data anywhere — the journal stays in the
// local database. It records which Google account the journal belongs to,
// pairs naturally with Google Drive backup/restore on a new phone, and is
// the foundation a future cloud-sync layer can build on.

const STATE_KEY = 'edgefolio-google-user'
const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const SCOPE = 'openid email profile'

export interface GoogleUser {
  sub: string
  email: string
  name: string
  picture?: string
}

export interface GoogleAuthState {
  user: GoogleUser | null
  connectedAt: number | null
}

export function getGoogleUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) return (JSON.parse(raw)?.user as GoogleUser) ?? null
  } catch { /* ignore */ }
  return null
}

function save(state: GoogleAuthState): void {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

function form(obj: Record<string, string>): string {
  return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}

export interface DeviceCode {
  device_code: string
  user_code: string
  verification_url: string
  interval: number
  expires_in: number
}

export async function requestSigninDeviceCode(clientId: string): Promise<DeviceCode> {
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

// Polls until the user approves the sign-in on their other device, then
// fetches the profile. Resolves with the signed-in user.
export async function pollForSignIn(
  clientId: string,
  dc: DeviceCode,
  onWait?: (secondsLeft: number) => void,
): Promise<GoogleUser> {
  const cid = clientId.trim()
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
        device_code: dc.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })
    const j = await r.json()
    if (r.ok && j.access_token) {
      const user = await fetchUser(j.access_token)
      save({ user, connectedAt: Date.now() })
      return user
    }
    const err = j.error
    if (err === 'authorization_pending') continue
    if (err === 'slow_down') { interval += 5; continue }
    if (err === 'access_denied') throw new Error('Sign-in was denied on the Google consent screen.')
    if (err === 'expired_token') throw new Error('The code expired before it was approved. Please try again.')
    throw new Error(j.error_description || err || 'Sign-in failed')
  }
  throw new Error('Timed out waiting for approval. Please try again.')
}

async function fetchUser(accessToken: string): Promise<GoogleUser> {
  const r = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
  const j = await r.json()
  if (!r.ok || !j.sub) throw new Error('Could not read your Google profile')
  return {
    sub: String(j.sub),
    email: String(j.email ?? ''),
    name: String(j.name || j.email || 'Google user'),
    picture: j.picture ? String(j.picture) : undefined,
  }
}

export function signOutGoogle(): void {
  save({ user: null, connectedAt: null })
}
