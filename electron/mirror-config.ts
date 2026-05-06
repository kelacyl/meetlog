/**
 * Mirror configuration — central management of download sources
 * for models (LLM/ASR) and external tools (ffmpeg/whisper.cpp).
 *
 * Models define download URLs per mirror. The active mirror is stored
 * in the config DB, so users can switch mirrors without code changes.
 */
import { getConfigValue } from './db'

// ─── Mirror definitions ──────────────────────────────────────────

export interface MirrorDef {
  id: string
  name: string
  description: string
}

export const MIRRORS: MirrorDef[] = [
  {
    id: 'hf-mirror',
    name: 'HF-Mirror (国内镜像)',
    description: 'HuggingFace 国内镜像，国内下载速度快',
  },
  {
    id: 'modelscope',
    name: 'ModelScope 魔搭社区',
    description: '阿里云魔搭社区，国内下载稳定',
  },
  {
    id: 'huggingface',
    name: 'HuggingFace 官方',
    description: 'HuggingFace 官方源，海外用户首选',
  },
]

export const DEFAULT_MIRROR = 'hf-mirror'

export function getActiveMirror(): string {
  return getConfigValue('model_mirror') || DEFAULT_MIRROR
}

// ─── Internal model definitions (per-mirror URLs) ─────────────────

interface RawModelDef {
  filename: string
  name: string
  size: string
  description: string
  /** download URLs keyed by mirror id */
  sources: Record<string, string>
}

