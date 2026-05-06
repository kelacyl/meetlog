import { app, BrowserWindow, ipcMain, dialog, shell, desktopCapturer } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase, getMeetings, getMeeting, saveMeeting, updateMeeting, deleteMeeting, getConfigValue, setConfigValue } from './db'
import { getLicenseInfo, validateLicenseKey, incrementUsage, getMachineId } from './license'
import { getLocalModels, getRecommendedModels, generateSummary, getModelsDir, unloadModel } from './llm-service'
import { transcribeWithWhisperCpp, getRecommendedWhisperModels, isWhisperCppAvailable, getWhisperBinaryPath } from './whisper-cpp-service'
import { convertToWav, isFfmpegAvailable, getFfmpegPath } from './audio-converter'
import { TranscriberEngine } from './transcriber-engine'
import { createTray, updateTrayRecordingState, shouldForceQuit, destroyTray } from './tray-manager'
import { startDownload, getDownloadProgress, downloadAndExtractTool } from './download-manager'
import { MIRRORS, getActiveMirror, getModelAllUrls, TOOL_DEFS } from './mirror-config'

let mainWindow: BrowserWindow | null = null
let recorderWindow: BrowserWindow | null = null
let recordedChunks: Buffer[] = []
let isRecording = false
let isPaused = false
let transcriberEngine: TranscriberEngine | null = null

