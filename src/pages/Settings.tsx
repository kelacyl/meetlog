import { useState, useEffect } from 'react'
import { FolderOpen, Save, Key, Mic, FileText, Monitor, ToggleLeft, Download, Cpu, RefreshCw, Wrench } from 'lucide-react'
import { useConfig } from '../hooks/useConfig'
import type { LocalModel, RecommendedModel, WhisperModel, MirrorDef, ToolDef } from '../../electron/preload'
import DownloadProgressModal from '../components/DownloadProgressModal'

const defaultTemplate = `你是一位专业的会议记录助手。请根据以下会议转录文本，生成结构化的会议纪要。

请包含以下内容：
1. 会议概述（简要总结会议主题和目的）
2. 与会人员（如果有提到的话）
3. 关键讨论点
4. 达成的决议
5. 行动事项（待办任务，标注负责人和截止日期）

请用中文输出，保持简洁专业。`

function MachineIdDisplay() {
  const [machineId, setMachineId] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.electronAPI.getMachineId().then(setMachineId)
  }, [])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(machineId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!machineId) return null

  return (
    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
      <p className="text-xs font-medium text-gray-500 mb-1">本机标识 (Machine ID)</p>
      <div className="flex items-center gap-2">
        <code className="text-xs text-gray-700 font-mono bg-gray-100 px-2 py-1 rounded flex-1 select-all">
          {machineId}
        </code>
        <button onClick={handleCopy} className="text-xs text-primary-600 hover:text-primary-700 whitespace-nowrap">
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        如需硬件绑定序列码，请将此 ID 发送给开发者。
      </p>
    </div>
  )
}

