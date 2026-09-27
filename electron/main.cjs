const { app, BrowserWindow, Menu, shell, session } = require('electron')
const path = require('path')

// The renderer loads from file:// in the packaged app, so cross-origin fetches
// to data APIs that don't send CORS headers (Yahoo Finance candles, the
// ForexFactory calendar) would be blocked. Inject a permissive CORS header on
// responses from those known hosts so the bias engine & calendar work offline-
// installed too. Scoped to specific hosts; webSecurity stays enabled.
function enableApiCors() {
  const filter = {
    urls: [
      'https://query1.finance.yahoo.com/*',
      'https://query2.finance.yahoo.com/*',
      'https://*.faireconomy.media/*',
      'https://api.gold-api.com/*',
      'https://api.frankfurter.app/*',
    ],
  }
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    responseHeaders['Access-Control-Allow-Origin'] = ['*']
    callback({ responseHeaders })
  })
}

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    title: 'Edgefolio',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  Menu.setApplicationMenu(null)

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Open external links in the OS browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
}

app.whenReady().then(() => {
  enableApiCors()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
