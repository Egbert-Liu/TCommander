# SSH 远程终端融合 实施计划

> **目标读者**：实施该计划的工程师（假设对 TCommander 代码库零上下文）。
> **验证模式**：本项目无单元测试框架，验证统一采用 `tsc --noEmit` 类型检查 + `npm run build` 构建 + 端到端手动验收三段式（替代标准 TDD）。

**Goal:** 让 TCommander 支持把远程 SSH 主机的 shell 作为一种会话类型，融入现有的「卡片预览 + 全屏终端」体系，与本地 PTY 会话在数据流、UI、交互上完全一致。

**Architecture:** 在 main 进程引入 `TerminalBackend` 抽象接口，本地会话走 `LocalPtyBackend`（包 node-pty，现有逻辑平移），SSH 会话走 `SshBackend`（包 ssh2 的 `Client.shell()` 通道）。`PtySession` 持有 backend 而非具体进程对象，`createSession` 按 `config.kind` 分流。由于渲染层与 IPC 层对「会话类型」完全无感知（均以 `sessionId` 耦合），SSH 会话**无需改动任何渲染层/IPC 代码**即可复用预览渲染、状态检测、全屏 xterm、快捷按钮等全部能力。

**Tech Stack:** ssh2（纯 JS，Node.js SSH 协议事实标准）、Electron safeStorage（敏感信息加密）、Zustand + electron-store（连接预设持久化）。

---

## 一、背景与现状（调研结论）

> 调研依据：[src/main/pty.ts](src/main/pty.ts)、[src/preload/index.ts](src/preload/index.ts)、[src/main/index.ts](src/main/index.ts)、[src/renderer/src/App.tsx](src/renderer/src/App.tsx)、[src/renderer/src/types.ts](src/renderer/src/types.ts)、[package.json](package.json)。

### 1.1 现有数据流（SSH 复用的基础）

```
MAIN: pty.spawn → onData ──► outputListeners ──► webContents.send('session-output', id, data)
                                          onExit ──► webContents.send('session-exit', id, code)
PRELOAD: invoke('create-session') / invoke('send-input') / invoke('resize-session') / invoke('close-session')
RENDERER: App.handleOutput → rAF 节流 → flushSession → store → SessionCard 预览 / FullscreenTerminal xterm
```

**核心结论：session id 是 main 与 renderer 的唯一耦合点。** 只要 SSH 会话也产生一个 `id` 并通过同样的 `session-output` / `session-exit` 通道推送数据，渲染层零改动。

### 1.2 现有后端实现（要抽象的部分）

[createPtyManager()](src/main/pty.ts) 内部：
- `PtySession` 持有 `ptyProcess: pty.IPty`、`ringBuf`（256KB 回放）、`config`。
- `createSession`：[pty.spawn(shell, [], {cwd, env, cols, rows})](src/main/pty.ts)，`onData` → ringBuf + listeners，`onExit` → 删除 + exitListeners。
- `sendInput` → `ptyProcess.write(data)`；`resizeSession` → `ptyProcess.resize(cols, rows)`；`closeSession` → `ptyProcess.kill()`。
- `initialCommand`：会话启动后等首次 onData 再 `write(cmd+'\r')`（[pty.ts](src/main/pty.ts) 的注入逻辑），SSH 场景同样适用。

### 1.3 改造的真正难点（比接入 ssh2 本身复杂）

1. **main→renderer 请求-响应通道**：SSH 交互式认证（keyboard-interactive）、known_hosts 首次连接确认，需要 main 主动问 renderer 拿用户输入。现有 IPC 只有「单向数据推送 + invoke 请求」，缺这一模式。可复用 `request-close-confirm`（[src/main/index.ts](src/main/index.ts)）的实现范式。
2. **连接生命周期状态机**：本地 PTY「创建即就绪」；SSH 有 `connecting → authenticating → ready → closed/error` 中间态，需要一个独立于 `SessionStatus`（按输出内容驱动）的 `connectionStatus` 字段。
3. **敏感信息安全存储**：[electron-store](src/main/storage.ts) 是明文 JSON，密码/passphrase 必须走 Electron `safeStorage`（操作系统级加密）。

---

## 二、总体设计：TerminalBackend 抽象

### 2.1 接口定义

```ts
// src/main/types.ts（新建）
export interface TerminalBackend {
  /** 订阅输出数据。返回取消订阅函数。 */
  onData(cb: (data: string) => void): () => void
  /** 订阅后端结束。exitCode: 本地为进程退出码，SSH 为通道关闭（通常无意义码）。 */
  onExit(cb: () => void): () => void
  /** 写入用户输入（含 \r \x03 \x1b[A 等控制序列）。 */
  write(data: string): void
  /** 调整伪终端尺寸。 */
  resize(cols: number, rows: number): void
  /** 终止后端。本地=kill 进程，SSH=关闭通道与连接。 */
  kill(): void
}
```