export default function SettingsPage() {
  const { config, setConfig, loading } = useConfig()
  const [localModels, setLocalModels] = useState<LocalModel[]>([])
  const [recommendedModels, setRecommendedModels] = useState<RecommendedModel[]>([])
  const [modelsDir, setModelsDir] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseMessage, setLicenseMessage] = useState('')
  const [downloadingModel, setDownloadingModel] = useState<{ filename: string; url: string; name: string } | null>(null)
  const [downloadingTool, setDownloadingTool] = useState<{ toolId: string; name: string } | null>(null)
  const [whisperModels, setWhisperModels] = useState<WhisperModel[]>([])
  const [localWhisperModels, setLocalWhisperModels] = useState<Array<{ filename: string; name?: string; size: string }>>([])

  // Mirror & tool state
  const [mirrors, setMirrors] = useState<MirrorDef[]>([])
  const [activeMirror, setActiveMirror] = useState('hf-mirror')
  const [toolDefs, setToolDefs] = useState<ToolDef[]>([])
  const [toolStatuses, setToolStatuses] = useState<Record<string, boolean | null>>({})

  const refreshModels = async () => {
    setRefreshing(true)
    // 每个调用独立容错，避免一个失败导致全部丢失
    try {
      const local = await window.electronAPI.getLocalModels()
      setLocalModels(local)
    } catch {
      setLocalModels([])
    }
    try {
      const recommended = await window.electronAPI.getRecommendedModels()
      setRecommendedModels(recommended)
    } catch {
      setRecommendedModels([])
    }
    try {
      const dir = await window.electronAPI.getModelsDir()
      setModelsDir(dir)
    } catch {
      // keep previous dir
    }
    setRefreshing(false)
  }

  const refreshWhisperModels = async () => {
    // 推荐列表和本地检测分离，各自独立容错
    let recommended: WhisperModel[] = []
    try {
      recommended = await window.electronAPI.getWhisperModels()
      setWhisperModels(recommended)
    } catch {
      setWhisperModels([])
    }
    try {
      const status = await window.electronAPI.checkModels()
      const whisperBinFiles = status.ggufFiles
        .filter((f) => f.startsWith('ggml-') && f.endsWith('.bin'))
        .map((f) => {
          const match = recommended.find((r) => r.filename === f)
          return {
            filename: f,
            name: match?.name,
            size: match?.size || '未知',
          }
        })
      setLocalWhisperModels(whisperBinFiles)
    } catch {
      // Ignore
    }
  }

  const loadMirrors = async () => {
    const [mirrorList, active] = await Promise.all([
      window.electronAPI.getMirrors(),
      window.electronAPI.getActiveMirror(),
    ])
    setMirrors(mirrorList)
    setActiveMirror(active)
  }

  const loadTools = async () => {
    const defs = await window.electronAPI.getToolDefs()
    setToolDefs(defs)
    // Check status for each tool
    const statuses: Record<string, boolean | null> = {}
    for (const tool of defs) {
      if (tool.toolId === 'ffmpeg') {
        statuses[tool.toolId] = await window.electronAPI.checkFfmpeg()
      } else if (tool.toolId === 'whisper-cpp') {
        statuses[tool.toolId] = await window.electronAPI.checkWhisperCpp()
      }
    }
    setToolStatuses(statuses)
  }

  const handleMirrorChange = async (mirrorId: string) => {
    setActiveMirror(mirrorId)
    await window.electronAPI.setActiveMirror(mirrorId)
    // Refresh models to get URLs for the new mirror
    refreshModels()
    refreshWhisperModels()
  }

  const handleToolDownloadComplete = async () => {
    loadTools()
    // Also refresh the main model check since tools status changed
  }

  const refreshAll = async () => {
    await Promise.all([refreshModels(), refreshWhisperModels(), loadTools(), loadMirrors()])
  }

  useEffect(() => {
    refreshModels()
    refreshWhisperModels()
    loadMirrors()
    loadTools()
    window.electronAPI.getLicenseInfo().then(() => {
      // Initialize license state
    })
  }, [])

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.selectFolder()
    if (path) {
      setConfig({ archivePath: path })
    }
  }

  const handleSave = async () => {
    await setConfig({
      archivePath: config.archivePath,
      llmModel: config.llmModel,
      voiceModel: config.voiceModel,
      meetingTemplate: config.meetingTemplate,
      minimizeToTray: config.minimizeToTray,
      chunkDuration: config.chunkDuration,
      audioSource: config.audioSource,
      modelMirror: activeMirror,
    })
    alert('设置已保存')
  }

  const handleActivateLicense = async () => {
    const valid = await window.electronAPI.validateLicense(licenseKey)
    if (valid) {
      setLicenseMessage('激活成功！您现在可以无限次记录会议。')
      setConfig({ licenseKey, isActivated: true })
    } else {
      setLicenseMessage('序列码无效，请检查输入。')
    }
  }

  const handleOpenModelsDir = async () => {
    await window.electronAPI.openModelsDir()
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        加载中...
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-8">系统设置</h2>

      <div className="max-w-2xl space-y-8">
        {/* Archive Path */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="text-primary-600" size={20} />
            <h3 className="text-lg font-semibold">存档路径</h3>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={config.archivePath}
              readOnly
              className="input flex-1 bg-gray-50"
            />
            <button onClick={handleSelectFolder} className="btn-secondary flex items-center gap-2">
              <FolderOpen size={16} />
              浏览
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            会议音频和记录将保存在此目录下。
          </p>
        </section>

        {/* Audio Source */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="text-primary-600" size={20} />
            <h3 className="text-lg font-semibold">音频捕获</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">音频源</label>
              <select
                value={config.audioSource}
                onChange={(e) => setConfig({ audioSource: e.target.value })}
                className="input"
              >
                <option value="system+mic">系统音频 + 麦克风（推荐）</option>
                <option value="mic-only">仅麦克风</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                实时转写分块时长: {config.chunkDuration} 秒
              </label>
              <input
                type="range"
                min="15"
                max="60"
                step="5"
                value={config.chunkDuration}
                onChange={(e) => setConfig({ chunkDuration: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>15秒（更快响应）</span>
                <span>60秒（更高准确度）</span>
              </div>
            </div>
          </div>
        </section>

        {/* Mirror Selector */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <Download className="text-primary-600" size={20} />
            <h3 className="text-lg font-semibold">下载镜像源</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">选择镜像源</label>
            <select
              value={activeMirror}
              onChange={(e) => handleMirrorChange(e.target.value)}
              className="input"
            >
              {mirrors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {mirrors.find((m) => m.id === activeMirror)?.description || ''}
            切换镜像后，模型下载链接将自动更新。推荐国内用户使用 HF-Mirror 或 ModelScope。
          </p>
        </section>

        {/* Tools Download (ffmpeg + whisper.cpp) */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="text-primary-600" size={20} />
            <h3 className="text-lg font-semibold">外部工具</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            以下工具是录音和转写功能必需的。点击下载按钮即可自动安装。
          </p>
          <div className="space-y-3">
            {toolDefs.map((tool) => {
              const isOk = toolStatuses[tool.toolId]
              return (
                <div
                  key={tool.toolId}
                  className={`border rounded-lg p-3 text-sm ${
                    isOk ? 'border-green-200 bg-green-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isOk ? 'bg-green-500' : isOk === false ? 'bg-red-500' : 'bg-gray-300'
                        }`}
                      />
                      <div>
                        <p className="font-medium text-gray-800">
                          {tool.name}
                          {isOk && (
                            <span className="ml-2 text-xs text-green-600">✓ 已就绪</span>
                          )}
                          {isOk === false && (
                            <span className="ml-2 text-xs text-red-600">✗ 未安装</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{tool.description}</p>
                      </div>
                    </div>
                    {!isOk && (
                      <button
                        onClick={() =>
                          setDownloadingTool({ toolId: tool.toolId, name: tool.name })
                        }
                        className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-md hover:bg-primary-700 flex items-center gap-1 shrink-0"
                      >
                        <Download size={12} />
                        一键安装
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {toolDefs.length === 0 && (
              <p className="text-xs text-gray-400">加载工具列表中...</p>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            工具将下载到 models 目录。如果一键安装失败，请手动下载 ffmpeg.exe 和 whisper-cli.exe
            并放入 models 目录（或添加到系统 PATH）。
          </p>
        </section>

        {/* Local LLM (llama.cpp) */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="text-primary-600" size={20} />
            <h3 className="text-lg font-semibold">本地大模型 (llama.cpp)</h3>
          </div>

          <div className="space-y-4">
            {/* Model selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">会议纪要模型</label>
              <select
                value={config.llmModel}
                onChange={(e) => setConfig({ llmModel: e.target.value })}
                className="input"
              >
                {localModels.length === 0 && (
                  <option value="">尚未安装模型，请先下载</option>
                )}
                {localModels.map((m) => (
                  <option key={m.filename} value={m.filename}>
                    {m.filename} ({m.sizeDisplay})
                  </option>
                ))}
              </select>
            </div>

            {/* Models directory & refresh */}
            <div className="flex items-center gap-2">
              <button onClick={handleOpenModelsDir} className="btn-secondary flex items-center gap-2 text-sm">
                <FolderOpen size={14} />
                打开模型目录
              </button>
              <button
                onClick={refreshAll}
                disabled={refreshing}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>
            <p className="text-sm text-gray-500">
              模型目录: {modelsDir || '加载中...'}
            </p>

            {/* Installed models list */}
            {localModels.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">已安装的模型:</p>
                <ul className="space-y-1">
                  {localModels.map((m) => (
                    <li key={m.filename} className="text-xs text-gray-500 flex items-center justify-between">
                      <span className="font-mono">{m.filename}</span>
                      <span>{m.sizeDisplay}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommended models */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                推荐下载 (GGUF 格式)
                <span className="text-xs text-gray-400 ml-2">
                  — 当前镜像: {mirrors.find((m) => m.id === activeMirror)?.name || activeMirror}
                </span>
              </p>
              <div className="space-y-2">
                {recommendedModels.map((m) => {
                  const isInstalled = localModels.some((lm) => lm.filename === m.filename)
                  return (
                    <div
                      key={m.filename}
                      className={`border rounded-lg p-3 text-sm ${
                        isInstalled ? 'border-green-200 bg-green-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-800">
                            {m.name}
                            {isInstalled && (
                              <span className="ml-2 text-xs text-green-600">✓ 已安装</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                          <p className="text-xs text-gray-400 mt-0.5">大小: {m.size}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        {isInstalled ? (
                          <span className="text-xs text-green-600">模型已就绪，无需下载</span>
                        ) : (
                          <button
                            onClick={() =>
                              setDownloadingModel({
                                filename: m.filename,
                                url: m.url,
                                name: m.name,
                              })
                            }
                            className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-md hover:bg-primary-700 flex items-center gap-1"
                          >
                            <Download size={12} />
                            下载 ({mirrors.find((mr) => mr.id === activeMirror)?.name || '当前镜像'})
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                点击下载按钮即可自动下载模型到本地。如果当前镜像下载失败，请切换到其他镜像源重试。
                7B 模型建议 8GB+ 可用内存，1.5B 模型最低 4GB。
              </p>
            </div>
          </div>
        </section>

        {/* Whisper Model (whisper.cpp GGUF) */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <Mic className="text-primary-600" size={20} />
            <h3 className="text-lg font-semibold">语音转写模型 (Whisper GGUF)</h3>
          </div>

          <div className="space-y-4">
            {/* Model selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">模型选择</label>
              <select
                value={config.voiceModel}
                onChange={(e) => setConfig({ voiceModel: e.target.value })}
                className="input"
              >
                <option value="">请先下载模型</option>
                {localWhisperModels.map((m) => (
                  <option key={m.filename} value={m.filename}>
                    {m.name || m.filename} ({m.size})
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-500 mt-1">
                使用 whisper.cpp + GGUF 格式。请先在"外部工具"区域安装 whisper.cpp 和 ffmpeg。
              </p>
            </div>

            {/* Installed whisper models */}
            {localWhisperModels.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">已安装的语音模型:</p>
                <ul className="space-y-1">
                  {localWhisperModels.map((m) => (
                    <li key={m.filename} className="text-xs text-gray-500 font-mono">
                      {m.filename} ({m.size})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommended whisper models */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                推荐下载 (GGUF 格式)
                <span className="text-xs text-gray-400 ml-2">
                  — 当前镜像: {mirrors.find((m) => m.id === activeMirror)?.name || activeMirror}
                </span>
              </p>
              <div className="space-y-2">
                {whisperModels.map((m) => {
                  const isInstalled = localWhisperModels.some((lm) => lm.filename === m.filename)
                  return (
                    <div
                      key={m.filename}
                      className={`border rounded-lg p-3 text-sm ${
                        isInstalled ? 'border-green-200 bg-green-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-800">
                            {m.name}
                            {isInstalled && (
                              <span className="ml-2 text-xs text-green-600">✓ 已安装</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                          <p className="text-xs text-gray-400 mt-0.5">大小: {m.size}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        {isInstalled ? (
                          <span className="text-xs text-green-600">模型已就绪</span>
                        ) : (
                          <button
                            onClick={() =>
                              setDownloadingModel({
                                filename: m.filename,
                                url: m.url,
                                name: m.name,
                              })
                            }
                            className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-md hover:bg-primary-700 flex items-center gap-1"
                          >
                            <Download size={12} />
                            下载 ({mirrors.find((mr) => mr.id === activeMirror)?.name || '当前镜像'})
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Background */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <ToggleLeft className="text-primary-600" size={20} />
            <h3 className="text-lg font-semibold">后台运行</h3>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.minimizeToTray}
              onChange={(e) => setConfig({ minimizeToTray: e.target.checked })}
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">关闭窗口时最小化到系统托盘</span>
              <p className="text-sm text-gray-500">
                启用后，关闭主窗口时应用继续在后台运行，通过系统托盘控制录音。
              </p>
            </div>
          </label>
        </section>

        {/* Template */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="text-primary-600" size={20} />
            <h3 className="text-lg font-semibold">会议纪要模板</h3>
          </div>
          <textarea
            value={config.meetingTemplate || defaultTemplate}
            onChange={(e) => setConfig({ meetingTemplate: e.target.value })}
            className="textarea h-48 font-mono text-sm"
            placeholder="输入自定义的会议纪要生成提示词模板..."
          />
          <p className="text-sm text-gray-500 mt-2">
            该模板将作为 system prompt 发送给本地大模型。您可以自定义输出格式和内容要求。
          </p>
        </section>

        {/* License */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <Key className="text-primary-600" size={20} />
            <h3 className="text-lg font-semibold">序列码激活</h3>
          </div>
          <MachineIdDisplay />
          {config.isActivated ? (
            <div className="p-4 bg-green-50 text-green-700 rounded-lg">
              已激活 - 您可以无限次记录会议
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="输入序列码"
                  className="input flex-1 uppercase"
                />
                <button onClick={handleActivateLicense} className="btn-primary">
                  激活
                </button>
              </div>
              {licenseMessage && (
                <p
                  className={`text-sm ${
                    licenseMessage.includes('成功') ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {licenseMessage}
                </p>
              )}
              <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg text-sm">
                <p className="font-medium">免费版限制</p>
                <p className="mt-1">每月最多记录 5 次会议。购买序列码后可解除限制。</p>
                <p className="mt-2 text-yellow-900">
                  请联系邮箱 <a href="mailto:kyl2059@qq.com" className="font-medium underline">kyl2059@qq.com</a> 获取序列码
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Save */}
        <div className="flex justify-end">
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save size={18} />
            保存设置
          </button>
        </div>
      </div>

      {/* Model Download Progress Modal */}
      {downloadingModel && (
        <DownloadProgressModal
          isOpen={true}
          filename={downloadingModel.filename}
          url={downloadingModel.url}
          modelName={downloadingModel.name}
          onClose={() => setDownloadingModel(null)}
          onComplete={() => { refreshModels(); refreshWhisperModels() }}
        />
      )}

      {/* Tool Download Progress Modal */}
      {downloadingTool && (
        <DownloadProgressModal
          isOpen={true}
          toolId={downloadingTool.toolId}
          modelName={downloadingTool.name}
          onClose={() => setDownloadingTool(null)}
          onComplete={handleToolDownloadComplete}
        />
      )}
    </div>
  )
}
