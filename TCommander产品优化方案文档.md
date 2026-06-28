# TCommander 产品优化方案文档

> 版本：v2.0 | 日期：2026-06-22 | 状态：待评审

---

## 一、方案概览

本方案涵盖 9 项功能需求，分为三大类：

| 类别 | 编号 | 功能 | 优先级 | 工作量 |
|------|------|------|--------|--------|
| **状态机制** | #2 | streaming 状态 + 中间状态 | P0 | 2天 |
| **状态机制** | #8 | Hook 状态更新接收接口 | P0 | 已完成 |
| **交互修复** | #3 | 卡片上下按钮预览同步 | P0 | 0.5天 |
| **交互修复** | #4 | 输入框回车无响应 | P1 | 0.5天 |
| **筛选排序** | #1 | 状态多选筛选器 | P1 | 1天 |
| **筛选排序** | #6 | 详情页其他会话列表排序 | P1 | 1天 |
| **视觉优化** | #7 | 其他会话列表选中态强化 | P2 | 0.5天 |
| **视觉优化** | #10 | 终端历史记录可见性增强 | P1 | 1天 |
| **视觉优化** | #11 | 其他会话列表快捷入口图标优化 | P1 | 0.5天 |
| **工具集成** | #5 | Claude Code / Codex Hook 示例 | P1 | 2天 |
| **产品分析** | #9 | 补充优化建议 | P2 | 含在各功能中 |

---

## 二、详细方案

---

### #1 状态多选筛选器（一键清除）

#### 现状分析

当前筛选器位于工具栏右侧，实现为**单选下拉框**：

```
当前实现（App.tsx 工具栏）：
<select value={statusFilter} onChange={...}>
  <option value="">全部状态</option>
  <option value="running">运行中</option>
  <option value="idle">空闲</option>
  <option value="needs-input">等待输入</option>
  <option value="needs-confirm">等待确认</option>
  <option value="error">错误</option>
</select>
```

**问题**：
- 只能选择一种状态，无法同时查看「等待输入 + 等待确认」的会话
- 用户需要频繁切换筛选条件
- 没有「一键清除筛选」的快捷操作

#### 方案设计

**将单选下拉框改为多选标签组**：

```
┌─────────────────────────────────────────────────────┐
│ 搜索...  │ 预览行数 [50▾] │ 排序 [按状态▾] │ 筛选： │
│          │                │              │ [●全部] [运行中] [空闲] [等待输入] [等待确认] [错误] │
└─────────────────────────────────────────────────────┘
```

**交互规则**：
- 点击标签切换选中/取消选中
- 「全部」标签：点击后选中所有状态（清除筛选）
- 至少选中一个状态时显示对应筛选结果
- 选中的标签高亮显示（蓝色背景）
- 未选中任何标签 = 显示全部（等同于「全部」）

**数据模型变更**：

```typescript
// store/index.ts
interface AppState {
  // 旧：statusFilter: string
  // 新：
  statusFilter: string[]  // 多选数组，空数组 = 显示全部
}
```

**筛选逻辑变更**：

```typescript
// App.tsx 中的 filteredSessions
const filteredSessions = useMemo(() => {
  return sortedSessions.filter(session => {
    // 搜索过滤（保持不变）
    if (searchQuery && !matchesSearch(session, searchQuery)) return false
    // 状态过滤（改为多选）
    if (statusFilter.length > 0 && !statusFilter.includes(session.status)) return false
    // 分组过滤（保持不变）
    if (selectedGroupId && session.groupId !== selectedGroupId) return false
    return true
  })
}, [sortedSessions, searchQuery, statusFilter, selectedGroupId])
```

**UI 组件**：

```tsx
// 工具栏中的筛选标签组
<div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
  <span style={{ fontSize: 11, color: '#888' }}>筛选：</span>
  {statusFilter.length > 0 && (
    <button
      onClick={() => set({ statusFilter: [] })}
      style={{
        fontSize: 11, padding: '2px 8px', borderRadius: 10,
        background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer'
      }}
    >
      全部 ✕
    </button>
  )}
  {STATUS_OPTIONS.map(opt => {
    const active = statusFilter.length === 0 || statusFilter.includes(opt.value)
    return (
      <button
        key={opt.value}
        onClick={() => toggleStatusFilter(opt.value)}
        style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: active ? opt.color + '33' : '#2a2a2a',
          color: active ? opt.color : '#666',
          border: `1px solid ${active ? opt.color : '#333'}`,
          cursor: 'pointer'
        }}
      >
        {opt.label}
      </button>
    )
  })}
</div>
```