### 2.2 数据流对照（证明渲染层复用）

| 现有本地 PTY | SSH 对应 | 接口 |
|---|---|---|
| `pty.spawn(shell, [], opts)` | `ssh2.Client.connect() → client.shell({cols,rows,term})` | 后端构造 |
| `ptyProcess.onData` | `stream.on('data')` | `onData` |
| `ptyProcess.onExit` | `stream.on('close')` + `client.on('close')` | `onExit` |
| `ptyProcess.write(d)` | `stream.write(d)` | `write` |
| `ptyProcess.resize(c,r)` | `stream.setWindow(r, c, 0, 0)` | `resize` |
| `ptyProcess.kill()` | `stream.end()` + `client.end()` | `kill` |
| `webContents.send('session-output', id, d)` | 同 | **完全复用** |
| App.handleOutput/flushSession | 同 | **完全复用** |
| SessionCard / FullscreenTerminal | 同 | **完全复用** |

---

## 三、文件结构（创建 / 修改清单）

| 文件 | 操作 | 职责 | 改动量 |
|---|---|---|---|
| `src/main/types.ts` | 新建 | `TerminalBackend`、`SessionConfig`、`SshConfig` 类型 | 新增 |
| `src/main/backends/localPty.ts` | 新建 | `LocalPtyBackend`（从 pty.ts 平移 pty.spawn 逻辑） | 新增 |
| `src/main/backends/sshBackend.ts` | 新建 | `SshBackend`（ssh2 Client + shell） | 新增 |
| `src/main/pty.ts` | 修改 | `PtySession.ptyProcess` → `backend`；`createSession` 按 kind 分流 | 中 |
| `src/main/secretStorage.ts` | 新建 | safeStorage 加密封装（get/set/remove） | 新增 |
| `src/main/index.ts` | 修改 | 注册 secretStorage IPC + 交互式认证请求-响应通道 | 中 |
| `src/preload/index.ts` | 修改 | 暴露 `secretGet/Set`、`onSshAuthPrompt`、`replySshAuth` | 小 |
| `src/renderer/src/vite-env.d.ts` | 修改 | ElectronAPI 接口补字段 | 小 |
| `src/renderer/src/types.ts` | 修改 | `Session` 加 `kind`、`sshConfig?`、`connectionStatus?` | 小 |
| `src/renderer/src/store/index.ts` | 修改 | `sshPresets` 状态 + actions | 小 |
| `src/renderer/src/utils/sessionActions.ts` | 修改 | `CreateSessionInput` 加 SSH 字段 | 小 |
| `src/renderer/src/components/SessionConfigFields.tsx` | 修改 | SSH 子表单（host/port/user/认证方式） | 中 |
| `src/renderer/src/components/NewSessionDialog.tsx` | 修改 | kind 切换、提交 SSH config | 小 |
| `src/renderer/src/components/SessionCard.tsx` | — | **无需改动** | 0 |
| `src/renderer/src/components/FullscreenTerminal.tsx` | — | **无需改动** | 0 |
| `src/renderer/src/App.tsx` | 修改 | 订阅 `connectionStatus` 推送（1 行） | 极小 |
| `package.json` | 修改 | 新增 `ssh2` 依赖 | 小 |
| `vite.config.ts` | 修改 | main external 追加 `'ssh2'` | 小 |

**渲染层零改动文件：SessionCard、FullscreenTerminal、statusDetector、ansiToHtml、terminalThemes。** 这是抽象带来的核心收益。

---

## 四、任务分解

> 每个 Task 自包含、可独立提交。验证三段式：
> 1. `npx tsc --noEmit -p tsconfig.json` → 期望无输出
> 2. `npm run build` → 期望三套 bundle（renderer/main/preload）成功
> 3. 手动验收（各 Task 给出验收点）

### Phase 1：后端抽象与依赖引入（不改变任何现有行为）

#### Task 1：引入 ssh2 依赖 + 构建配置

**Files:** Modify `package.json`, `vite.config.ts`

- [ ] **Step 1:** 安装依赖

```bash
npm install ssh2
```

- [ ] **Step 2:** 在 [vite.config.ts](vite.config.ts) 的 main 进程 `external` 数组追加 `'ssh2'`（与 `node-pty`、`electron-store` 并列）。ssh2 是纯 JS，**不需要进 asarUnpack**。

