/**
 * Audio converter – converts WebM (and other formats) to 16kHz mono WAV
 * suitable for whisper.cpp. Uses ffmpeg if available.
 */
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

/** Resolve bundled ffmpeg path if it exists. */
function resolveFfmpeg(): string {
  const bundledPaths = [
    path.join(process.resourcesPath || '', 'ffmpeg', 'ffmpeg.exe'),
    path.join(app.getAppPath(), 'ffmpeg', 'ffmpeg.exe'),
    path.join(__dirname, '..', '..', 'ffmpeg', 'ffmpeg.exe'),
  ]
  for (const p of bundledPaths) {
    if (fs.existsSync(p)) return p
  }
  // Fall back to system PATH
  return 'ffmpeg'
}

/** Convert an audio file to 16kHz mono WAV for whisper.cpp. */
export function convertToWav(inputPath: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = resolveFfmpeg()
    const args = [
      '-y',                     // overwrite output
      '-i', inputPath,          // input
      '-ar', '16000',           // 16kHz sample rate
      '-ac', '1',               // mono
      '-sample_fmt', 's16',     // 16-bit signed PCM
      '-f', 'wav',              // WAV format
      outputPath,
    ]

    execFile(ffmpeg, args, { timeout: 120000 }, (err) => {
      if (err) {
        reject(
          new Error(
            `音频转换失败，请确认已安装 ffmpeg 并添加到系统 PATH。\n` +
              `技术详情: ${err.message}`
          )
        )
        return
      }
      if (!fs.existsSync(outputPath)) {
        reject(new Error('音频转换失败：输出文件未生成'))
        return
      }
      resolve(outputPath)
    })
  })
}

/**
 * Extract a time segment from a continuous session WebM file and convert
 * directly to 16kHz mono WAV.  Uses ffmpeg input seeking (-ss before -i)
 * for fast keyframe-based extraction.
 */
export function extractWavSegment(
  sessionFilePath: string,
  startSec: number,
  durationSec: number,
  outputPath: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = resolveFfmpeg()
    const args = [
      '-y',
      '-ss', String(startSec),
      '-i', sessionFilePath,
      '-t', String(durationSec),
      '-ar', '16000',
      '-ac', '1',
      '-sample_fmt', 's16',
      '-f', 'wav',
      outputPath,
    ]

    execFile(ffmpeg, args, { timeout: 120000 }, (err) => {
      if (err) {
        reject(
          new Error(
            `音频片段提取失败，请确认已安装 ffmpeg。\n` +
              `技术详情: ${err.message}`
          )
        )
        return
      }
      if (!fs.existsSync(outputPath)) {
        reject(new Error('音频片段提取失败：输出文件未生成'))
        return
      }
      resolve(outputPath)
    })
  })
}

/** Check if ffmpeg is available. */
export function isFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(resolveFfmpeg(), ['-version'], { timeout: 10000 }, (err) => {
      resolve(!err)
    })
  })
}

/** Get resolved ffmpeg path (for display). */
export function getFfmpegPath(): string {
  return resolveFfmpeg()
}
