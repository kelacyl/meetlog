import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, Trash2, FileText, Calendar, Clock, AlertTriangle, Cpu, Download } from 'lucide-react'
import type { Meeting, RecordingStatus, TranscriptionSegment } from '../types'
import RecordingIndicator from '../components/RecordingIndicator'
import TranscriptionPanel from '../components/TranscriptionPanel'

export default function HomePage() {
  const navigate = useNavigate()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [currentMeetingId, setCurrentMeetingId] = useState<number | null>(null)
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0)
  const [recordingDuration, setRecordingDuration] = useState<number>(0)
  const [hasSystemAudio, setHasSystemAudio] = useState<boolean>(false)
  const [recorderError, setRecorderError] = useState<string | null>(null)
  const [transcriptionSegments, setTranscriptionSegments] = useState<TranscriptionSegment[]>([])
  const [licenseInfo, setLicenseInfo] = useState({ isActivated: false, usageCount: 0, monthLimit: 5 })
  const [modelStatus, setModelStatus] = useState<{ hasLlmModel: boolean; hasWhisperModel: boolean; ggufFiles: string[]; modelsDir: string; ffmpegAvailable: boolean; whisperCppAvailable: boolean } | null>(null)
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadMeetings = useCallback(async () => {
    const data = await window.electronAPI.getMeetings()
    setMeetings(data)
  }, [])

  const loadLicenseInfo = useCallback(async () => {
    const info = await window.electronAPI.getLicenseInfo()
    setLicenseInfo(info)
  }, [])

  const loadModelStatus = useCallback(async () => {
    const status = await window.electronAPI.checkModels()
    setModelStatus(status)
  }, [])

  useEffect(() => {
    loadMeetings()
    loadLicenseInfo()
    loadModelStatus()

    const unsubStatus = window.electronAPI.onRecordingStatus((s) => {
      setStatus(s)
      if (s === 'idle') {
        // Recording ended
        stopDurationTimer()
        loadMeetings()
        loadLicenseInfo()
        setTranscriptionSegments([])
        setRecorderError(null)
      }
    })

    const unsubTranscription = window.electronAPI.onTranscriptionPartial((data) => {
      setTranscriptionSegments((prev) => [...prev, data])
    })

    const unsubTransError = window.electronAPI.onTranscriptionError((data) => {
      console.error('Transcription error:', data.message)
      setRecorderError(`转写出错: ${data.message}`)
    })

    const unsubSystemAudio = window.electronAPI.onSystemAudioStatus((data) => {
      setHasSystemAudio(data.available)
    })

    const unsubRecorderError = window.electronAPI.onRecorderError((message) => {
      setRecorderError(message)
    })

    const unsubTrayStart = window.electronAPI.onTrayStartRecording(() => {
      handleStartRecording()
    })

    const unsubTrayStop = window.electronAPI.onTrayStopRecording(() => {
      handleStopRecording()
    })

    // Refresh model status when window regains focus (e.g. after downloading in Settings)
    const handleFocus = () => {
      loadModelStatus()
      loadMeetings()
      loadLicenseInfo()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      unsubStatus()
      unsubTranscription()
      unsubTransError()
      unsubSystemAudio()
      unsubRecorderError()
      unsubTrayStart()
      unsubTrayStop()
      stopDurationTimer()
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Effect dependency update for loadMeetings and loadLicenseInfo
  // We intentionally only run the effect once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const startDurationTimer = () => {
    if (durationTimerRef.current) return
    durationTimerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1)
    }, 1000)
  }

  const stopDurationTimer = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
    setRecordingDuration(0)
  }

  const handleStartRecording = async () => {
    const result = await window.electronAPI.startRecording()
    if (!result.success) {
      alert(result.error)
      return
    }

    const title = `会议 ${new Date().toLocaleString('zh-CN')}`
    const id = await window.electronAPI.saveMeeting({
      title,
      createdAt: Date.now(),
      duration: 0,
      transcript: '',
      summary: '',
      audioPath: '',
    })
    setCurrentMeetingId(id)
    setRecordingStartTime(Date.now())
    setRecorderError(null)
    setTranscriptionSegments([])
    setHasSystemAudio(false)
    startDurationTimer()
  }

  const handleStopRecording = async () => {
    const result = await window.electronAPI.stopRecording()
    if (result.success && currentMeetingId !== null && result.audioPath) {
      const duration = Math.floor((Date.now() - recordingStartTime) / 1000)
      await window.electronAPI.updateMeeting(currentMeetingId, {
        audioPath: result.audioPath,
        duration,
      })

      // Use transcript from transcription engine if available, otherwise transcribe
      const transcript = result.transcript || ''
      if (transcript) {
        await window.electronAPI.updateMeeting(currentMeetingId, { transcript })
      } else {
        // Fallback: batch transcribe the whole file
        const config = await window.electronAPI.getConfig()
        try {
          const text = await window.electronAPI.transcribeAudio(result.audioPath, config.voiceModel)
          await window.electronAPI.updateMeeting(currentMeetingId, { transcript: text })
        } catch (err: any) {
          console.error('Transcription failed:', err)
          await window.electronAPI.updateMeeting(currentMeetingId, {
            transcript: `【转录失败】${err.message || '未知错误'}`,
          })
        }
      }
    }
    setCurrentMeetingId(null)
    stopDurationTimer()
    setTranscriptionSegments([])
    loadMeetings()
  }

  const handlePause = async () => {
    await window.electronAPI.pauseRecording()
    stopDurationTimer()
  }

  const handleResume = async () => {
    await window.electronAPI.resumeRecording()
    startDurationTimer()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条会议记录吗？')) return
    await window.electronAPI.deleteMeeting(id)
    loadMeetings()
  }

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">会议记录</h2>
            <p className="text-gray-500 mt-1">
              {licenseInfo.isActivated
                ? '已激活 - 无限次会议记录'
                : `免费版 - 本月已使用 ${licenseInfo.usageCount} / ${licenseInfo.monthLimit} 次会议`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {status === 'idle' ? (
              <div className="flex items-center gap-3">
                {modelStatus && (!modelStatus.hasLlmModel || !modelStatus.hasWhisperModel || !modelStatus.ffmpegAvailable || !modelStatus.whisperCppAvailable) ? (
                  <div className="text-right">
                    <button
                      disabled
                      className="flex items-center gap-2 px-6 py-3 bg-gray-400 text-white rounded-lg font-medium cursor-not-allowed"
                      title="请先下载模型后再开始录音"
                    >
                      <Mic size={20} />
                      开始录音
                    </button>
                    <p className="text-xs text-amber-600 mt-1 flex items-center justify-end gap-1">
                      <AlertTriangle size={12} />
                      请先前往
                      <button
                        onClick={() => navigate('/settings')}
                        className="underline font-medium hover:text-amber-800"
                      >
                        系统设置
                      </button>
                      下载模型
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={handleStartRecording}
                    className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    <Mic size={20} />
                    开始录音
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Model check warning banner */}
      {modelStatus && (!modelStatus.hasLlmModel || !modelStatus.hasWhisperModel || !modelStatus.ffmpegAvailable || !modelStatus.whisperCppAvailable) && (
        <div className="mx-8 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-800">环境未就绪，录音功能已禁用</p>
              <p className="text-sm text-amber-700 mt-1">
                为避免浪费免费额度（每月 {licenseInfo.monthLimit} 次），请先在系统设置中完成环境配置。
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                {!modelStatus.hasLlmModel && (
                  <span className="flex items-center gap-1 text-amber-700">
                    <Cpu size={14} />
                    缺少 LLM 大模型 (GGUF)
                  </span>
                )}
                {!modelStatus.hasWhisperModel && (
                  <span className="flex items-center gap-1 text-amber-700">
                    <Mic size={14} />
                    缺少语音转写模型 (Whisper GGUF)
                  </span>
                )}
                {!modelStatus.ffmpegAvailable && (
                  <span className="flex items-center gap-1 text-amber-700">
                    <AlertTriangle size={14} />
                    缺少 ffmpeg (音频转换)
                  </span>
                )}
                {!modelStatus.whisperCppAvailable && (
                  <span className="flex items-center gap-1 text-amber-700">
                    <AlertTriangle size={14} />
                    缺少 whisper.cpp (语音引擎)
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate('/settings')}
                className="mt-3 flex items-center gap-1 text-sm bg-amber-600 text-white px-4 py-1.5 rounded-md hover:bg-amber-700"
              >
                <Download size={14} />
                前往配置环境
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Recording Indicator */}
          <RecordingIndicator
            status={status}
            duration={recordingDuration}
            hasSystemAudio={hasSystemAudio}
            error={recorderError}
            onPause={handlePause}
            onResume={handleResume}
            onStop={handleStopRecording}
          />

          {/* Live Transcription Panel */}
          {status !== 'idle' && (
            <TranscriptionPanel segments={transcriptionSegments} />
          )}

          {/* Meeting List */}
          {status === 'idle' && (
            <>
              {meetings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Mic size={64} strokeWidth={1} />
                  <p className="mt-4 text-lg">暂无会议记录</p>
                  <p className="mt-2">点击右上角"开始录音"按钮开始记录您的第一次会议</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {meetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      onClick={() => navigate(`/meeting/${meeting.id}`)}
                      className="card hover:shadow-md transition-shadow cursor-pointer group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">{meeting.title}</h3>
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              {formatDate(meeting.createdAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={14} />
                              {formatDuration(meeting.duration)}
                            </span>
                            {meeting.summary && (
                              <span className="flex items-center gap-1 text-primary-600">
                                <FileText size={14} />
                                已生成纪要
                              </span>
                            )}
                          </div>
                          {meeting.transcript && (
                            <p className="mt-3 text-sm text-gray-600 line-clamp-2">
                              {meeting.transcript.substring(0, 200)}...
                            </p>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(meeting.id)
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
