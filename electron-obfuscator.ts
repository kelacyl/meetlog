/**
 * Vite plugin: obfuscates Electron main/preload output via javascript-obfuscator.
 */
import type { Plugin } from 'vite'
import { obfuscate, type ObfuscationOptions } from 'javascript-obfuscator'
import fs from 'fs'
import path from 'path'

export interface ObfuscatorPluginOptions {
  /** Glob patterns for files to obfuscate (relative to outDir). Default: all .js files */
  include?: RegExp
  /** Output directory to scan */
  outDir?: string
  /** javascript-obfuscator options override */
  obfuscatorOptions?: ObfuscationOptions
  /** Enable verbose logging */
  verbose?: boolean
}

const DEFAULT_OPTIONS: ObfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.5,
  // Must be false — renames object keys and breaks IPC/contextBridge
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  // Don't break the app
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  // Keep performance reasonable
  deadCodeInjection: false,
  splitStrings: true,
  splitStringsChunkLength: 10,
  // Protect critical Electron / IPC identifiers
  reservedStrings: [
    'electronAPI',
    'start-recording',
    'stop-recording',
    'pause-recording',
    'resume-recording',
    'recorder-chunk',
    'recorder-error',
    'get-meetings',
    'get-meeting',
    'save-meeting',
    'update-meeting',
    'delete-meeting',
    'get-config',
    'set-config',
    'select-folder',
    'get-local-models',
    'get-recommended-models',
    'get-models-dir',
    'generate-summary',
    'transcribe-audio',
    'validate-license',
    'get-license-info',
    'increment-usage',
    'get-machine-id',
    'get-app-version',
    'open-path',
    'open-models-dir',
    'get-desktop-sources',
    'system-audio-status',
    'recording-status',
    'recording-data',
    'transcription-partial',
    'transcription-error',
    'recorder-start',
    'recorder-stop',
    'recorder-pause',
    'recorder-resume',
    'tray-start-recording',
    'tray-stop-recording',
    'minimize_to_tray',
    'archive_path',
    'llm_model',
    'voice_model',
    'meeting_template',
    'license_key',
    'chunk_duration',
    'audio_source',
    'model_mirror',
    // Download & mirror
    'download-model',
    'get-download-progress',
    'download-progress',
    'check-models',
    'get-whisper-models',
    'check-ffmpeg',
    'check-whisper-cpp',
    'get-mirrors',
    'get-active-mirror',
    'set-active-mirror',
    'get-model-all-urls',
    'download-tool',
    'get-tool-defs',
    'download-tool-progress',
  ],
}

export function electronObfuscatorPlugin(options: ObfuscatorPluginOptions = {}): Plugin {
  const {
    include = /\.js$/,
    outDir,
    obfuscatorOptions,
    verbose = true,
  } = options

  // Normalise string array encoding
  const mergedOptions: ObfuscationOptions = {
    ...DEFAULT_OPTIONS,
    ...obfuscatorOptions,
  }

  return {
    name: 'electron-obfuscator',
    apply: 'build',
    enforce: 'post',

    writeBundle(bundleOptions, bundle) {
      const resolvedOutDir = outDir || bundleOptions.dir || ''
      if (!resolvedOutDir) {
        console.warn('[electron-obfuscator] No outDir specified, skipping obfuscation')
        return
      }

      // Collect output files from the bundle
      const filesToProcess: string[] = []

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && include.test(fileName)) {
          const filePath = path.resolve(resolvedOutDir, fileName)
          if (fs.existsSync(filePath)) {
            filesToProcess.push(filePath)
          }
        }
      }

      if (filesToProcess.length === 0) {
        if (verbose) {
          console.log('[electron-obfuscator] No matching files found to obfuscate')
        }
        return
      }

      for (const filePath of filesToProcess) {
        try {
          const originalCode = fs.readFileSync(filePath, 'utf-8')
          const result = obfuscate(originalCode, mergedOptions)
          fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf-8')

          if (verbose) {
            const originalSize = (Buffer.byteLength(originalCode) / 1024).toFixed(1)
            const obfuscatedSize = (Buffer.byteLength(result.getObfuscatedCode()) / 1024).toFixed(1)
            console.log(
              `[electron-obfuscator] ${path.basename(filePath)}: ${originalSize} KB → ${obfuscatedSize} KB`,
            )
          }
        } catch (err: any) {
          console.error(`[electron-obfuscator] Failed to obfuscate ${filePath}:`, err.message)
        }
      }
    },
  }
}