#### 验收标准
- [ ] 筛选器改为多选标签组，点击可切换选中/取消
- [ ] 「全部」标签可一键清除所有筛选
- [ ] 筛选结果实时更新
- [ ] 选中的标签有明确的高亮视觉反馈
- [ ] 空筛选 = 显示全部会话

---

### #2 streaming 状态 + 中间状态机制

#### 现状分析

当前状态体系：

```
SessionStatus = 'idle' | 'needs-input' | 'needs-confirm' | 'error' | 'running'
```

**空闲检测逻辑**（App.tsx）：
```
每次有输出 → 设置 10 秒定时器
  ├─ 10 秒内无新输出 → 转为 idle
  └─ 10 秒内又有新输出 → 取消定时器，重新设置
```

**问题**：
1. **缺少 streaming 状态**：持续输出的命令行（如 `npm install`、`cargo build`）和已完成的命令行在视觉上没有区分，都是 `running`
2. **idle 转换过于敏感**：只要 10 秒无输出就转为 idle，但用户可能正在思考下一步操作，此时不应算「空闲」
3. **状态切换缺乏缓冲**：从 `running` → `idle` 的转换是瞬时的，卡片标签突然从「运行中」变成「空闲」，视觉上不自然

#### 方案设计

**新增状态：`streaming`**

```
SessionStatus = 'idle' | 'needs-input' | 'needs-confirm' | 'error' | 'running' | 'streaming'
```

**状态语义**：

| 状态 | 含义 | 视觉 |
|------|------|------|
| `streaming` | 正在持续输出，有活跃的数据流 | 绿色 + 脉冲动画 |
| `running` | 命令已启动，等待首次输出或输出间隔较长 | 绿色 |
| `idle` | 长时间无输出且用户无操作 | 灰色 |
| `needs-input` | 等待用户输入 | 黄色 |
| `needs-confirm` | 等待用户确认 | 橙色 |
| `error` | 检测到错误 | 红色 |

**状态转换规则**：

```
                    首次输出
    ┌──────────────────────────────────┐
    │                                  ▼
  idle ──(用户操作)──▶ running ──(持续输出)──▶ streaming
    ▲                    │                       │
    │                    │ 10秒无输出              │ 10秒无输出
    │                    ▼                       ▼
    │                 idle ◀────────────────── idle
    │                    │
    │                    │ 命中规则
    │                    ▼
    │           needs-input / needs-confirm / error
    │                    │
    │                    │ 用户操作 / 新输出
    └────────────────────┘
```

**关键变更**：

1. **`running` → `streaming`**：当会话在 2 秒内收到 3 次以上输出批次时，标记为 `streaming`
2. **`streaming` → `running`**：输出频率降低后回退到 `running`
3. **`running`/`streaming` → `idle`**：保持 10 秒无输出阈值，但增加「用户操作感知」

**空闲检测改进**：

```typescript
// 新增：用户操作时间戳
interface AppState {
  lastUserActionAt: Record<string, number>  // 每个会话的用户最后操作时间
}

// 空闲检测逻辑改进
const scheduleIdleCheck = useCallback((sessionId: string) => {
  if (idleTimers.current[sessionId]) {
    clearTimeout(idleTimers.current[sessionId])
  }
  
  idleTimers.current[sessionId] = setTimeout(() => {
    const state = useAppStore.getState()
    const session = state.sessions.find(s => s.id === sessionId)
    if (!session || session.status !== 'running' && session.status !== 'streaming') return
    
    // 检查用户最近是否有操作（展开卡片、发送输入等）
    const lastAction = state.lastUserActionAt[sessionId] || 0
    const now = Date.now()
    if (now - lastAction < IDLE_THRESHOLD_MS) {
      // 用户最近有操作，延长等待
      scheduleIdleCheck(sessionId)
      return
    }
    
    state.updateSession(sessionId, {
      status: 'idle',
      stableActivityAt: now
    })
    delete idleTimers.current[sessionId]
  }, IDLE_THRESHOLD_MS)
}, [])
```

**streaming 检测逻辑**：

