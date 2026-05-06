import { contextBridge, ipcRenderer } from 'electron'

export interface Meeting {
  id: number
  title: string
  createdAt: number
  duration: number
  transcript: string
  summary: string
  audioPath: string
}

export interface AppConfig {
  archivePath: string
  llmModel: string
  voiceModel: string
  meetingTemplate: string
  licenseKey: string
  isActivated: boolean
  minimizeToTray: boolean
  chunkDuration: number
  audioSource: string
  modelMirror: string
}

export interface TranscriptionPartial {
  text: string
  timestamp: number
  isFinal: boolean
  sequence: number
  mergedText: string
}

export interface TranscriptionError {
  message: string
  sequence: number
}

export interface SystemAudioStatus {
  available: boolean
}

export interface DesktopSource {
  id: string
  name: string
}

export interface LocalModel {
  filename: string
  sizeBytes: number
  sizeDisplay: string
}

export interface RecommendedModel {
  name: string
  filename: string
  size: string
  description: string
  url: string
}

export interface DownloadProgress {
  id: string
  filename: string
  url: string
  status: 'idle' | 'downloading' | 'completed' | 'error'
  progress: number
  downloadedBytes: number
  totalBytes: number
  speed: string
  eta: string
  error?: string
}

export interface ElectronAPI {
  // Recording
  startRecording: () => Promise<{ success: boolean; error?: string }>
  stopRecording: () => Promise<{ success: boolean; audioPath?: string; transcript?: string; error?: string }>
  pauseRecording: () => Promise<void>
  resumeRecording: () => Promise<void>
  onRecordingStatus: (callback: (status: 'idle' | 'recording' | 'paused') => void) => () => void
  onMainEvent: (event: string, callback: (...args: any[]) => void) => () => void
  sendToMain: (channel: string, ...args: any[]) => void

  // Real-time transcription
  onTranscriptionPartial: (callback: (data: TranscriptionPartial) => void) => () => void
  onTranscriptionError: (callback: (data: TranscriptionError) => void) => () => void
  onSystemAudioStatus: (callback: (status: SystemAudioStatus) => void) => () => void
  onRecorderError: (callback: (message: string) => void) => () => void

  // Tray commands
  onTrayStartRecording: (callback: () => void) => () => void
  onTrayStopRecording: (callback: () => void) => () => void

  // Desktop capture
  getDesktopSources: () => Promise<DesktopSource[]>

  // Meetings
  getMeetings: () => Promise<Meeting[]>
  getMeeting: (id: number) => Promise<Meeting | null>
  saveMeeting: (meeting: Omit<Meeting, 'id'>) => Promise<number>
  updateMeeting: (id: number, data: Partial<Meeting>) => Promise<void>
  deleteMeeting: (id: number) => Promise<void>

  // Config
  getConfig: () => Promise<AppConfig>
  setConfig: (config: Partial<AppConfig>) => Promise<void>
  selectFolder: () => Promise<string | undefined>

  // LLM (local llama.cpp)
  getLocalModels: () => Promise<LocalModel[]>
  getRecommendedModels: () => Promise<RecommendedModel[]>
  getModelsDir: () => Promise<string>
  generateSummary: (transcript: string, template: string, model: string) => Promise<string>
  openModelsDir: () => Promise<void>

  // Whisper
  transcribeAudio: (audioPath: string, model: string) => Promise<string>

  // License
  validateLicense: (key: string) => Promise<boolean>
  getLicenseInfo: () => Promise<{ isActivated: boolean; usageCount: number; monthLimit: number }>
  incrementUsage: () => Promise<{ allowed: boolean; remaining: number }>
  getMachineId: () => Promise<string>

  // App
  getAppVersion: () => Promise<string>
  openPath: (path: string) => Promise<void>

  // Model download
  downloadModel: (filename: string, url: string) => Promise<{ success: boolean; path?: string; error?: string }>
  getDownloadProgress: (filename: string) => Promise<DownloadProgress | null>
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void

  // Model check
  checkModels: () => Promise<{
    hasLlmModel: boolean
    hasWhisperModel: boolean
    ggufFiles: string[]
    modelsDir: string
    ffmpegAvailable: boolean
    whisperCppAvailable: boolean
    whisperBinaryPath: string
    ffmpegPath: string
  }>

  // Whisper models (GGUF)
  getWhisperModels: () => Promise<WhisperModel[]>
  checkFfmpeg: () => Promise<boolean>
  checkWhisperCpp: () => Promise<boolean>

  // Mirror management
  getMirrors: () => Promise<MirrorDef[]>
  getActiveMirror: () => Promise<string>
  setActiveMirror: (mirrorId: string) => Promise<void>
  getModelAllUrls: (filename: string) => Promise<Record<string, string>>

  // Tool download
  downloadTool: (toolId: string) => Promise<{ success: boolean; path?: string; error?: string }>
  getToolDefs: () => Promise<ToolDef[]>
}

export interface WhisperModel {
  name: string
  filename: string
  size: string
  description: string
  url: string
}

