// Indian market news headlines for the India mode.
//
// Source: Economic Times "Markets" RSS feed (free, no key). It's XML, parsed in
// the browser with DOMParser. Like the other feeds it has no CORS headers, so it
// works natively in the APK (CapacitorHttp) and Electron (header injection); the
// dev preview goes through the Vite /etnews proxy.

export interface Headline { title: string; link: string; at: number }
export interface NewsSnapshot { items: Headline[]; at: number }

const FEED = 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'
const FEED_URL = import.meta.env.DEV ? '/etnews' : FEED
const CACHE_KEY = 'edgefolio-india-news'

export function readCachedIndiaNews(): NewsSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export async function fetchIndiaNews(): Promise<NewsSnapshot> {
  const r = await fetch(FEED_URL)
  if (!r.ok) throw new Error('india-news')
  const text = await r.text()
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  const items: Headline[] = []
  xml.querySelectorAll('item').forEach((it) => {
    const title = it.querySelector('title')?.textContent?.trim()
    const link = it.querySelector('link')?.textContent?.trim() || ''
    const pub = it.querySelector('pubDate')?.textContent?.trim() || ''
    if (title) items.push({ title, link, at: Date.parse(pub) || Date.now() })
  })
  if (items.length === 0) throw new Error('india-news-empty')
  const snap: NewsSnapshot = { items: items.slice(0, 18), at: Date.now() }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)) } catch { /* ignore */ }
  return snap
}

// DEV-only demo headlines so the preview shows the news list (the sandbox can't
// reach the feed). Compiled out of production builds. Timestamps are generated
// ONCE (module load) so the relative times don't reset on every refresh.
const DEMO_NEWS_BASE = Date.now()
const DEMO_NEWS: NewsSnapshot = {
  at: DEMO_NEWS_BASE,
  items: [
    'Sensex, Nifty end higher as banking and IT stocks lead the rally',
    'Rupee holds steady against the US dollar ahead of RBI policy meet',
    'FIIs turn net buyers; DIIs continue to support the market',
    'Bank Nifty hits fresh record high on strong lender earnings',
    'Ahead of Market: 10 things that will decide stock action tomorrow',
    'Gold prices ease as global yields firm up; silver follows',
  ].map((t, i) => ({ title: t, link: '#', at: DEMO_NEWS_BASE - (i + 1) * 37 * 60000 })),
}
export function devDemoNews(): NewsSnapshot {
  return DEMO_NEWS
}
