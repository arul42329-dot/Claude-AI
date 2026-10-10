// Saving a generated file (CSV / Excel report) for the user.
//
// Desktop / Electron: a classic blob download.
//
// Android: the WebView cannot download blob URLs at all, so the file is
// written into the app's cache with the Filesystem plugin and handed to the
// system share sheet through the Share plugin — `files: [uri]` is the
// documented option for local files (WhatsApp, Gmail, Drive, Files…).
// If that chain fails for any reason we retry with the WebView's own Web
// Share API, and only then surface the error — the user always sees either
// a share sheet or a message, never a silent no-op.

import { isNativePlatform } from './candles'

export type SaveOutcome = 'shared' | 'downloaded' | 'canceled'

function isCancel(e: any): boolean {
  return /cancel|abort|dismiss/i.test(String(e?.message ?? e))
}

export async function saveFileToUser(
  filename: string,
  mime: string,
  data: string | Uint8Array | ArrayBuffer,
  opts: { title: string; dialogTitle?: string },
): Promise<SaveOutcome> {
  // ---- desktop / browser: direct download ----
  if (!isNativePlatform()) {
    const blob = new Blob([data as BlobPart], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return 'downloaded'
  }

  // ---- Android / native: cache file + system share sheet ----
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')

  let uri: string
  if (typeof data === 'string') {
    const res = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    uri = res.uri
  } else {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    let b64 = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    const res = await Filesystem.writeFile({ path: filename, data: btoa(b64), directory: Directory.Cache })
    uri = res.uri
  }

  // 1) Capacitor Share plugin — files[] carries the attachment as a proper
  //    content:// URI via the app's FileProvider.
  try {
    const { Share } = await import('@capacitor/share')
    await Share.share({
      title: opts.title,
      dialogTitle: opts.dialogTitle ?? opts.title,
      files: [uri],
    })
    return 'shared'
  } catch (e: any) {
    if (isCancel(e)) return 'canceled' // user closed the sheet — not an error
    // 2) Fallback: the WebView's Web Share API with a real File object.
    try {
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData & { files?: File[] }) => boolean
        share?: (d: ShareData & { files?: File[] }) => Promise<void>
      }
      const file = new File([data as BlobPart], filename, { type: mime })
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: opts.title })
        return 'shared'
      }
    } catch (e2: any) {
      if (isCancel(e2)) return 'canceled'
    }
    throw e // surface the original plugin error to the caller's toast
  }
}
