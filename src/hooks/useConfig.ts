import { useState, useEffect, useCallback } from 'react'
import type { AppConfig } from '../types'

const defaultConfig: AppConfig = {
  archivePath: '',
  llmModel: 'qwen2.5-7b-instruct-q4_k_m.gguf',
  voiceModel: 'ggml-large-v3-turbo.bin',
  meetingTemplate: '',
  licenseKey: '',
  isActivated: false,
  minimizeToTray: true,
  chunkDuration: 30,
  audioSource: 'system+mic',
  modelMirror: 'hf-mirror',
}

export function useConfig() {
  const [config, setConfigState] = useState<AppConfig>(defaultConfig)
  const [loading, setLoading] = useState(true)

  const loadConfig = useCallback(async () => {
    try {
      const data = await window.electronAPI.getConfig()
      setConfigState(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const setConfig = useCallback(async (partial: Partial<AppConfig>) => {
    await window.electronAPI.setConfig(partial)
    setConfigState((prev: AppConfig) => ({ ...prev, ...partial }))
  }, [])

  return { config, setConfig, loading, reload: loadConfig }
}