```typescript
// 在 flushSession 中增加 streaming 检测
const outputTimestamps = useRef<Record<string, number[]>>({})

// 记录每次输出的时间戳
const recordOutput = (sessionId: string) => {
  const now = Date.now()
  if (!outputTimestamps.current[sessionId]) {
    outputTimestamps.current[sessionId] = []
  }
  outputTimestamps.current[sessionId].push(now)
  // 只保留最近 10 秒的记录
  outputTimestamps.current[sessionId] = outputTimestamps.current[sessionId]
    .filter(t => now - t < 10000)
}

// 判断是否为 streaming
const isStreaming = (sessionId: string): boolean => {
  const timestamps = outputTimestamps.current[sessionId] || []
  // 2 秒内 3 次以上输出 = streaming
  const recent = timestamps.filter(t => Date.now() - t < 2000)
  return recent.length >= 3
}
```

**视觉配置**：

```typescript
const STATUS_CONFIG = {
  streaming: {
    color: '#22c55e',
    bg: '#22c55e22',
    label: '输出中',
    glow: '0 0 8px #22c55e55',
    pulse: true  // 新增：脉冲动画
  },
  // ...其他状态保持不变
}
```

#### 验收标准
- [ ] 新增 `streaming` 状态，持续输出时自动标记
- [ ] `streaming` 状态有脉冲动画视觉反馈
- [ ] 空闲检测考虑用户操作时间
- [ ] 状态转换平滑，无突变
- [ ] 排序逻辑中 `streaming` 优先级与 `running` 相同

---

### #3 修复卡片上下按钮后预览区域不同步

#### 现状分析

**当前行为**：
- 用户通过键盘 `Alt+↑/↓` 或工具栏按钮切换选中卡片
- 选中卡片后，预览区域（SessionCard 中的 previewText）应显示该卡片的最新输出
- **问题**：切换选中后，预览区域仍显示旧卡片的内容

**根因分析**：

预览区域的渲染依赖于 `session.previewText`，但 `previewText` 的更新时机与选中状态变更存在时序问题：

```
用户按 ↓ 切换卡片
  → selectedSessionId 更新（store）
  → 新卡片的 SessionCard 重新渲染
  → 但 previewText 可能还是旧值（flushSession 尚未触发）
  → 预览区域显示旧内容
```

#### 方案设计

**方案：切换选中时强制刷新预览**

```typescript
// 在 App.tsx 中，切换选中时触发预览刷新
const handleSelectSession = useCallback((sessionId: string) => {
  set({ selectedSessionId: sessionId })
  
  // 强制刷新该会话的预览
  const state = useAppStore.getState()
  const session = state.sessions.find(s => s.id === sessionId)
  if (session) {
    // 重新计算 previewText
    const fullRaw = session.history.join('')
    const tailRaw = tailLines(fullRaw, 16 * 1024)
    const cleanText = cleanTerminalOutputKeepColor(tailRaw)
    state.updateSession(sessionId, { previewText: cleanText })
  }
}, [])
```

**优化：使用 useMemo 缓存预览计算**

```typescript
// 在 SessionCard 中，预览内容通过 useMemo 计算
const previewContent = useMemo(() => {
  if (!isSelected) return null  // 非选中不计算
  
  const fullRaw = session.history.join('')
  const tailRaw = tailLines(fullRaw, 16 * 1024)
  return cleanTerminalOutputKeepColor(tailRaw)
}, [isSelected, session.history])
```

#### 验收标准
- [ ] 切换选中卡片后，预览区域立即显示新卡片的内容
- [ ] 预览内容与终端实际输出一致
- [ ] 切换过程无闪烁或延迟

---

### #4 修复输入框回车偶尔无响应

#### 现状分析

**问题描述**：用户在快速操作输入框输入数字后按回车，偶尔无响应。

**根因分析**：

1. **防抖冲突**：输入框的 `onChange` 事件与 `onKeyDown` 事件存在时序竞争
2. **焦点丢失**：某些操作（如状态更新触发重渲染）导致输入框失去焦点
3. **事件冒泡**：回车事件可能被父元素拦截

#### 方案设计

**修复 1：确保回车事件优先处理**

```tsx
<input
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()  // 阻止事件冒泡
      handleQuickInput(e.currentTarget.value)
      e.currentTarget.value = ''
    }
  }}
  onBlur={(e) => {
    // 失焦时也提交内容
    if (e.target.value.trim()) {
      handleQuickInput(e.target.value)
      e.target.value = ''
    }
  }}
/>
```