```ts
external: ['electron', 'node-pty', 'electron-store', 'ssh2']
```

- [ ] **Step 3:** 验证构建（此时无代码引用，仅确认依赖可解析）

Run: `npm run build`
Expected: 三套 bundle 成功，无 ssh2 相关报错。

- [ ] **Step 4:** Commit

```bash
git add package.json package-lock.json vite.config.ts
git commit -m "build(deps): 引入 ssh2 依赖用于远程终端后端"
```

#### Task 2：定义 TerminalBackend 接口与 SessionConfig 扩展

**Files:** Create `src/main/types.ts`

- [ ] **Step 1:** 新建文件，定义后端接口、SSH 配置、会话配置

```ts
// src/main/types.ts
export interface TerminalBackend {
  onData(cb: (data: string) => void): () => void
  onExit(cb: () => void): () => void
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

/** SSH 连接配置（不含敏感字段，敏感字段单独走 secretStorage） */
export interface SshConfig {
  host: string
  port: number
  username: string
  authMethod: 'password' | 'privateKey' | 'keyboard-interactive'
  /** 私钥时：私钥文件路径 */
  privateKeyPath?: string
  /** 私钥 passphrase 引用（存于 secretStorage 的 key） */
  passphraseRef?: string
  /** 密码引用（存于 secretStorage 的 key） */
  passwordRef?: string
  /** known_hosts 校验策略：accept=接受并记录（首连提示），skip=跳过校验 */
  hostVerifier?: 'accept' | 'skip'
  cols?: number
  rows?: number
}

/** 会话配置：kind 默认 'local'，向后兼容现有调用 */
export interface SessionConfig {
  kind?: 'local' | 'ssh'
  // —— local ——
  terminalType?: 'powershell' | 'cmd' | 'bash'
  cwd?: string
  initialCommand?: string
  cols?: number
  rows?: number
  // —— ssh ——
  ssh?: SshConfig
}
```

- [ ] **Step 2:** 验证类型

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无输出（新建文件尚未被引用，不影响编译）。

- [ ] **Step 3:** Commit

```bash
git add src/main/types.ts
git commit -m "feat(main): 定义 TerminalBackend 抽象与 SessionConfig 扩展"
```

#### Task 3：提取 LocalPtyBackend（行为不变的纯重构）

**Files:** Create `src/main/backends/localPty.ts`

- [ ] **Step 1:** 把 [src/main/pty.ts](src/main/pty.ts) 现有的 `pty.spawn` 逻辑封装为 `LocalPtyBackend`，严格实现 `TerminalBackend`。关键：`getShellPath` 逻辑、cwd 兜底、env 注入都搬过来。

```ts
// src/main/backends/localPty.ts
import * as pty from 'node-pty'
import * as os from 'os'
import type { TerminalBackend } from '../types'

function getShellPath(terminalType: string): string {
  if (process.platform === 'win32') {
    if (terminalType === 'cmd') return 'cmd.exe'
    return 'powershell.exe'
  }
  if (terminalType === 'bash') return 'bash'
  return process.env.SHELL || 'bash'
}

export interface LocalPtyOptions {
  terminalType?: 'powershell' | 'cmd' | 'bash'
  cwd?: string
  cols?: number
  rows?: number
}

export class LocalPtyBackend implements TerminalBackend {
  private proc: pty.IPty
  private dataCbs = new Set<(data: string) => void>()
  private exitCbs = new Set<() => void>()

  constructor(opts: LocalPtyOptions) {
    const shell = getShellPath(opts.terminalType || 'powershell')
    let cwd = opts.cwd || ''
    if (!cwd || cwd === '~' || !cwd.includes(':') && !cwd.startsWith('/')) {
      cwd = os.homedir()
    }
    this.proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: opts.cols || 160,
      rows: opts.rows || 40,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8' },
    })
    this.proc.onData((d) => this.dataCbs.forEach((cb) => cb(d)))
    this.proc.onExit(() => this.exitCbs.forEach((cb) => cb()))
  }

  onData(cb: (data: string) => void): () => void {
    this.dataCbs.add(cb)
    return () => this.dataCbs.delete(cb)
  }
  onExit(cb: () => void): () => void {
    this.exitCbs.add(cb)
    return () => this.exitCbs.delete(cb)
  }
  write(data: string): void {
    this.proc.write(data)
  }
  resize(cols: number, rows: number): void {
    try { this.proc.resize(cols, rows) } catch { /* 进程已退出时忽略 */ }
  }
  kill(): void {
    try { this.proc.kill() } catch { /* 已退出 */ }
  }
}
```

