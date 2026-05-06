import { useState, useEffect, useCallback } from 'react'
import { X, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import type { DownloadProgress } from '../../electron/preload'

interface DownloadProgressModalProps {
  isOpen: boolean
  /** Model filename (for model downloads) */
  filename?: string
  /** Direct download URL (for model downloads) */
  url?: string
  /** Tool ID (for tool downloads, e.g. "ffmpeg", "whisper-cpp") */
  toolId?: string
  /** Display name for the download */
  modelName: string
  onClose: () => void
  onComplete: () => void
}

export default function DownloadProgressModal({
  isOpen,
  filename,
  url,
  toolId,
  modelName,
  onClose,
  onComplete,
}: DownloadProgressModalProps) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [started, setStarted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startDownload = useCallback(async () => {
    setStarted(true)
    setError(null)
    try {
      if (toolId) {
        // Tool download
        const result = await window.electronAPI.downloadTool(toolId)
        if (!result.success) {
          setError(result.error || '下载失败')
        }
      } else if (filename && url) {
        // Model download
        const result = await window.electronAPI.downloadModel(filename, url)
        if (!result.success) {
          setError(result.error || '下载失败')
        }
      }
    } catch (err: any) {
      setError(err.message || '下载失败')
    }
  }, [filename, url, toolId])

  useEffect(() => {
    if (!isOpen) return

    const progressId = toolId || filename || ''

    const unsub = window.electronAPI.onDownloadProgress((p) => {
      if (p.filename === progressId || p.id === progressId) {
        setProgress(p)
        if (p.status === 'error') {
          setError(p.error || '下载失败')
        }
        if (p.status === 'completed') {
          onComplete()
          setTimeout(onClose, 2000)
        }
      }
    })

    if (!started) {
      startDownload()
    }

    return () => unsub()
  }, [isOpen, filename, toolId, startDownload, started, onComplete, onClose])

  if (!isOpen) return null

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] overflow-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {toolId ? '工具下载' : '模型下载'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Name */}
        <p className="text-sm text-gray-600 mb-4">
          正在下载 <span className="font-medium text-gray-800">{modelName}</span>
        </p>

        {/* Error state */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">下载失败</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
              <button
                onClick={startDownload}
                className="mt-2 text-xs text-red-700 underline hover:no-underline"
              >
                重试
              </button>
            </div>
          </div>
        )}

        {/* Completed state */}
        {progress?.status === 'completed' && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle size={18} className="text-green-500" />
            <p className="text-sm text-green-700">下载完成！已就绪。</p>
          </div>
        )}

        {/* Progress bar */}
        {progress && progress.status !== 'completed' && (
          <div className="space-y-3">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-primary-600 rounded-full transition-all duration-300"
                style={{ width: `${progress.progress || 0}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-gray-500">
              <span>
                {formatSize(progress.downloadedBytes)}
                {progress.totalBytes > 0 && ` / ${formatSize(progress.totalBytes)}`}
              </span>
              <span>{progress.progress}%</span>
            </div>

            <div className="flex justify-between text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Download size={12} />
                {progress.speed}
              </span>
              <span>剩余 {progress.eta}</span>
            </div>
          </div>
        )}

        {/* Initial loading state */}
        {!progress && !error && (
          <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">正在连接...</span>
          </div>
        )}
      </div>
    </div>
  )
}
