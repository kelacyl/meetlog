# MeetLog Assistant — 本地大模型会议记录助手

基于本地大模型的 Windows 桌面会议记录工具，支持系统音频实时捕获、语音转文字、AI 会议纪要生成，**全程离线运行，数据不上云**。

## 核心功能

- **系统音频捕获** — 捕获腾讯会议、Zoom 等主流会议软件的系统音频，无需额外配置
- **实时语音转写** — 基于 whisper.cpp + GGUF 模型，低延迟实时转写会议发言
- **AI 会议纪要** — 本地 LLM（支持 Qwen2.5 等 GGUF 模型）自动生成结构化纪要，含会议概述、讨论要点、决议、行动事项
- **自定义模板** — 支持配置会议纪要模板，AI 按模板生成
- **完全离线** — 所有模型本地运行，数据不出本机
- **序列码授权** — 免费版每月 5 次会议，付费解锁无限制

## 技术栈

| 层 | 技术 |
|------|------|
| 桌面框架 | Electron 31 + React 18 + TypeScript |
| 语音转写 | whisper.cpp CLI + GGUF 模型 (ggml-large-v3-turbo) |
| 会议纪要 | node-llama-cpp (llama.cpp) + GGUF 模型 (Qwen2.5 7B) |
| 音频处理 | Electron desktopCapturer + MediaRecorder API + ffmpeg |
| UI | React Router + Tailwind CSS + Lucide Icons |
| 构建 | Vite + electron-builder (NSIS 安装包) |

## 快速开始

### 环境要求

- Windows 10/11 x64
- Node.js >= 18.x（推荐 20.x LTS）
- 磁盘空间 >= 10 GB（用于模型下载）

### 安装与运行

```powershell
# 克隆仓库
git clone https://github.com/kelacyl/meetlog.git
cd meetlog

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建 + 打包 EXE
npm run build:win
```

### 首次使用

1. 启动应用后进入**设置**页面
2. 下载 LLM 模型（GGUF 格式，推荐 Qwen2.5-7B-Instruct Q4_K_M）
3. 下载语音模型（GGUF 格式，推荐 ggml-large-v3-turbo）
4. 确认 ffmpeg 和 whisper-cli 状态正常
5. 回到首页开始录音

## 项目结构

```
meetlog/
├── electron/                     # Electron 主进程
│   ├── main.ts                   # 主入口 + IPC
│   ├── preload.ts                # 预加载脚本
│   ├── db.ts                     # JSON 数据存储
│   ├── license.ts                # 序列码验证
│   ├── llm-service.ts            # LLM: llama.cpp + GGUF
│   ├── whisper-cpp-service.ts    # ASR: whisper.cpp
│   ├── audio-converter.ts        # ffmpeg 音频转换
│   ├── download-manager.ts       # 模型下载管理
│   ├── transcriber-engine.ts     # 实时转写引擎
│   └── tray-manager.ts           # 系统托盘
├── src/                          # React 前端
│   ├── App.tsx                   # 路由 + 布局
│   ├── pages/
│   │   ├── Home.tsx              # 首页（录音 + 环境检查）
│   │   ├── Settings.tsx          # 设置（模型 + 序列码）
│   │   └── MeetingDetail.tsx     # 会议详情
│   └── components/
│       ├── RecordingIndicator.tsx
│       ├── TranscriptionPanel.tsx
│       └── DownloadProgressModal.tsx
├── tools/                        # 运行时依赖
│   └── whisper/                  # whisper.cpp Windows 二进制
├── scripts/
│   └── generate-key.ts           # 序列码生成工具
├── assets/                       # 图标资源
├── package.json
└── vite.config.ts
```

## 许可证

MIT License

## 作者

MeetLog — kyl2059@qq.com