**修复 2：保持输入框焦点**

```typescript
// 在状态更新时，保持输入框焦点
useEffect(() => {
  if (inputRef.current && document.activeElement !== inputRef.current) {
    // 如果输入框之前有焦点，重新聚焦
    if (wasFocused) {
      inputRef.current.focus()
    }
  }
}, [session.status, session.history])
```

**修复 3：输入缓冲机制**

```typescript
// 使用 ref 存储输入值，避免 React 重渲染导致的丢失
const inputBuffer = useRef('')

const handleInputChange = (value: string) => {
  inputBuffer.current = value
}

const handleQuickInput = () => {
  const value = inputBuffer.current.trim()
  if (!value) return
  inputBuffer.current = ''
  // 发送输入...
}
```

#### 验收标准
- [ ] 快速输入数字后按回车，100% 响应
- [ ] 输入框不会意外失去焦点
- [ ] 回车事件不会被父元素拦截

---

### #5 Claude Code / Codex Hook 后处理工具示例

#### 背景

TCommander 已实现 HTTP Hook 服务器（端口 19527），外部工具可通过 API 精确控制卡片状态。需要提供 Claude Code 和 Codex 的集成示例。

#### Claude Code 集成方案

**方案：Claude Code MCP Server 扩展**

Claude Code 支持 MCP（Model Context Protocol），可以开发一个 MCP Server 来与 TCommander 通信。

**文件结构**：
```
hooks/
├── claude-code/
│   ├── mcp-server.js          # MCP Server 实现
│   ├── tcommander-client.js   # TCommander API 客户端
│   └── README.md              # 使用说明
```

**核心实现**：

```javascript
// hooks/claude-code/mcp-server.js
const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { TcommanderClient } = require('./tcommander-client.js')

const server = new Server({
  name: 'tcommander-hook',
  version: '1.0.0'
})

const tcClient = new TcommanderClient()

// 注册工具
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'tcommander_update_status',
        description: '更新 TCommander 卡片状态',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '会话 ID' },
            status: { 
              type: 'string', 
              enum: ['running', 'idle', 'needs-input', 'needs-confirm', 'error', 'streaming'],
              description: '新状态' 
            },
            message: { type: 'string', description: '状态消息' }
          },
          required: ['sessionId', 'status']
        }
      },
      {
        name: 'tcommander_list_sessions',
        description: '列出所有 TCommander 会话',
        inputSchema: { type: 'object', properties: {} }
      }
    ]
  }
})

// 处理工具调用
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params
  
  if (name === 'tcommander_update_status') {
    await tcClient.updateStatus(args.sessionId, args.status, args.message)
    return { content: [{ type: 'text', text: `状态已更新为 ${args.status}` }] }
  }
  
  if (name === 'tcommander_list_sessions') {
    const sessions = await tcClient.listSessions()
    return { content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }] }
  }
  
  return { content: [{ type: 'text', text: '未知工具' }], isError: true }
})

// 启动
const transport = new StdioServerTransport()
await server.connect(transport)
```

```javascript
// hooks/claude-code/tcommander-client.js
const http = require('http')

class TcommanderClient {
  constructor(port = 19527) {
    this.baseUrl = `http://127.0.0.1:${port}`
  }
  
  async updateStatus(sessionId, status, message) {
    return this.request('POST', `/api/session/${sessionId}/status`, { status, message })
  }
  
  async listSessions() {
    return this.request('GET', '/api/sessions')
  }
  
  async request(method, path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl)
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: { 'Content-Type': 'application/json' }
      }
      
      const req = http.request(options, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      })
      
      req.on('error', reject)
      if (body) req.write(JSON.stringify(body))
      req.end()
    })
  }
}

module.exports = { TcommanderClient }
```

**使用方式**：

```bash
# 1. 在 Claude Code 配置中添加 MCP Server
# ~/.claude/config.json
{
  "mcpServers": {
    "tcommander": {
      "command": "node",
      "args": ["/path/to/hooks/claude-code/mcp-server.js"]
    }
  }
}

# 2. Claude Code 中调用
# > 使用 tcommander_update_status 将会话 session-xxx 标记为 error，消息为 "构建失败"
```

#### Codex 集成方案

**方案：Codex CLI 包装脚本**

```bash
#!/bin/bash
# hooks/codex/tcommander-codex-wrapper.sh

