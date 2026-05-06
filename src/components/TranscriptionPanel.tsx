import { useEffect, useRef } from 'react'
import { FileText } from 'lucide-react'
import type { TranscriptionSegment } from '../types'

interface TranscriptionPanelProps {
  segments: TranscriptionSegment[]
}

export default function TranscriptionPanel({ segments }: TranscriptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [segments])

  if (segments.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="text-primary-600" size={20} />
          <h3 className="text-lg font-semibold">实时转写</h3>
        </div>
        <div className="text-center py-8 text-gray-400">
          <p>等待语音输入...</p>
          <p className="text-sm mt-2">开始说话后，转写内容将在此实时显示</p>
        </div>
      </div>
    )
  }

  // Get the latest merged text for display
  const latestSegment = segments[segments.length - 1]
  const displayText = latestSegment?.mergedText || segments.map((s) => s.text).join('\n')

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="text-primary-600" size={20} />
        <h3 className="text-lg font-semibold">实时转写</h3>
        {!latestSegment?.isFinal && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full animate-pulse">
            转写中...
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="max-h-96 overflow-auto prose max-w-none"
      >
        <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
          {displayText || '正在识别语音...'}
        </div>
      </div>

      {segments.length > 1 && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
          已处理 {segments.length} 个语音片段
        </div>
      )}
    </div>
  )
}
