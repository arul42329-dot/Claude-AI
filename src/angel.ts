// Angel One SmartAPI link — LIVE prices (tick-like, ~3s polling) for Indian
// indices, USDINR and MCX commodities. The user links their own Angel One
// account (API key + client code + PIN + TOTP secret, stored ONLY on this
// device); Edgefolio uses it for MARKET DATA ONLY — it never places orders.
//
// Why: INDmoney (where the user trades) has no public API, but Angel One's
// SmartAPI is free and covers NSE/BSE indices + MCX. Without a link the app
// falls back to Yahoo (delayed ~15 min), exactly as before.
//
// All requests go through corsFetch — in the Android APK that is native
// CapacitorHttp (no CORS), which is what makes the browser-blocked Angel
// endpoints work on the phone.

import { corsFetch } from './candles'

const CREDS_KEY = 'edgefolio-angel-creds'
const SESSION_KEY = 'edgefolio-angel-session'
const TOKENS_KEY = 'edgefolio-angel-tokens-v1'
const HOST = 'https://apiconnect.angelbroking.com'
const SCRIP_MASTER = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json'

export interface AngelCreds {
  apiKey: string
  clientCode: string
  /** the Angel One PIN or web password — SmartAPI's `password` field takes either */
  pin: string
  totpSecret: string
}

interface AngelSession { jwt: string; refresh: string; at: number }

// ---------------- TOTP (RFC 6238, SHA-1, 6 digits, 30s) ----------------
// Generated locally with Web Crypto — the secret never leaves the device.

async function base32Decode(secret: string): Promise<Uint8Array> {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | alphabet.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export async function totp(secret: string, forTime = Date.now()): Promise<string> {
  const key = await base32Decode(secret)
  const counter = Math.floor(forTime / 30000)
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256) }
  const cryptoObj = globalThis.crypto
  if (!cryptoObj?.subtle) throw new Error('no-webcrypto')
  const keyBuf = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer
  const k = await cryptoObj.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = new Uint8Array(await cryptoObj.subtle.sign('HMAC', k, msg))
  const offset = sig[sig.length - 1] & 0x0f
  const bin = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3]
  return String(bin % 1000000).padStart(6, '0')
}

// ---------------- credentials + session ----------------

export function getAngelCreds(): AngelCreds | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (c?.apiKey && c?.clientCode && c?.pin && c?.totpSecret) return c as AngelCreds
    return null
  } catch { return null }
}

export function setAngelCreds(c: AngelCreds | null): void {
  try {
    if (c) localStorage.setItem(CREDS_KEY, JSON.stringify(c))
    else localStorage.removeItem(CREDS_KEY)
  } catch { /* ignore */ }
}

function headers(creds: AngelCreds, jwt?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': creds.apiKey,
  }
  if (jwt) h.Authorization = 'Bearer ' + jwt
  return h
}

// Log in (daily session; auto-renews via the stored credentials).
async function login(creds: AngelCreds): Promise<AngelSession> {
  const code = await totp(creds.totpSecret)
  const r = await corsFetch(HOST + '/rest/auth/angelbroking/user/v1/loginByPassword', {
    method: 'POST',
    headers: headers(creds),
    timeoutMs: 15000,
    // NOTE: SmartAPI's field is `password` — it accepts the PIN or the web
    // password. Sending `pin` returns "invalid password parameters".
    body: JSON.stringify({ clientcode: creds.clientCode, password: creds.pin, totp: code }),
  })
  if (!r.ok) throw new Error('Angel login HTTP ' + r.status)
  const j: any = await r.json()
  const jwt = j?.data?.jwtToken
  const refresh = j?.data?.refreshToken
  if (!jwt) throw new Error(j?.message || 'Angel login failed — check API key / PIN / TOTP')
  const s: AngelSession = { jwt, refresh: refresh ?? '', at: Date.now() }
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { /* ignore */ }
  return s
}

let session: AngelSession | null = null
export function angelLinked(): boolean { return getAngelCreds() != null }

async function getSession(): Promise<AngelSession> {
  if (!session) {
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { session = null }
  }
  const fresh = session && Date.now() - session.at < 20 * 60 * 1000 // jwt lives ~1 day; be safe
  if (fresh) return session!
  session = await login(getAngelCreds()!)
  return session
}

// ---------------- instrument tokens ----------------
// Index tokens on NSE/BSE are stable; commodity futures rotate monthly, so
// they are resolved by name from the (public, unauthenticated) scrip master,
// cached locally. Only the ~20 needed rows are kept.

export interface AngelToken { exchange: string; token: string; name: string; expiry?: string }

const STATIC_INDEX_TOKENS: AngelToken[] = [
  { exchange: 'NSE', token: '26000', name: 'NIFTY 50' },
  { exchange: 'NSE', token: '26009', name: 'BANK NIFTY' },
  { exchange: 'NSE', token: '26017', name: 'INDIA VIX' },
  { exchange: 'NSE', token: '26037', name: 'FIN NIFTY' },
]