const LLM_MODEL_DEFS: RawModelDef[] = [
  {
    filename: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    name: 'Qwen2.5 7B (推荐)',
    size: '~4.7 GB',
    description: '通义千问 2.5 7B 指令模型，Q4_K_M 量化。中文会议纪要效果最佳，建议 8GB+ 内存。',
    sources: {
      'huggingface':
        'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
      'hf-mirror':
        'https://hf-mirror.com/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
      'modelscope':
        'https://modelscope.cn/models/qwen/Qwen2.5-7B-Instruct-GGUF/resolve/master/qwen2.5-7b-instruct-q4_k_m.gguf',
    },
  },
  {
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    name: 'Qwen2.5 1.5B (轻量)',
    size: '~1.0 GB',
    description: '通义千问 2.5 1.5B 轻量版，速度更快。适合低配机器（4GB 内存）。',
    sources: {
      'huggingface':
        'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
      'hf-mirror':
        'https://hf-mirror.com/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
      'modelscope':
        'https://modelscope.cn/models/qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/master/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    },
  },
  {
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    name: 'Qwen2.5 3B (均衡)',
    size: '~2.0 GB',
    description: '通义千问 2.5 3B 均衡版，在速度和效果间取得平衡。',
    sources: {
      'huggingface':
        'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
      'hf-mirror':
        'https://hf-mirror.com/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
      'modelscope':
        'https://modelscope.cn/models/qwen/Qwen2.5-3B-Instruct-GGUF/resolve/master/qwen2.5-3b-instruct-q4_k_m.gguf',
    },
  },
]

const WHISPER_MODEL_DEFS: RawModelDef[] = [
  {
    filename: 'ggml-large-v3.bin',
    name: 'whisper-large-v3 (推荐)',
    size: '~3.0 GB',
    description: 'Whisper Large V3 GGUF，多语言支持，中文效果最佳。',
    sources: {
      'huggingface':
        'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
      'hf-mirror':
        'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
      'modelscope':
        'https://modelscope.cn/models/manyeyes/ggml-large-v3/resolve/master/ggml-large-v3.bin',
    },
  },
  {
    filename: 'ggml-large-v3-turbo.bin',
    name: 'whisper-large-v3-turbo (快速推荐)',
    size: '~1.5 GB',
    description: 'Whisper Large V3 Turbo GGUF，速度更快，中文效果略低于 V3。适合低配机器。',
    sources: {
      'huggingface':
        'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
      'hf-mirror':
        'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
      'modelscope':
        'https://modelscope.cn/models/manyeyes/ggml-large-v3-turbo/resolve/master/ggml-large-v3-turbo.bin',
    },
  },
  {
    filename: 'ggml-medium.bin',
    name: 'whisper-medium (均衡)',
    size: '~1.1 GB',
    description: 'Whisper Medium GGUF，速度与效果的平衡选择。',
    sources: {
      'huggingface':
        'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
      'hf-mirror':
        'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
      'modelscope':
        'https://modelscope.cn/models/manyeyes/ggml-medium/resolve/master/ggml-medium.bin',
    },
  },
  {
    filename: 'ggml-small.bin',
    name: 'whisper-small (轻量)',
    size: '~370 MB',
    description: 'Whisper Small GGUF，速度最快但中文效果有限。仅推荐低配机器应急使用。',
    sources: {
      'huggingface':
        'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
      'hf-mirror':
        'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
      'modelscope':
        'https://modelscope.cn/models/manyeyes/ggml-small/resolve/master/ggml-small.bin',
    },
  },
]

// ─── URL resolution ───────────────────────────────────────────────

/** Pick the best URL for a model given the preferred mirror and fallbacks. */
function resolveUrl(sources: Record<string, string>, preferredMirror: string): string {
  if (sources[preferredMirror]) return sources[preferredMirror]
  // Fallback chain: hf-mirror → huggingface → modelscope
  for (const id of ['hf-mirror', 'huggingface', 'modelscope']) {
    if (sources[id]) return sources[id]
  }
  return ''
}

// ─── Public model accessors ───────────────────────────────────────

export interface ModelSource {
  filename: string
  name: string
  size: string
  description: string
  url: string
}

export function getResolvedLlmModels(): ModelSource[] {
  const mirror = getActiveMirror()
  return LLM_MODEL_DEFS.map((m) => ({
    filename: m.filename,
    name: m.name,
    size: m.size,
    description: m.description,
    url: resolveUrl(m.sources, mirror),
  }))
}

export function getResolvedWhisperModels(): ModelSource[] {
  const mirror = getActiveMirror()
  return WHISPER_MODEL_DEFS.map((m) => ({
    filename: m.filename,
    name: m.name,
    size: m.size,
    description: m.description,
    url: resolveUrl(m.sources, mirror),
  }))
}

/** Get all available mirror URLs for a model (for fallback download). */
export function getModelAllUrls(filename: string): Record<string, string> {
  for (const defs of [LLM_MODEL_DEFS, WHISPER_MODEL_DEFS]) {
    const m = defs.find((d) => d.filename === filename)
    if (m) return { ...m.sources }
  }
  return {}
}

/** Get URL for a specific model + mirror combination. */
export function getModelUrlForMirror(filename: string, mirrorId: string): string | null {
  const urls = getModelAllUrls(filename)
  return urls[mirrorId] || null
}

// ─── Tool download URLs ───────────────────────────────────────────

export interface ToolSource {
  toolId: string
  name: string
  description: string
  /** The executable filename to install */
  filename: string
  archiveType: 'zip' | 'direct'
  url: string
}

export const TOOL_DEFS: ToolSource[] = [
  {
    toolId: 'ffmpeg',
    name: 'ffmpeg',
    description: '音频格式转换工具 (WebM → WAV)，录音转写必需。已预置在安装包中，如意外丢失可在此重新下载。',
    filename: 'ffmpeg.exe',
    archiveType: 'zip',
    // BtbN FFmpeg-Builds (static, LGPL, win64) — more reliable than gyan.dev
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-win64-lgpl-8.1.zip',
  },
  {
    toolId: 'whisper-cpp',
    name: 'whisper.cpp',
    description: '语音转写引擎 (Whisper CLI)，实时转写必需。',
    filename: 'whisper-cli.exe',
    archiveType: 'zip',
    url: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip',
  },
]
