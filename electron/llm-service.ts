/**
 * LLM Service - Local LLM integration via node-llama-cpp (bundled llama.cpp).
 *
 * Features:
 * - Auto-downloads llama.cpp binaries on first use (no system deps required)
 * - Loads GGUF format models from local models directory
 * - Chat session API for meeting summary generation
 * - Model management (list, download recommended models)
 */

import fs from 'fs'
import path from 'path'
import { app } from 'electron'

// Types for node-llama-cpp (lazy-loaded to avoid requiring at import time)

// We'll dynamically import node-llama-cpp to avoid issues on platforms
// where the native binary isn't available yet
let llamaModule: any = null
let llamaInstance: any = null

let currentModel: any = null
let currentContext: any = null
let currentModelPath: string = ''

// ─── Model directory ─────────────────────────────────────────────

export function getModelsDir(): string {
  const dir = path.join(app.getPath('userData'), 'models')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// ─── Recommended models ──────────────────────────────────────────

export interface RecommendedModel {
  name: string
  filename: string
  size: string
  description: string
  url: string
}

export function getRecommendedModels(): RecommendedModel[] {
  try {
    // Lazy import to avoid circular dependency at module load
    const { getResolvedLlmModels } = require('./mirror-config')
    const models: import('./mirror-config').ModelSource[] = getResolvedLlmModels()
    return models.map((m) => ({
      name: m.name,
      filename: m.filename,
      size: m.size,
      description: m.description,
      url: m.url,
    }))
  } catch (err) {
    console.error('Failed to load recommended LLM models:', err)
    return []
  }
}

// ─── Initialization ───────────────────────────────────────────────

async function getLlamaModule(): Promise<any> {
  if (!llamaModule) {
    // node-llama-cpp auto-downloads the llama.cpp binary on first import
    llamaModule = await import('node-llama-cpp')
  }
  return llamaModule
}

async function initLlama(): Promise<any> {
  if (!llamaInstance) {
    const mod = await getLlamaModule()
    llamaInstance = await mod.getLlama()
  }
  return llamaInstance
}

// ─── Model listing ────────────────────────────────────────────────

export interface LocalModel {
  filename: string
  sizeBytes: number
  sizeDisplay: string
}

export async function getLocalModels(): Promise<LocalModel[]> {
  const modelsDir = getModelsDir()
  if (!fs.existsSync(modelsDir)) {
    return []
  }

  const files = fs.readdirSync(modelsDir)
  const ggufFiles = files.filter((f) => f.endsWith('.gguf'))

  return ggufFiles.map((filename) => {
    const filePath = path.join(modelsDir, filename)
    const stats = fs.statSync(filePath)
    return {
      filename,
      sizeBytes: stats.size,
      sizeDisplay: formatFileSize(stats.size),
    }
  })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ─── Summary generation ───────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `你是一位专业的会议记录助手。请根据以下会议转录文本，生成结构化的会议纪要。

请包含以下内容：
1. 会议概述（简要总结会议主题和目的）
2. 与会人员（如果有提到的话）
3. 关键讨论点
4. 达成的决议
5. 行动事项（待办任务，标注负责人和截止日期）

请用中文输出，保持简洁专业。`

// ─── Long-transcript chunking (Map-Reduce) ─────────────────────────

/** Max chars per chunk before triggering map-reduce (Chinese text). */
const CHUNK_SIZE = 3000
/** Overlap between adjacent chunks to prevent context breakage. */
const OVERLAP = 300

/**
 * Split text into chunks with overlap, trying to break at sentence boundaries.
 */
function splitChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) {
    return [text]
  }

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + CHUNK_SIZE
    if (end >= text.length) {
      chunks.push(text.substring(start))
      break
    }

    // Try to break at the nearest sentence boundary (。！？\n)
    const slice = text.substring(start, end)
    const breakMatch = slice.match(/[。！？\n](?=[^。！？\n]*$)/)
    if (breakMatch && breakMatch.index !== undefined && breakMatch.index > CHUNK_SIZE * 0.6) {
      end = start + breakMatch.index + 1
    }

    chunks.push(text.substring(start, end))
    start = end - OVERLAP
  }

  return chunks
}

const MAP_SYSTEM_PROMPT = `你是一位专业的会议记录助手。请从以下会议转录片段中提取所有关键信息。

要求：
1. 提取所有讨论要点和结论
2. 提取提到的决策、行动事项（含负责人和截止日期）
3. 提取提到的与会人员和他们的发言要点
4. 保留所有具体数据、数字、日期、名称

请用中文输出，尽量详细，不要遗漏重要信息。`

