// Economic calendar data — high-impact news & scheduled releases.
// Source: the free, keyless ForexFactory weekly JSON feeds hosted by
// faireconomy.media (this week + next week). On Android these requests go
// through Capacitor's native HTTP (CapacitorHttp), so browser CORS doesn't
// block them; results are cached to localStorage for offline viewing.

export type Impact = 'High' | 'Medium' | 'Low' | 'Holiday'

export interface EconEvent {
  id: string
  title: string
  country: string // currency code, e.g. USD, EUR, GBP
  time: number // epoch ms
  impact: Impact
  forecast: string
  previous: string
}

export interface EconSnapshot { events: EconEvent[]; at: number }

const FEEDS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
]
const CACHE_KEY = 'edgefolio-econ'

function normImpact(s: any): Impact {
  const v = String(s || '').toLowerCase()
  if (v.startsWith('high')) return 'High'
  if (v.startsWith('med')) return 'Medium'
  if (v.startsWith('holiday')) return 'Holiday'
  return 'Low'
}

export function readCachedEcon(): EconSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function fetchEcon(): Promise<EconSnapshot> {
  const results = await Promise.allSettled(
    FEEDS.map(async (u) => {
      const r = await fetch(u)
      if (!r.ok) throw new Error('feed')
      return r.json()
    }),
  )
  const raw: any[] = []
  for (const res of results) if (res.status === 'fulfilled' && Array.isArray(res.value)) raw.push(...res.value)
  if (raw.length === 0) throw new Error('No calendar data available')

  const seen = new Set<string>()
  const events: EconEvent[] = []
  for (const e of raw) {
    const t = new Date(e.date).getTime()
    if (!Number.isFinite(t)) continue
    const id = `${t}-${e.country}-${e.title}`
    if (seen.has(id)) continue
    seen.add(id)
    events.push({
      id,
      title: String(e.title || ''),
      country: String(e.country || ''),
      time: t,
      impact: normImpact(e.impact),
      forecast: String(e.forecast ?? ''),
      previous: String(e.previous ?? ''),
    })
  }
  events.sort((a, b) => a.time - b.time)
  const snap: EconSnapshot = { events, at: Date.now() }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)) } catch { /* ignore */ }
  return snap
}

// De-duplicated fetch: returns fresh-enough cache, or a single shared in-flight
// request, so multiple components on the same page don't each hit the network.
let inflight: Promise<EconSnapshot> | null = null
export async function getEcon(maxAgeMs = 5 * 60 * 1000): Promise<EconSnapshot> {
  const cached = readCachedEcon()
  if (cached && Date.now() - cached.at < maxAgeMs) return cached
  if (inflight) return inflight
  inflight = fetchEcon().finally(() => { inflight = null })
  return inflight
}

// Currency codes with a high-impact event still to come today (local day). Past
// events are excluded so the "News" tag warns about upcoming volatility only.
export function highImpactCurrenciesToday(snap: EconSnapshot | null): Set<string> {
  const out = new Set<string>()
  if (!snap) return out
  const now = Date.now()
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = start.getTime() + 86400000
  for (const e of snap.events) {
    if (e.impact === 'High' && e.time >= now && e.time < end) out.add(e.country)
  }
  return out
}
