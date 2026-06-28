# TCommander SSH 会话管理功能优化方案

## 一、当前功能概述

### 1.1 核心功能
- **SSH 连接**：支持密码、私钥、交互式三种认证方式
- **预设管理**：可保存 SSH 配置为预设，快速创建会话
- **凭证存储**：通过 Electron safeStorage 加密存储密码/口令
- **工作目录**：支持指定 SSH 登录后的初始目录
- **自动保存预设**：勾选"记住密码"时自动创建/更新预设

### 1.2 技术实现
- 使用 ssh2 库实现 SSH 连接
- 密码通过 OS 级加密（Windows DPAPI / macOS Keychain / Linux libsecret）
- 预设数据持久化到 electron-store
- 支持 connectionStatus 状态显示（connecting/ready/disconnected）

---

## 二、产品视角问题分析

### 2.1 用户体验问题

#### P0 - 核心体验缺陷

**1. 缺少一键重连机制**
- **问题**：SSH 连接断开后，用户需要重新打开新建会话对话框，手动输入配置或选择预设
- **影响**：网络不稳定场景下，重连操作繁琐，打断工作流
- **用户场景**：
  - 开发过程中 SSH 连接意外断开
  - 需要快速恢复多个会话
  - 长时间挂机后连接失效

**2. 错误提示不够具体**
- **问题**：连接失败时仅显示"创建会话失败，请重试"，未区分具体原因
- **影响**：用户无法判断是网络问题、认证失败、还是配置错误
- **用户场景**：
  - 密码错误但提示"创建失败"，用户不知道是密码问题
  - 主机不可达但无明确提示，用户反复尝试
  - 私钥路径错误但无引导修复

**3. Host Key 验证简化处理**
- **问题**：当前直接信任所有 host key（`hostVerifier = () => true`）
- **影响**：存在中间人攻击风险，不符合安全最佳实践
- **用户场景**：
  - 首次连接新服务器时无确认提示
  - 服务器 host key 变更时无警告
  - 企业环境安全审计不通过

#### P1 - 重要功能缺失

**4. 缺少批量操作能力**
- **问题**：无法批量创建、重连、关闭多个 SSH 会话
- **影响**：管理多个服务器时效率低下
- **用户场景**：
  - 运维人员需要同时连接 10+ 台服务器
  - 需要批量重启所有会话
  - 需要快速切换分组内的所有会话

**5. 缺少连接状态可视化**
- **问题**：连接状态仅在卡片上显示小图标，不够醒目
- **影响**：用户难以快速识别哪些会话已断开
- **用户场景**：
  - 多个会话卡片中难以快速找到断开的
  - 长时间未操作的会话状态不明确
  - 需要逐个检查连接状态

**6. 缺少快捷键支持**
- **问题**：所有操作都需要鼠标点击，无键盘快捷键
- **影响**：高频用户操作效率低
- **用户场景**：
  - 快速创建新会话需要多次点击
  - 切换会话需要鼠标操作
  - 无法通过键盘快速重连

#### P2 - 体验优化项

**7. 预设管理不够智能**
- **问题**：
  - 预设名称固定为 `username@host`，不够灵活
  - 无法导入/导出预设配置
  - 缺少预设分组功能
- **影响**：预设数量多时管理困难
- **用户场景**：
  - 有 50+ 个服务器预设，难以查找
  - 需要在多台电脑间同步预设
  - 需要按项目/环境分组管理预设

**8. 缺少连接历史**
- **问题**：无法查看最近连接的服务器列表
- **影响**：需要重新输入配置或查找预设
- **用户场景**：
  - 临时连接过一台服务器，后续想快速重连
  - 忘记之前连接过的服务器地址
  - 需要查看连接频率统计

**9. 缺少连接测试功能**
- **问题**：创建会话前无法测试连接是否成功
- **影响**：配置错误时需要等待超时
- **用户场景**：
  - 不确定网络是否可达
  - 不确定端口是否正确
  - 不确定认证方式是否支持

**10. 缺少会话模板**
- **问题**：无法基于现有会话创建模板
- **影响**：相似配置需要重复输入
- **用户场景**：
  - 需要连接同一主机的多个目录
  - 需要创建多个相似配置的会话
  - 需要快速复制会话配置

---

## 三、优化方案

### 3.1 P0 优化（核心体验）

