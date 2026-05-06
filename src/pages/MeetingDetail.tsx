import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Headphones, Sparkles, Loader2 } from 'lucide-react'
import type { Meeting } from '../types'

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [generating, setGenerating] = useState(false)
  const [transcribing, setTranscribing] = useState(false)

  const loadMeeting = useCallback(async () => {
    if (!id) return
    const data = await window.electronAPI.getMeeting(Number(id))
    setMeeting(data)
  }, [id])

  useEffect(() => {
    loadMeeting()
  }, [loadMeeting])

  // Listen for live transcription updates if this meeting is being recorded
  useEffect(() => {
    const unsubscribe = window.electronAPI.onTranscriptionPartial((data) => {
      if (data.mergedText && meeting) {
        setMeeting((prev) =>
          prev ? { ...prev, transcript: data.mergedText } : prev
        )
      }
    })

    return unsubscribe
  }, [meeting?.id])

  const handleGenerateSummary = async () => {
    if (!meeting || !meeting.transcript) return
    setGenerating(true)
    try {
      const config = await window.electronAPI.getConfig()
      const summary = await window.electronAPI.generateSummary(
        meeting.transcript,
        config.meetingTemplate,
        config.llmModel
      )
      await window.electronAPI.updateMeeting(meeting.id, { summary })
      await loadMeeting()
    } catch (err: any) {
      alert(`生成纪要失败: ${err.message || '未知错误'}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleTranscribe = async () => {
    if (!meeting || !meeting.audioPath) return
    setTranscribing(true)
    try {
      const config = await window.electronAPI.getConfig()
      const transcript = await window.electronAPI.transcribeAudio(meeting.audioPath, config.voiceModel)
      await window.electronAPI.updateMeeting(meeting.id, { transcript })
      await loadMeeting()
    } catch (err: any) {
      alert(`转录失败: ${err.message || '未知错误'}`)
    } finally {
      setTranscribing(false)
    }
  }

  const handleOpenAudio = () => {
    if (meeting?.audioPath) {
      window.electronAPI.openPath(meeting.audioPath)
    }
  }

  if (!meeting) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <Loader2 className="animate-spin mr-2" />
        加载中...
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{meeting.title}</h2>
            <p className="text-gray-500 mt-1">
              {new Date(meeting.createdAt).toLocaleString('zh-CN')}
              {meeting.duration > 0 && (
                <span className="ml-3">
                  时长: {Math.floor(meeting.duration / 60)}分{meeting.duration % 60}秒
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Actions */}
          <div className="flex gap-3">
            {meeting.audioPath && (
              <button
                onClick={handleOpenAudio}
                className="btn-secondary flex items-center gap-2"
              >
                <Headphones size={18} />
                打开音频文件
              </button>
            )}
            {meeting.audioPath && !meeting.transcript && (
              <button
                onClick={handleTranscribe}
                disabled={transcribing}
                className="btn-primary flex items-center gap-2"
              >
                {transcribing ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                {transcribing ? '转录中...' : '语音转写'}
              </button>
            )}
            {meeting.transcript && (
              <button
                onClick={handleGenerateSummary}
                disabled={generating}
                className="btn-primary flex items-center gap-2"
              >
                {generating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {generating ? '生成中...' : '生成会议纪要'}
              </button>
            )}
          </div>

          {/* Transcript */}
          {meeting.transcript && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="text-primary-600" size={20} />
                <h3 className="text-lg font-semibold">会议转录</h3>
              </div>
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {meeting.transcript}
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          {meeting.summary && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="text-primary-600" size={20} />
                <h3 className="text-lg font-semibold">会议纪要</h3>
              </div>
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {meeting.summary}
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!meeting.transcript && !meeting.summary && !transcribing && (
            <div className="card text-center py-16">
              <FileText size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">暂无转录内容</p>
              {meeting.audioPath ? (
                <p className="text-gray-400 mt-2">点击下方按钮开始语音转写</p>
              ) : (
                <p className="text-gray-400 mt-2">本次录音未保存音频文件</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
