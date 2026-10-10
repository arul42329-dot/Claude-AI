// One-tap Excel report (Analytics → 📊 Excel report). Builds a fully analysed
// multi-sheet workbook — dashboard summary, every trade, monthly / strategy /
// session / weekday breakdowns and the equity curve — and downloads it.
// Generated entirely on-device with ExcelJS; nothing leaves the phone.

import ExcelJS from 'exceljs'
import { isNativePlatform } from './candles'
import type { Trade } from './types'
import { netPnlOf, tradeDate, tradeR, computeStats, computeRStats, equityCurve } from './stats'
import { displayDirection, instrumentLabel } from './util'
import type { Cashflow } from './types'
import type { AppMode } from './mode'

const GOLD = 'FFE8B458'
const INK = 'FF141414'
const GREEN = 'FF1C6B50'
const RED = 'FF7A2B3C'

function plFont(p: number) {
  return { font: { color: { argb: p > 0 ? GREEN : p < 0 ? RED : 'FF666666' } } }
}

export async function exportExcelReport(
  tradesAll: Trade[],
  opts: { mode: AppMode; currency: string; startBalance: number; cashflows: Cashflow[]; scopeName: string },
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Edgefolio'
  wb.created = new Date()

  const trades = [...tradesAll].sort((a, b) => tradeDate(a).getTime() - tradeDate(b).getTime())
  const stats = computeStats(trades)
  const rStats = computeRStats(trades)
  const isIndia = opts.mode === 'india'
  const cur = opts.currency

  // ---------- Sheet 1: Dashboard ----------
  const dash = wb.addWorksheet('Dashboard', { views: [{ state: 'frozen', ySplit: 4 }] })
  dash.columns = [{ width: 30 }, { width: 18 }, { width: 30 }, { width: 18 }]
  const title = dash.addRow(['Edgefolio — trading report'])
  title.font = { bold: true, size: 18, color: { argb: GOLD } }
  dash.addRow([`Generated ${new Date().toLocaleString()}`]).font = { color: { argb: 'FF888888' } }
  dash.addRow([`Scope: ${opts.scopeName} · ${trades.length} trades · ${isIndia ? 'India' : 'Forex'} journal`]).font = { color: { argb: 'FF888888' } }
  dash.addRow([])

  const taxTotal = trades.reduce((a, t) => a + (t.taxes ?? 0), 0)
  const brokerageTotal = trades.reduce((a, t) => a + (t.brokerage ?? 0), 0)
  const grossTotal = trades.reduce((a, t) => a + netPnlOf(t) + (t.taxes ?? 0), 0)
  const netTotal = trades.reduce((a, t) => a + netPnlOf(t), 0)
  const roi = opts.startBalance > 0 ? (netTotal / opts.startBalance) * 100 : 0

  const rows: [string, string, string, string][] = [
    ['GROSS P/L (before tax)', grossTotal.toFixed(2) + ' ' + cur, 'NET P/L (after tax)', netTotal.toFixed(2) + ' ' + cur],
    ['Total brokerage', brokerageTotal.toFixed(2) + ' ' + cur, 'Total taxes', taxTotal.toFixed(2) + ' ' + cur],
    ['Win rate', stats.winRate.toFixed(1) + '%', 'Closed trades', String(stats.closedTrades)],
    ['Wins / Losses / BE', `${stats.wins} / ${stats.losses} / ${stats.breakeven}`, 'Profit factor', stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)],
    ['Expectancy / trade', stats.expectancy.toFixed(2) + ' ' + cur, 'Avg R (realised)', rStats.avgR != null ? rStats.avgR.toFixed(2) + 'R' : '—'],
    ['Best trade', stats.bestTrade.toFixed(2) + ' ' + cur, 'Worst trade', stats.worstTrade.toFixed(2) + ' ' + cur],
    ['Max win streak', String(stats.maxWinStreak), 'Max loss streak', String(stats.maxLossStreak)],
    ['Start balance', opts.startBalance.toFixed(2) + ' ' + cur, 'ROI', roi.toFixed(2) + '%'],
  ]
  for (const r of rows) {
    const row = dash.addRow(r)
    row.getCell(1).font = { bold: true }
    row.getCell(3).font = { bold: true }
  }
  // highlight the gross/net row
  const gn = dash.getRow(6)
  gn.getCell(2).font = { bold: true, color: { argb: grossTotal >= 0 ? GREEN : RED } }
  gn.getCell(4).font = { bold: true, color: { argb: netTotal >= 0 ? GREEN : RED } }

  // ---------- Sheet 2: Trades ----------
  const tx = wb.addWorksheet('Trades', { views: [{ state: 'frozen', ySplit: 1 }] })
  tx.columns = [
    { header: '#', key: 'serial', width: 6 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Time', key: 'time', width: 8 },
    { header: 'Pair', key: 'pair', width: 22 },
    { header: 'View', key: 'dir', width: 8 },
    { header: 'Session', key: 'session', width: 10 },
    { header: 'Strategy', key: 'strategy', width: 14 },
    { header: 'Entry', key: 'entry', width: 10 },
    { header: 'Exit', key: 'exit', width: 10 },
    { header: 'Lots', key: 'lots', width: 7 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Gross', key: 'gross', width: 12 },
    { header: 'Brokerage', key: 'brokerage', width: 11 },
    { header: 'Tax share', key: 'taxes', width: 10 },
    { header: 'NET P/L', key: 'net', width: 12 },
    { header: 'R', key: 'r', width: 7 },
    { header: 'Outcome', key: 'outcome', width: 10 },
    { header: 'Rating', key: 'rating', width: 8 },
    { header: 'Account', key: 'account', width: 14 },
  ]
  const headerRow = tx.getRow(1)
  headerRow.eachCell((c) => { c.font = { bold: true, color: { argb: INK } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } } })
  for (const t of trades) {
    const r = tradeR(t)
    const qty = t.segment === 'equity' ? t.lots : t.lots != null && t.lotSize != null ? t.lots * t.lotSize : undefined
    const row = tx.addRow({
      serial: t.serial ?? '',
      date: t.date,
      time: t.time ?? '',
      pair: instrumentLabel(t),
      dir: displayDirection(t) === 'long' ? '▲ Long' : '▼ Short',
      session: t.session ?? '',
      strategy: t.strategy ?? '',
      entry: t.entryPrice ?? '',
      exit: t.exitPrice ?? '',
      lots: t.lots ?? '',
      qty: qty ?? '',
      gross: t.grossPnl ?? '',
      brokerage: t.brokerage ?? '',
      taxes: t.taxes ?? '',
      net: netPnlOf(t),
      r: r != null ? Math.round(r * 100) / 100 : '',
      outcome: t.outcome ?? '',
      rating: t.rating ?? '',
      account: t.accountId ?? '',
    })
    row.getCell('net').font = { color: { argb: netPnlOf(t) > 0 ? GREEN : netPnlOf(t) < 0 ? RED : 'FF666666' }, bold: true }
    if (t.outcome) row.getCell('outcome').font = { color: { argb: t.outcome === 'win' ? GREEN : t.outcome === 'loss' ? RED : 'FF666666' } }
  }

  // ---------- helper for breakdown sheets ----------
  function breakdown(name: string, keyOf: (t: Trade) => string) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = [
      { header: name, key: 'k', width: 22 },
      { header: 'Trades', key: 'n', width: 9 },
      { header: 'Wins', key: 'w', width: 8 },
      { header: 'Losses', key: 'l', width: 8 },
      { header: 'Win rate', key: 'wr', width: 10 },
      { header: 'NET P/L', key: 'net', width: 13 },
    ]
    const h = ws.getRow(1)
    h.eachCell((c) => { c.font = { bold: true, color: { argb: INK } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } } })
    const groups = new Map<string, Trade[]>()
    for (const t of trades) {
      const k = keyOf(t) || '—'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(t)
    }
    for (const [k, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const st = computeStats(list)
      const row = ws.addRow({ k, n: list.length, w: st.wins, l: st.losses, wr: st.winRate.toFixed(1) + '%', net: st.netPnl })
      row.getCell('net').font = { color: { argb: st.netPnl > 0 ? GREEN : st.netPnl < 0 ? RED : 'FF666666' }, bold: true }
    }
    return ws
  }

  breakdown('Monthly', (t) => t.date.slice(0, 7))
  breakdown('By strategy', (t) => t.strategy || '—')
  breakdown('By session', (t) => t.session || '—')
  breakdown('By weekday', (t) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][tradeDate(t).getDay()])

  // ---------- Equity curve ----------
  const eq = wb.addWorksheet('Equity curve', { views: [{ state: 'frozen', ySplit: 1 }] })
  eq.columns = [
    { header: 'Date', key: 'd', width: 12 },
    { header: 'Event', key: 'e', width: 14 },
    { header: 'Net P/L', key: 'p', width: 12 },
    { header: 'Balance', key: 'b', width: 14 },
  ]
  const hq = eq.getRow(1)
  hq.eachCell((c) => { c.font = { bold: true, color: { argb: INK } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } } })
  const curve = equityCurve(trades, opts.startBalance, opts.cashflows)
  for (let i = 0; i < curve.length; i++) {
    const pt = curve[i]
    const delta = i === 0 ? 0 : Math.round((pt.balance - curve[i - 1].balance) * 100) / 100
    const row = eq.addRow({ d: pt.label, e: i === 0 ? 'Start' : 'Trade / flow', p: i === 0 ? '' : delta, b: pt.balance })
    if (i > 0) row.getCell('p').font = { color: { argb: delta > 0 ? GREEN : delta < 0 ? RED : 'FF666666' } }
  }

  const buf = await wb.xlsx.writeBuffer()
  const filename = `edgefolio-report-${new Date().toISOString().slice(0, 10)}.xlsx`
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  if (isNativePlatform()) {
    // Android WebView can't download blob URLs — write to the app cache and
    // open the system share sheet (Sheets, Drive, WhatsApp, email…).
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    let b64 = ''
    const bytes = new Uint8Array(buf as ArrayBuffer)
    for (let i = 0; i < bytes.length; i += 0x8000) {
      b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    const res = await Filesystem.writeFile({
      path: filename,
      data: btoa(b64),
      directory: Directory.Cache,
    })
    await Share.share({ title: 'Edgefolio report', text: 'My trading report (Excel)', url: res.uri, dialogTitle: 'Share report' })
  } else {
    const url = URL.createObjectURL(new Blob([buf], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}