#### 3.1.1 一键重连机制

**功能描述**：
- 在会话卡片上添加"重连"按钮（仅断开状态显示）
- 支持右键菜单快速重连
- 支持快捷键 `Ctrl+R`（Windows）/ `Cmd+R`（macOS）重连当前会话
- 重连时复用原有配置（包括加密的密码）

**实现方案**：
```typescript
// 1. 在 SessionCard 添加重连按钮
{session.connectionStatus === 'disconnected' && (
  <Button 
    icon={<ReloadOutlined />} 
    onClick={() => handleReconnect(session)}
    size="small"
  >
    重连
  </Button>
)}

// 2. 实现重连逻辑
const handleReconnect = async (session: Session) => {
  if (session.kind !== 'ssh') return
  
  // 复用原有 sshConfig（包含 passwordRef）
  const newSession = await createSessionFromConfig({
    name: session.name,
    kind: 'ssh',
    cwd: session.cwd,
    initialCommand: session.initialCommand,
    groupId: session.groupId,
    existingSshConfig: session.sshConfig,
    quickActions: session.quickActions,
  })
  
  if (newSession) {
    removeSession(session.id)
    message.success('重连成功')
  } else {
    message.error('重连失败，请检查网络或配置')
  }
}
```

**验收标准**：
- 断开状态的会话显示"重连"按钮
- 点击后 3 秒内完成重连（网络正常情况）
- 重连后保留原有会话配置（名称、分组、工作目录等）
- 支持键盘快捷键

#### 3.1.2 错误提示优化

**功能描述**：
- 区分不同类型的连接错误，提供具体提示
- 提供错误修复建议
- 支持错误日志查看

**错误分类**：
```typescript
enum SshErrorType {
  NETWORK_UNREACHABLE = 'NETWORK_UNREACHABLE', // 网络不可达
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT', // 连接超时
  AUTH_FAILED = 'AUTH_FAILED', // 认证失败
  HOST_KEY_CHANGED = 'HOST_KEY_CHANGED', // Host key 变更
  PRIVATE_KEY_NOT_FOUND = 'PRIVATE_KEY_NOT_FOUND', // 私钥不存在
  PERMISSION_DENIED = 'PERMISSION_DENIED', // 权限被拒绝
  UNKNOWN = 'UNKNOWN', // 未知错误
}

const errorMessages: Record<SshErrorType, { title: string; suggestion: string }> = {
  [SshErrorType.NETWORK_UNREACHABLE]: {
    title: '无法连接到服务器',
    suggestion: '请检查网络连接和服务器地址是否正确',
  },
  [SshErrorType.CONNECTION_TIMEOUT]: {
    title: '连接超时',
    suggestion: '请检查服务器是否在线，或尝试增加超时时间',
  },
  [SshErrorType.AUTH_FAILED]: {
    title: '认证失败',
    suggestion: '请检查用户名、密码或私钥是否正确',
  },
  [SshErrorType.HOST_KEY_CHANGED]: {
    title: '服务器身份验证失败',
    suggestion: '服务器 host key 已变更，可能是中间人攻击，请确认服务器身份',
  },
  [SshErrorType.PRIVATE_KEY_NOT_FOUND]: {
    title: '私钥文件不存在',
    suggestion: '请检查私钥路径是否正确',
  },
  [SshErrorType.PERMISSION_DENIED]: {
    title: '权限被拒绝',
    suggestion: '请检查用户是否有登录权限',
  },
  [SshErrorType.UNKNOWN]: {
    title: '连接失败',
    suggestion: '请检查配置或查看错误日志',
  },
}
```

**实现方案**：
```typescript
// 在 sshBackend.ts 中捕获具体错误
async start(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    this.client.on('error', (err: Error & { level?: string }) => {
      const errorType = classifySshError(err)
      reject(new SshConnectionError(errorType, err.message))
    })
  })
}

// 在 sessionActions.ts 中处理错误
try {
  const session = await createSessionFromConfig(input)
  if (!session) {
    message.error('创建会话失败，请重试')
  }
} catch (error) {
  if (error instanceof SshConnectionError) {
    const { title, suggestion } = errorMessages[error.type]
    Modal.error({
      title,
      content: (
        <div>
          <p>{suggestion}</p>
          <p style={{ fontSize: 12, color: '#999' }}>
            错误详情：{error.message}
          </p>
        </div>
      ),
    })
  } else {
    message.error('创建会话失败，请重试')
  }
}
```