SESSION_ID="${TCOMMANDER_SESSION_ID}"
TC_PORT="${TCOMMANDER_PORT:-19527}"

if [ -z "$SESSION_ID" ]; then
  echo "错误：未设置 TCOMMANDER_SESSION_ID"
  exit 1
fi

# 执行 Codex 命令，捕获输出
codex "$@" 2>&1 | while IFS= read -r line; do
  echo "$line"
  
  # 检测特定模式并更新状态
  if echo "$line" | grep -qE "(error|failed|Error|FAILED)"; then
    curl -s -X POST "http://127.0.0.1:$TC_PORT/api/session/$SESSION_ID/status" \
      -H "Content-Type: application/json" \
      -d "{\"status\":\"error\",\"message\":\"$line\"}" > /dev/null
  fi
  
  if echo "$line" | grep -qE "(continue|proceed|y/n)"; then
    curl -s -X POST "http://127.0.0.1:$TC_PORT/api/session/$SESSION_ID/status" \
      -H "Content-Type: application/json" \
      -d "{\"status\":\"needs-confirm\",\"message\":\"$line\"}" > /dev/null
  fi
done

# 命令完成后标记为 idle
curl -s -X POST "http://127.0.0.1:$TC_PORT/api/session/$SESSION_ID/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"idle"}' > /dev/null
```

**使用方式**：

```bash
# 在 TCommander 中创建会话时，使用包装脚本
export TCOMMANDER_SESSION_ID="session-xxx"
./hooks/codex/tcommander-codex-wrapper.sh "帮我重构这个函数"
```

#### 会话 ID 感知方案

**问题**：外部工具如何知道当前对应的 TCommander 会话 ID？

**解决方案**：

1. **环境变量注入**：TCommander 在创建会话时，自动设置环境变量
   ```bash
   export TCOMMANDER_SESSION_ID="session-1234567890-abcdef"
   ```

2. **包装脚本**：提供 `tcommander-run` 命令
   ```bash
   #!/bin/bash
   # scripts/tcommander-run.sh
   export TCOMMANDER_SESSION_ID="$1"
   shift
   exec "$@"
   ```

3. **配置文件**：在会话目录写入 `.tcommander-session-id` 文件

#### 验收标准
- [ ] Claude Code MCP Server 可正常启动并注册工具
- [ ] Claude Code 可通过 MCP 工具更新 TCommander 卡片状态
- [ ] Codex 包装脚本可捕获输出并更新状态
- [ ] 提供完整的使用文档和示例

---

### #6 详情页底部其他会话列表排序

#### 现状分析

当前 `FullscreenTerminal.tsx` 底部有一个**其他会话列表**，用于快速切换到其他会话：

```tsx
// FullscreenTerminal.tsx 底部栏（当前实现）
<div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
  {otherSessions.map(s => (
    <div key={s.id} onClick={() => switchTo(s.id)}>
      {s.name}
    </div>
  ))}
</div>
```

**注意**：这是「其他会话列表」，不是「历史命令」。它显示的是除当前会话外的所有会话卡片。

**问题**：
- 底部会话列表没有排序，按原始数组顺序显示
- 与主界面的卡片排序逻辑不一致
- 用户无法按状态、时间等维度快速定位会话

#### 方案设计

**复用主界面的排序逻辑**：

```typescript
// 在 FullscreenTerminal.tsx 中引入排序函数
import { getSortedSessionsIds } from '../App'  // 或提取到独立模块

