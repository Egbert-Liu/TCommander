# Hook 接口方案：精确状态触发机制

## 一、问题分析

### 1.1 当前状态检测机制的局限性

**现有方案**：基于正则表达式匹配终端输出
- 位置：`src/renderer/src/utils/statusDetector.ts`
- 触发时机：每次终端输出后（`flushSession` 中调用 `detectStatusWithRules`）
- 规则类型：contains / equals / regex / startsWith / endsWith

**典型误匹配场景**：

1. **日志中的 "error" 关键字**
   ```
   [INFO] Processing request...
   [DEBUG] error_count = 0  // 误匹配为 error 状态
   [INFO] Request completed
   ```

2. **Y/N 提示的非交互式出现**
   ```
   $ cat config.txt
   Do you want to continue? [y/n]  // 文件内容，非真正等待输入
   ```

3. **命令输出中的问号**
   ```
   $ ls
   file?.txt  // 文件名包含 ?，误匹配为 needs-input
   ```

4. **多行命令的中间状态**
   ```bash
   $ echo "Are you sure?" && \
   > echo "yes"
   ```

**根本问题**：
- 正则匹配是**被动检测**，依赖输出内容的特征
- 无法区分"真正的状态"和"输出中的相似文本"
- 工具的语义信息（"我真的在等待输入"）无法传递给 TCommander

### 1.2 Hook 方案的核心价值

**主动通知 vs 被动检测**：
- 工具明确知道自己在做什么（等待输入、出错、需要确认）
- 通过 hook 主动通知 TCommander，避免猜测
- 100% 准确，零误匹配

**使用场景**：
1. **CI/CD 脚本**：构建失败时主动标记 error
2. **交互式工具**：等待用户输入时标记 needs-input
3. **部署脚本**：需要确认时标记 needs-confirm
4. **长时间任务**：完成时标记 idle，运行时标记 running

## 二、方案设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      外部工具                            │
│  (CI/CD, 部署脚本, 交互式程序, 自定义工具)                │
└────────────┬────────────────────────────────────────────┘
             │
             │ 方式 1: HTTP API (推荐，通用性强)
             │ 方式 2: CLI 命令 (简单直接)
             │ 方式 3: 文件监控 (最简单，适合脚本)
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│                   TCommander 主进程                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ HTTP Server  │  │   CLI 解析   │  │ File Watcher │  │
│  │  (可选)      │  │   (可选)     │  │   (可选)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └─────────────────┼─────────────────┘          │
│                           ▼                             │
│                  ┌────────────────┐                     │
│                  │  Hook Handler  │                     │
│                  └────────┬───────┘                     │
└───────────────────────────┼─────────────────────────────┘
                            │ IPC
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  TCommander 渲染进程                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │           App.tsx - Hook 处理逻辑                │  │
│  │  - 接收 hook 请求                                │  │
│  │  - 更新会话状态 (status, matchedRuleName)        │  │
│  │  - 触发 UI 更新                                  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 会话 ID 感知方案

**问题**：外部工具如何知道当前会话的 ID？

**方案对比**：

| 方案 | 实现方式 | 优点 | 缺点 | 推荐度 |
|------|---------|------|------|--------|
| **环境变量注入** | 启动工具时设置 `TCOMMANDER_SESSION_ID` | 对工具透明，自动传递 | 需要修改启动方式 | ⭐⭐⭐⭐⭐ |
| **包装脚本** | 提供 `tcommander-run` 命令，自动注入环境变量 | 用户无需关心 ID | 需要额外安装脚本 | ⭐⭐⭐⭐ |
| **配置文件** | 工具读取 `~/.tcommander/current-session` | 简单 | 多会话冲突 | ⭐⭐ |
| **主动查询** | 工具调用 API 查询当前活跃会话 | 灵活 | 需要额外 API 调用 | ⭐⭐⭐ |

**推荐方案**：**环境变量注入 + 包装脚本**

```bash
# 方式 1：手动设置环境变量
export TCOMMANDER_SESSION_ID="session-1234567890-abcdef"
./my-script.sh

# 方式 2：使用包装脚本（推荐）
tcommander-run ./my-script.sh
# 包装脚本自动注入 TCOMMANDER_SESSION_ID
```

### 2.3 Hook 接口定义

#### 2.3.1 HTTP API 接口

**基础 URL**：`http://localhost:19527`（端口可配置）

**接口 1：更新会话状态**
```http
POST /api/session/{sessionId}/status
Content-Type: application/json

{
  "status": "error" | "needs-input" | "needs-confirm" | "running" | "idle",
  "message": "可选的状态描述",
  "metadata": {
    "source": "ci-cd",
    "exitCode": 1,
    "timestamp": 1234567890
  }
}
```