**验收标准**：
- 所有 SSH 错误都能被正确分类
- 每种错误都有明确的标题和修复建议
- 错误信息对用户友好，避免技术术语
- 支持查看完整错误日志（高级用户）

#### 3.1.3 Host Key 验证优化

**功能描述**：
- 首次连接时弹窗确认 host key
- Host key 变更时警告用户
- 支持管理已知 host key 列表

**实现方案**：
```typescript
// 1. 在 main 进程实现 host key 管理
class HostKeyManager {
  private store = createStorageManager()
  
  // 获取已知 host key
  getHostKey(host: string): string | undefined {
    return this.store.get(`host_key_${host}`)
  }
  
  // 保存 host key
  saveHostKey(host: string, key: string): void {
    this.store.set(`host_key_${host}`, key)
  }
  
  // 验证 host key
  verifyHostKey(host: string, key: string): 'match' | 'mismatch' | 'unknown' {
    const saved = this.getHostKey(host)
    if (!saved) return 'unknown'
    return saved === key ? 'match' : 'mismatch'
  }
}

// 2. 在 sshBackend.ts 中实现验证逻辑
const verifier = this.cfg.hostVerifier || 'accept'
if (verifier === 'accept' && this.authBridge) {
  connectOpts.hostVerifier = async (key: Buffer) => {
    const keyFingerprint = key.toString('base64')
    const result = hostKeyManager.verifyHostKey(this.cfg.host, keyFingerprint)
    
    if (result === 'match') return true
    if (result === 'mismatch') {
      // 通过 authBridge 弹窗警告
      const confirmed = await this.authBridge.requestHostKeyConfirm(
        this.sessionId,
        this.cfg.host,
        keyFingerprint,
        true // mismatch
      )
      if (confirmed) {
        hostKeyManager.saveHostKey(this.cfg.host, keyFingerprint)
      }
      return confirmed
    }
    
    // unknown - 首次连接
    const confirmed = await this.authBridge.requestHostKeyConfirm(
      this.sessionId,
      this.cfg.host,
      keyFingerprint,
      false
    )
    if (confirmed) {
      hostKeyManager.saveHostKey(this.cfg.host, keyFingerprint)
    }
    return confirmed
  }
}

// 3. 在渲染进程实现确认弹窗
const SshHostKeyDialog: React.FC = () => {
  const [visible, setVisible] = useState(false)
  const [host, setHost] = useState('')
  const [fingerprint, setFingerprint] = useState('')
  const [isMismatch, setIsMismatch] = useState(false)
  
  useEffect(() => {
    window.electronAPI.onHostKeyConfirm((sessionId, host, fingerprint, isMismatch) => {
      setHost(host)
      setFingerprint(fingerprint)
      setIsMismatch(isMismatch)
      setVisible(true)
    })
  }, [])
  
  const handleConfirm = () => {
    window.electronAPI.respondHostKeyConfirm(true)
    setVisible(false)
  }
  
  const handleCancel = () => {
    window.electronAPI.respondHostKeyConfirm(false)
    setVisible(false)
  }
  
  return (
    <Modal
      title={isMismatch ? '⚠️ 警告：服务器身份验证失败' : '首次连接服务器'}
      open={visible}
      onOk={handleConfirm}
      onCancel={handleCancel}
      okText="信任并连接"
      cancelText="取消"
      okButtonProps={isMismatch ? { danger: true } : {}}
    >
      <div>
        {isMismatch ? (
          <Alert
            type="error"
            message="服务器 Host Key 已变更"
            description="这可能是中间人攻击，请确认服务器身份后再连接。"
          />
        ) : (
          <p>您即将首次连接到以下服务器：</p>
        )}
        <div style={{ margin: '16px 0', padding: '12px', background: '#f5f5f5', borderRadius: 4 }}>
          <p><strong>主机：</strong>{host}</p>
          <p><strong>Host Key 指纹：</strong></p>
          <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{fingerprint}</code>
        </div>
        <p style={{ fontSize: 12, color: '#999' }}>
          请通过其他渠道（如 SSH 命令）确认此指纹是否正确。
        </p>
      </div>
    </Modal>
  )
}
```