// What we want live prices for (display name → scrip-master match).
const WANTED: { display: string; exchange: string; match: (row: any) => boolean }[] = [
  { display: 'CRUDEOIL', exchange: 'MCX', match: (r) => r.symbol === 'CRUDEOIL' || r.name === 'CRUDE OIL' },
  { display: 'GOLD', exchange: 'MCX', match: (r) => r.symbol === 'GOLD' && (r.name || '').indexOf('PETAL') < 0 },
  { display: 'SILVER', exchange: 'MCX', match: (r) => r.symbol === 'SILVER' },
  { display: 'NATURALGAS', exchange: 'MCX', match: (r) => r.symbol === 'NATURALGAS' },
  { display: 'USDINR', exchange: 'CDS', match: (r) => r.symbol === 'USDINR' && (r.instrumenttype ?? '') === 'CUR' },
  // GIFT Nifty (the old Singapore/SGX Nifty) trades on NSE IFSC
  { display: 'GIFTNIFTY', exchange: 'NSEIFS', match: (r) => r.symbol === 'GIFTNIFTY' || (r.name ?? '').toUpperCase().includes('GIFT NIFTY') },
]

// stored: tokens plus a __resolvedAt timestamp
type TokenCache = Record<string, AngelToken | number>

function readTokens(): TokenCache {
  try { return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}') || {} } catch { return {} }
}

// Resolve MCX/CDS tokens from the scrip master (nearest expiry), then cache.
export async function resolveTokens(): Promise<Record<string, AngelToken>> {
  const map: Record<string, AngelToken> = {}
  for (const t of STATIC_INDEX_TOKENS) map[t.name] = t
  map['INDIA VIX'] = { exchange: 'NSE', token: '26017', name: 'INDIA VIX' }
  const cached = readTokens()
  const resolvedAt = Number(cached.__resolvedAt ?? 0)
  if (resolvedAt && Date.now() - resolvedAt < 12 * 3600 * 1000) {
    const kept: Record<string, AngelToken> = { ...map }
    for (const [k, v] of Object.entries(cached)) if (k !== '__resolvedAt' && v && typeof v === 'object') kept[k] = v as AngelToken
    return kept
  }
  try {
    const r = await corsFetch(SCRIP_MASTER, { timeoutMs: 45000 })
    if (!r.ok) throw new Error('scrip ' + r.status)
    const rows: any[] = await r.json()
    for (const w of WANTED) {
      const now = new Date()
      const cands = rows
        .filter((row) => row.exch_seg === w.exchange && w.match(row))
        .filter((row) => {
          if (!row.expiry) return w.exchange === 'CDS'
          const ex = new Date(row.expiry)
          return !isNaN(ex.getTime()) && ex.getTime() > now.getTime()
        })
        .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)))
      const hit = cands[0]
      if (hit) map[w.display] = { exchange: w.exchange, token: String(hit.token), name: w.display, expiry: hit.expiry }
    }
    const store: TokenCache = { ...map, __resolvedAt: Date.now() }
    localStorage.setItem(TOKENS_KEY, JSON.stringify(store))
  } catch { /* keep statics */ }
  return map
}

// ---------------- live quotes (LTP) ----------------

export interface AngelLtp { symbol: string; ltp: number; changePct?: number }

// Fetch LTPs for all resolvable instruments. Returns {} on any failure
// (callers fall back to the delayed Yahoo feed).
export async function fetchAngelLtps(): Promise<Record<string, AngelLtp>> {
  const creds = getAngelCreds()
  if (!creds) return {}
  try {
    const tokens = await resolveTokens()
    const s = await getSession()
    const byExchange: Record<string, string[]> = {}
    for (const t of Object.values(tokens)) {
      ;(byExchange[t.exchange] = byExchange[t.exchange] || []).push(t.token)
    }
    const r = await corsFetch(HOST + '/rest/secure/angelbroking/market/v1/quote/', {
      method: 'POST',
      headers: headers(creds, s.jwt),
      timeoutMs: 12000,
      body: JSON.stringify({ mode: 'LTP', exchangeTokens: byExchange }),
    })
    if (!r.ok) throw new Error('ltp ' + r.status)
    const j: any = await r.json()
    const out: Record<string, AngelLtp> = {}
    for (const row of j?.data?.fetched ?? []) {
      const token = String(row.symbolToken ?? '')
      const name = Object.entries(tokens).find(([, t]) => t.token === token)?.[0]
      if (!name) continue
      const ltp = Number(row.ltp)
      const close = Number(row.close ?? 0)
      if (Number.isFinite(ltp) && ltp > 0) {
        out[name] = { symbol: name, ltp, changePct: close > 0 ? ((ltp - close) / close) * 100 : undefined }
      }
    }
    return out
  } catch {
    return {}
  }
}

// Test a set of credentials by logging in (Settings "Link" button).
export async function testAngelLogin(creds: AngelCreds): Promise<void> {
  const saved = getAngelCreds()
  setAngelCreds(creds)
  session = null
  try {
    await login(creds)
  } catch (e) {
    setAngelCreds(saved)
    session = null
    throw e
  }
}