function getArchivePath(): string {
  const archivePath = getConfigValue('archive_path') || path.join(app.getPath('userData'), 'meetlog')
  if (!fs.existsSync(archivePath)) {
    fs.mkdirSync(archivePath, { recursive: true })
  }
  return archivePath
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, '../../dist-electron/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  // Close to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!shouldForceQuit()) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createRecorderWindow() {
  if (recorderWindow) return

  recorderWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../dist-electron/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    recorderWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/recorder.html`)
  } else {
    recorderWindow.loadFile(path.join(__dirname, '../../dist/recorder.html'))
  }

  recorderWindow.on('closed', () => {
    recorderWindow = null
  })
}

app.whenReady().then(() => {
  initDatabase()
  createMainWindow()
  createRecorderWindow()

  // Create system tray
  if (mainWindow) {
    createTray(mainWindow, {
      onShowWindow: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
      onStartRecording: () => {
        mainWindow?.webContents.send('tray-start-recording')
      },
      onStopRecording: () => {
        mainWindow?.webContents.send('tray-stop-recording')
      },
      onQuit: async () => {
        destroyTray()
        await unloadModel()
        closeDatabase()
      },
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
      createRecorderWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('before-quit', async () => {
  destroyTray()
  await unloadModel()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase()
    app.quit()
  }
})

// ─── IPC Handlers ────────────────────────────────────────────────

// Recording
ipcMain.handle('start-recording', async () => {
  const usage = incrementUsage()
  if (!usage.allowed) {
    return { success: false, error: '本月免费会议次数已用完，请购买序列码解锁。' }
  }

  if (!recorderWindow || recorderWindow.isDestroyed()) {
    createRecorderWindow()
  }

  recordedChunks = []
  isRecording = true
  isPaused = false

  // Initialize transcription engine — resolve voice model with fallback
  let modelName = getConfigValue('voice_model') || ''
  if (!modelName) {
    modelName = findFirstModel('.bin') || 'ggml-large-v3-turbo.bin'
  }
  transcriberEngine = new TranscriberEngine(30, 10)
  if (mainWindow) {
    transcriberEngine.start(mainWindow, modelName)
  }

  recorderWindow?.webContents.send('recorder-start')
  mainWindow?.webContents.send('recording-status', 'recording')

  // Update tray icon
  updateTrayRecordingState(true)

  return { success: true }
})

ipcMain.handle('stop-recording', async () => {
  if (!isRecording) return { success: false, error: 'Not recording' }

  recorderWindow?.webContents.send('recorder-stop')
  isRecording = false
  isPaused = false
  mainWindow?.webContents.send('recording-status', 'idle')
  updateTrayRecordingState(false)

  // Wait a bit for final chunks
  await new Promise(resolve => setTimeout(resolve, 1000))

  // Finalize transcription with the engine
  let fullTranscript = ''
  if (transcriberEngine) {
    fullTranscript = await transcriberEngine.stop()
  }

  if (recordedChunks.length === 0 && !fullTranscript) {
    transcriberEngine = null
    return { success: false, error: 'No audio recorded' }
  }

  const archivePath = getArchivePath()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const audioPath = path.join(archivePath, `meeting-${timestamp}.webm`)
  const buffer = Buffer.concat(recordedChunks)
  fs.writeFileSync(audioPath, buffer)

  transcriberEngine = null

  return { success: true, audioPath, transcript: fullTranscript }
})

ipcMain.handle('pause-recording', async () => {
  isPaused = true
  recorderWindow?.webContents.send('recorder-pause')
  mainWindow?.webContents.send('recording-status', 'paused')
})

ipcMain.handle('resume-recording', async () => {
  isPaused = false
  recorderWindow?.webContents.send('recorder-resume')
  mainWindow?.webContents.send('recording-status', 'recording')
})

ipcMain.on('recorder-chunk', (_, chunk: ArrayBuffer) => {
  if (isRecording && !isPaused) {
    const buffer = Buffer.from(chunk)
    recordedChunks.push(buffer)

    // Also feed to transcription engine for real-time processing
    if (transcriberEngine) {
      transcriberEngine.pushAudioChunk(chunk)
    }
  }
})

ipcMain.on('recorder-error', (_, message: string) => {
  console.error('Recorder error:', message)
  mainWindow?.webContents.send('recorder-error', message)
})

ipcMain.on('system-audio-status', (_, status: { available: boolean }) => {
  mainWindow?.webContents.send('system-audio-status', status)
})

// Meetings
ipcMain.handle('get-meetings', async () => {
  return getMeetings()
})

ipcMain.handle('get-meeting', async (_, id: number) => {
  return getMeeting(id) || null
})

ipcMain.handle('save-meeting', async (_, meeting: any) => {
  return saveMeeting(meeting)
})

ipcMain.handle('update-meeting', async (_, id: number, data: any) => {
  updateMeeting(id, data)
})

ipcMain.handle('delete-meeting', async (_, id: number) => {
  deleteMeeting(id)
})

// Config
/** Return the first file matching the given extension in the models directory. */
function findFirstModel(ext: string): string | null {
  const dir = getModelsDir()
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(ext))
  return files.length > 0 ? files[0] : null
}

ipcMain.handle('get-config', async () => {
  const archivePath = getConfigValue('archive_path') || path.join(app.getPath('userData'), 'meetlog')
  const licenseKey = getConfigValue('license_key') || ''

  // Resolve LLM model: saved config → first available .gguf → hardcoded default
  let llmModel = getConfigValue('llm_model') || ''
  if (!llmModel) {
    llmModel = findFirstModel('.gguf') || 'qwen2.5-7b-instruct-q4_k_m.gguf'
  }

  // Resolve voice model: saved config → first available whisper model → hardcoded default
  let voiceModel = getConfigValue('voice_model') || ''
  if (!voiceModel) {
    voiceModel = findFirstModel('.bin') || 'ggml-large-v3-turbo.bin'
  }

  return {
    archivePath,
    llmModel,
    voiceModel,
    meetingTemplate: getConfigValue('meeting_template') || '',
    licenseKey,
    isActivated: licenseKey ? validateLicenseKey(licenseKey) : false,
    minimizeToTray: getConfigValue('minimize_to_tray') !== 'false',
    chunkDuration: parseInt(getConfigValue('chunk_duration') || '30', 10),
    audioSource: getConfigValue('audio_source') || 'system+mic',
    modelMirror: getConfigValue('model_mirror') || 'hf-mirror',
  }
})

ipcMain.handle('set-config', async (_, config: any) => {
  if (config.archivePath !== undefined) setConfigValue('archive_path', config.archivePath)
  if (config.llmModel !== undefined) setConfigValue('llm_model', config.llmModel)
  if (config.voiceModel !== undefined) setConfigValue('voice_model', config.voiceModel)
  if (config.meetingTemplate !== undefined) setConfigValue('meeting_template', config.meetingTemplate)
  if (config.licenseKey !== undefined) setConfigValue('license_key', config.licenseKey)
  if (config.minimizeToTray !== undefined) setConfigValue('minimize_to_tray', String(config.minimizeToTray))
  if (config.chunkDuration !== undefined) setConfigValue('chunk_duration', String(config.chunkDuration))
  if (config.audioSource !== undefined) setConfigValue('audio_source', config.audioSource)
  if (config.modelMirror !== undefined) setConfigValue('model_mirror', config.modelMirror)
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  return result.filePaths[0]
})

// Desktop Capturer (for system audio capture)
ipcMain.handle('get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
    }))
  } catch (err: any) {
    console.error('desktopCapturer.getSources failed:', err.message)
    return []
  }
})

// LLM (local llama.cpp)
ipcMain.handle('get-local-models', async () => {
  return getLocalModels()
})

ipcMain.handle('get-recommended-models', async () => {
  return getRecommendedModels()
})

ipcMain.handle('get-models-dir', async () => {
  return getModelsDir()
})

ipcMain.handle('generate-summary', async (_, transcript: string, template: string, model: string) => {
  // If the specified model doesn't exist, fall back to any available .gguf
  let resolvedModel = model
  if (resolvedModel) {
    const modelPath = path.join(getModelsDir(), resolvedModel)
    if (!fs.existsSync(modelPath)) {
      const fallback = findFirstModel('.gguf')
      if (fallback) {
        console.log(`Model "${resolvedModel}" not found, falling back to "${fallback}"`)
        resolvedModel = fallback
        // Auto-save the fallback so the user doesn't hit this again
        setConfigValue('llm_model', fallback)
      }
    }
  }
  return generateSummary(transcript, template, resolvedModel)
})

// Whisper transcription (whisper.cpp GGUF)
ipcMain.handle('transcribe-audio', async (_, audioPath: string, model: string) => {
  // Fall back if the specified whisper model doesn't exist
  let resolvedModel = model
  if (resolvedModel) {
    const modelPath = path.join(getModelsDir(), resolvedModel)
    if (!fs.existsSync(modelPath)) {
      const fallback = findFirstModel('.bin')
      if (fallback) {
        console.log(`Whisper model "${resolvedModel}" not found, falling back to "${fallback}"`)
        resolvedModel = fallback
        setConfigValue('voice_model', fallback)
      }
    }
  }

  // Convert audio to WAV if needed, then transcribe with whisper.cpp
  const ext = path.extname(audioPath).toLowerCase()
  let wavPath = audioPath

  if (ext !== '.wav') {
    wavPath = audioPath.replace(/\.[^.]+$/, '') + '.wav'
    await convertToWav(audioPath, wavPath)
  }

  const result = await transcribeWithWhisperCpp(wavPath, resolvedModel, 'zh')

  // Clean up converted WAV if we created it
  if (wavPath !== audioPath) {
    try { fs.unlinkSync(wavPath) } catch {}
  }

  return result.text
})

// License
ipcMain.handle('validate-license', async (_, key: string) => {
  const valid = validateLicenseKey(key)
  if (valid) {
    setConfigValue('license_key', key)
  }
  return valid
})

ipcMain.handle('get-license-info', async () => {
  return getLicenseInfo()
})

ipcMain.handle('increment-usage', async () => {
  return incrementUsage()
})

ipcMain.handle('get-machine-id', async () => {
  return getMachineId()
})

// App
ipcMain.handle('get-app-version', async () => {
  return app.getVersion()
})

ipcMain.handle('open-path', async (_, filePath: string) => {
  shell.showItemInFolder(filePath)
})

// Open models directory in file explorer
ipcMain.handle('open-models-dir', async () => {
  shell.openPath(getModelsDir())
})

// Model download
ipcMain.handle('download-model', async (_, filename: string, url: string) => {
  try {
    const destPath = await startDownload(filename, url, getModelsDir())
    return { success: true, path: destPath }
  } catch (err: any) {
    return { success: false, error: err.message || '下载失败' }
  }
})

ipcMain.handle('get-download-progress', async (_, filename: string) => {
  return getDownloadProgress(filename) || null
})

// Mirror management
ipcMain.handle('get-mirrors', async () => {
  return MIRRORS
})

ipcMain.handle('get-active-mirror', async () => {
  return getActiveMirror()
})

ipcMain.handle('set-active-mirror', async (_, mirrorId: string) => {
  setConfigValue('model_mirror', mirrorId)
})

// Get all mirror URLs for a model (for fallback download)
ipcMain.handle('get-model-all-urls', async (_, filename: string) => {
  return getModelAllUrls(filename)
})

// Tool download (ffmpeg, whisper.cpp)
ipcMain.handle('download-tool', async (_, toolId: string) => {
  try {
    const tool = TOOL_DEFS.find((t) => t.toolId === toolId)
    if (!tool) {
      return { success: false, error: `未知工具: ${toolId}` }
    }
    const destPath = await downloadAndExtractTool(
      tool.toolId,
      tool.name,
      tool.url,
      tool.filename,
      getModelsDir(),
    )
    return { success: true, path: destPath }
  } catch (err: any) {
    return { success: false, error: err.message || '下载失败' }
  }
})

// Get tool download info
ipcMain.handle('get-tool-defs', async () => {
  return TOOL_DEFS
})

// Model status check
ipcMain.handle('check-models', async () => {
  const modelsDir = getModelsDir()
  const allFiles = fs.existsSync(modelsDir) ? fs.readdirSync(modelsDir) : []

  const llmFiles = allFiles.filter((f) => f.endsWith('.gguf'))
  const whisperFiles = allFiles.filter((f) => f.endsWith('.bin') && f.startsWith('ggml-'))

  const hasLlmModel = llmFiles.length > 0
  const hasWhisperModel = whisperFiles.length > 0

  // Also check tooling availability
  const ffmpegOk = await isFfmpegAvailable()
  const whisperCppOk = await isWhisperCppAvailable()

  return {
    hasLlmModel,
    hasWhisperModel,
    ggufFiles: [...llmFiles, ...whisperFiles],
    modelsDir,
    ffmpegAvailable: ffmpegOk,
    whisperCppAvailable: whisperCppOk,
    whisperBinaryPath: getWhisperBinaryPath(),
    ffmpegPath: getFfmpegPath(),
  }
})

// Whisper models (GGUF)
ipcMain.handle('get-whisper-models', async () => {
  return getRecommendedWhisperModels()
})

// Tool availability checks
ipcMain.handle('check-ffmpeg', async () => {
  return isFfmpegAvailable()
})

ipcMain.handle('check-whisper-cpp', async () => {
  return isWhisperCppAvailable()
})
