// Rule-based daily trend-bias engine.
//
// Fully transparent, no ML: five indicators are computed from daily OHLC
// candles, each casts a +1 / -1 (structure can be 0) vote, and the votes are
// summed into a -5..+5 score that maps to Bullish / Bearish / Neutral.
//
//   1. Price vs EMA50        close > EMA50            -> +1 else -1
//   2. EMA20 vs EMA50        EMA20 > EMA50            -> +1 else -1
//   3. Market structure      uptrend +1 / down -1 / flat 0
//   4. MACD momentum         histogram > 0            -> +1 else -1
//   5. RSI vs 50             RSI(14) > 50             -> +1 else -1
//
//   score >= +2 -> Bullish ,  score <= -2 -> Bearish ,  else Neutral
//
// STEP 4 helpers (support/resistance, reversal watch, trade call) are exported
// too, for callers that surface them.

export interface Candle { t: number; o: number; h: number; l: number; c: number }

export type BiasLabel = 'Bullish' | 'Bearish' | 'Neutral'
export type Structure = 'uptrend' | 'downtrend' | 'flat'

export interface BiasVote {
  name: string
  value: 1 | 0 | -1
  detail: string
}

export interface BiasResult {
  label: BiasLabel
  score: number // -5..+5
  votes: BiasVote[]
  structure: Structure
  price: number
  ema20: number
  ema50: number
  rsi: number
  macdHist: number
  atr: number
  support: number[]
  resistance: number[]
  reversal: string | null
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

// Exponential moving average over the whole series (seeded from the first value).
export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = 0
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

function rsiValue(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

// Wilder-smoothed RSI (alpha = 1/period on average gains vs losses).
export function rsiWilder(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN)
  if (closes.length < period + 1) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = rsiValue(avgGain, avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    const g = d > 0 ? d : 0
    const l = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = rsiValue(avgGain, avgLoss)
  }
  return out
}

// MACD histogram = (EMA12 - EMA26) minus its own 9-period EMA (signal line).
export function macdHistogram(closes: number[]): number[] {
  const e12 = ema(closes, 12)
  const e26 = ema(closes, 26)
  const macdLine = closes.map((_, i) => e12[i] - e26[i])
  const signal = ema(macdLine, 9)
  return macdLine.map((m, i) => m - signal[i])
}

// Wilder-smoothed ATR(14) from true range.
export function atrWilder(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const n = closes.length
  const out = new Array<number>(n).fill(NaN)
  if (n < period + 1) return out
  const tr: number[] = []
  for (let i = 0; i < n; i++) {
    if (i === 0) tr.push(highs[i] - lows[i])
    else tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])))
  }
  let sum = 0
  for (let i = 1; i <= period; i++) sum += tr[i]
  let atr = sum / period
  out[period] = atr
  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + tr[i]) / period
    out[i] = atr
  }
  return out
}

// ---------------------------------------------------------------------------
// Market structure (swing points)
// ---------------------------------------------------------------------------

export interface Swing { index: number; price: number }

// A candle is a swing high if its high is strictly the max among itself and
// `span` candles on each side (span = 3 -> a 7-candle window). Swing low mirrors.
export function swingHighs(highs: number[], span = 3): Swing[] {
  const res: Swing[] = []
  for (let i = span; i < highs.length - span; i++) {
    let isMax = true
    for (let j = i - span; j <= i + span; j++) {
      if (j !== i && highs[j] >= highs[i]) { isMax = false; break }
    }
    if (isMax) res.push({ index: i, price: highs[i] })
  }
  return res
}

export function swingLows(lows: number[], span = 3): Swing[] {
  const res: Swing[] = []
  for (let i = span; i < lows.length - span; i++) {
    let isMin = true
    for (let j = i - span; j <= i + span; j++) {
      if (j !== i && lows[j] <= lows[i]) { isMin = false; break }
    }
    if (isMin) res.push({ index: i, price: lows[i] })
  }
  return res
}

export function marketStructure(highs: number[], lows: number[]): Structure {
  const sh = swingHighs(highs)
  const sl = swingLows(lows)
  if (sh.length < 2 || sl.length < 2) return 'flat'
  const prevHigh = sh[sh.length - 2].price
  const lastHigh = sh[sh.length - 1].price
  const prevLow = sl[sl.length - 2].price
  const lastLow = sl[sl.length - 1].price
  if (lastHigh > prevHigh && lastLow > prevLow) return 'uptrend'
  if (lastHigh < prevHigh && lastLow < prevLow) return 'downtrend'
  return 'flat'
}

// ---------------------------------------------------------------------------
// Core bias computation (STEP 1-3, plus STEP 4 S/R + reversal)
// ---------------------------------------------------------------------------