// 底部会话列表排序
const sortedOtherSessions = useMemo(() => {
  const sortedIds = getSortedSessionIds(sessions, {
    sortBy,
    statusPriority: STATUS_PRIORITY
  })
  return sortedIds
    .map(id => sessions.find(s => s.id === id))
    .filter(s => s && s.id !== currentSessionId)
}, [sessions, currentSessionId, sortBy])
```

**排序逻辑提取**：

```typescript
// utils/sortUtils.ts（新建）
export function sortSessions(
  sessions: Session[],
  options: { sortBy: string; statusPriority: Record<string, number> }
): Session[] {
  const { sortBy, statusPriority } = options
  
  return [...sessions].sort((a, b) => {
    // 第一级：状态优先级
    const aHasStatus = hasStatus(a.status)
    const bHasStatus = hasStatus(b.status)
    if (aHasStatus !== bHasStatus) return aHasStatus ? -1 : 1
    
    if (aHasStatus && bHasStatus) {
      const aPriority = statusPriority[a.status] ?? 99
      const bPriority = statusPriority[b.status] ?? 99
      if (aPriority !== bPriority) return aPriority - bPriority
      // 同严重程度按 lastActivityAt 倒序
      return (b.lastActivityAt || 0) - (a.lastActivityAt || 0)
    }
    
    // 第二级：按用户选择的排序方式
    switch (sortBy) {
      case 'createdAt':
        return b.id.localeCompare(a.id)
      case 'name':
        return (a.name || '').localeCompare(b.name || '')
      case 'lastActivityAt':
        return (b.lastActivityAt || 0) - (a.lastActivityAt || 0)
      default: // 'status'
        return (b.stableActivityAt || b.createdAt || 0) - 
               (a.stableActivityAt || a.createdAt || 0)
    }
  })
}
```

#### 验收标准
- [ ] 详情页底部会话列表按与主界面相同的规则排序
- [ ] 切换排序方式后，底部列表同步更新
- [ ] 排序逻辑提取为独立工具函数，可复用

---

### #7 其他会话列表选中态视觉强化

#### 现状分析

当前详情页底部其他会话列表的选中态样式较为基础：

```tsx
// FullscreenTerminal.tsx
<div style={{
  border: `1px solid ${s.id === currentSessionId ? '#3b82f6' : '#333'}`,
  // 仅边框颜色变化，视觉不够明显
}}>
```

**问题**：
- 选中态仅通过边框颜色区分，不够醒目
- 缺少发光效果、背景色变化等视觉反馈
- 在多个会话卡片中难以快速定位当前选中项

#### 方案设计

**增强选中态视觉效果**：

```tsx
<div style={{
  // 基础样式
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  
  // 选中态增强
  ...(s.id === currentSessionId ? {
    border: '2px solid #3b82f6',
    background: '#3b82f622',
    boxShadow: '0 0 12px #3b82f655, inset 0 0 8px #3b82f622',
    transform: 'scale(1.05)',
  } : {
    border: '1px solid #333',
    background: 'transparent',
    '&:hover': {
      border: '1px solid #555',
      background: '#ffffff08'
    }
  })
}}>
```

**视觉层次**：

| 状态 | 边框 | 背景 | 阴影 | 缩放 |
|------|------|------|------|------|
| 默认 | 1px #333 | 透明 | 无 | 1.0 |
| 悬停 | 1px #555 | #ffffff08 | 无 | 1.0 |
| 选中 | 2px #3b82f6 | #3b82f622 | 双层发光 | 1.05 |

#### 验收标准
- [ ] 选中卡片有明显的视觉区分（边框 + 背景 + 阴影 + 缩放）
- [ ] 悬停态有过渡动画
- [ ] 选中态在深色/浅色主题下都清晰可见

---

### #10 终端历史记录可见性增强

#### 现状分析

当前终端历史记录的存储和显示存在以下限制：

**存储限制**（`statusDetector.ts`）：
- `RENDER_HISTORY_LINE_LIMIT = 400` 行
- `RENDER_HISTORY_BYTE_LIMIT = 512 * 1024` (512KB)
- `truncateHistory()` 函数会截断超出限制的历史

**预览限制**（`statusDetector.ts`）：
- `tailLines()` 默认只取尾部 16KB 用于预览和状态检测

**详情页限制**（`FullscreenTerminal.tsx`）：
- `MAX_REPLAY_SIZE = 512 * 1024` (512KB)
- `selectReplayContent()` 只取最后 512KB 用于回放显示
- xterm 配置 `scrollback: 10000` 行

**问题**：
- 用户无法看到更早的终端输出（超过 512KB 的内容被截断）
- 长时间运行的命令（如编译、日志输出）历史丢失严重
- 无法回溯查看完整的命令执行过程

#### 方案设计

**方案 1：增大存储和显示限制**

```typescript
// statusDetector.ts - 增大存储限制
export const RENDER_HISTORY_LINE_LIMIT = 2000  // 从 400 增加到 2000
export const RENDER_HISTORY_BYTE_LIMIT = 2 * 1024 * 1024  // 从 512KB 增加到 2MB

