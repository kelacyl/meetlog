/**
 * Download manager – handles in-app model downloads with progress events.
 * Supports GGUF model files and tool binary downloads (zip archives).
 */
import { BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { execFile } from 'child_process'

export interface DownloadProgress {
  id: string
  filename: string
  url: string
  status: 'idle' | 'downloading' | 'completed' | 'error'
  progress: number           // 0–100
  downloadedBytes: number
  totalBytes: number
  speed: string              // human-readable, e.g. "2.3 MB/s"
  eta: string                // human-readable, e.g. "5m 30s"
  error?: string
}

const activeDownloads = new Map<string, DownloadProgress>()

/** Deliver a progress update to all renderer windows. */
function broadcastProgress(progress: DownloadProgress) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('download-progress', progress)
    }
  }
}

/**
 * Start downloading a file. Sends progress events to renderers and
 * resolves with the local file path on success.
 */
export async function startDownload(
  filename: string,
  url: string,
  destDir: string,
): Promise<string> {
  const destPath = path.join(destDir, filename)
  const tmpPath = destPath + '.tmp'

  // Already completed?
  if (fs.existsSync(destPath)) {
    const progress: DownloadProgress = {
      id: filename,
      filename,
      url,
      status: 'completed',
      progress: 100,
      downloadedBytes: fs.statSync(destPath).size,
      totalBytes: fs.statSync(destPath).size,
      speed: '0 B/s',
      eta: '已完成',
    }
    broadcastProgress(progress)
    return destPath
  }

  // Clean up partial download
  if (fs.existsSync(tmpPath)) {
    fs.unlinkSync(tmpPath)
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  return new Promise<string>((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const req = proto.get(url, { timeout: 30000 }, (res) => {
      // Handle redirects (301, 302, 303, 307, 308)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        const redirectUrl = res.headers.location
        if (redirectUrl) {
          startDownload(filename, redirectUrl, destDir).then(resolve).catch(reject)
          return
        }
        reject(new Error(`HTTP ${res.statusCode}: Redirect without location header`))
        return
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
      let downloadedBytes = 0
      const startTime = Date.now()

      const progress: DownloadProgress = {
        id: filename,
        filename,
        url,
        status: 'downloading',
        progress: 0,
        downloadedBytes: 0,
        totalBytes,
        speed: '0 B/s',
        eta: '计算中...',
      }
      activeDownloads.set(filename, progress)

      const writeStream = fs.createWriteStream(tmpPath)

      res.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length
        const elapsed = (Date.now() - startTime) / 1000
        const speed = downloadedBytes / elapsed

        progress.downloadedBytes = downloadedBytes
        progress.progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
        progress.speed = formatSpeed(speed)
        progress.eta = totalBytes > 0
          ? formatDuration((totalBytes - downloadedBytes) / speed)
          : '计算中...'

        broadcastProgress({ ...progress })
      })

      res.pipe(writeStream)

      writeStream.on('finish', () => {
        // Atomic rename
        fs.renameSync(tmpPath, destPath)
        progress.status = 'completed'
        progress.progress = 100
        progress.downloadedBytes = fs.statSync(destPath).size
        progress.totalBytes = progress.downloadedBytes
        progress.speed = '0 B/s'
        progress.eta = '已完成'
        broadcastProgress({ ...progress })
        activeDownloads.delete(filename)
        resolve(destPath)
      })

      writeStream.on('error', (err) => {
        activeDownloads.delete(filename)
        reject(err)
      })
    })

    req.on('error', (err) => {
      activeDownloads.delete(filename)
      reject(err)
    })

    req.on('timeout', () => {
      req.destroy()
      activeDownloads.delete(filename)
      reject(new Error('下载超时，请检查网络连接'))
    })
  })
}

/** Get the current state of a download. */
export function getDownloadProgress(filename: string): DownloadProgress | null {
  return activeDownloads.get(filename) || null
}

// ─── Zip download + extract (for tool binaries) ──────────────────

/**
 * Download a zip archive and extract a specific file from it.
 * Uses PowerShell Expand-Archive on Windows (built-in, no extra deps).
 *
 * @param toolId   – short identifier for progress events
 * @param toolName – display name
 * @param url      – download URL for the zip archive
 * @param findFilename – filename to find within the extracted archive (e.g. "ffmpeg.exe")
 * @param destDir  – directory to place the final extracted file
 */
export async function downloadAndExtractTool(
  toolId: string,
  toolName: string,
  url: string,
  findFilename: string,
  destDir: string,
): Promise<string> {
  const destPath = path.join(destDir, findFilename)

  // Already installed?
  if (fs.existsSync(destPath)) {
    const progress: DownloadProgress = {
      id: toolId,
      filename: findFilename,
      url,
      status: 'completed',
      progress: 100,
      downloadedBytes: fs.statSync(destPath).size,
      totalBytes: fs.statSync(destPath).size,
      speed: '0 B/s',
      eta: '已完成',
    }
    broadcastProgress(progress)
    return destPath
  }

  // Step 1: Download the zip
  const zipFilename = `${toolId}.zip`
  const zipPath = await startDownload(zipFilename, url, destDir)

  // Step 2: Extract to a temp directory
  const extractDir = path.join(destDir, `${toolId}_extract`)
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
  fs.mkdirSync(extractDir, { recursive: true })

  await extractZip(zipPath, extractDir)

  // Step 3: Find the target file recursively
  const foundPath = findFileRecursive(extractDir, findFilename)
  if (!foundPath) {
    // Cleanup
    try { fs.rmSync(extractDir, { recursive: true, force: true }) } catch {}
    try { fs.unlinkSync(zipPath) } catch {}
    throw new Error(
      `在 ${toolName} 压缩包中未找到 "${findFilename}"。\n` +
        `请手动下载并放置到: ${destDir}`
    )
  }

  // Step 4: Copy to destDir
  fs.copyFileSync(foundPath, destPath)

  // Step 5: Cleanup
  try { fs.rmSync(extractDir, { recursive: true, force: true }) } catch {}
  try { fs.unlinkSync(zipPath) } catch {}

  // Broadcast completion
  const finalProgress: DownloadProgress = {
    id: toolId,
    filename: findFilename,
    url,
    status: 'completed',
    progress: 100,
    downloadedBytes: fs.statSync(destPath).size,
    totalBytes: fs.statSync(destPath).size,
    speed: '0 B/s',
    eta: '已完成',
  }
  broadcastProgress(finalProgress)

  return destPath
}

/** Extract a zip file using PowerShell (Windows built-in). */
function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use PowerShell's Expand-Archive (available on Win 10+/Server 2016+)
    const cmd = `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
    execFile('powershell', ['-NoProfile', '-Command', cmd], { timeout: 120000 }, (err) => {
      if (err) {
        reject(new Error(`解压失败: ${err.message}`))
        return
      }
      resolve()
    })
  })
}

/** Recursively search for a file by name within a directory. */
function findFileRecursive(dir: string, filename: string): string | null {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile() && entry.name === filename) {
        return fullPath
      }
      if (entry.isDirectory()) {
        const found = findFileRecursive(fullPath, filename)
        if (found) return found
      }
    }
  } catch {
    // Permission errors, etc.
  }
  return null
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '即将完成'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m > 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
