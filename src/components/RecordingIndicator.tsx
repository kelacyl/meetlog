import { Square, Pause, Play, Clock, AlertCircle } from 'lucide-react'
import type { RecordingStatus } from '../types'

interface RecordingIndicatorProps {
  status: RecordingStatus
  duration: number
  hasSystemAudio: boolean
  error: string | null
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

export default function RecordingIndicator({
  status,
  duration,
  hasSystemAudio,
  error,
  onPause,
  onResume,
  onStop,
}: RecordingIndicatorProps) {
  if (status === 'idle') return null

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Pulsing dot */}
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <span className="font-semibold text-red-700">
            {status === 'paused' ? '录音已暂停' : '正在录音'}
          </span>
          <span className="flex items-center gap-1 text-sm text-red-500">
            <Clock size={14} />
            {formatDuration(duration)}
          </span>
          {!hasSystemAudio && (
            <span className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
              <AlertCircle size={12} />
              仅麦克风
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {status === 'paused' ? (
            <button
              onClick={onResume}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Play size={14} />
              继续
            </button>
          ) : (
            <button
              onClick={onPause}
              className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm font-medium"
            >
              <Pause size={14} />
              暂停
            </button>
          )}
          <button
            onClick={onStop}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium"
          >
            <Square size={14} />
            结束录音
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-100 px-3 py-2 rounded-lg">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
    </div>
  )
}
