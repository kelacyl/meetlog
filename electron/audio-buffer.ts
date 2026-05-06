import fs from 'fs'
import path from 'path'
import { app } from 'electron'

/**
 * Ring buffer for accumulating audio chunks during recording.
 *
 * Instead of re-concatenating MediaRecorder chunks into separate WebM files
 * (which fails because only the first chunk contains the EBML header), we
 * maintain a SINGLE continuous session.webm file.  Transcription windows
 * are extracted from the session file using ffmpeg's -ss/-t options.
 */

export interface AudioChunk {
  /** Path to the continuous session WebM file (valid Matroska) */
  sessionFilePath: string
  /** Start time offset in seconds from recording start */
  startTime: number
  /** End time offset in seconds from recording start */
  endTime: number
  /** Sequence number for ordering */
  sequence: number
}

export class AudioBuffer {
  private chunks: ArrayBuffer[] = []
  private chunkTimestamps: number[] = []
  private recordingStartTime: number = 0
  private sequenceCounter: number = 0
  private tempDir: string
  private sessionFilePath: string = ''

  // Configuration
  private readonly chunkDurationSec: number
  private readonly overlapDurationSec: number

  constructor(chunkDurationSec: number = 30, overlapDurationSec: number = 10) {
    this.chunkDurationSec = chunkDurationSec
    this.overlapDurationSec = overlapDurationSec
    this.tempDir = path.join(app.getPath('temp'), 'meetlog-chunks')
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
    }
  }

  /**
   * Start a new recording session. Resets all buffers and creates
   * a fresh session WebM file to which all chunks will be appended.
   */
  startRecording(): void {
    this.chunks = []
    this.chunkTimestamps = []
    this.sequenceCounter = 0
    this.recordingStartTime = Date.now()
    this.cleanupTempDir()

    this.sessionFilePath = path.join(this.tempDir, 'session.webm')
    // Truncate/create empty session file
    fs.writeFileSync(this.sessionFilePath, Buffer.alloc(0))
  }

  /**
   * Push a new audio chunk (raw WebM blob from MediaRecorder, ~3 seconds).
   * Data is appended to the continuous session file so the file stays a
   * valid Matroska stream with a single EBML header at the front.
   */
  pushChunk(data: ArrayBuffer): void {
    this.chunks.push(data)
    this.chunkTimestamps.push((Date.now() - this.recordingStartTime) / 1000)
    // Append to session file – keeps the EBML header from chunk #0 intact
    fs.appendFileSync(this.sessionFilePath, Buffer.from(data))
  }

  /**
   * Get total accumulated audio duration in seconds (approximate).
   */
  getTotalDurationSec(): number {
    return this.chunks.length * 3
  }

  /**
   * Check if we have enough audio for a transcription window.
   */
  hasEnoughForWindow(): boolean {
    return this.getTotalDurationSec() >= this.chunkDurationSec
  }

  /**
   * Extract a time-based transcription window pointing into the session file.
   * Returns null if not enough audio accumulated.
   *
   * Windows overlap to avoid cutting mid-sentence:
   * - First window: 0 to chunkDurationSec
   * - Subsequent windows: (prevEnd - overlap) to (prevEnd - overlap + chunkDuration)
   *
   * The caller is responsible for extracting the actual WAV from the session file
   * using ffmpeg's -ss and -t options.
   */
  extractWindow(): AudioChunk | null {
    if (!this.hasEnoughForWindow()) {
      return null
    }

    const totalDuration = this.getTotalDurationSec()
    const sequence = this.sequenceCounter++

    // Calculate time window with overlap
    let windowStart: number
    let windowEnd: number

    if (sequence === 0) {
      windowStart = 0
      windowEnd = Math.min(this.chunkDurationSec, totalDuration)
    } else {
      // Slide forward by (chunkDuration - overlap) from the previous window
      const slideAmount = this.chunkDurationSec - this.overlapDurationSec
      windowStart = sequence * slideAmount
      windowEnd = Math.min(windowStart + this.chunkDurationSec, totalDuration)
    }

    if (windowEnd - windowStart < 1) {
      return null // Too small to bother
    }

    return {
      sessionFilePath: this.sessionFilePath,
      startTime: windowStart,
      endTime: windowEnd,
      sequence,
    }
  }

  /**
   * Copy the complete session file to the user's archive directory.
   */
  finalizeRecording(outputPath: string): void {
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    if (fs.existsSync(this.sessionFilePath)) {
      fs.copyFileSync(this.sessionFilePath, outputPath)
    }
  }

  /**
   * Stop recording and clean up temporary chunk files.
   */
  stopRecording(): void {
    this.cleanupTempDir()
  }

  /**
   * Simple energy-based VAD — not applicable to compressed WebM chunks.
   * Always returns true; the Whisper model handles silence well.
   */
  static hasVoiceActivity(_data: ArrayBuffer, _threshold: number = 0.01): boolean {
    return true
  }

  private cleanupTempDir(): void {
    if (fs.existsSync(this.tempDir)) {
      const files = fs.readdirSync(this.tempDir)
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(this.tempDir, file))
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
