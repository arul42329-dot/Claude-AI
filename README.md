# 📈 Edgefolio — Forex Trade Entry Journal

A private, offline **Forex trade journal** that runs on **Android** and **Windows** from a single codebase.
Log every trade, build your **own checklists**, and analyse your performance **daily, weekly and monthly**.

> Your data is stored locally on your device (IndexedDB). Nothing is uploaded anywhere. Export/import backups whenever you like.

---

## ✨ Features

- **Trade logging** — pair/instrument, buy/sell, session, strategy, entry/exit, stop loss, take profit, lot size, risk %, auto‑calculated **Risk:Reward**, outcome, P/L, pips, execution rating, emotion, tags, notes and an optional chart **screenshot**.
- **Build‑your‑own checklists** — create unlimited checklist templates (Pre‑Trade, Risk Management, Psychology…) right inside the app, add/reorder items, then attach them to any trade and tick them off. A live **compliance %** is tracked per trade.
- **Analytics — daily / weekly / monthly** — switch the period with one tap:
  - Net P/L, win rate, profit factor, expectancy, total pips, avg R:R, best/worst trade, win & loss streaks.
  - **Equity curve** chart and a **period P/L** bar chart.
  - Breakdown **by pair, by session, by strategy**.
  - **Checklist discipline vs. results** — see whether you win more when you follow your checklists.
- **Live Markets tab** — all major forex pairs plus **gold (XAU/USD)** front‑and‑centre, each card showing the live price, day change and a **Bullish/Bearish bias**. Data is pulled from free, keyless providers (gold‑api.com for metals & crypto, frankfurter.app / ECB for FX) and cached for offline viewing.
- **Rule‑based daily bias** — the Bullish/Bearish/Neutral label is computed transparently (no black‑box ML) from ~2 years of daily OHLC candles: five votes from **EMA20/EMA50**, **price vs EMA50**, **market structure** (swing highs/lows), **MACD histogram** and **Wilder RSI(14)** are summed into a −5…+5 score (≥ +2 Bullish, ≤ −2 Bearish, else Neutral). Hover a bias badge to see the full vote breakdown. Candles come from Yahoo Finance; if unavailable it falls back to the day‑change bias.
- **Bias analysis panel** — tap any Markets pair (or the gold hero) to open a breakdown: the score meter, all five signal votes, the raw indicators (EMA20/50, RSI, MACD hist, ATR, structure), nearest **support & resistance** levels, a **reversal‑wick watch** flag, and a **trade call** (entry, 1.5× ATR stop, and 1.5×/3× ATR targets) whenever the daily bias is directional — otherwise "No trade — wait."
- **Multiple accounts** — journal several trading accounts separately, switch between them, and see per‑account stats or a combined view.
- **Google Drive backup (Android)** — connect once with your own Google Client ID and Edgefolio auto‑backs‑up your whole journal to your Drive once a day when you open the app, always replacing the same file. Uses the OAuth device flow with the `drive.file` scope (the app only ever touches the single backup file it creates).
- **P/L calendar heatmap** — a month grid where each day is coloured by net profit, with monthly totals and green/red day counts.
- **Position-size / risk calculator** — enter balance, risk % and stop in pips to get the exact lot size (on the Pre-Trade page).
- **India mode** — a Forex ⇄ India toggle atop the Markets tab switches to major Indian indices (**NIFTY 50, BANK NIFTY, FIN NIFTY, NIFTY MIDCAP 50, SENSEX**), each with a live index price, the same transparent rule‑based daily bias, an NSE market‑open/closed status pill (IST), the economic calendar, and Indian market headlines (Economic Times RSS). It is kept **completely separate** from the forex dashboard, journal and stats — nothing here is counted into your trade logs.
- **Sessions & killzone clock** — live Sydney/Tokyo/London/New York session status plus ICT killzone windows (on the Markets tab).
- **Economic calendar** — upcoming high-impact news & releases (currency, time in your timezone, forecast vs previous) from a free ForexFactory feed, with impact/currency filters (on the Markets tab).
- **App lock (PIN)** — optional 4–8 digit PIN required on open to keep your journal private.
- **Goals & targets** — set a monthly profit goal and max-loss limit; progress bars show on the Dashboard.
- **Daily reflection journal** — free-form daily notes with a mood rating (Dashboard card).
- **Accent themes** — recolour the app (gold, azure, emerald, violet, rose, teal).
- **CSV export** — export all trades to a spreadsheet-friendly CSV.
- **Dashboard** — headline stats + equity curve + recent trades.
- **Backup & restore** — export/import all data as JSON or export trades to CSV. Load sample trades to explore. Clearing your data keeps the default checklists and accounts.
- **Modern dark UI**, responsive — desktop sidebar + mobile bottom navigation.

---

## 🧱 Tech stack

| Layer | Tech |
|------|------|
| App | React 18 + TypeScript + Vite |
| Charts | Recharts |
| Storage | Dexie (IndexedDB) — fully offline |
| Windows app | Electron + electron-builder (NSIS installer + portable) |
| Android app | Capacitor |
| Binaries | Built automatically via GitHub Actions |

---

## 🚀 Run it in your browser (development)

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`).

Production preview:

```bash
npm run build
npm run preview
```

---

## 📦 Getting the installable apps (APK & EXE)

Building a real Android `.apk` needs the Android SDK, and a Windows `.exe` needs a Windows machine — so both are built for you **automatically in the cloud** by GitHub Actions. You don't need to install anything.

### Option A — Download from the Actions tab (quickest)
1. Push this repo to GitHub (already connected).
2. Go to the **Actions** tab → **“Build apps (Android APK + Windows installer)”** → **Run workflow**.
3. When it finishes (~5–10 min), open the run and download the artifacts:
   - **Edgefolio-Android** → `Edgefolio.apk`
   - **Edgefolio-Windows** → `Edgefolio-Setup-1.3.11.exe` (installer) and a portable `.exe`

### Option B — Publish a versioned Release
Push a tag and the same build will also create a **GitHub Release** with the APK and EXE attached:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Find the files under the repo's **Releases** page.

### Installing
- **Android:** copy `Edgefolio.apk` to your phone and open it. Allow “install from unknown sources” when prompted. *(This is a debug‑signed build for personal use — perfect for your own device.)*
- **Windows:** run `Edgefolio-Setup-1.3.11.exe` to install, or use the portable `.exe` with no install. Windows SmartScreen may warn because the build isn't code‑signed — choose **More info → Run anyway**.

---

## 🛠️ Building binaries locally (optional, advanced)

**Windows** (on a Windows machine):
```bash
npm install
npm run build
npx electron-builder --win
# → output in ./release
```

**Android** (needs Android SDK + JDK 17):
```bash
npm install
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📁 Project structure

```
src/
  pages/            Dashboard, Trades, Analytics, Checklists, Settings
  components/        TradeForm, Modal, StatCard, Toast
  db.ts             Dexie database + seed + backup/restore
  stats.ts          All analytics (stats, period grouping, equity curve)
  types.ts          Domain types
  util.ts           Live-query hook + formatters
electron/           Electron main process (Windows app)
build/              App icons (icon.ico / icon.png)
.github/workflows/  CI that builds the APK + Windows installer
capacitor.config.ts Android config
electron-builder.yml Windows packaging config
```

---

## 🔒 Privacy

Everything stays on your device. There is no account, no server, no tracking. Use **Settings → Export backup** to keep a copy of your journal.