**验收标准**：
- 首次连接时弹窗显示 host key 指纹
- Host key 变更时显示警告（红色）
- 用户可选择信任并保存
- 支持查看和管理已保存的 host key
- 提供"不再提示"选项（不推荐）

---

### 3.2 P1 优化（重要功能）

#### 3.2.1 批量操作

**功能描述**：
- 支持多选会话卡片
- 批量重连、关闭、删除
- 批量创建会话（从多个预设）

**实现方案**：
```typescript
// 1. 在 App.tsx 添加多选模式
const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
const [batchMode, setBatchMode] = useState(false)

const handleToggleSelect = (sessionId: string) => {
  const newSelected = new Set(selectedSessions)
  if (newSelected.has(sessionId)) {
    newSelected.delete(sessionId)
  } else {
    newSelected.add(sessionId)
  }
  setSelectedSessions(newSelected)
}

// 2. 在 Toolbar 添加批量操作按钮
{batchMode && (
  <Space>
    <Button onClick={() => handleBatchReconnect()}>
      批量重连 ({selectedSessions.size})
    </Button>
    <Button onClick={() => handleBatchClose()}>
      批量关闭 ({selectedSessions.size})
    </Button>
    <Button onClick={() => handleBatchDelete()}>
      批量删除 ({selectedSessions.size})
    </Button>
  </Space>
)}

// 3. 实现批量操作逻辑
const handleBatchReconnect = async () => {
  const sessionsToReconnect = sessions.filter(s => selectedSessions.has(s.id))
  
  for (const session of sessionsToReconnect) {
    if (session.connectionStatus === 'disconnected') {
      await handleReconnect(session)
    }
  }
  
  setSelectedSessions(new Set())
  setBatchMode(false)
  message.success(`已重连 ${sessionsToReconnect.length} 个会话`)
}
```

**验收标准**：
- 支持多选会话卡片
- 批量重连、关闭、删除功能正常
- 操作前有确认提示
- 操作进度可视化

#### 3.2.2 连接状态可视化

**功能描述**：
- 在会话卡片上显示醒目的连接状态
- 断开的会话卡片边框变红
- 支持按连接状态筛选

**实现方案**：
```typescript
// 在 SessionCard.tsx 中根据状态显示不同样式
const getCardStyle = () => {
  if (session.connectionStatus === 'disconnected') {
    return {
      border: '2px solid #ff4d4f',
      boxShadow: '0 0 8px rgba(255, 77, 79, 0.3)',
    }
  }
  if (session.connectionStatus === 'connecting') {
    return {
      border: '2px solid #faad14',
    }
  }
  return {}
}

<Card
  style={{
    ...getCardStyle(),
    // 其他样式
  }}
>
  {/* 卡片内容 */}
</Card>

// 在 Toolbar 添加状态筛选
<Select
  mode="multiple"
  placeholder="按连接状态筛选"
  onChange={handleStatusFilter}
>
  <Select.Option value="connected">已连接</Select.Option>
  <Select.Option value="disconnected">已断开</Select.Option>
  <Select.Option value="connecting">连接中</Select.Option>
</Select>
```

**验收标准**：
- 断开的会话卡片有明显的视觉提示（红色边框）
- 连接中的会话显示黄色边框
- 支持按状态筛选
- 状态变化时有动画过渡

#### 3.2.3 快捷键支持

**功能描述**：
- `Ctrl/Cmd + N`：新建会话
- `Ctrl/Cmd + R`：重连当前会话
- `Ctrl/Cmd + W`：关闭当前会话
- `Ctrl/Cmd + Shift + P`：打开预设管理
- `Ctrl/Cmd + K`：快速切换会话
- `Alt + 1/2/3...`：切换到第 1/2/3... 个会话

**实现方案**：
```typescript
// 在 App.tsx 中监听快捷键
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl/Cmd + N：新建会话
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault()
      setNewSessionOpen(true)
    }
    
    // Ctrl/Cmd + R：重连当前会话
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault()
      const activeSession = sessions.find(s => s.id === activeSessionId)
      if (activeSession) {
        handleReconnect(activeSession)
      }
    }
    
    // Ctrl/Cmd + W：关闭当前会话
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault()
      const activeSession = sessions.find(s => s.id === activeSessionId)
      if (activeSession) {
        handleCloseSession(activeSession)
      }
    }
    
    // Alt + 数字：切换会话
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault()
      const index = parseInt(e.key) - 1
      if (sessions[index]) {
        setActiveSessionId(sessions[index].id)
      }
    }
  }
  
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [sessions, activeSessionId])
```

