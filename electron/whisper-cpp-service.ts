/**
 * Whisper.cpp service – ASR via whisper.cpp CLI with GGUF models.
 *
 * Uses whisper.cpp main executable to transcribe WAV files.
 * Models are GGUF format, downloaded from ModelScope mirror.
 */
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let whisperBinPath = ''

/** Resolve or locate the whisper.cpp binary. */
function resolveWhisperBinary(): string {
  if (whisperBinPath && fs.existsSync(whisperBinPath)) {
    return whisperBinPath
  }

  const candidates = [
    // Bundled in extraResources
    path.join(process.resourcesPath || '', 'whisper', 'whisper-cli'),
    path.join(process.resourcesPath || '', 'whisper', 'whisper-cli.exe'),
    // In app directory
    path.join(app.getAppPath(), 'whisper', 'whisper-cli'),
    path.join(app.getAppPath(), 'whisper', 'whisper-cli.exe'),
    // In models directory (user-placed)
    path.join(getModelsDir(), 'whisper-cli'),
    path.join(getModelsDir(), 'whisper-cli.exe'),
    // Development: local tools/ directory
    path.join(__dirname, '..', '..', 'tools', 'whisper', 'whisper-cli'),
    path.join(__dirname, '..', '..', 'tools', 'whisper', 'whisper-cli.exe'),
    path.join(__dirname, '..', 'tools', 'whisper', 'whisper-cli'),
    path.join(__dirname, '..', 'tools', 'whisper', 'whisper-cli.exe'),
    // System PATH
    'whisper-cli',
    'whisper-cli.exe',
    'whisper',
    'whisper.exe',
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      whisperBinPath = p
      return p
    }
  }

  // Not found – try system PATH as last resort
  whisperBinPath = 'whisper-cli'
  return whisperBinPath
}

/** Get the models directory (shared with LLM). */
function getModelsDir(): string {
  const dir = path.join(app.getPath('userData'), 'models')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// ─── Recommended whisper GGUF models ──────────────────────────────

export interface WhisperModel {
  name: string
  filename: string
  size: string
  description: string
  url: string
}

export function getRecommendedWhisperModels(): WhisperModel[] {
  try {
    // Lazy import to avoid circular dependency at module load
    const { getResolvedWhisperModels } = require('./mirror-config')
    const models: import('./mirror-config').ModelSource[] = getResolvedWhisperModels()
    return models.map((m) => ({
      name: m.name,
      filename: m.filename,
      size: m.size,
      description: m.description,
      url: m.url,
    }))
  } catch (err) {
    console.error('Failed to load recommended whisper models:', err)
    return []
  }
}

// ─── Transcription ───────────────────────────────────────────────

export interface TranscribeResult {
  text: string
  duration: number  // audio duration in seconds
}

/**
 * Transcribe a WAV file using whisper.cpp CLI.
 * @param wavPath  – path to 16kHz mono 16-bit WAV file
 * @param modelFilename – GGUF model filename (in models directory)
 * @param language – language hint ('zh' for Chinese, 'auto' for auto-detect)
 */
export function transcribeWithWhisperCpp(
  wavPath: string,
  modelFilename: string,
  language: string = 'zh',
): Promise<TranscribeResult> {
  return new Promise((resolve, reject) => {
    const modelPath = path.join(getModelsDir(), modelFilename)

    if (!fs.existsSync(modelPath)) {
      reject(
        new Error(
          `Whisper 模型 "${modelFilename}" 未找到。\n` +
            `请将 GGUF 模型文件放入: ${getModelsDir()}\n` +
            `推荐从 ModelScope 国内镜像下载。`
        )
      )
      return
    }

    if (!fs.existsSync(wavPath)) {
      reject(new Error(`音频文件未找到: ${wavPath}`))
      return
    }

    const whisperBin = resolveWhisperBinary()

    const args = [
      '-m', modelPath,
      '-f', wavPath,
      '-l', language,
      '--no-timestamps',
      '-oj',          // JSON output (written to wavPath.json)
      '-of', wavPath.replace(/\.wav$/i, ''),  // output file prefix
    ]

    execFile(whisperBin, args, { timeout: 600000 }, (err, stdout, stderr) => {
      // whisper.cpp writes output to a JSON file, not stdout
      const jsonPath = wavPath.replace(/\.wav$/i, '') + '.json'

      try {
        if (fs.existsSync(jsonPath)) {
          const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
          // Combine all segments' text
          const text = jsonData.transcription
            ? jsonData.transcription.map((seg: any) => seg.text.trim()).join('')
            : ''

          // Clean up JSON output file
          try { fs.unlinkSync(jsonPath) } catch {}

          resolve({
            text: text || '【转录结果为空】',
            duration: jsonData.transcription
              ? jsonData.transcription.reduce((sum: number, seg: any) => sum + (seg.duration || 0), 0)
              : 0,
          })
          return
        }
      } catch (parseErr) {
        // JSON parse failed – fall through to error
      }

      // If we get here, either the process failed or output parsing failed
      if (err) {
        reject(
          new Error(
            `语音转录失败。\n` +
              `请确认:\n` +
              `1. whisper.cpp 已安装并可用\n` +
              `2. 模型文件放置在: ${getModelsDir()}\n` +
              `3. 音频为 16kHz 单声道 WAV 格式\n\n` +
              `技术详情: ${err.message}\n${stderr || ''}`
          )
        )
      } else {
        // Process succeeded but we couldn't parse output
        resolve({ text: stdout || '', duration: 0 })
      }
    })
  })
}

/** Check if whisper.cpp binary is available and working. */
export function isWhisperCppAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const whisperBin = resolveWhisperBinary()
    execFile(whisperBin, ['--help'], { timeout: 10000 }, (err) => {
      resolve(!err)
    })
  })
}

/** Get the resolved whisper.cpp binary path. */
export function getWhisperBinaryPath(): string {
  return resolveWhisperBinary()
}

/** Get the models directory path. */
export function getWhisperModelsDir(): string {
  return getModelsDir()
}
