// Big "comparison" hero tile shown at the top of a market tab: DXY for forex,
// India VIX for the India tab. Clickable to open the full bias breakdown.

type Bias = 'Bullish' | 'Bearish' | 'Neutral'

function fmtPrice(n: number, d: number, locale = 'en-US') {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
}
function fmtChg(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

export function ComparisonTile({
  label, sub, price, changePct, bias, decimals, locale, biasTitle, accent, onOpen,
}: {
  label: string
  sub?: string
  price: number
  changePct: number
  bias?: Bias
  decimals: number
  locale?: string
  biasTitle?: string
  accent?: 'usd' | 'vix'
  onOpen?: () => void
}) {
  const up = changePct >= 0
  return (
    <div
      className={'cmp-tile' + (accent ? ' ' + accent : '') + (onOpen ? ' clickable' : '')}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => { if (onOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }}
    >
      <div className="cmp-head">
        <span className="cmp-label">{label}</span>
        {sub && <span className="cmp-sub">{sub}</span>}
        {onOpen && <span className="cmp-chev" aria-hidden="true">›</span>}
      </div>
      <div className="cmp-price">{fmtPrice(price, decimals, locale)}</div>
      <div className="cmp-foot">
        <span className={'pill ' + (up ? 'up' : 'down')}>{fmtChg(changePct)}</span>
        {bias && (
          <span className={'bias ' + (bias === 'Bullish' ? 'bull' : bias === 'Bearish' ? 'bear' : 'neu')} title={biasTitle}>
            <span className="bdot" />{bias}
          </span>
        )}
      </div>
    </div>
  )
}