**响应**：
```json
{
  "success": true,
  "sessionId": "session-1234567890-abcdef",
  "previousStatus": "running",
  "newStatus": "error"
}
```

**接口 2：查询会话状态**
```http
GET /api/session/{sessionId}/status
```

**响应**：
```json
{
  "sessionId": "session-1234567890-abcdef",
  "status": "running",
  "lastActivityAt": 1234567890,
  "matchedRuleName": "hook-triggered"
}
```

**接口 3：列出所有会话**
```http
GET /api/sessions
```

**响应**：
```json
{
  "sessions": [
    {
      "id": "session-1234567890-abcdef",
      "name": "Build Server",
      "status": "running",
      "kind": "local"
    }
  ]
}
```

#### 2.3.2 CLI 命令接口

**命令格式**：
```bash
tcommander-cli status <sessionId> <status> [--message <msg>]
tcommander-cli list
tcommander-cli get <sessionId>
```

**示例**：
```bash
# 标记会话为错误状态
tcommander-cli status session-1234567890-abcdef error --message "Build failed"

# 列出所有会话
tcommander-cli list

# 查询会话状态
tcommander-cli get session-1234567890-abcdef
```

#### 2.3.3 文件监控接口

**文件路径**：`~/.tcommander/hooks/{sessionId}.json`

**文件格式**：
```json
{
  "status": "error",
  "message": "Build failed",
  "timestamp": 1234567890
}
```

**工作流程**：
1. 工具写入 JSON 文件到指定路径
2. TCommander 监控文件变化
3. 读取文件内容，更新会话状态
4. 删除文件（或移动到 `processed/` 目录）

**示例脚本**：
```bash
#!/bin/bash
SESSION_ID=$TCOMMANDER_SESSION_ID
HOOK_FILE="$HOME/.tcommander/hooks/$SESSION_ID.json"

# 标记错误
echo '{"status":"error","message":"Build failed"}' > "$HOOK_FILE"
```

### 2.4 工具集成示例

#### 2.4.1 CI/CD 脚本集成

```bash
#!/bin/bash
# build.sh

# 开始构建
echo "Starting build..."

# 执行构建命令
npm run build
BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -ne 0 ]; then
  # 构建失败，标记为 error
  tcommander-cli status $TCOMMANDER_SESSION_ID error --message "Build failed with exit code $BUILD_EXIT_CODE"
  exit $BUILD_EXIT_CODE
fi

# 构建成功，标记为 idle
tcommander-cli status $TCOMMANDER_SESSION_ID idle --message "Build completed successfully"
```

#### 2.4.2 交互式工具集成

```python
#!/usr/bin/env python3
# interactive_tool.py

import os
import requests

session_id = os.environ.get('TCOMMANDER_SESSION_ID')

def ask_user(question):
    """询问用户问题，并通知 TCommander"""
    # 标记为需要输入
    requests.post(
        f'http://localhost:19527/api/session/{session_id}/status',
        json={
            'status': 'needs-input',
            'message': question
        }
    )
    
    # 等待用户输入
    answer = input(question + ': ')
    
    # 恢复为运行状态
    requests.post(
        f'http://localhost:19527/api/session/{session_id}/status',
        json={'status': 'running'}
    )
    
    return answer

# 使用示例
name = ask_user('What is your name?')
print(f'Hello, {name}!')
```

#### 2.4.3 部署脚本集成

```bash
#!/bin/bash
# deploy.sh

DEPLOY_ENV=$1

# 标记为需要确认
tcommander-cli status $TCOMMANDER_SESSION_ID needs-confirm --message "About to deploy to $DEPLOY_ENV"

# 等待用户确认
read -p "Are you sure you want to deploy to $DEPLOY_ENV? (y/n) " confirm

if [ "$confirm" != "y" ]; then
  echo "Deployment cancelled"
  tcommander-cli status $TCOMMANDER_SESSION_ID idle --message "Deployment cancelled"
  exit 1
fi

# 执行部署
echo "Deploying to $DEPLOY_ENV..."
# ... 部署逻辑 ...

# 部署完成
tcommander-cli status $TCOMMANDER_SESSION_ID idle --message "Deployment completed"
```

## 三、技术实现细节

### 3.1 主进程实现

#### 3.1.1 HTTP 服务器（可选）

**文件**：`src/main/hookServer.ts`

