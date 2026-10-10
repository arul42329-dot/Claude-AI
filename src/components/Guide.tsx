import { Modal } from './Modal'

const GUIDE_KEY = 'edgefolio-guide-seen'

export function hasSeenGuide(): boolean {
  try { return localStorage.getItem(GUIDE_KEY) === '1' } catch { return true }
}

export function markGuideSeen(): void {
  try { localStorage.setItem(GUIDE_KEY, '1') } catch { /* ignore */ }
}

const STEPS: { icon: string; title: string; text: string }[] = [
  { icon: '🇮🇳', title: 'Two journals', text: 'The top bar switches India ⚡ and Forex — trades, accounts and goals are kept completely separate.' },
  { icon: '📝', title: 'Log a trade', text: 'Trades → ＋ New trade. Enter entry, exit and lots — P/L is calculated automatically (brokerage comes from Settings → Lot sizes & brokerage).' },
  { icon: '🧾', title: 'Day tax', text: 'Trades → 🧾 Day tax. Enter the whole day\'s taxes once — it\'s split across that day\'s trades automatically.' },
  { icon: '🧭', title: 'Markets', text: 'Tap 🧭 Pre-market check for VIX, GIFT Nifty, USD/INR, US indices and commodities. Tiles show the 15-minute bias — tap one for the full panel with S/R and the daily trade call.' },
  { icon: '📈', title: 'Live prices', text: 'Settings → Angel One · live prices. Link your Angel One account (free SmartAPI key) for live tick prices.' },
  { icon: '🔔', title: 'Alerts', text: 'Settings → Alerts — big news, session opens and index 15m trend flips, right on your phone.' },
  { icon: '📊', title: 'Analytics & reports', text: 'Full stats, calendar and insights — plus the 📊 Excel report button that builds a complete report workbook.' },
  { icon: '☁️', title: 'Backup', text: 'Settings → Google Drive backup keeps your journal — and your Angel One link — safe.' },
]

export function Guide({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="How to use Edgefolio"
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Got it</button>}
    >
      <div className="guide-list">
        {STEPS.map((s) => (
          <div key={s.title} className="guide-step">
            <span className="guide-ic">{s.icon}</span>
            <div>
              <div className="guide-t">{s.title}</div>
              <div className="guide-x">{s.text}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
