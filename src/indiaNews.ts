// Indian market news headlines for the India mode.
//
// Source: Economic Times "Markets" RSS feed (free, no key). It's XML, parsed in
// the browser with DOMParser. It has no CORS headers, so native apps (APK/Electron)
// hit it directly while any browser routes it through a CORS proxy (corsSafe).

import { corsFetch } from './candles'

export interface Headline { title: string; link: string; at: number }
export interface NewsSnapshot { items: Headline[]; at: number }

const FEED = 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'
const CACHE_KEY = 'edgefolio-india-news-v2'

export function readCachedIndiaNews(): NewsSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export async function fetchIndiaNews(): Promise<NewsSnapshot> {
  const r = await corsFetch(FEED)
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
