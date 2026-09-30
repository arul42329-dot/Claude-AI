import { useEffect, useMemo, useState } from 'react'
import { db, nextTradeSerial } from '../db'
import { useLiveQuery } from '../util'
import { useAccountScope } from '../accounts'
import { useAppMode, marketOf, type AppMode } from '../mode'
import type { Trade, Direction, Outcome, Session } from '../types'
import { Modal } from './Modal'
import { Combobox } from './Combobox'
import { NumberStepper } from './NumberStepper'
import { useToast } from './Toast'
import { SESSIONS, SEGMENTS, instrumentsFor, indiaInstruments, defaultInstrument, type Segment } from '../util'
import { getUsdRates, readCachedRates, convertAmount } from '../fxrates'
import { format } from 'date-fns'

// Downscale + re-encode a picked image to a compact JPEG data URL so stored
// screenshots stay small (the journal lives in IndexedDB / backup JSON).
async function compressImage(file: File, maxEdge = 1400, quality = 0.72): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('decode failed'))
    i.src = dataUrl
  })
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl // can't compress — keep the original
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

function emptyTrade(mode: AppMode = 'forex'): Trade {
  return {
    id: crypto.randomUUID(),
    market: mode,
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    pair: defaultInstrument(mode),
    direction: 'long',
    session: mode === 'india' ? 'other' : 'london',
    segment: mode === 'india' ? 'equity' : undefined,
    strategy: '',
    outcome: 'open',
    checklists: [],
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function TradeForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Trade
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const { mode } = useAppMode()
  const allEntries = useLiveQuery(() => db.checklistEntries.orderBy('serial').reverse().toArray(), [], [])
  const { accounts, activeId, settings } = useAccountScope()
  const [t, setT] = useState<Trade>(initial ? structuredClone(initial) : emptyTrade(mode))
  const [tagInput, setTagInput] = useState('')
  const [rates, setRates] = useState<Record<string, number> | null>(() => readCachedRates()?.rates ?? null)

  // Latest FX reference rates, for converting forex P/L into the account currency.
  useEffect(() => { getUsdRates().then(setRates).catch(() => {}) }, [])

  // Only link pre-trade checks from the same mode (India ⟷ India, forex ⟷ forex).
  const tradeMarket = marketOf(t)
  const isIndia = tradeMarket === 'india'
  const seg: Segment = t.segment ?? 'equity'
  const isOption = isIndia && seg === 'options'
  const instrumentList = isIndia ? indiaInstruments(seg) : instrumentsFor('forex')
  const entries = (allEntries ?? []).filter((e) => marketOf(e) === tradeMarket)

  // Default a new trade to the account currently in view (or the first account).
  useEffect(() => {
    if (!t.accountId && accounts.length) {
      const def = activeId !== 'all' ? activeId : accounts[0].id
      setT((prev) => ({ ...prev, accountId: def }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, activeId])

  function set<K extends keyof Trade>(key: K, value: Trade[K]) {
    setT((prev) => ({ ...prev, [key]: value }))
  }
  function setNum<K extends keyof Trade>(key: K, value: string) {
    setT((prev) => ({ ...prev, [key]: value === '' ? undefined : Number(value) } as Trade))
  }

  // Auto R:R from entry / SL / TP
  const autoRr = useMemo(() => {
    const { entryPrice: e, stopLoss: sl, takeProfit: tp } = t
    if (e == null || sl == null || tp == null) return undefined
    const risk = Math.abs(e - sl)
    const reward = Math.abs(tp - e)
    if (risk === 0) return undefined
    return Math.round((reward / risk) * 100) / 100
  }, [t.entryPrice, t.stopLoss, t.takeProfit])

  // Keep the stored riskReward in sync with the auto calculation as inputs change.
  useEffect(() => {
    if (autoRr != null && autoRr !== t.riskReward) {
      setT((prev) => ({ ...prev, riskReward: autoRr }))
    }
  }, [autoRr])

  // Total traded quantity used to turn a price move into money.
  //  • Forex: "Position size (units)"  (100000 = 1.00 standard lot)
  //  • India F&O / commodity: Lots × Qty-per-lot (e.g. NIFTY 75, BANKNIFTY 30)
  //  • India equity / cash: Quantity (shares)
  const totalQty = useMemo(() => {
    if (isIndia) {
      if (seg === 'options' || seg === 'futures' || seg === 'commodity') {
        if (t.lots == null || t.lotSize == null) return undefined
        return t.lots * t.lotSize
      }
      return t.lots ?? undefined // equity / other: lots holds share qty
    }
    return t.lotSize ?? undefined // forex: lotSize holds units
  }, [isIndia, seg, t.lots, t.lotSize])

  // Account currency this trade is journalled in (India is always INR).
  const acctCcy = isIndia
    ? 'INR'
    : (accounts.find((a) => a.id === t.accountId)?.currency || settings?.accountCurrency || 'USD')
  // The pair's quote currency (right side of e.g. EUR/USD, USD/JPY, XAU/USD).
  const quoteCcy = (t.pair?.split('/')[1] || acctCcy).toUpperCase()

  // Auto P/L from entry, exit (close), direction and size. For a SELL the P/L is
  // inverted (you profit when price falls). For forex the raw P/L is in the quote
  // currency and is converted into the account currency with live FX rates.
  const autoPnl = useMemo(() => {
    const { entryPrice: e, exitPrice: x, direction } = t
    if (e == null || x == null || totalQty == null || totalQty === 0) return undefined
    const sign = direction === 'short' ? -1 : 1
    const raw = (x - e) * sign * totalQty // in quote currency (INR already for India)
    if (isIndia) return Math.round(raw * 100) / 100
    if (quoteCcy === acctCcy) return Math.round(raw * 100) / 100
    if (rates) {
      const conv = convertAmount(raw, quoteCcy, acctCcy, rates)
      if (conv != null) return Math.round(conv * 100) / 100
    }
    return Math.round(raw * 100) / 100 // fallback: unconverted (quote currency)
  }, [t.entryPrice, t.exitPrice, t.direction, totalQty, isIndia, quoteCcy, acctCcy, rates])

  // Whether the auto P/L is still shown in the quote currency (rates unavailable).
  const pnlUnconverted = !isIndia && quoteCcy !== acctCcy && (!rates || convertAmount(1, quoteCcy, acctCcy, rates) == null)

  // Keep P/L (and the win/loss outcome) synced to the auto value unless the user
  // has chosen to type P/L manually.
  const [pnlManual, setPnlManual] = useState(() => initial?.pnl != null)
  useEffect(() => {
    if (pnlManual || autoPnl == null) return
    setT((prev) => {
      const outcome: Outcome = prev.outcome === 'open'
        ? prev.outcome
        : autoPnl > 0 ? 'win' : autoPnl < 0 ? 'loss' : 'breakeven'
      return { ...prev, pnl: autoPnl, outcome }
    })
  }, [autoPnl, pnlManual])

  // Entries that can be linked: still pending, or already linked to THIS trade.
  const linkable = (entries ?? []).filter((e) => !e.linkedTradeId || e.linkedTradeId === t.id)
  const selectedEntry = t.checklistSerial != null ? (entries ?? []).find((e) => e.serial === t.checklistSerial) : undefined

  function addTag() {
    const v = tagInput.trim()
    if (!v) return
    if (!(t.tags ?? []).includes(v)) set('tags', [...(t.tags ?? []), v])
    setTagInput('')
  }

  // Multiple chart screenshots: images are downscaled + re-encoded on the
  // device (max 1400px long edge, JPEG) so a trade never bloats the database
  // or the Drive backup. Android's picker offers camera or gallery.
  async function handleScreenshots(files: FileList | null) {
    if (!files || !files.length) return
    const next = [...(t.screenshots ?? [])]
    for (const file of Array.from(files).slice(0, 6 - next.length)) {
      let url: string | null = null
      try { url = await compressImage(file) } catch { url = null }
      if (!url && file.size <= 3_500_000) {
        url = await new Promise<string>((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(r.result as string)
          r.onerror = () => rej(r.error)
          r.readAsDataURL(file)
        }).catch(() => null)
      }
      if (url) next.push(url)
    }
    if (next.length) set('screenshots', next)
    if (next.length >= 6) toast('Up to 6 screenshots per trade')
  }

  function removeScreenshot(i: number) {
    set('screenshots', (t.screenshots ?? []).filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!t.pair) return alert('Choose a currency pair.')
    const serial = t.serial ?? (await nextTradeSerial())

    // Snapshot the linked pre-trade checklist onto the trade so analytics keep working.
    const chosen = t.checklistSerial != null ? (entries ?? []).find((e) => e.serial === t.checklistSerial) : undefined
    const checklists = chosen
      ? [{ checklistId: chosen.checklistId, checklistName: `${chosen.checklistName} · #${chosen.serial}`, items: chosen.items }]
      : []

    const accountId = t.accountId || (activeId !== 'all' ? activeId : accounts[0]?.id)
    const payload: Trade = {
      ...t,
      accountId,
      serial,
      riskReward: autoRr ?? t.riskReward,
      checklists,
      updatedAt: Date.now(),
    }
    await db.trades.put(payload)

    // Maintain the two-way link between trade and pre-trade checklist entry.
    for (const e of entries ?? []) {
      if (e.linkedTradeId === t.id && e.serial !== t.checklistSerial) {
        await db.checklistEntries.update(e.id, { linkedTradeId: undefined })
      }
    }
    if (chosen) await db.checklistEntries.update(chosen.id, { linkedTradeId: t.id })

    onSaved()
  }

  const selPct = selectedEntry && selectedEntry.items.length
    ? Math.round((selectedEntry.items.filter((i) => i.checked).length / selectedEntry.items.length) * 100)
    : null

  return (
    <Modal
      title={initial ? `Edit trade${t.serial ? ' #' + t.serial : ''}` : 'New trade log'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save trade</button>
        </>
      }
    >
      {/* Link to pre-trade checklist — first, so it's front and centre */}
      <h3 style={{ margin: '0 0 12px' }}>Link pre-trade checklist</h3>
      {linkable.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No pre-trade checks available to link. Run a checklist on the <strong>Pre-Trade</strong> tab before your trade, then link it here by its serial #.
        </p>
      ) : (
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Which pre-trade check does this trade belong to?</label>
          <select
            className="select"
            value={t.checklistSerial ?? ''}
            onChange={(e) => set('checklistSerial', e.target.value === '' ? undefined : Number(e.target.value))}
          >
            <option value="">— Not linked —</option>
            {linkable.map((e) => {
              const pct = e.items.length ? Math.round((e.items.filter((i) => i.checked).length / e.items.length) * 100) : 0
              return (
                <option key={e.id} value={e.serial}>
                  #{e.serial} · {e.pair} · {e.checklistName} ({pct}%)
                </option>
              )
            })}
          </select>
        </div>
      )}

      {selectedEntry && (
        <div className="card" style={{ marginBottom: 20, padding: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>#{selectedEntry.serial} · {selectedEntry.checklistName}</strong>
            {selPct != null && <span className="muted" style={{ fontSize: 13 }}>{selPct}% completed</span>}
          </div>
          {selectedEntry.items.map((it) => (
            <div className="check-row" key={it.itemId} style={{ cursor: 'default' }}>
              <div className={'checkbox' + (it.checked ? ' checked' : '')}>{it.checked ? '✓' : ''}</div>
              <span style={{ flex: 1, color: it.checked ? 'var(--text)' : 'var(--text-faint)' }}>{it.text}</span>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Recorded on the Pre-Trade tab (read-only here).</p>
        </div>
      )}

      {/* Basics */}
      <h3 style={{ margin: '10px 0 12px' }}>Trade details</h3>
      <div className="form-grid">
        <div className="field">
          <label>Account</label>
          <select className="select" value={t.accountId ?? ''} onChange={(e) => set('accountId', e.target.value)}>
            {accounts.length === 0 && <option value="">— No accounts —</option>}
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Date</label>
          <input className="input" type="date" value={t.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="field">
          <label>Time</label>
          <input className="input" type="time" value={t.time ?? ''} onChange={(e) => set('time', e.target.value)} />
        </div>
        {isIndia && (
          <div className="field">
            <label>Segment</label>
            <select className="select" value={seg} onChange={(e) => set('segment', e.target.value as Segment)}>
              {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label>{isIndia ? (seg === 'commodity' ? 'Commodity' : seg === 'options' || seg === 'futures' ? 'Underlying' : 'Index / Stock') : 'Pair / Instrument'}</label>
          <Combobox value={t.pair} onChange={(v) => set('pair', v)} options={instrumentList} placeholder={isIndia ? 'Search index, stock or commodity…' : 'Search pair…'} />
        </div>
        <div className="field">
          <label>{isOption ? 'Buy / Sell option' : 'Direction'}</label>
          <div className="seg">
            <button className={t.direction === 'long' ? 'active' : ''} onClick={() => set('direction', 'long' as Direction)}>▲ Buy</button>
            <button className={t.direction === 'short' ? 'active' : ''} onClick={() => set('direction', 'short' as Direction)}>▼ Sell</button>
          </div>
        </div>
        {!isIndia && (
          <div className="field">
            <label>Session</label>
            <select className="select" value={t.session} onChange={(e) => set('session', e.target.value as Session)}>
              {SESSIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label>Strategy / Setup</label>
          <input className="input" value={t.strategy ?? ''} onChange={(e) => set('strategy', e.target.value)} placeholder="e.g. Breakout, OB retest" />
        </div>
      </div>

      {/* Option contract details (India options only) */}
      {isOption && (
        <>
          <h3 style={{ margin: '22px 0 12px' }}>Option contract</h3>
          <div className="form-grid">
            <div className="field">
              <label>Call / Put</label>
              <div className="seg">
                <button className={t.optionType === 'CE' ? 'active' : ''} onClick={() => set('optionType', 'CE')}>Call (CE)</button>
                <button className={t.optionType === 'PE' ? 'active' : ''} onClick={() => set('optionType', 'PE')}>Put (PE)</button>
              </div>
            </div>
            <div className="field"><label>Strike price</label><NumberStepper value={t.strike} onChange={(v) => set('strike', v)} step={50} min={0} placeholder="e.g. 25000" /></div>
            <div className="field"><label>Expiry</label><input className="input" type="date" value={t.expiry ?? ''} onChange={(e) => set('expiry', e.target.value)} /></div>
            <div className="field"><label>Lots</label><NumberStepper value={t.lots} onChange={(v) => set('lots', v)} step={1} min={0} placeholder="e.g. 2" /></div>
            <div className="field"><label>Qty per lot</label><NumberStepper value={t.lotSize} onChange={(v) => set('lotSize', v)} step={5} min={0} placeholder="NIFTY 75, BANKNIFTY 30" /></div>
          </div>
        </>
      )}
      {isIndia && (seg === 'futures' || seg === 'commodity') && (
        <>
          <h3 style={{ margin: '22px 0 12px' }}>Contract</h3>
          <div className="form-grid">
            <div className="field"><label>Expiry</label><input className="input" type="date" value={t.expiry ?? ''} onChange={(e) => set('expiry', e.target.value)} /></div>
            <div className="field"><label>Lots</label><NumberStepper value={t.lots} onChange={(v) => set('lots', v)} step={1} min={0} placeholder="e.g. 1" /></div>
            <div className="field"><label>Qty per lot</label><NumberStepper value={t.lotSize} onChange={(v) => set('lotSize', v)} step={5} min={0} placeholder="e.g. 50" /></div>
          </div>
        </>
      )}

      {/* Plan — your intended stop & target. Used only to compute Risk:Reward. */}
      <h3 style={{ margin: '22px 0 4px' }}>Plan · risk</h3>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
        Where you <em>planned</em> to get out. These only drive Risk : Reward — leave blank if you don't use them.
      </p>
      <div className="form-grid">
        <div className="field"><label>Stop loss</label><input className="input" type="number" step="any" value={t.stopLoss ?? ''} onChange={(e) => setNum('stopLoss', e.target.value)} placeholder="planned SL price" /></div>
        <div className="field"><label>Take profit</label><input className="input" type="number" step="any" value={t.takeProfit ?? ''} onChange={(e) => setNum('takeProfit', e.target.value)} placeholder="planned TP price" /></div>
        <div className="field"><label>Risk %</label><input className="input" type="number" step="any" value={t.riskPercent ?? ''} onChange={(e) => setNum('riskPercent', e.target.value)} /></div>
        <div className="field">
          <label>Risk : Reward (auto)</label>
          <input
            className="input"
            type="text"
            readOnly
            value={autoRr != null ? `1 : ${autoRr}` : (t.riskReward != null ? `1 : ${t.riskReward}` : '—')}
            title="Automatically calculated from Entry, Stop loss and Take profit"
            style={{ background: 'var(--bg-2)', cursor: 'default', fontWeight: 700 }}
          />
          <span className="muted" style={{ fontSize: 11 }}>From Entry, Stop loss &amp; Take profit</span>
        </div>
      </div>

      {/* Execution — what actually happened. P/L is computed from these. */}
      <h3 style={{ margin: '22px 0 4px' }}>Execution · result</h3>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
        What <em>actually</em> happened. P/L is calculated automatically from entry, close price, direction &amp; size.
      </p>
      <div className="form-grid">
        <div className="field"><label>{isOption ? 'Entry premium' : 'Entry price'}</label><input className="input" type="number" step="any" value={t.entryPrice ?? ''} onChange={(e) => setNum('entryPrice', e.target.value)} placeholder="fill price" /></div>
        <div className="field"><label>{isOption ? 'Exit / close premium' : 'Exit / close price'}</label><input className="input" type="number" step="any" value={t.exitPrice ?? ''} onChange={(e) => setNum('exitPrice', e.target.value)} placeholder="close price" /></div>
        {!isIndia && (
          <div className="field">
            <label>Position size (units)</label>
            <input className="input" type="number" step="any" value={t.lotSize ?? ''} onChange={(e) => setNum('lotSize', e.target.value)} placeholder="100000 = 1.00 lot" />
            <span className="muted" style={{ fontSize: 11 }}>100000 = 1.00 standard lot</span>
          </div>
        )}
        {isIndia && !isOption && seg !== 'futures' && seg !== 'commodity' && (
          <div className="field"><label>Quantity (shares)</label><NumberStepper value={t.lots} onChange={(v) => set('lots', v)} step={1} min={0} placeholder="e.g. 100" /></div>
        )}
        <div className="field">
          <label>Outcome</label>
          <select className="select" value={t.outcome} onChange={(e) => { setPnlManual(true); set('outcome', e.target.value as Outcome) }}>
            <option value="open">Open</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
          </select>
        </div>
        <div className="field">
          <label>
            P/L ({isIndia ? '₹ INR' : 'account currency'})
            {!pnlManual && autoPnl != null && <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> · auto</span>}
          </label>
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input"
              type="number"
              step="any"
              value={t.pnl ?? ''}
              onChange={(e) => { setPnlManual(true); setNum('pnl', e.target.value) }}
              placeholder={autoPnl != null ? String(autoPnl) : 'e.g. 125 or -80'}
              style={!pnlManual && autoPnl != null ? { background: 'var(--bg-2)', fontWeight: 700 } : undefined}
            />
            {pnlManual && (
              <button type="button" className="btn sm" title="Recalculate automatically from prices & size"
                onClick={() => { setPnlManual(false); if (autoPnl != null) setNum('pnl', String(autoPnl)) }}>
                Auto
              </button>
            )}
          </div>
          <span className="muted" style={{ fontSize: 11 }}>
            {pnlManual
              ? 'Manual — tap Auto to recompute from prices.'
              : pnlUnconverted
                ? `Auto in ${quoteCcy} (rate to ${acctCcy} unavailable) — type to override.`
                : `Auto in ${acctCcy} from entry, close price, direction & size — type to override.`}
          </span>
        </div>
        {!isIndia && <div className="field"><label>Pips</label><input className="input" type="number" step="any" value={t.pips ?? ''} onChange={(e) => setNum('pips', e.target.value)} /></div>}
        <div className="field">
          <label>Execution rating</label>
          <select className="select" value={t.rating ?? ''} onChange={(e) => setNum('rating', e.target.value)}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
          </select>
        </div>
        <div className="field"><label>Emotion</label><input className="input" value={t.emotion ?? ''} onChange={(e) => set('emotion', e.target.value)} placeholder="Calm, FOMO, fearful…" /></div>
      </div>

      {/* Notes / tags / screenshot */}
      <h3 style={{ margin: '22px 0 12px' }}>Notes</h3>
      <div className="field full" style={{ marginBottom: 16 }}>
        <label>Trade notes</label>
        <textarea className="textarea" value={t.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="What was the idea? What did you learn?" />
      </div>
      <div className="field full" style={{ marginBottom: 16 }}>
        <label>Tags</label>
        <div className="row">
          <input className="input" style={{ maxWidth: 220 }} value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="Add tag + Enter" />
          <div className="chips">
            {(t.tags ?? []).map((tag) => (
              <span key={tag} className="chip" style={{ cursor: 'pointer' }} onClick={() => set('tags', (t.tags ?? []).filter((x) => x !== tag))}>{tag} ✕</span>
            ))}
          </div>
        </div>
      </div>
      <div className="field full">
        <label>Chart screenshots (optional · up to 6)</label>
        <input className="input" type="file" accept="image/*" multiple onChange={(e) => { handleScreenshots(e.target.files); e.target.value = '' }} />
        {(t.screenshots?.length || t.screenshot) ? (
          <div className="shot-grid">
            {t.screenshot && (
              <div className="shot-cell">
                <img src={t.screenshot} alt="screenshot" />
                <button type="button" className="shot-x" title="Remove" onClick={() => set('screenshot', undefined)}>✕</button>
              </div>
            )}
            {(t.screenshots ?? []).map((s, i) => (
              <div className="shot-cell" key={i}>
                <img src={s} alt={'screenshot ' + (i + 1)} />
                <button type="button" className="shot-x" title="Remove" onClick={() => removeScreenshot(i)}>✕</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Snap your chart from the camera or gallery — images are compressed automatically.
          </p>
        )}
      </div>
    </Modal>
  )
}

export { emptyTrade }