// FullscreenTerminal.tsx - 增大回放限制
const MAX_REPLAY_SIZE = 2 * 1024 * 1024  // 从 512KB 增加到 2MB
```

**方案 2：分层存储策略**

```typescript
// 热数据：最近 512KB，完整保留
// 温数据：512KB - 2MB，压缩存储（去除 ANSI 转义序列）
// 冷数据：超过 2MB，仅保留关键行（命令输入、错误信息、状态变化）

interface SessionHistory {
  hot: string[]      // 最近 512KB，完整
  warm: string[]     // 512KB - 2MB，压缩
  cold: string[]     // 超过 2MB，关键行
}
```

**方案 3：用户可配置的历史记录深度**

```typescript
// store/index.ts
interface AppState {
  historyDepth: 'low' | 'medium' | 'high'  // 用户可配置
}

// 根据配置动态调整限制
const HISTORY_LIMITS = {
  low: { lines: 400, bytes: 512 * 1024 },
  medium: { lines: 1000, bytes: 1024 * 1024 },
  high: { lines: 2000, bytes: 2 * 1024 * 1024 }
}
```

**推荐方案**：方案 1 + 方案 3 结合
- 默认增大限制到 2MB
- 提供用户配置选项（低/中/高）
- 在设置界面添加「历史记录深度」选项

**实现细节**：

```tsx
// 设置界面新增选项
<div>
  <label>历史记录深度</label>
  <select value={historyDepth} onChange={e => set({ historyDepth: e.target.value })}>
    <option value="low">低（512KB，节省内存）</option>
    <option value="medium">中（1MB，推荐）</option>
    <option value="high">高（2MB，完整历史）</option>
  </select>
</div>
```

```typescript
// 动态应用限制
const applyHistoryLimits = (history: string[], depth: string) => {
  const limits = HISTORY_LIMITS[depth]
  return truncateHistory(history, limits.lines, limits.bytes)
}
```

#### 验收标准
- [ ] 终端历史记录存储限制增大到 2MB
- [ ] 详情页回放限制增大到 2MB
- [ ] 设置界面提供历史记录深度配置选项
- [ ] 不同深度配置下内存占用合理
- [ ] 长时间运行的命令可以回溯更多历史输出

---

### #11 其他会话列表快捷入口图标优化

#### 现状分析

当前详情页底部的其他会话列表以简化的**小图标/标签**形式展示，仅显示会话名称：

```tsx
// FullscreenTerminal.tsx 底部栏（当前实现）
<div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
  {otherSessions.map(s => (
    <div key={s.id} onClick={() => switchTo(s.id)}>
      {s.name}
    </div>
  ))}
