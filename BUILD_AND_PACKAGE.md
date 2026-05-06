# MeetLog Assistant — Windows 开发与打包指南 (2026-04-30 更新)

## 环境要求

| 要求 | 说明 |
|------|------|
| 操作系统 | **Windows 10/11 x64** |
| Node.js | >= 18.x（推荐 20.x LTS） |
| npm | >= 9.x |
| 磁盘空间 | >= 10 GB |
| ffmpeg | 需安装并添加到系统 PATH（用于音频格式转换） |
| whisper.cpp | 需下载 `whisper-cli.exe` 放入 models 目录 |

---

## 一、源码同步 (WSL → Windows)

在 WSL 中修改代码后，同步到 Windows 工程目录。

> **Windows 工程目录**: `D:\AI\meetlog-app`

```bash
# 在 WSL 中执行
rsync -av --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='dist-electron' \
  --exclude='release' \
  --exclude='.git' \
  /home/kyl/workspace/本地会议助手/meetlog-app/ \
  /mnt/d/AI/meetlog-app/
```

> 同步完成后，Windows 上的 `package-lock.json` 可能来自 Linux 环境，需要删除后重新生成。

---

## 二、首次安装 (Windows PowerShell)

以下所有命令在 **Windows PowerShell** 中执行，工作目录 `D:\AI\meetlog-app`。

### 1. 配置 npm 淘宝镜像（加速下载）

```powershell
npm config set registry https://registry.npmmirror.com
npm config get registry
```

恢复默认：
```powershell
npm config set registry https://registry.npmjs.org
```

### 2. 释放文件占用

如果遇到 "EPERM: operation not permitted" 或文件被占用：

```powershell
# 管理员 PowerShell
taskkill /F /IM electron.exe
taskkill /F /IM node.exe
```

### 3. 清理旧构建产物 + 旧依赖

```powershell
# 删除构建产物和依赖（含旧的 Linux 版 lock 文件）
Remove-Item -Recurse -Force release, dist, dist-electron, node_modules, package-lock.json -ErrorAction SilentlyContinue
```

### 4. 安装依赖

```powershell
npm install
```

> **注意**：不要在 WSL 和 Windows 之间共用 `node_modules` 和 `package-lock.json`。跨平台原生模块不兼容。如果之前在 WSL 中运行过 `npm install`，必须先执行上一步清理。

---

## 三、构建与打包

### 开发模式（热重载）

```powershell
npm run dev
```

### 仅构建（不打包）

```powershell
npx vite build
```

构建产物：
- `dist/` — React 前端 + 混淆 JS
- `dist-electron/main/main.js` — Electron 主进程 (混淆)
- `dist-electron/preload/preload.js` — 预加载脚本 (混淆)

### 打包为 EXE 安装包

```powershell
npx vite build; npx electron-builder --win
```

产物：`release/MeetLog Assistant Setup 1.0.0.exe`

> PowerShell 不支持 `&&`，多条命令用 `;` 分隔，且每条都需要 `npx` 前缀。

---

## 四、whisper.cpp 与 ffmpeg 配置

ASR 已从 `@xenova/transformers` 迁移到 **whisper.cpp + GGUF 模型**。

### 用户侧需要安装的工具

| 工具 | 下载地址 | 说明 |
|------|---------|------|
| **ffmpeg** | https://ffmpeg.org/download.html | 音频格式转换 |
| **whisper.cpp** | https://github.com/ggerganov/whisper.cpp/releases | 语音转写引擎 |

将 `ffmpeg.exe` 和 `whisper-cli.exe` 添加到系统 PATH，或放入 models 目录。

### 打包时内置工具（可选）

在 `package.json` 的 `extraResources` 中添加：

```json
"extraResources": [
  { "from": "./assets", "to": "assets" },
  { "from": "./tools/ffmpeg.exe", "to": "ffmpeg/ffmpeg.exe" },
  { "from": "./tools/whisper-cli.exe", "to": "whisper/whisper-cli.exe" }
]
```

---

## 五、常用命令速查

所有命令在 **Windows PowerShell** 中执行。

