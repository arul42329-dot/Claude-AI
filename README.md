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
- **Dashboard** — headline stats + equity curve + recent trades.
- **Backup & restore** — export/import all data as JSON. Load sample trades to explore. Clear all data.
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
   - **Edgefolio-Windows** → `Edgefolio-Setup-1.1.2.exe` (installer) and a portable `.exe`

### Option B — Publish a versioned Release
Push a tag and the same build will also create a **GitHub Release** with the APK and EXE attached:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Find the files under the repo's **Releases** page.

### Installing
- **Android:** copy `Edgefolio.apk` to your phone and open it. Allow “install from unknown sources” when prompted. *(This is a debug‑signed build for personal use — perfect for your own device.)*
- **Windows:** run `Edgefolio-Setup-1.1.2.exe` to install, or use the portable `.exe` with no install. Windows SmartScreen may warn because the build isn't code‑signed — choose **More info → Run anyway**.

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
