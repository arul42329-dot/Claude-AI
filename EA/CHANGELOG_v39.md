# v39 — "Signal Accuracy" Update

**EA:** TITAN EDGE / RAGE SURGE / PHOENIX FLIP (Triple Mode) HFT
**Files in this folder:**

| File | Purpose |
|---|---|
| `TITAN_TRIPLE_MODE_v39.mq5` | The updated EA (bug fixes + accuracy layer). **Use this.** |
| `TITAN_TRIPLE_MODE_v38_original.mq5` | Your code exactly as shared — rollback + A/B baseline |
| `CHANGELOG_v39.md` | This document |

---

## 1. Bugs fixed first (these change behaviour — all of them protect exits)

### 1.1 SELL positions with no stop loss were NEVER trailed — critical
In `TrialStop()`, the sell-side modify condition required:

```mql5
if((sl < posinfo.StopLoss()) && ...
```

For a SELL with `StopLoss() == 0` that comparison is `positive_number < 0` → **always false**. So every SELL leg that had no initial SL could never receive a trailing stop.

**Why it matters:** in Bucket & Step modes, `EnableGridStopLoss` defaults to **false**, so grid legs open with SL = 0. If you turned on `EnableGridTrailingSL`, BUY legs trailed fine and SELL legs silently never trailed. Asymmetric exits = giving back profit on half your basket.

**Fix:** `(posinfo.StopLoss() == 0 || sl < posinfo.StopLoss())`.

### 1.2 "Trail Start" (MaxTrailing) never actually applied in Default_Trail mode
`TrailingStopIncrement` was assigned **once** in `OnInit()` from `TrailingStopThreshold` — a global that is never updated anywhere. It stayed `0` forever, so the TrailType 0 trigger level was effectively `entry + commission` instead of `entry + MaxTrailing`. Your input comment literally says `MaxTrailing = 4; // Trail Start` — that intent was never reaching the code.

**Fix:** `TrailingStopIncrement = AverageSpread * MaxTrailing;` recomputed every tick alongside all the other derived trailing values.

### 1.3 The `Slippage` input was never applied
The input existed but `trade.SetDeviationInPoints()` was never called, so every market order used CTrade's default deviation. Now applied in `OnInit()`.
*(Tip: 1 point is very tight for market orders — consider 10–20 on live accounts to avoid rejections/requotes.)*

### 1.4 Crash guard on MA / Tenkan-sen trail types
`CopyBuffer(...)` results were unchecked before reading `indbuffer[0]`. If the indicator handle had no data yet (EA just attached, history still loading), that's an **array-out-of-range runtime error that halts the EA**. All four call sites (BUY/SELL × MA/Tenkan) are now guarded.

### 1.5 Handle hygiene
`handleTrailMA`, `handleIchimoku`, `handleTrendMA` are now initialised to `INVALID_HANDLE` and all nine handles are released in `OnDeinit()`.

---

## 2. New: SIGNAL ACCURACY FILTERS (one input group, 18 inputs)

All under `=== SIGNAL ACCURACY FILTERS (v39) ===`. Design rules baked into every filter:

1. **Closed-bar data only (shift 1)** — no repainting, no intra-bar flip-flop, backtest = live behaviour.
2. **Fail open** — filter off, handle missing, or feed empty ⇒ trade is *allowed*. A filter can never silently freeze trading.
3. **New entries only** — open positions, basket targets, loss guards, profit locks and trailing always keep running.

### Where each filter applies

| Filter | SL Mode (TITAN EDGE) | Bucket Mode (RAGE SURGE) | Step Mode (PHOENIX FLIP) |
|---|---|---|---|
| **Trend Align** (M15 EMA by default) | BUY/SELL stop **placement** + pulls stale counter-trend pendings | straddle: no (neutral by design); adds: already covered by your 4-vote gate | **first entry** must agree |
| **RSI Exhaustion** (14, 78/22) | no — breakout stop orders *are* the momentum confirmation | **adds** | **adds** |
| **ATR Band** (M1 ATR) | first entries | first entries + adds | first entries + adds |
| **News Blackout** (±5/3 min) | first entries + pulls pendings | first entries + adds | first entries + adds |
| **Candle Confirm** | no — stop order is the confirmation | no — straddle is two-sided | **first entry** |
| **Session Tail** (5 min) | first entries + pulls pendings | first entries + adds | first entries + adds |

### Rationale (why these six)