**验收标准**：
- 所有快捷键正常工作
- 不与其他应用快捷键冲突
- 支持自定义快捷键（高级功能）
- 在设置中显示快捷键列表

---

### 3.3 P2 优化（体验提升）

#### 3.3.1 预设管理优化

**功能描述**：
- 预设支持自定义名称（不限于 `username@host`）
- 预设支持分组
- 预设支持导入/导出
- 预设支持搜索

**实现方案**：
```typescript
// 1. 在 Preset 类型中添加 tags 字段
interface Preset {
  id: string
  name: string
  kind: 'local' | 'ssh'
  tags?: string[] // 新增：标签/分组
  // 其他字段...
}

// 2. 在 PresetsDialog 添加搜索和筛选
const [searchText, setSearchText] = useState('')
const [filterTag, setFilterTag] = useState<string | null>(null)

const filteredPresets = presets.filter(p => {
  const matchSearch = p.name.toLowerCase().includes(searchText.toLowerCase())
  const matchTag = !filterTag || p.tags?.includes(filterTag)
  return matchSearch && matchTag
})

// 3. 实现导入/导出
const handleExportPresets = () => {
  const data = JSON.stringify(presets, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tcommander-presets-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const handleImportPresets = async (file: File) => {
  const text = await file.text()
  const imported = JSON.parse(text)
  // 合并预设（去重）
  // ...
}
```

**验收标准**：
- 预设支持自定义名称
- 预设支持标签/分组
- 支持搜索和筛选
- 支持导入/导出 JSON 文件

#### 3.3.2 连接历史

**功能描述**：
- 记录最近连接的服务器列表
- 显示连接频率统计
- 支持从历史快速创建会话

**实现方案**：
```typescript
// 1. 在 store 中添加连接历史
interface ConnectionHistory {
  host: string
  username: string
  port: number
  lastConnected: number
  connectCount: number
}

// 2. 在创建会话时记录历史
const recordConnection = (sshConfig: SshSessionConfig) => {
  const history = useAppStore.getState().connectionHistory
  const existing = history.find(
    h => h.host === sshConfig.host && h.username === sshConfig.username
  )
  
  if (existing) {
    existing.lastConnected = Date.now()
    existing.connectCount++
  } else {
    history.push({
      host: sshConfig.host,
      username: sshConfig.username,
      port: sshConfig.port || 22,
      lastConnected: Date.now(),
      connectCount: 1,
    })
  }
  
  useAppStore.getState().setConnectionHistory(history)
}

// 3. 在新建会话对话框显示历史
<Select
  placeholder="从历史记录选择"
  onChange={handleSelectHistory}
>
  {connectionHistory
    .sort((a, b) => b.lastConnected - a.lastConnected)
    .slice(0, 10)
    .map(h => (
      <Select.Option key={`${h.host}-${h.username}`} value={`${h.host}-${h.username}`}>
        {h.username}@{h.host} (连接 {h.connectCount} 次)
      </Select.Option>
    ))}
</Select>
```

**验收标准**：
- 自动记录连接历史
- 显示最近 10 条历史
- 显示连接次数统计
- 支持从历史快速创建

#### 3.3.3 连接测试

**功能描述**：
- 在创建会话前测试连接
- 显示测试结果（延迟、认证状态）
- 提供修复建议

**实现方案**：
```typescript
// 1. 在主进程实现测试连接 API
ipcMain.handle('test-ssh-connection', async (_, config: SshConfig) => {
  const startTime = Date.now()
  
  try {
    const client = new Client()
    
    await new Promise<void>((resolve, reject) => {
      client.once('ready', resolve)
      client.once('error', reject)
      
      const connectOpts = {
        host: config.host,
        port: config.port || 22,
        username: config.username,
        readyTimeout: 5000, // 5 秒超时
        // 认证配置...
      }
      
      client.connect(connectOpts)
    })
    
    const latency = Date.now() - startTime
    client.end()
    
    return { success: true, latency }
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      errorType: classifySshError(error)
    }
  }
})

// 2. 在渲染进程调用测试
const handleTestConnection = async () => {
  const values = await form.validateFields()
  const config = buildSshConfig(values)
  
  setLoading(true)
  const result = await window.electronAPI.testSshConnection(config)
  setLoading(false)
  
  if (result.success) {
    message.success(`连接成功，延迟 ${result.latency}ms`)
  } else {
    const { title, suggestion } = errorMessages[result.errorType]
    Modal.error({
      title,
      content: suggestion,
    })
  }
}

// 3. 在表单添加测试按钮
<Button
  icon={<ApiOutlined />}
  onClick={handleTestConnection}
  loading={loading}
>
  测试连接
</Button>
```