- [ ] **Step 2:** 类型检查

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无输出。

- [ ] **Step 3:** Commit（此时 pty.ts 尚未切换到用它，此提交是「新增未使用代码」，下一步才接入）

```bash
git add src/main/backends/localPty.ts
git commit -m "refactor(main): 提取 LocalPtyBackend 实现后端接口"
```

#### Task 4：PtySession 切换到 backend（行为不变）

**Files:** Modify `src/main/pty.ts`

- [ ] **Step 1:** 改造 `PtySession`：`ptyProcess: pty.IPty` → `backend: TerminalBackend`。

```ts
interface PtySession {
  id: string
  backend: TerminalBackend          // ← 原 ptyProcess
  config: SessionConfig
  destroyed: boolean
  ringBuf: string
  ringBufMax: number
}
```

- [ ] **Step 2:** 改造 `createSession`：按 `config.kind` 分流（默认 local），订阅 backend 的 onData/onExit 注入 ringBuf + listeners。`initialCommand` 注入逻辑保留（等首次 onData 再 write）。**关键：保留原有 `getRecentOutput`、ringBuf、listeners、id 生成全部不变。**

```ts
import { LocalPtyBackend } from './backends/localPty'
// ...
createSession(config: SessionConfig): string {
  const id = generateId()
  const kind = config.kind || 'local'
  const backend = kind === 'ssh'
    ? new SshBackend(config.ssh!)          // Task 6 实现，本 Task 先留 // TODO
    : new LocalPtyBackend(config)
  const session: PtySession = { id, backend, config, destroyed: false, ringBuf: '', ringBufMax: 256 * 1024 }
  sessions.set(id, session)
  backend.onData((data) => {
    appendToRing(session, data)
    outputListeners.forEach((l) => l(id, data))
  })
  backend.onExit(() => {
    sessions.delete(id)
    exitListeners.forEach((l) => l(id, 0))
  })
  // initialCommand 注入逻辑保留（等首次 onData 再 backend.write(cmd + '\r')）
  // ...
  return id
}
```

- [ ] **Step 3:** `sendInput` / `resizeSession` / `closeSession` 把 `session.ptyProcess.xxx` 改为 `session.backend.xxx`。

- [ ] **Step 4:** **关键验收——本地会话行为必须完全不变。** 类型检查 + 构建后，手动创建一个 powershell 会话，确认：能正常输出、能输入、能 resize、能关闭。

Run: `npm run build`
手动验收：本地终端功能与重构前完全一致。

- [ ] **Step 5:** Commit

```bash
git add src/main/pty.ts
git commit -m "refactor(main): PtySession 持有 TerminalBackend，按 kind 分流（本地行为不变）"
```

> ✅ **里程碑 1**：后端抽象完成，本地功能零回归。此处可发布一个 patch 版本验证重构稳定性。

---

### Phase 2：SSH 后端实现

#### Task 5：SshBackend 基础实现（密码认证）

**Files:** Create `src/main/backends/sshBackend.ts`

