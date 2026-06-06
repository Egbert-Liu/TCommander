# Client Manager

多终端会话管理桌面应用，专为统一管理 AI Client（如 Clock Code、Codex 等）而设计。基于 Electron + React + Vite 构建，提供状态感知、快捷操作、快照恢复等能力。

## 功能特性

- **多会话管理** - 同时管理多个终端会话，卡片式实时预览
- **状态感知引擎** - 自动检测终端状态（需确认 / 待输入 / 错误 / 运行中 / 空闲）
- **快捷操作** - 一键确认(Y)/拒绝(N)、快速输入命令
- **全屏终端** - 基于 xterm.js 的完整终端视图，支持 ESC 退出
- **分组管理** - 自定义分组，16色色板选择，颜色标记筛选
- **预设系统** - 创建预设模板，新建会话时一键填充配置，支持保存为预设
- **快照管理** - 一键保存/恢复工作环境
- **深色主题** - Cyber-Terminal 深色科技风 UI
- **跨平台** - 支持 Windows / macOS / Linux

## 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | Electron 29 |
| UI 框架 | React 18 |
| 构建工具 | Vite 5 |
| 终端渲染 | @xterm/xterm + node-pty |
| UI 组件库 | Ant Design 5 |
| 状态管理 | Zustand |
| 样式方案 | TailwindCSS 3 |
| 语言 | TypeScript 5 |
| 持久化 | electron-store |

## 环境要求

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **操作系统**: Windows 10+ / macOS 12+ / Linux (glibc 2.31+)

> Windows 下 node-pty 编译需要 Visual Studio Build Tools（通常随 `npm install` 自动安装）

## 安装

```bash
# 克隆项目
git clone <repository-url>
cd cli_manager

# 安装依赖（使用国内镜像加速）
npm install

# 如果 Electron 下载超时，项目已配置 .npmrc 镜像源
# 也可手动指定：
npm install --registry=https://registry.npmmirror.com
```

## 开发

```bash
# 启动开发模式（Vite + Electron 热重载）
npm run dev
```

启动后 Electron 窗口会自动打开，修改代码后渲染进程自动热更新。

## 构建

```bash
# 仅构建（不打包安装程序）
npm run build

# 打包当前平台的安装程序
npm run dist

# 按平台打包
npm run dist:win    # Windows NSIS 安装包 (.exe)
npm run dist:mac    # macOS DMG 安装包
npm run dist:linux  # Linux AppImage + DEB

# 仅打包目录（不生成安装程序，用于测试）
npm run pack
```

构建产物输出到 `release/` 目录。

### 图标配置

打包前将应用图标放入 `build/` 目录：

| 平台 | 文件 | 格式 |
|------|------|------|
| Windows | `build/icon.ico` | ICO (256x256) |
| macOS | `build/icon.icns` | ICNS (512x512) |
| Linux | `build/icon.png` | PNG (512x512) |

> 缺少图标时 electron-builder 会使用默认图标。

## 项目结构

```
cli_manager/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 主进程入口，窗口创建与 IPC 注册
│   │   ├── pty.ts               # PTY 进程管理（创建/输入/关闭/调整）
│   │   └── storage.ts           # 持久化存储（electron-store 封装）
│   ├── preload/                 # 预加载脚本
│   │   └── index.ts             # contextBridge 暴露 API 给渲染进程
│   └── renderer/                # Electron 渲染进程（React 应用）
│       └── src/
│           ├── components/      # UI 组件
│           │   ├── Toolbar.tsx          # 顶部工具栏
│           │   ├── Sidebar.tsx          # 左侧分组边栏
│           │   ├── SessionCard.tsx      # 会话卡片
│           │   ├── FullscreenTerminal.tsx # 全屏终端
│           │   ├── NewSessionDialog.tsx  # 新建会话对话框
│           │   ├── PresetsDialog.tsx     # 预设管理对话框
│           │   └── PresetForm.tsx        # 预设编辑表单
│           ├── store/
│           │   └── index.ts     # Zustand 全局状态
│           ├── utils/
│           │   └── statusDetector.ts  # 状态感知引擎
│           ├── types.ts         # TypeScript 类型定义
│           ├── App.tsx          # 应用根组件
│           ├── main.tsx         # React 入口
│           └── index.css        # 全局样式 + Ant Design 主题覆盖
├── build/                       # 应用图标资源
├── index.html                   # HTML 入口
├── package.json                 # 项目配置 + electron-builder 配置
├── vite.config.ts               # Vite + Electron 插件配置
├── tailwind.config.js           # TailwindCSS 配置
├── tsconfig.json                # TypeScript 配置
└── .npmrc                       # npm 镜像源配置
```

## 使用说明

### 新建会话

1. 点击工具栏「新建会话」按钮
2. 填写会话名称、终端类型、工作目录、初始命令
3. 可从已有预设中选择，自动填充配置
4. 勾选「保存为预设」可将当前配置保存为预设模板
5. 点击「创建」

### 会话操作

- **全屏** - 点击卡片右上角展开按钮，进入全屏终端模式（ESC 退出）
- **快捷确认** - 当状态为「需确认」时，点击 Y/N 按钮快速响应
- **快速输入** - 点击卡片底部「> 点击输入...」输入命令
- **关闭** - 点击删除按钮关闭会话

### 分组管理

1. 在左侧边栏点击「添加分组」
2. 输入分组名称，点击色块选择颜色
3. 点击分组名称筛选对应会话

### 预设管理

1. 点击工具栏「更多」→「预设管理」
2. 新建/编辑/删除预设模板
3. 新建会话时从预设列表选择即可快速填充

### 快照

- 点击工具栏「更多」→「保存快照」保存当前所有会话和分组状态

## IPC 通信

| 通道 | 方向 | 说明 |
|------|------|------|
| `create-session` | 渲染→主 | 创建 PTY 会话 |
| `send-input` | 渲染→主 | 向会话发送输入 |
| `close-session` | 渲染→主 | 关闭会话 |
| `resize-session` | 渲染→主 | 调整终端尺寸 |
| `storage-get` | 渲染→主 | 读取持久化数据 |
| `storage-set` | 渲染→主 | 写入持久化数据 |
| `session-output` | 主→渲染 | 终端输出数据 |
| `session-exit` | 主→渲染 | 会话退出通知 |

## License

MIT