```
=== 环境 ===
npm config set registry https://registry.npmmirror.com   设置淘宝镜像
npm install                                               安装依赖

=== 清理 ===
Remove-Item -Recurse -Force release, dist, dist-electron -ErrorAction SilentlyContinue    清理构建产物
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue  完全重置依赖

=== 构建 ===
npx vite build                                            仅构建
npx vite build; npx electron-builder --win               构建 + 打包 EXE
npm run build:win                                         一键打包 (含 tsc 类型检查)

=== 调试 ===
npm run dev                                               开发模式 (热重载)
npx tsc --noEmit                                          TS 类型检查

=== WSL 同步 ===
rsync -av --delete --exclude='node_modules' --exclude='dist' --exclude='dist-electron' --exclude='release' /home/kyl/workspace/本地会议助手/meetlog-app/ /mnt/d/AI/meetlog-app/

=== 序列码 ===
npx ts-node scripts/generate-key.ts                       生成序列码 (开发者用)
```

---

## 六、项目架构

```
meetlog-app/
├── electron/                        # Electron 主进程
│   ├── main.ts                      # 主入口 + IPC 处理
│   ├── preload.ts                   # 预加载脚本
│   ├── db.ts                        # JSON 数据库
│   ├── license.ts                   # 序列码验证
│   ├── llm-service.ts               # LLM: llama.cpp + GGUF
│   ├── whisper-cpp-service.ts       # [新] ASR: whisper.cpp + GGUF
│   ├── audio-converter.ts           # [新] ffmpeg 音频转换
│   ├── download-manager.ts          # [新] 下载管理器
│   ├── transcriber-engine.ts        # 实时转写引擎
│   ├── audio-buffer.ts              # 音频缓冲
│   └── tray-manager.ts              # 系统托盘
├── src/                             # React 前端
│   ├── App.tsx                      # 路由 + 布局
│   ├── pages/
│   │   ├── Home.tsx                 # 首页 (录音 + 环境检查)
│   │   ├── Settings.tsx             # 设置 (模型下载 + 序列码)
│   │   └── MeetingDetail.tsx        # 会议详情
│   └── components/
│       ├── DownloadProgressModal.tsx # [新] 下载进度弹窗
│       ├── RecordingIndicator.tsx   # 录音指示条
│       └── TranscriptionPanel.tsx   # 实时转写面板
├── electron-obfuscator.ts           # [新] 代码混淆插件
├── scripts/generate-key.ts          # 序列码生成工具
├── package.json                     # 依赖 + 打包配置
├── vite.config.ts                   # 构建配置 (含混淆)
└── BUILD_AND_PACKAGE.md             # 本文件
```

---

## 七、新增功能 (2026-04-30)

| 功能 | 说明 |
|------|------|
| **应用内模型下载** | LLM + ASR 模型一键下载 (ModelScope 国内镜像)，进度/速度/ETA |
| **启动环境检查** | 首页检测 LLM/ASR 模型 + ffmpeg + whisper.cpp，缺失则禁用录音 |
| **whisper.cpp 引擎** | ASR 从 @xenova/transformers 迁移到 whisper.cpp + GGUF |
| **代码混淆** | 构建产物自动混淆，SECRET_KEY 等敏感字符串已隐藏 |
| **序列码联系** | 激活区显示联系邮箱 kyl2059@qq.com |

---

## 八、常见问题

### Q: `npm install` 报错 "Unsupported platform for @rollup/rollup-linux-x64-gnu"

`package-lock.json` 是从 Linux/WSL 带过来的，包含 Linux 专用包。解决方法：

```powershell
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm install
```

### Q: PowerShell 报 "标记 && 不是此版本中的有效语句分隔符"

PowerShell 用 `;` 代替 `&&`，且每个命令需要单独的 `npx` 前缀：

```powershell
npx vite build; npx electron-builder --win
```

### Q: 启动后首页显示"环境未就绪"

检查四项：LLM (.gguf)、ASR (ggml-*.bin)、ffmpeg、whisper.cpp。前往设置页下载/配置。

### Q: 语音转写失败

1. `ffmpeg -version` 确认已安装
2. `whisper-cli --help` 确认可用
3. 确认 whisper GGUF 模型 (.bin) 已下载到 models 目录
4. 查看设置页"语音转写模型"区域的工具状态指示灯

### Q: WSL 中改完代码后如何同步

```bash
# 在 WSL 终端执行
rsync -av --delete \
  --exclude='node_modules' --exclude='dist' --exclude='dist-electron' --exclude='release' \
  /home/kyl/workspace/本地会议助手/meetlog-app/ \
  /mnt/d/AI/meetlog-app/
```

同步后回到 Windows，删除旧 lock 文件再 `npm install`。