export interface MirrorDef {
  id: string
  name: string
  description: string
}

export interface ToolDef {
  toolId: string
  name: string
  description: string
  filename: string
  archiveType: 'zip' | 'direct'
  url: string
}

const api: ElectronAPI = {
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  pauseRecording: () => ipcRenderer.invoke('pause-recording'),
  resumeRecording: () => ipcRenderer.invoke('resume-recording'),
  onRecordingStatus: (callback) => {
    const handler = (_: unknown, status: 'idle' | 'recording' | 'paused') => callback(status)
    ipcRenderer.on('recording-status', handler)
    return () => ipcRenderer.removeListener('recording-status', handler)
  },
  onMainEvent: (event: string, callback) => {
    const handler = (_: unknown, ...args: any[]) => callback(...args)
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.removeListener(event, handler)
  },
  sendToMain: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args)
  },

  // Real-time transcription
  onTranscriptionPartial: (callback) => {
    const handler = (_: unknown, data: TranscriptionPartial) => callback(data)
    ipcRenderer.on('transcription-partial', handler)
    return () => ipcRenderer.removeListener('transcription-partial', handler)
  },
  onTranscriptionError: (callback) => {
    const handler = (_: unknown, data: TranscriptionError) => callback(data)
    ipcRenderer.on('transcription-error', handler)
    return () => ipcRenderer.removeListener('transcription-error', handler)
  },
  onSystemAudioStatus: (callback) => {
    const handler = (_: unknown, status: SystemAudioStatus) => callback(status)
    ipcRenderer.on('system-audio-status', handler)
    return () => ipcRenderer.removeListener('system-audio-status', handler)
  },
  onRecorderError: (callback) => {
    const handler = (_: unknown, message: string) => callback(message)
    ipcRenderer.on('recorder-error', handler)
    return () => ipcRenderer.removeListener('recorder-error', handler)
  },

  // Tray commands
  onTrayStartRecording: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('tray-start-recording', handler)
    return () => ipcRenderer.removeListener('tray-start-recording', handler)
  },
  onTrayStopRecording: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('tray-stop-recording', handler)
    return () => ipcRenderer.removeListener('tray-stop-recording', handler)
  },

  // Desktop capture
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),

  getMeetings: () => ipcRenderer.invoke('get-meetings'),
  getMeeting: (id: number) => ipcRenderer.invoke('get-meeting', id),
  saveMeeting: (meeting) => ipcRenderer.invoke('save-meeting', meeting),
  updateMeeting: (id, data) => ipcRenderer.invoke('update-meeting', id, data),
  deleteMeeting: (id: number) => ipcRenderer.invoke('delete-meeting', id),

  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (config) => ipcRenderer.invoke('set-config', config),
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // LLM (local llama.cpp)
  getLocalModels: () => ipcRenderer.invoke('get-local-models'),
  getRecommendedModels: () => ipcRenderer.invoke('get-recommended-models'),
  getModelsDir: () => ipcRenderer.invoke('get-models-dir'),
  generateSummary: (transcript, template, model) =>
    ipcRenderer.invoke('generate-summary', transcript, template, model),
  openModelsDir: () => ipcRenderer.invoke('open-models-dir'),

  transcribeAudio: (audioPath, model) => ipcRenderer.invoke('transcribe-audio', audioPath, model),

  validateLicense: (key: string) => ipcRenderer.invoke('validate-license', key),
  getLicenseInfo: () => ipcRenderer.invoke('get-license-info'),
  incrementUsage: () => ipcRenderer.invoke('increment-usage'),
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openPath: (path: string) => ipcRenderer.invoke('open-path', path),

  // Model download
  downloadModel: (filename, url) => ipcRenderer.invoke('download-model', filename, url),
  getDownloadProgress: (filename) => ipcRenderer.invoke('get-download-progress', filename),
  onDownloadProgress: (callback) => {
    const handler = (_: unknown, progress: DownloadProgress) => callback(progress)
    ipcRenderer.on('download-progress', handler)
    return () => ipcRenderer.removeListener('download-progress', handler)
  },

  // Model check
  checkModels: () => ipcRenderer.invoke('check-models'),

  // Whisper models (GGUF)
  getWhisperModels: () => ipcRenderer.invoke('get-whisper-models'),
  checkFfmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  checkWhisperCpp: () => ipcRenderer.invoke('check-whisper-cpp'),

  // Mirror management
  getMirrors: () => ipcRenderer.invoke('get-mirrors'),
  getActiveMirror: () => ipcRenderer.invoke('get-active-mirror'),
  setActiveMirror: (mirrorId) => ipcRenderer.invoke('set-active-mirror', mirrorId),
  getModelAllUrls: (filename) => ipcRenderer.invoke('get-model-all-urls', filename),

  // Tool download
  downloadTool: (toolId) => ipcRenderer.invoke('download-tool', toolId),
  getToolDefs: () => ipcRenderer.invoke('get-tool-defs'),
}

contextBridge.exposeInMainWorld('electronAPI', api)

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