export function computeBias(candles: Candle[]): BiasResult | null {
  // Need enough history for EMA50 + swing structure to be meaningful.
  if (!candles || candles.length < 60) return null
  const c = candles.map((x) => x.c)
  const h = candles.map((x) => x.h)
  const l = candles.map((x) => x.l)

  const e20 = ema(c, 20)
  const e50 = ema(c, 50)
  const rsiArr = rsiWilder(c, 14)
  const histArr = macdHistogram(c)
  const atrArr = atrWilder(h, l, c, 14)

  const i = c.length - 1
  const price = c[i]
  const ema20 = e20[i]
  const ema50 = e50[i]
  const rsi = rsiArr[i]
  const macdHist = histArr[i]
  const atr = atrArr[i]
  const structure = marketStructure(h, l)

  if (![price, ema20, ema50, rsi, macdHist].every(Number.isFinite)) return null

  const votes: BiasVote[] = [
    { name: 'Price vs EMA50', value: price > ema50 ? 1 : -1, detail: `close ${price > ema50 ? '>' : '≤'} EMA50` },
    { name: 'EMA20 vs EMA50', value: ema20 > ema50 ? 1 : -1, detail: `EMA20 ${ema20 > ema50 ? '>' : '≤'} EMA50` },
    { name: 'Structure', value: structure === 'uptrend' ? 1 : structure === 'downtrend' ? -1 : 0, detail: structure },
    { name: 'MACD', value: macdHist > 0 ? 1 : -1, detail: `hist ${macdHist > 0 ? '>' : '≤'} 0` },
    { name: 'RSI', value: rsi > 50 ? 1 : -1, detail: `RSI ${Number.isFinite(rsi) ? rsi.toFixed(0) : '—'}` },
  ]

  const score = votes.reduce((s, v) => s + v.value, 0)
  const label: BiasLabel = score >= 2 ? 'Bullish' : score <= -2 ? 'Bearish' : 'Neutral'

  const { support, resistance } = supportResistance(h, l, price)
  const reversal = reversalWatch(candles[i], atr, support, resistance)

  return { label, score, votes, structure, price, ema20, ema50, rsi, macdHist, atr, support, resistance, reversal }
}

// ---------------------------------------------------------------------------
// STEP 4 helpers
// ---------------------------------------------------------------------------

// Nearest 2 resistances (from the last 8 swing highs above price) and nearest 2
// supports (from the last 8 swing lows below price).
export function supportResistance(highs: number[], lows: number[], price: number): { support: number[]; resistance: number[] } {
  const sh = swingHighs(highs).slice(-8).map((s) => s.price).filter((p) => p > price)
  const sl = swingLows(lows).slice(-8).map((s) => s.price).filter((p) => p < price)
  const resistance = Array.from(new Set(sh)).sort((a, b) => a - b).slice(0, 2) // nearest above first
  const support = Array.from(new Set(sl)).sort((a, b) => b - a).slice(0, 2) // nearest below first
  return { support, resistance }
}

// Rejection wick near a level: wick > 2x body and > 40% of the candle's range,
// with price within 0.5x ATR of the level.
export function reversalWatch(last: Candle, atr: number, support: number[], resistance: number[]): string | null {
  if (!Number.isFinite(atr) || atr <= 0) return null
  const body = Math.abs(last.c - last.o)
  const range = last.h - last.l
  if (range <= 0) return null
  const upperWick = last.h - Math.max(last.o, last.c)
  const lowerWick = Math.min(last.o, last.c) - last.l
  const near = (levels: number[], px: number) => levels.some((lv) => Math.abs(px - lv) <= 0.5 * atr)

  if ((near(support, last.l) || near(support, last.c)) && lowerWick > 2 * body && lowerWick > 0.4 * range) {
    return 'Bullish rejection at support'
  }
  if ((near(resistance, last.h) || near(resistance, last.c)) && upperWick > 2 * body && upperWick > 0.4 * range) {
    return 'Bearish rejection at resistance'
  }
  return null
}

export interface TradeCall {
  action: 'Long' | 'Short' | 'No trade'
  reason: string
  entry?: number
  stop?: number
  target1?: number
  target2?: number
}

// Propose a trade only when the viewed timeframe's bias AGREES with the daily
// bias (and daily is not Neutral). Entry = current price; stop = 1.5x ATR
// against; T1 = 1.5x ATR, T2 = 3x ATR in favor.
export function tradeCall(daily: BiasResult, viewedBias: BiasLabel, price: number): TradeCall {
  if (daily.label === 'Neutral') return { action: 'No trade', reason: 'Daily bias is Neutral — wait.' }
  if (viewedBias !== daily.label) return { action: 'No trade', reason: 'Timeframe bias disagrees with daily — wait.' }
  const atr = daily.atr
  if (!Number.isFinite(atr) || atr <= 0) return { action: 'No trade', reason: 'ATR unavailable.' }
  if (daily.label === 'Bullish') {
    return { action: 'Long', reason: 'Daily & timeframe agree (bullish).', entry: price, stop: price - 1.5 * atr, target1: price + 1.5 * atr, target2: price + 3 * atr }
  }
  return { action: 'Short', reason: 'Daily & timeframe agree (bearish).', entry: price, stop: price + 1.5 * atr, target1: price - 1.5 * atr, target2: price - 3 * atr }
}