const REDUCE_USER_PROMPT_PREFIX = `以下是会议各片段的要点汇总。请根据这些要点，生成一份完整的结构化会议纪要：`

async function runSession(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const { LlamaChatSession } = await getLlamaModule()
  const session = new LlamaChatSession({
    contextSequence: currentContext.getSequence(),
    systemPrompt,
  })
  try {
    return await session.prompt(userPrompt)
  } finally {
    // Free native memory immediately — V8 GC doesn't know about llama.cpp allocations
    session.dispose({ disposeSequence: true })
  }
}

async function mapReduceSummary(
  transcript: string,
  template: string
): Promise<string> {
  const chunks = splitChunks(transcript)

  // ─── Single chunk: just do one-shot ───────────────────────────────
  if (chunks.length === 1) {
    return runSession(
      template || DEFAULT_SYSTEM_PROMPT,
      `以下是会议转录文本。请根据上述要求，生成结构化的会议纪要：\n\n${transcript}`
    )
  }

  console.log(`Long transcript detected: ${chunks.length} chunks, running Map-Reduce`)

  // ─── Map phase: summarize each chunk ──────────────────────────────
  const partialSummaries: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Map chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)
    const summary = await runSession(
      MAP_SYSTEM_PROMPT,
      `会议转录片段 (第 ${i + 1}/${chunks.length} 部分)：\n\n${chunks[i]}`
    )
    partialSummaries.push(summary)
  }

  // ─── Reduce phase: merge summaries into final structured minutes ──
  console.log('  Reduce: merging summaries...')
  const combined = partialSummaries
    .map((s, i) => `【第 ${i + 1} 部分要点】\n${s}`)
    .join('\n\n---\n\n')

  const reduceUserPrompt = `${REDUCE_USER_PROMPT_PREFIX}\n\n${combined}`

  return runSession(template || DEFAULT_SYSTEM_PROMPT, reduceUserPrompt)
}

// ─── Main entry point ──────────────────────────────────────────────

export async function generateSummary(
  transcript: string,
  template: string,
  modelName: string
): Promise<string> {
  const llama = await initLlama()
  const modelPath = path.join(getModelsDir(), modelName)

  if (!fs.existsSync(modelPath)) {
    throw new Error(
      `模型文件 "${modelName}" 未找到。\n\n` +
        `请将 GGUF 格式的模型文件放入以下目录:\n${getModelsDir()}\n\n` +
        `推荐下载: Qwen2.5-7B-Instruct GGUF\n` +
        `下载页面: https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF`
    )
  }

  try {
    // Dispose old context to free native memory (model stays loaded)
    if (currentContext && !currentContext.disposed) {
      await currentContext.dispose()
      currentContext = null
    }

    // Reload model only if the model file changed
    if (modelPath !== currentModelPath) {
      console.log(`Loading model: ${modelPath}`)
      if (currentModel) currentModel = null

      currentModel = await llama.loadModel({ modelPath })
      currentModelPath = modelPath
      console.log('Model loaded successfully')
    }

    // Always create a fresh context for each summary generation.
    // This prevents KV-cache/sequence exhaustion from prior calls.
    currentContext = await currentModel.createContext({ contextSize: 32768 })
    console.log('Context created for summary generation')

    return await mapReduceSummary(transcript, template)
  } catch (error: any) {
    console.error('LLM summary generation error:', error)
    throw new Error(
      `会议纪要生成失败: ${error.message || '未知错误'}\n\n` +
        '请确保：\n' +
        '1. 模型文件未损坏（GGUF 格式）\n' +
        '2. 系统内存充足（7B 模型建议 8GB+ RAM）\n' +
        '3. 首次运行会自动下载 llama.cpp 运行时'
    )
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────

export async function resetLlm(): Promise<void> {
  if (currentContext && !currentContext.disposed) {
    await currentContext.dispose()
  }
  currentContext = null
  currentModel = null
  currentModelPath = ''
  llamaInstance = null
  llamaModule = null
}

export async function unloadModel(): Promise<void> {
  if (currentContext && !currentContext.disposed) {
    await currentContext.dispose()
  }
  currentContext = null
  currentModel = null
  currentModelPath = ''
}
