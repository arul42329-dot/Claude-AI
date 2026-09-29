// Big "comparison" hero tile shown at the top of a market tab: DXY for forex,
// India VIX for the India tab. Always rendered (with a waiting state) so the tile
// is visibly present even before live data arrives or if a network blocks the feed.

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
  price?: number
  changePct?: number
  bias?: Bias
  decimals: number
  locale?: string
  biasTitle?: string
  accent?: 'usd' | 'vix'
  onOpen?: () => void
}) {
  const hasData = Number.isFinite(price as number)
  const up = (changePct ?? 0) >= 0
  const clickable = hasData && !!onOpen
  return (
    <div
      className={'cmp-tile' + (accent ? ' ' + accent : '') + (clickable ? ' clickable' : '')}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen!() } }}
    >
      <div className="cmp-head">
        <span className="cmp-label">{label}</span>
        {sub && <span className="cmp-sub">{sub}</span>}
        {clickable && <span className="cmp-chev" aria-hidden="true">›</span>}
      </div>
      {hasData ? (
        <>
          <div className="cmp-price">{fmtPrice(price as number, decimals, locale)}</div>
          <div className="cmp-foot">
            <span className={'pill ' + (up ? 'up' : 'down')}>{fmtChg(changePct ?? 0)}</span>
            {bias && (
              <span className={'bias ' + (bias === 'Bullish' ? 'bull' : bias === 'Bearish' ? 'bear' : 'neu')} title={biasTitle}>
                <span className="bdot" />{bias}
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="cmp-price cmp-pending">—</div>
          <div className="cmp-foot"><span className="cmp-wait">Fetching live data…</span></div>
        </>
      )}
    </div>
  )
}