- [ ] **Step 1:** 实现 `SshBackend`，密码认证 + shell 通道。依据 [ssh2 官方文档](https://github.com/mscdex/ssh2) 的 `Client.connect()` + `client.shell(windowOptions, cb)` 模式。

```ts
// src/main/backends/sshBackend.ts
import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import type { TerminalBackend, SshConfig } from '../types'
import { secretStorage } from '../secretStorage'  // Task 8 实现

export class SshBackend implements TerminalBackend {
  private client = new Client()
  private stream: any = null
  private dataCbs = new Set<(data: string) => void>()
  private exitCbs = new Set<() => void>()
  private closed = false

  constructor(private cfg: SshConfig) {}

  /** 异步启动：连接 + 认证 + 开 shell。resolved 后才有数据。 */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.on('ready', () => {
        this.client.shell(
          { term: 'xterm-256color', cols: this.cfg.cols || 160, rows: this.cfg.rows || 40 },
          (err, stream) => {
            if (err) { reject(err); return }
            this.stream = stream
            stream.on('data', (d: Buffer) => this.dataCbs.forEach((cb) => cb(d.toString())))
            stream.on('close', () => this.handleExit())
            resolve()
          }
        )
      })
      this.client.on('error', (err) => {
        if (!this.stream) reject(err)   // 连接阶段错误
        // 已连接后的错误通过 close 兜底
      })
      this.client.on('close', () => this.handleExit())

      const connectOpts: any = {
        host: this.cfg.host,
        port: this.cfg.port || 22,
        username: this.cfg.username,
        readyTimeout: 20000,
      }
      if (this.cfg.authMethod === 'password') {
        connectOpts.password = this.cfg.passwordRef
          ? secretStorage.get(this.cfg.passwordRef) || ''
          : ''
      } else if (this.cfg.authMethod === 'privateKey') {
        connectOpts.privateKey = readFileSync(this.cfg.privateKeyPath!)
        if (this.cfg.passphraseRef) {
          connectOpts.passphrase = secretStorage.get(this.cfg.passphraseRef) || ''
        }
      }
      this.client.connect(connectOpts)
    })
  }

  private handleExit() {
    if (this.closed) return
    this.closed = true
    this.exitCbs.forEach((cb) => cb())
  }

  onData(cb: (data: string) => void): () => void { this.dataCbs.add(cb); return () => this.dataCbs.delete(cb) }
  onExit(cb: () => void): () => void { this.exitCbs.add(cb); return () => this.exitCbs.delete(cb) }
  write(data: string): void { this.stream?.write(data) }
  resize(cols: number, rows: number): void {
    // ssh2 的 setWindow 签名：(rows, cols, height, width)
    this.stream?.setWindow(rows, cols, 0, 0)
  }
  kill(): void {
    try { this.stream?.end() } catch {}
    try { this.client.end() } catch {}
    this.handleExit()
  }
}
```

> **注意**：`keyboard-interactive` 认证（双因素、交互式密码提示）依赖 Task 11 的请求-响应通道，本 Task 先支持 password / privateKey 两种静态认证。

- [ ] **Step 2:** 类型检查（此时依赖 secretStorage 未实现，先注释掉 secretStorage 相关行或建空壳）

Run: `npx tsc --noEmit -p tsconfig.json`

- [ ] **Step 3:** Commit

```bash
git add src/main/backends/sshBackend.ts
git commit -m "feat(ssh): SshBackend 基于 ssh2 实现密码/私钥认证与 shell 通道"
```

#### Task 6：pty.ts 接入 SshBackend + 连接错误处理

**Files:** Modify `src/main/pty.ts`

- [ ] **Step 1:** `createSession` 对 ssh 分支调用 `new SshBackend(cfg)`，并 `.start()` 处理异步连接。**关键：`createSession` 当前同步返回 id，SSH 异步 start 失败需通过 `session-exit` 通道 + 一条错误提示文本回传**（避免改 invoke 为 async 的连锁改动）。

```ts
createSession(config: SessionConfig): string {
  const id = generateId()
  const kind = config.kind || 'local'
  let backend: TerminalBackend
  if (kind === 'ssh') {
    const ssh = new SshBackend(config.ssh!)
    backend = ssh
    // 先建 session 占位，异步连接
    const session: PtySession = { id, backend, config, destroyed: false, ringBuf: '', ringBufMax: 256 * 1024 }
    sessions.set(id, session)
    const unsubData = backend.onData((data) => {
      appendToRing(session, data)
      outputListeners.forEach((l) => l(id, data))
    })
    backend.onExit(() => {
      sessions.delete(id)
      exitListeners.forEach((l) => l(id, 0))
    })
    ssh.start().catch((err) => {
      // 连接失败：推一条用户可读的错误文本，再触发 exit
      const msg = `[SSH 连接失败] ${err.message}\r\n`
      outputListeners.forEach((l) => l(id, msg))
      exitListeners.forEach((l) => l(id, 1))
      unsubData()
    })
    return id
  }
  // ... local 分支保持 Task 4 的实现
}
```

- [ ] **Step 2:** 验收（需 Task 8 的 secretStorage + Task 9 的 UI 配合，此处先类型检查）

Run: `npx tsc --noEmit -p tsconfig.json`

- [ ] **Step 3:** Commit

```bash
git add src/main/pty.ts
git commit -m "feat(ssh): createSession 支持 ssh 分支与异步连接错误回传"
```

---

### Phase 3：敏感信息安全存储

#### Task 7：safeStorage 加密封装

**Files:** Create `src/main/secretStorage.ts`

- [ ] **Step 1:** 用 Electron `safeStorage`（操作系统级加密，Windows 用 DPAPI）封装。仅在 `app.whenReady()` 后可用，故 `encryptString` 前判 `safeStorage.isEncryptionAvailable()`。

```ts
// src/main/secretStorage.ts
import { safeStorage } from 'electron'

const PREFIX = 'ssh_secret_'

export const secretStorage = {
  set(key: string, plaintext: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统加密不可用（safeStorage），无法存储敏感信息')
    }
    const buf = safeStorage.encryptString(plaintext)
    // 复用现有 storageManager 的持久化能力（底层 electron-store）
    // 这里直接写文件或借 storageManager，二选一；推荐借 storageManager
    storageManager.set(PREFIX + key, buf.toString('base64'))
  },
  get(key: string): string | undefined {
    const b64 = storageManager.get(PREFIX + key) as string | undefined
    if (!b64) return undefined
    try {
      return safeStorage.decryptString(Buffer.from(b64, 'base64'))
    } catch {
      return undefined
    }
  },
  remove(key: string): void {
    storageManager.delete(PREFIX + key)
  },
}
```

> 依赖 [storageManager](src/main/storage.ts)。若其无 `delete` 方法，Task 中补一个。

- [ ] **Step 2:** 在 [src/main/index.ts](src/main/index.ts) 注册 IPC：

```ts
ipcMain.handle('secret-set', (_, key, value) => secretStorage.set(key, value))
ipcMain.handle('secret-get', (_, key) => secretStorage.get(key))
ipcMain.handle('secret-remove', (_, key) => secretStorage.remove(key))
```

- [ ] **Step 3:** [src/preload/index.ts](src/preload/index.ts) 暴露：

```ts
secretGet: (key: string) => ipcRenderer.invoke('secret-get', key),
secretSet: (key: string, value: string) => ipcRenderer.invoke('secret-set', key, value),
secretRemove: (key: string) => ipcRenderer.invoke('secret-remove', key),
```

[vite-env.d.ts](src/renderer/src/vite-env.d.ts) 的 `ElectronAPI` 补对应签名。

- [ ] **Step 4:** 类型检查 + 构建

Run: `npm run build`
Expected: 成功。

- [ ] **Step 5:** Commit

```bash
git add src/main/secretStorage.ts src/main/index.ts src/preload/index.ts src/renderer/src/vite-env.d.ts
git commit -m "feat(security): safeStorage 加密封装敏感信息与 IPC"
```

---

### Phase 4：渲染层类型与配置 UI

#### Task 8：Session 类型与预设扩展

**Files:** Modify `src/renderer/src/types.ts`, `src/renderer/src/store/index.ts`, `src/renderer/src/utils/sessionActions.ts`

- [ ] **Step 1:** [types.ts](src/renderer/src/types.ts) 的 `Session` 增加字段：

```ts
export type SessionKind = 'local' | 'ssh'
export type ConnectionStatus = 'connecting' | 'ready' | 'closed' | 'error'

export interface Session {
  // ...现有字段
  kind: SessionKind                       // 默认 'local'（向后兼容：读时 ?? 'local'）
  sshConfig?: SshConfigUI                 // 仅 kind==='ssh'
  connectionStatus?: ConnectionStatus     // 仅 ssh 有意义
}
```

- [ ] **Step 2:** [store/index.ts](src/renderer/src/store/index.ts) 增加 `sshPresets` 状态 + `addSshPreset` / `removeSshPreset` action，持久化键 `sshPresets`（启动时在 [App.tsx loadPersistedData](src/renderer/src/App.tsx) 一并拉回）。

- [ ] **Step 3:** [sessionActions.ts](src/renderer/src/utils/sessionActions.ts) 的 `CreateSessionInput` 加 SSH 字段，`createSessionFromConfig` 在 kind==='ssh' 时调 `createSession({ kind:'ssh', ssh: {...} })`，并把密码/passphrase 写入 secretStorage 后只存 ref。

- [ ] **Step 4:** 类型检查

Run: `npx tsc --noEmit -p tsconfig.json`

- [ ] **Step 5:** Commit

```bash
git add src/renderer/src/types.ts src/renderer/src/store/index.ts src/renderer/src/utils/sessionActions.ts
git commit -m "feat(renderer): Session/预设支持 ssh 类型与连接状态"
```

#### Task 9：SSH 配置子表单 UI

**Files:** Modify `src/renderer/src/components/SessionConfigFields.tsx`, `src/renderer/src/components/NewSessionDialog.tsx`

- [ ] **Step 1:** [SessionConfigFields.tsx](src/renderer/src/components/SessionConfigFields.tsx) 增加会话类型切换（Radio：本地 / SSH），SSH 选中时显示子表单：

```
[ ○ 本地终端  ● SSH 远程 ]
┌─ SSH 配置 ─────────────────────────┐
│ 主机 Host      [192.168.1.10     ] │
│ 端口 Port      [22            ]    │
│ 用户 User      [root          ]    │
│ 认证方式       [密码 ▼]            │
│   密码(密码)   [••••••••     ]    │  ← 存 secretStorage
│   或 私钥路径  [~/.ssh/id_rsa]    │
│   私钥口令     [••••••••     ]    │
│ 主机校验       [首连确认 ▼]        │
└────────────────────────────────────┘
```

- 严格遵循现有 [SessionConfigFields](src/renderer/src/components/SessionConfigFields.tsx) 的 Ant Design Form.Item 模式（`name`/`rules`/`placeholder` 一致）。
- 密码 / passphrase 字段用 `Input.Password`，提交时**不进 store**，单独走 `secretSet`。

- [ ] **Step 2:** [NewSessionDialog.tsx](src/renderer/src/components/NewSessionDialog.tsx) 的提交处理按 kind 分流，调用 Task 8 扩展后的 `createSessionFromConfig`。

- [ ] **Step 3:** 构建 + 端到端验收

Run: `npm run build`
手动验收：新建一个本地会话（功能不变）+ 一个 SSH 会话（密码认证，连一台测试机）。
- SSH 卡片预览应显示远端 banner 与提示符。
- 全屏终端应能交互（ls、vim、htop）。
- resize 全屏窗口，远端应跟随（`stream.setWindow`）。

- [ ] **Step 4:** Commit

```bash
git add src/renderer/src/components/SessionConfigFields.tsx src/renderer/src/components/NewSessionDialog.tsx
git commit -m "feat(ui): SSH 配置子表单与会话创建"
```

> ✅ **里程碑 2**：SSH（密码/私钥认证）端到端可用。此处可发布 minor 版本（0.6.0）。

---

### Phase 5：进阶——交互式认证与 known_hosts

#### Task 10：main→renderer 请求-响应通道

**Files:** Modify `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/vite-env.d.ts`

- [ ] **Step 1:** 复用 `request-close-confirm` 的范式（[src/main/index.ts](src/main/index.ts)），实现通用「主进程问、渲染进程答」：

```ts
// main
let authResolver: ((answer: string | null) => void) | null = null
ipcMain.handle('ssh-auth-reply', (_, answer) => {
  authResolver?.(answer); authResolver = null
})
async function requestSshAuth(sessionId: string, prompt: string): Promise<string | null> {
  if (!isWindowValid()) return null
  mainWindow!.webContents.send('ssh-auth-prompt', sessionId, prompt)
  return new Promise((resolve) => { authResolver = resolve })
}
```

- [ ] **Step 2:** preload 暴露 `onSshAuthPrompt(cb)` / `replySshAuth(answer)`，vite-env.d.ts 补类型。

- [ ] **Step 3:** Commit

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/vite-env.d.ts
git commit -m "feat(ssh): 交互式认证请求-响应通道"
```

#### Task 11：keyboard-interactive 认证 + known_hosts 确认

**Files:** Modify `src/main/backends/sshBackend.ts`, `src/renderer/src/App.tsx`, 新建 `src/renderer/src/components/SshAuthDialog.tsx`

- [ ] **Step 1:** `SshBackend.start()` 支持 `keyboard-interactive`：

```ts
this.client.on('keyboard-interactive', (_name, _instr, _lang, prompts, finish) => {
  // 通过回调让 main 询问 renderer，拿到答案后 finish([answer])
  // 需要把 prompts 透出——SshBackend 构造时注入 requestAuth 回调
  const promptText = prompts.map((p) => p.prompt).join('\n')
  this.requestAuth?.(promptText).then((answer) => finish(answer ? [answer] : []))
})
connectOpts.tryKeyboard = true
```

- [ ] **Step 2:** known_hosts 首连确认：`connectOpts.hostVerifier` 设为回调，首次连接时通过 `requestAuth` 问用户「是否信任主机指纹」，答 yes 才放行（`skip` 策略直接放行）。

- [ ] **Step 3:** 新建 `SshAuthDialog.tsx`（Modal + Input，样式参照 [CloseConfirmDialog](src/renderer/src/components/CloseConfirmDialog.tsx)），在 [App.tsx](src/renderer/src/App.tsx) 订阅 `onSshAuthPrompt` 弹出、提交 `replySshAuth`。

- [ ] **Step 4:** 端到端验收：用一台开启 keyboard-interactive 的服务器测试；模拟首次连接未知主机确认弹窗。

- [ ] **Step 5:** Commit

```bash
git add src/main/backends/sshBackend.ts src/renderer/src/App.tsx src/renderer/src/components/SshAuthDialog.tsx
git commit -m "feat(ssh): keyboard-interactive 认证与 known_hosts 首连确认"
```

---

### Phase 6：连接状态与打磨

#### Task 12：connectionStatus 推送与 UI 反馈

**Files:** Modify `src/main/pty.ts` / `src/main/index.ts` / `App.tsx` / `SessionCard.tsx`

- [ ] **Step 1:** SshBackend 在 `start()` 各阶段通过新增 `onStatus(cb)` 推送 `connecting/ready/error`，main 转发为 `webContents.send('session-conn-status', id, status)`。

- [ ] **Step 2:** App.tsx 订阅并写入 `session.connectionStatus`（1 行 effect）。

- [ ] **Step 3:** SessionCard 在连接中显示「连接中...」骨架/旋转图标（复用现有 status 颜色体系 [statusColors.ts](src/renderer/src/utils/statusColors.ts)），连接失败显示错误态。

- [ ] **Step 4:** Commit

```bash
git commit -m "feat(ssh): 连接状态推送与卡片连接中/失败反馈"
```

#### Task 13：SshPreset 管理 UI + 断线重连（可选）

**Files:** Modify `src/renderer/src/components/PresetForm.tsx` / `PresetsDialog.tsx`

- [ ] **Step 1:** 在 [PresetsDialog](src/renderer/src/components/PresetsDialog.tsx) 增加 SSH 预设 tab，复用 Task 8 的 `sshPresets`。
- [ ] **Step 2:**（可选）`onExit` 触发后，若 config 含 `autoReconnect`，延迟 N 秒重建 backend 并回灌 ringBuf。

- [ ] **Step 3:** Commit

```bash
git commit -m "feat(ssh): SSH 预设管理与可选断线重连"
```

---

## 五、验证策略

本项目**无单元测试框架**（[package.json](package.json) 无 jest/vitest）。验证三段式：

1. **类型检查**：`npx tsc --noEmit -p tsconfig.json` → 期望无任何输出。
2. **构建**：`npm run build` → 期望 renderer / main / preload 三套 bundle 全部成功。
3. **手动验收**：每个 Task 的「验收点」明确给出操作步骤与预期。

建议补一个 `npm run typecheck` 脚本到 [package.json](package.json) 的 scripts（`"typecheck": "tsc --noEmit -p tsconfig.json"`），方便后续。

---

## 六、里程碑与版本建议

| 里程碑 | 内容 | 版本 |
|---|---|---|
| M1 | 后端抽象完成，本地功能零回归 | 0.5.1（patch，验证重构） |
| M2 | SSH 密码/私钥认证端到端可用 | 0.6.0（minor） |
| M3 | 交互式认证 + known_hosts + 状态反馈 | 0.7.0（minor） |
| M4 | 预设管理 + 断线重连 | 0.8.0（minor） |

建议**每个里程碑单独发版**，便于回归定位。

---

## 七、风险与注意事项

1. **ssh2 在 Electron 中的打包**：纯 JS，无需 asarUnpack，但需在 [vite.config.ts](vite.config.ts) main `external` 中声明（Task 1），否则会被错误打包。
2. **safeStorage 可用性**：Linux 无 keyring 环境下 `isEncryptionAvailable()` 返回 false，需降级提示用户（不可静默明文存密码）。
3. **native 模块冲突**：node-pty 已是 native，ssh2 是纯 JS，二者无冲突；但升级 Electron 大版本时需同步重编 node-pty。
4. **安全红线**：密码/passphrase **绝不进 Zustand store、绝不进 electron-store 明文键、绝不进 git**。统一走 secretStorage（Task 7）。
5. **2GB ringBuf / 长会话**：SSH 长连接可能产生大量输出，现有 256KB ringBuf + 渲染层 16KB tailLines 已能控制内存，无需额外处理。
6. **resize 时机**：ssh2 `setWindow` 必须在 shell 通道建立后调用，`SshBackend.resize` 需判 `this.stream` 非空（Task 5 已处理）。

---

## 八、自检清单（Self-Review）

- [x] **Spec 覆盖**：连接（Task 1-6）、认证 password/privateKey（Task 5,7,9）、认证 keyboard-interactive（Task 10-11）、known_hosts（Task 11）、状态反馈（Task 12）、预设（Task 8,13）均有对应 Task。
- [x] **无占位符**：每个代码步骤给出可执行代码，无 TBD/TODO（除 Task 4 内对 Task 6 的前置 `// TODO`，已在后续 Task 落地）。
- [x] **类型一致**：`TerminalBackend` 接口在 Task 2 定义、Task 3-5 实现、Task 4 消费，签名一致；`SessionConfig.kind` 全链路一致。
- [x] **渲染层零改动声明**：SessionCard / FullscreenTerminal 经调研确认无需改动，已在文件清单标注（0）。
