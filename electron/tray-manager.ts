import { Tray, Menu, BrowserWindow, app, nativeImage, MenuItemConstructorOptions } from 'electron'
import path from 'path'

/**
 * System tray manager for background operation.
 *
 * Features:
 * - Minimize to tray when window is closed
 * - Tray icon with recording status indicator
 * - Context menu: show window, start/stop recording, quit
 * - Double-click tray icon to restore window
 */

let tray: Tray | null = null
let forceQuit = false
let isRecording = false
let storedCallbacks: TrayCallbacks | null = null
let storedMainWindow: BrowserWindow | null = null

function getTrayIconPath(recording: boolean): string {
  const iconName = recording ? 'tray-recording.png' : 'tray-icon.png'

  // In development
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(__dirname, '../../assets', iconName)
  }
  // In production build
  return path.join(__dirname, '../../assets', iconName)
}

function createTrayIcon(recording: boolean): Electron.NativeImage {
  try {
    const iconPath = getTrayIconPath(recording)
    return nativeImage.createFromPath(iconPath)
  } catch {
    // Fallback: create a simple 16x16 icon programmatically
    // Use a colored square as minimal fallback
    return nativeImage.createEmpty()
  }
}

export interface TrayCallbacks {
  onShowWindow: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onQuit: () => void
}

/**
 * Create the system tray with context menu.
 */
function buildTrayMenu(): MenuItemConstructorOptions[] {
  return [
    {
      label: '显示主窗口',
      click: () => {
        if (storedMainWindow) {
          storedMainWindow.show()
          storedMainWindow.focus()
        }
        storedCallbacks?.onShowWindow()
      },
    },
    { type: 'separator' },
    {
      label: isRecording ? '■ 停止录音' : '● 开始录音',
      click: () => {
        if (isRecording) {
          storedCallbacks?.onStopRecording()
        } else {
          storedCallbacks?.onStartRecording()
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        forceQuit = true
        storedCallbacks?.onQuit()
        app.quit()
      },
    },
  ]
}

export function createTray(mainWindow: BrowserWindow, callbacks: TrayCallbacks): Tray {
  if (tray) {
    tray.destroy()
  }

  storedCallbacks = callbacks
  storedMainWindow = mainWindow

  const icon = createTrayIcon(false)
  tray = new Tray(icon)
  tray.setToolTip('MeetLog Assistant - 本地会议助手')
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenu()))

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}

/**
 * Update tray menu to reflect current recording state.
 */
export function updateTrayRecordingState(recording: boolean): void {
  isRecording = recording

  if (tray) {
    tray.setToolTip(
      recording
        ? 'MeetLog Assistant - 正在录音中...'
        : 'MeetLog Assistant - 本地会议助手'
    )

    // Update icon
    const icon = createTrayIcon(recording)
    tray.setImage(icon)

    // Rebuild context menu to update recording label
    tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenu()))
  }
}

/**
 * Check if the app should actually quit (vs hide to tray).
 */
export function shouldForceQuit(): boolean {
  return forceQuit
}

/**
 * Reset force quit flag (called after app decides to hide instead of quit).
 */
export function resetForceQuit(): void {
  forceQuit = false
}

/**
 * Set force quit flag (called from tray quit menu).
 */
export function setForceQuit(): void {
  forceQuit = true
}

/**
 * Destroy the tray.
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
  storedCallbacks = null
  storedMainWindow = null
}

/**
 * Check if tray exists.
 */
export function hasTray(): boolean {
  return tray !== null
}
