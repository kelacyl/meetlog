import { BrowserWindow } from 'electron'
import fs from 'fs'
import { AudioBuffer } from './audio-buffer'
import { transcribeWithWhisperCpp } from './whisper-cpp-service'
import { extractWavSegment } from './audio-converter'

/**
 * Chunked transcription engine for near-real-time meeting transcription.
 *
 * Manages:
 * 1. Audio buffer accumulation during recording
 * 2. Periodic chunk extraction with overlap windows
 * 3. Sequential transcription queue (one chunk at a time)
 * 4. Result merging and partial result emission to renderer
 */

export interface TranscriptionResult {
  text: string
  startTime: number
  endTime: number
  isFinal: boolean
  sequence: number
}

export class TranscriberEngine {
  private audioBuffer: AudioBuffer
  private mainWindow: BrowserWindow | null = null
  private isRunning: boolean = false
  private isProcessing: boolean = false
  private modelName: string = 'whisper-base'
  private allResults: TranscriptionResult[] = []
  private fullTranscript: string = ''
  private processInterval: ReturnType<typeof setInterval> | null = null

  constructor(chunkDurationSec: number = 30, overlapDurationSec: number = 10) {
    this.audioBuffer = new AudioBuffer(chunkDurationSec, overlapDurationSec)
  }

  /**
   * Start the transcription engine.
   * Begins polling the audio buffer for new chunks to transcribe.
   */
  start(mainWindow: BrowserWindow, modelName: string): void {
    this.mainWindow = mainWindow
    this.modelName = modelName || 'whisper-base'
    this.isRunning = true
    this.isProcessing = false
    this.allResults = []
    this.fullTranscript = ''

    this.audioBuffer.startRecording()

    // Poll every few seconds for new audio windows to transcribe
    this.processInterval = setInterval(() => {
      this.processNextWindow()
    }, 5000)
  }

  /**
   * Push a new audio chunk into the buffer.
   */
  pushAudioChunk(data: ArrayBuffer): void {
    if (!this.isRunning) return
    this.audioBuffer.pushChunk(data)
  }

  /**
   * Stop the engine and finalize transcription.
   * Returns a promise that resolves with the complete transcript.
   */
  async stop(): Promise<string> {
    this.isRunning = false

    if (this.processInterval) {
      clearInterval(this.processInterval)
      this.processInterval = null
    }

    // Process any remaining chunks in the queue
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Process one final window for any remaining audio
    await this.processNextWindow()

    // Merge all partial results into final transcript
    this.fullTranscript = this.mergeResults()

    this.audioBuffer.stopRecording()

    return this.fullTranscript
  }

  /**
   * Finalize the complete audio file for archiving.
   */
  finalizeAudio(outputPath: string): void {
    this.audioBuffer.finalizeRecording(outputPath)
  }

  /**
   * Process the next available audio window.
   *
   * Uses the continuous session WebM file maintained by AudioBuffer.
   * Extracts the time window directly to WAV via ffmpeg -ss/-t,
   * avoiding invalid WebM concatenation.
   */
  private async processNextWindow(): Promise<void> {
    if (this.isProcessing) return

    const chunk = this.audioBuffer.extractWindow()
    if (!chunk) return

    this.isProcessing = true

    // Unique WAV path for this window
    const wavPath = `${chunk.sessionFilePath}.w${chunk.sequence}.wav`

    try {
      // 1. Extract time segment from session WebM → 16kHz mono WAV
      const duration = chunk.endTime - chunk.startTime
      await extractWavSegment(chunk.sessionFilePath, chunk.startTime, duration, wavPath)

      // 2. Transcribe with whisper.cpp
      const result = await transcribeWithWhisperCpp(wavPath, this.modelName, 'zh')

      if (result.text && result.text.trim()) {
        const transcription: TranscriptionResult = {
          text: result.text.trim(),
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          isFinal: !this.isRunning,
          sequence: chunk.sequence,
        }

        this.allResults.push(transcription)

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('transcription-partial', {
            text: transcription.text,
            timestamp: Date.now(),
            isFinal: transcription.isFinal,
            sequence: transcription.sequence,
            mergedText: this.mergeResults(),
          })
        }
      }
    } catch (err: any) {
      console.error('Transcription chunk failed:', err.message)
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('transcription-error', {
          message: err.message || '转写失败',
          sequence: chunk.sequence,
        })
      }
    } finally {
      // Clean up the temporary WAV file (but keep the session WebM)
      try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath) } catch {}

      this.isProcessing = false
    }
  }

  /**
   * Merge all partial transcription results into a coherent full text.
   * Uses sequence-based ordering and deduplication of overlap regions.
   */
  private mergeResults(): string {
    if (this.allResults.length === 0) return ''

    // Sort by sequence
    const sorted = [...this.allResults].sort((a, b) => a.sequence - b.sequence)

    if (sorted.length === 1) return sorted[0].text

    // Simple merge: concatenate all results
    // A more sophisticated implementation would deduplicate overlap regions
    // by comparing the end of one result with the beginning of the next.
    const texts = sorted.map((r) => r.text)

    // Basic dedup: remove shorter text if it's contained in another
    const deduped: string[] = []
    for (let i = 0; i < texts.length; i++) {
      const current = texts[i]
      let isDuplicate = false

      for (let j = 0; j < texts.length; j++) {
        if (i !== j && texts[j].includes(current) && texts[j].length > current.length) {
          isDuplicate = true
          break
        }
      }

      if (!isDuplicate) {
        deduped.push(current)
      }
    }

    return deduped.join('\n')
  }

  /**
   * Check if there are pending transcription tasks.
   */
  hasPendingTasks(): boolean {
    return this.isProcessing
  }
}