</div>
```

**问题**：
- 快捷入口图标样式过于简陋，仅显示名称文字
- 缺少状态指示（无法一眼看出哪个会话有错误/等待输入）
- 缺少会话类型标识（无法区分本地/SSH）
- 缺少连接状态可视化
- 多个会话时难以快速识别目标会话

#### 方案设计

**增强快捷入口图标的信息密度和视觉辨识度**：

```tsx
// 优化后的快捷入口图标
<div style={{
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 6,
  border: `1px solid ${statusColor}`,
  background: isSelected ? '#3b82f622' : 'transparent',
  cursor: 'pointer',
  minWidth: 80,
  maxWidth: 150,
}}>
  {/* 状态指示点 */}
  <div style={{
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: statusColor,
    boxShadow: hasStatus ? `0 0 4px ${statusColor}` : 'none',
    flexShrink: 0,
  }} />
  
  {/* 类型图标 */}
  <span style={{ fontSize: 12, flexShrink: 0 }}>
    {session.kind === 'ssh' ? '🔗' : '💻'}
  </span>
  
  {/* 会话名称（截断） */}
  <span style={{
    fontSize: 11,
    color: '#ccc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }}>
    {session.name}
  </span>
</div>
```

**视觉元素**：

| 元素 | 说明 | 颜色规则 |
|------|------|---------|
| 状态指示点 | 6px 圆点，有状态时带发光 | error=红, needs-input=黄, needs-confirm=橙, running=绿, idle=灰 |
| 类型图标 | 本地=💻, SSH=🔗 | 固定 |
| 会话名称 | 最多显示 15 字符，超出省略 | 默认 #ccc |
| 边框 | 选中时蓝色高亮 | 默认 #333, 选中 #3b82f6 |

**交互增强**：
- 悬停时显示完整会话信息 tooltip（名称、状态、最后活动时间）
- 右键菜单支持快速操作（重连、关闭）

#### 验收标准
- [ ] 快捷入口显示状态指示点（颜色对应会话状态）
- [ ] 快捷入口显示类型图标（本地/SSH）
- [ ] 会话名称过长时自动截断并显示省略号
- [ ] 悬停时显示 tooltip 展示完整信息
- [ ] 选中态有明显的视觉区分

---

### #8 Hook 状态更新接收接口

#### 现状

**已完成**。HTTP Hook 服务器已实现，支持：
- `POST /api/session/:sessionId/status` - 更新状态
- `GET /api/session/:sessionId/status` - 查询会话
- `GET /api/sessions` - 列出所有会话

详见 [Hook接口使用文档.md](./Hook接口使用文档.md)

---

### #9 产品视角补充优化建议

#### 9.1 会话分组管理

**现状**：支持分组，但分组功能较为基础。

**优化建议**：
- 支持拖拽排序分组
- 支持分组折叠/展开
- 支持分组级别的筛选（如「只看某分组的错误会话」）
- 支持分组颜色标签

#### 9.2 会话搜索增强

**现状**：支持按名称搜索。

**优化建议**：
- 支持按输出内容搜索（全文检索）
- 支持按状态搜索（如「搜索所有等待输入的会话」）
- 支持正则表达式搜索
- 搜索结果高亮

#### 9.3 批量操作

**现状**：不支持批量操作。

**优化建议**：
- 支持多选会话（Ctrl+点击）
- 批量关闭、批量删除、批量重连
- 批量导出会话日志

#### 9.4 会话模板

**现状**：支持预设，但预设只保存配置，不保存命令。

**优化建议**：
- 支持保存常用命令序列为模板
- 支持模板变量（如 `${project_name}`）
- 支持模板分享（导出/导入）

#### 9.5 通知与提醒

**现状**：无通知机制。

**优化建议**：
- 会话状态变化时发送系统通知（如「构建完成」「需要确认」）
- 支持通知规则配置（如「只在 error 时通知」）
- 支持通知声音

#### 9.6 会话快照增强

**现状**：支持创建快照，但快照管理较为基础。

**优化建议**：
- 支持快照对比（两个快照的差异）
- 支持快照标签
- 支持自动快照（如每小时自动保存）

---

## 三、实施计划

### 阶段划分

| 阶段 | 内容 | 优先级 | 预计工作量 |
|------|------|--------|-----------|
| 阶段 1 | #3 预览同步修复 + #4 输入框修复 | P0 | 1天 |
| 阶段 2 | #2 streaming 状态 + 中间状态 | P0 | 2天 |
| 阶段 3 | #1 多选筛选器 + #6 历史命令排序 | P1 | 2天 |
| 阶段 4 | #5 Claude Code / Codex Hook 示例 | P1 | 2天 |
| 阶段 5 | #7 选中态视觉强化 | P2 | 0.5天 |

### 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| streaming 状态误判 | 用户体验下降 | 提供配置项调整阈值 |
| Hook 接口安全性 | 安全风险 | 仅监听 127.0.0.1，添加 token 认证 |
| 排序逻辑变更 | 用户习惯改变 | 保持默认排序不变，提供切换选项 |

---

## 四、附录

### 相关文件清单

| 文件 | 说明 |
|------|------|
| `src/renderer/src/types.ts` | 类型定义 |
| `src/renderer/src/store/index.ts` | 状态管理 |
| `src/renderer/src/App.tsx` | 主应用逻辑 |
| `src/renderer/src/components/SessionCard.tsx` | 卡片组件 |
| `src/renderer/src/components/FullscreenTerminal.tsx` | 详情页组件 |
| `src/renderer/src/utils/statusDetector.ts` | 状态检测 |
| `src/main/hookServer.ts` | Hook 服务器 |
| `hooks/claude-code/` | Claude Code 集成（待创建） |
| `hooks/codex/` | Codex 集成（待创建） |

### 参考文档

- [Hook接口方案-精确状态触发机制.md](./Hook接口方案-精确状态触发机制.md)
- [Hook接口使用文档.md](./Hook接口使用文档.md)
- [卡片排序逻辑梳理与优化建议.md](./卡片排序逻辑梳理与优化建议.md)
- [SSH会话管理功能优化方案.md](./SSH会话管理功能优化方案.md)
