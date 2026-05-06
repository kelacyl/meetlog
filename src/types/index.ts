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

export type RecordingStatus = 'idle' | 'recording' | 'paused'

export interface TranscriptionSegment {
  text: string
  timestamp: number
  isFinal: boolean
  sequence: number
  mergedText: string
}

export interface RecordingState {
  status: RecordingStatus
  startTime: number
  duration: number
  hasSystemAudio: boolean
  partialTranscript: string
  error: string | null
}