```typescript
import http from 'http'
import { URL } from 'url'

export function createHookServer(
  port: number,
  onHookRequest: (sessionId: string, payload: any) => Promise<any>
) {
  const server = http.createServer(async (req, res) => {
    // CORS 支持
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }
    
    const url = new URL(req.url!, `http://localhost:${port}`)
    const path = url.pathname
    
    try {
      // POST /api/session/:sessionId/status
      if (req.method === 'POST' && path.match(/^\/api\/session\/[^/]+\/status$/)) {
        const sessionId = path.split('/')[3]
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', async () => {
          const payload = JSON.parse(body)
          const result = await onHookRequest(sessionId, payload)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        })
        return
      }
      
      // GET /api/session/:sessionId/status
      if (req.method === 'GET' && path.match(/^\/api\/session\/[^/]+\/status$/)) {
        const sessionId = path.split('/')[3]
        const result = await onHookRequest(sessionId, { action: 'get' })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
        return
      }
      
      res.writeHead(404)
      res.end('Not found')
    } catch (error) {
      res.writeHead(500)
      res.end(JSON.stringify({ error: (error as Error).message }))
    }
  })
  
  server.listen(port, '127.0.0.1')
  console.log(`Hook server listening on http://127.0.0.1:${port}`)
  
  return server
}
```

#### 3.1.2 文件监控（可选）

**文件**：`src/main/hookWatcher.ts`

```typescript
import fs from 'fs'
import path from 'path'
import os from 'os'

export function createHookWatcher(
  hooksDir: string,
  onHookFile: (sessionId: string, payload: any) => void
) {
  // 确保目录存在
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true })
  }
  
  // 监控目录
  fs.watch(hooksDir, (eventType, filename) => {
    if (eventType === 'rename' && filename?.endsWith('.json')) {
      const filePath = path.join(hooksDir, filename)
      
      // 延迟读取，确保文件写入完成
      setTimeout(() => {
        if (!fs.existsSync(filePath)) return
        
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          const payload = JSON.parse(content)
          const sessionId = filename.replace('.json', '')
          
          onHookFile(sessionId, payload)
          
          // 删除已处理的文件
          fs.unlinkSync(filePath)
        } catch (error) {
          console.error('Failed to process hook file:', error)
        }
      }, 100)
    }
  })
}
```

#### 3.1.3 主进程集成

**文件**：`src/main/index.ts`

```typescript
import { createHookServer } from './hookServer'
import { createHookWatcher } from './hookWatcher'

app.whenReady().then(() => {
  // ... 现有代码 ...
  
  // 启动 HTTP Hook 服务器（可选，通过配置启用）
  const enableHttpHook = storageManager.get('enableHttpHook') ?? false
  const hookPort = storageManager.get('hookPort') ?? 19527
  
  if (enableHttpHook) {
    createHookServer(hookPort, async (sessionId, payload) => {
      // 转发给渲染进程
      if (payload.action === 'get') {
        // 查询状态
        return new Promise((resolve) => {
          const requestId = `hook-get-${Date.now()}`
          hookGetResolvers[requestId] = resolve
          mainWindow?.webContents.send('hook-get-request', requestId, sessionId)
        })
      } else {
        // 更新状态
        mainWindow?.webContents.send('hook-status-update', sessionId, payload)
        return { success: true, sessionId }
      }
    })
  }
  
  // 启动文件监控（可选）
  const enableFileHook = storageManager.get('enableFileHook') ?? false
  if (enableFileHook) {
    const hooksDir = path.join(os.homedir(), '.tcommander', 'hooks')
    createHookWatcher(hooksDir, (sessionId, payload) => {
      mainWindow?.webContents.send('hook-status-update', sessionId, payload)
    })
  }
})
```

### 3.2 渲染进程实现

**文件**：`src/renderer/src/App.tsx`

```typescript
// 监听 hook 状态更新
useEffect(() => {
  const unsubscribe = window.electronAPI.onHookStatusUpdate((sessionId, payload) => {
    const state = useAppStore.getState()
    const session = state.sessions.find(s => s.id === sessionId)
    
    if (!session) {
      console.warn(`Hook: Session not found: ${sessionId}`)
      return
    }
    
    // 更新会话状态
    state.updateSession(sessionId, {
      status: payload.status,
      matchedRuleName: 'hook-triggered',
      lastActivityAt: Date.now()
    })
    
    // 显示通知
    message.success(`会话状态已更新: ${payload.status}`)
  })
  
  return unsubscribe
}, [])
```

### 3.3 Preload 层扩展

**文件**：`src/preload/index.ts`

```typescript
// Hook 状态更新监听
let hookStatusUpdateCallbacks: Array<(sessionId: string, payload: any) => void> = []

ipcRenderer.on('hook-status-update', (_, sessionId, payload) => {
  hookStatusUpdateCallbacks.forEach(cb => cb(sessionId, payload))
})