**验收标准**：
- 测试连接在 5 秒内返回结果
- 显示延迟时间
- 失败时提供修复建议
- 不影响正常创建流程

---

## 四、实施计划

### 4.1 阶段划分

**第一阶段（2 周）：P0 核心体验**
- Week 1：一键重连 + 错误提示优化
- Week 2：Host Key 验证优化

**第二阶段（2 周）：P1 重要功能**
- Week 3：批量操作 + 连接状态可视化
- Week 4：快捷键支持

**第三阶段（2 周）：P2 体验提升**
- Week 5：预设管理优化 + 连接历史
- Week 6：连接测试

### 4.2 优先级排序

| 优先级 | 功能 | 工作量 | 价值 | ROI |
|--------|------|--------|------|-----|
| P0 | 一键重连 | 1 天 | 高 | 高 |
| P0 | 错误提示优化 | 2 天 | 高 | 高 |
| P0 | Host Key 验证 | 3 天 | 高 | 中 |
| P1 | 批量操作 | 2 天 | 中 | 中 |
| P1 | 连接状态可视化 | 1 天 | 中 | 高 |
| P1 | 快捷键支持 | 2 天 | 中 | 中 |
| P2 | 预设管理优化 | 3 天 | 低 | 中 |
| P2 | 连接历史 | 2 天 | 低 | 中 |
| P2 | 连接测试 | 2 天 | 低 | 低 |

### 4.3 风险评估

**技术风险**：
1. Host Key 验证可能影响现有用户（需要重新确认）
   - 缓解：提供迁移脚本，自动保存已知 host key
2. 批量操作可能导致性能问题（大量并发连接）
   - 缓解：限制并发数，添加进度提示
3. 快捷键可能与其他应用冲突
   - 缓解：支持自定义快捷键，提供禁用选项

**产品风险**：
1. 功能过于复杂，新用户学习成本高
   - 缓解：保持默认配置简单，高级功能可选
2. 安全功能（Host Key）可能被用户视为麻烦
   - 缓解：提供"不再提示"选项（不推荐），教育用户重要性

---

## 五、验收标准

### 5.1 功能验收
- 所有 P0 功能在 2 周内完成并通过测试
- 所有 P1 功能在 4 周内完成并通过测试
- 所有 P2 功能在 6 周内完成并通过测试

### 5.2 性能验收
- 一键重连响应时间 < 3 秒
- 批量操作支持 50+ 并发会话
- 连接测试响应时间 < 5 秒
- 快捷键响应时间 < 100ms

### 5.3 用户体验验收
- 错误提示准确率 > 95%
- 用户完成任务的步骤减少 30%
- 用户满意度评分 > 4.5/5

---

## 六、附录

### 6.1 相关文档
- [Electron safeStorage 文档](https://www.electronjs.org/docs/latest/api/safe-storage)
- [ssh2 库文档](https://github.com/mscdex/ssh2)
- [Ant Design 组件库](https://ant.design/components/overview-cn)

### 6.2 参考资料
- VS Code Remote SSH 功能设计
- Termius SSH 客户端用户体验
- Xshell 连接管理最佳实践

### 6.3 术语表
- **Host Key**：SSH 服务器的身份标识，用于防止中间人攻击
- **safeStorage**：Electron 提供的 OS 级加密存储 API
- **connectionStatus**：会话连接状态（connecting/ready/disconnected）
- **预设**：保存的会话配置，可快速创建新会话

---

**文档版本**：v1.0  
**创建日期**：2026-06-19  
**最后更新**：2026-06-19  
**作者**：TCommander 产品团队  
**审核状态**：待审核