- **Trend Align** — the single biggest accuracy lever for direction. SL Mode previously straddled stop orders both ways regardless of the higher-TF trend; now it only arms the side the M15 EMA(100) agrees with, and pulls the stale opposite pending when the trend flips. Step Mode's fixed-direction first entry now waits for agreement instead of firing blind.
- **RSI Exhaustion** — your grid adds are *trend-chasing* (v35 gate). The classic failure of trend-chasing grids is adding at the extreme. Blocking BUY adds at RSI ≥ 78 and SELL adds at RSI ≤ 22 removes "buy the local top" adds while barely touching genuine trend adds (RSI spends most of a real trend between 40–80).
- **ATR Band** — the momentum score measures *activity*, not range. A busy-but-tight tape scores well but the spread eats it; a violent spike also scores well but fills/stops are unreliable. The band blocks both tails. **Defaults 0/0 = inactive until you set real values** (see tuning below).
- **News Blackout** — your news system was display-only. Now the same calendar feed + importance filter actually pauses *new* entries around Medium/High events for the symbol's currencies + USD. Starts/ends are logged in the Experts tab (`[AccFilter] News blackout START/END`). **Live/demo only — the Strategy Tester has no calendar feed, so this filter is inert in backtests.**
- **Candle Confirm** — Step first entry could fire mid-bar on any tick; now the last *closed* candle must agree with the direction (doji = no confirmation).
- **Session Tail** — entries opened minutes before your session ends are the ones `EnablePostSessionTimeout` later force-closes at whatever loss they happen to carry. They are blocked instead.

---

## 3. Tuning guide

### ATR band — measure, don't guess (defaults are INACTIVE)
1. Open your symbol on **M1**, attach the standard **ATR(14)** indicator.
2. During your normal trading session, note the typical low and typical high of the ATR (Data Window), in **points**.
3. Set `MinATRPoints` ≈ the quiet-side value you never want to trade below, `MaxATRPoints` ≈ the chaos level you never want to trade above.

Rough starting points (verify on YOUR broker's feed — point values differ):

| Symbol | MinATRPoints | MaxATRPoints |
|---|---|---|
| EURUSD / GBPUSD (5-digit) | 10–15 | 120–200 |
| XAUUSD (point = 0.01) | 40–80 | 600–1000 |
| NIFTY/BANKNIFY indices | measure | measure |

### Trend Align
- Running the chart on M1 → keep `PERIOD_M15` / EMA 100. Running M5 → try `PERIOD_H1`.
- Too restrictive (few trades)? Lower the period to 50 or move the TF down one step.

### RSI
- 78/22 only blocks true extremes. Tighten to 70/30 for stricter add filtering.

### News Blackout
- 5 min before / 3 min after is the sensible minimum for HFT-style scalps. For high-impact only, set `NewsImportanceFilter = News_HighOnly`.
- Requires the terminal calendar to work (View → Toolbox → Calendar must show events).

### Also strongly recommended (existing inputs, unchanged by me)
- **`MaxSpread = 5555` is effectively "off".** Set a real cap ≈ 3–5× your broker's average spread (e.g. 30–60 points on 5-digit majors). The spread *penalty* in the momentum score only discounts the score; a hard cap protects the raw Bucket/Step market orders.
- `EnableGridStopLoss = true` for Bucket/Step modes — per-leg broker-side stop as a hard floor under the reactive basket guard (this input existed since v32; with fix 1.1 the trailing now also works correctly on those legs).

---

## 4. How to test properly (please A/B, don't just run it)

1. **Baseline:** backtest `TITAN_TRIPLE_MODE_v38_original.mq5` — same symbol/TF/period/settings.
2. **Fixes only:** backtest v39 with `EnableAccuracyFilters = false`. Difference vs step 1 = the pure effect of the trailing/bug fixes (expect: SELL legs actually trail, fewer round-trips in Step/Bucket).
3. **Full layer:** v39 with filters ON. Difference vs step 2 = the pure effect of the accuracy layer.
4. **One at a time:** if step 3 disappoints, toggle individual filters off to find which one helps or hurts *your* symbol. Different modes/symbols benefit from different subsets.
5. **News blackout cannot be validated in the tester** (no calendar feed) — check it on demo: you should see `[AccFilter] News blackout START/END` lines in the Experts tab around scheduled Medium/High events.
6. Walk-forward: optimise on one window, verify on the next. A filter set that only helps in-sample is curve fitting.

---

## 5. Honest limitations

- **I could not compile here** (no MetaEditor on this Linux sandbox). I ran thorough static checks — brace/paren balance, every new function/input/global defined exactly once, every call site verified, no non-ASCII characters — but **compile it in MetaEditor (F7) before running**. If anything trips, send me the exact compiler line and I'll fix it.
- **No backtest was run here.** These filters remove known-bad trade contexts (counter-trend first entries, dead/spiking tape, news windows, exhausted adds, session tails); whether that improves *your* bottom line on *your* symbol must be validated with the A/B process above.
- **Grid risk is unchanged.** `BucketScaleLotMultiplier` / `StepScaleLotMultiplier` still compound lot size on adds. The v36 caps and basket loss guard are reactive; a per-trade `GridStopLoss` is the only broker-side floor.
- Minor pre-existing quirks I left alone (harmless, noted for awareness): `EAModeFlag` is always 0 (legacy no-op), the double `IsTradingSession()` call, `UpdateDailyProfit()` re-enables trading at midnight even in Manual Button mode, and the commission-per-pip estimate relies on finding a past closed deal in history.

---

## 6. Rollback

- `EnableAccuracyFilters = false` → exact v38 entry logic (bug fixes 1.1–1.5 remain, which you want).
- Full old behaviour, byte-for-byte → use `TITAN_TRIPLE_MODE_v38_original.mq5`.