contextBridge.exposeInMainWorld('electronAPI', {
  // ... 现有 API ...
  
  onHookStatusUpdate: (callback: (sessionId: string, payload: any) => void) => {
    hookStatusUpdateCallbacks.push(callback)
    return () => {
      hookStatusUpdateCallbacks = hookStatusUpdateCallbacks.filter(cb => cb !== callback)
    }
  }
})
```

## 四、实施计划

### 4.1 阶段划分

#### 阶段 1：核心实现（2-3 天）
- [ ] 实现 HTTP Hook 服务器
- [ ] 实现渲染进程 hook 处理逻辑
- [ ] 添加 preload 层 API
- [ ] 基础测试

#### 阶段 2：CLI 工具（1-2 天）
- [ ] 实现 `tcommander-cli` 命令行工具
- [ ] 支持 status / list / get 命令
- [ ] 打包为独立可执行文件

#### 阶段 3：文件监控（1 天）
- [ ] 实现文件监控机制
- [ ] 添加配置选项

#### 阶段 4：包装脚本（1 天）
- [ ] 实现 `tcommander-run` 包装脚本
- [ ] 自动注入环境变量
- [ ] 提供示例脚本

#### 阶段 5：文档与示例（1-2 天）
- [ ] 编写 API 文档
- [ ] 提供集成示例
- [ ] 录制演示视频

**总计**：6-9 天

### 4.2 优先级建议

**高优先级**（必须实现）：
1. HTTP API 接口（通用性最强）
2. 渲染进程 hook 处理逻辑
3. 环境变量注入方案

**中优先级**（推荐实现）：
4. CLI 工具（简单易用）
5. 包装脚本（自动化）

**低优先级**（可选实现）：
6. 文件监控（最简单但延迟高）

### 4.3 技术选型建议

| 组件 | 推荐方案 | 备选方案 |
|------|---------|---------|
| HTTP 服务器 | Node.js 内置 `http` 模块 | Express.js（功能更强但体积大） |
| CLI 工具 | Commander.js + pkg | Yargs + nexe |
| 文件监控 | Node.js `fs.watch` | chokidar（跨平台兼容性好） |
| 包装脚本 | Bash / PowerShell | Python（跨平台） |

## 五、风险评估

### 5.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| HTTP 端口冲突 | 无法启动服务器 | 中 | 支持端口配置，自动检测可用端口 |
| 安全性问题 | 未授权访问 | 低 | 仅监听 127.0.0.1，添加 token 认证 |
| 性能问题 | 频繁 hook 导致卡顿 | 低 | 添加节流机制，限制 hook 频率 |
| 跨平台兼容 | Windows/Mac/Linux 差异 | 中 | 充分测试，使用跨平台库 |

### 5.2 使用风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 工具集成复杂 | 用户不愿使用 | 中 | 提供详细文档和示例 |
| 环境变量丢失 | hook 失效 | 中 | 包装脚本自动处理 |
| 多会话冲突 | 状态更新错误 | 低 | 严格校验 sessionId |

## 六、与现有机制的关系

### 6.1 共存策略

**Hook 优先，正则兜底**：
- 如果工具支持 hook，优先使用 hook（100% 准确）
- 如果工具不支持 hook，继续使用正则匹配（可能有误匹配）
- 两者可以共存，hook 触发后禁用该会话的正则检测

**实现方式**：
```typescript
// App.tsx - flushSession
const detectResult = session.hookEnabled
  ? { status: session.status, matched: false }  // hook 模式，跳过正则
  : detectStatusWithRules(cleanText, rules)     // 正则模式
```

### 6.2 配置选项

在设置中添加：
- [ ] 启用 HTTP Hook 服务器
- [ ] Hook 服务器端口（默认 19527）
- [ ] 启用文件监控
- [ ] Hook 优先模式（启用后禁用正则检测）

## 七、总结

### 7.1 核心价值

1. **100% 准确**：工具主动通知，零误匹配
2. **通用性强**：HTTP API 支持任何语言/工具
3. **易于集成**：提供 CLI 工具和包装脚本
4. **向后兼容**：与现有正则机制共存

### 7.2 推荐实施路径

1. **MVP（最小可行产品）**：HTTP API + 环境变量注入（3 天）
2. **增强版**：+ CLI 工具 + 包装脚本（+3 天）
3. **完整版**：+ 文件监控 + 配置界面（+3 天）

### 7.3 下一步行动

1. 确认是否实施此方案
2. 确定优先级和阶段划分
3. 开始阶段 1 的实现

---

**备注**：此方案需要用户确认是否值得投入开发资源。如果误匹配问题不严重，可以继续优化正则规则；如果需要 100% 准确，则建议实施此方案。
