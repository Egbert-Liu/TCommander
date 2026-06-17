import { useState, useMemo, useEffect, useRef } from 'react'
import { ConfigProvider, theme, Button, Checkbox, Space, Popconfirm, Dropdown, Input, Select } from 'antd'
import type { MenuProps } from 'antd'
import { PlusCircleFilled, CodeFilled, DeleteOutlined, CloseOutlined, SettingFilled, SearchOutlined } from '@ant-design/icons'
import { useAppStore } from './store'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import SessionCard from './components/SessionCard'
import FullscreenTerminal from './components/FullscreenTerminal'
import NewSessionDialog from './components/NewSessionDialog'
import PresetsDialog from './components/PresetsDialog'
import SnapshotsDialog from './components/SnapshotsDialog'
import RulesDialog from './components/RulesDialog'
import EmptyState from './components/EmptyState'
import LoadingMask from './components/LoadingMask'
import { cleanTerminalOutput, detectStatusWithRules, truncateHistory } from './utils/statusDetector'
import { STATUS_COLORS } from './utils/statusColors'
import { createSessionFromConfig } from './utils/sessionActions'

/** Sync Ant Design theme tokens to :root CSS variables so var(--ant-*) works in all inline styles */
function ThemeSync() {
  const { token } = theme.useToken()
  useEffect(() => {
    const root = document.documentElement
    const vars: Record<string, string> = {
      '--ant-color-bg-layout': token.colorBgLayout,
      '--ant-color-bg-container': token.colorBgContainer,
      '--ant-color-bg-base': token.colorBgBase,
      '--ant-color-bg-elevated': token.colorBgElevated,
      '--ant-color-text': token.colorText,
      '--ant-color-text-secondary': token.colorTextSecondary,
      '--ant-color-text-tertiary': token.colorTextTertiary,
      '--ant-color-border': token.colorBorder,
      '--ant-color-border-secondary': token.colorBorderSecondary,
      '--ant-color-primary': token.colorPrimary,
      '--ant-color-primary-bg': token.colorPrimaryBg,
      '--ant-color-fill': token.colorFill,
      '--ant-color-fill-quaternary': token.colorFillQuaternary,
      '--ant-color-error': token.colorError,
      '--ant-color-error-bg': token.colorErrorBg,
      // 状态色（单一来源 STATUS_COLORS）+ 主色 + 标题栏控制区宽度，供 CSS var 引用
      ...Object.fromEntries(
        Object.entries(STATUS_COLORS).flatMap(([status, c]) => [
          [`--status-${status}`, c.color],
          [`--status-${status}-bg`, c.bg],
        ])
      ),
      '--primary': '#38bdf8',
      '--titlebar-control-width': /Win/.test(navigator.userAgent) ? '138px' : '0px',
    }
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, String(v)))
  }, [token])
  return null
}

function App() {
  const sessions = useAppStore((s) => s.sessions)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)
  const selectedGroupId = useAppStore((s) => s.selectedGroupId)
  const setSelectedGroupId = useAppStore((s) => s.setSelectedGroupId)
  const statusFilter = useAppStore((s) => s.statusFilter)
  const setStatusFilter = useAppStore((s) => s.setStatusFilter)
  const isFullscreen = useAppStore((s) => s.isFullscreen)
  const darkMode = useAppStore((s) => s.darkMode)
  const setPresets = useAppStore((s) => s.setPresets)
  const setGroups = useAppStore((s) => s.setGroups)
  const setSnapshots = useAppStore((s) => s.setSnapshots)
  const setDarkMode = useAppStore((s) => s.setDarkMode)
  const setRules = useAppStore((s) => s.setRules)
  const removeSession = useAppStore((s) => s.removeSession)
  const previewLineCount = useAppStore((s) => s.previewLineCount)
  const setPreviewLineCount = useAppStore((s) => s.setPreviewLineCount)

  const [showNewSession, setShowNewSession] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [resetTarget, setResetTarget] = useState<import('./types').Session | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 计算各状态数量
  const statusCounts = useMemo(() => {
    const counts = { error: 0, 'needs-confirm': 0, 'needs-input': 0, running: 0, idle: 0 }
    sessions.forEach(s => {
      if (counts[s.status] !== undefined) counts[s.status]++
    })
    return counts
  }, [sessions])

  // 批量选择操作
  const handleSelectAll = () => {
    if (selectedIds.size === filteredSessions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredSessions.map(s => s.id)))
    }
  }

  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      await window.electronAPI.closeSession(id)
      removeSession(id)
    }
    setSelectedIds(new Set())
  }

  // 状态筛选与分组筛选互斥：同一时刻只允许一个生效，避免结果相互干扰
  const handleStatusFilterChange = (status: string | null) => {
    setStatusFilter(status)
    if (status) setSelectedGroupId(null)
  }

  // 空状态快速创建菜单
  const quickCreateItems = [
    { key: 'powershell', label: 'PowerShell', onClick: () => createSessionFromConfig({ name: 'PowerShell', terminalType: 'powershell' }) },
    { key: 'cmd', label: 'CMD', onClick: () => createSessionFromConfig({ name: 'CMD', terminalType: 'cmd' }) },
    { key: 'bash', label: 'Bash', onClick: () => createSessionFromConfig({ name: 'Bash', terminalType: 'bash' }) },
  ]

  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        const [savedPresets, savedGroups, savedSnapshots, savedDarkMode, savedRules, savedTerminalTheme] = await Promise.all([
          window.electronAPI.storageGet('presets'),
          window.electronAPI.storageGet('groups'),
          window.electronAPI.storageGet('snapshots'),
          window.electronAPI.storageGet('darkMode'),
          window.electronAPI.storageGet('rules'),
          window.electronAPI.storageGet('terminalTheme'),
        ])
        if (savedPresets && Array.isArray(savedPresets)) setPresets(savedPresets)
        if (savedGroups && Array.isArray(savedGroups)) setGroups(savedGroups)
        if (savedSnapshots && Array.isArray(savedSnapshots)) setSnapshots(savedSnapshots)
        if (typeof savedDarkMode === 'boolean') setDarkMode(savedDarkMode)
        if (savedRules && Array.isArray(savedRules) && savedRules.length > 0) setRules(savedRules)
        if (typeof savedTerminalTheme === 'string') {
          useAppStore.getState().setTerminalTheme(savedTerminalTheme)
        }
      } catch (e) {
        console.error('加载持久化数据失败:', e)
      }
    }
    loadPersistedData()

    // 监听主进程发来的「用户已确认关闭」事件，展示 loading 蒙板给用户即时反馈
    const unsubClosing = window.electronAPI.onAppClosing(() => {
      const setGlobalLoading = useAppStore.getState().setGlobalLoading
      setGlobalLoading(true, '正在关闭应用并释放所有会话资源...')
    })
    return () => { unsubClosing() }
  }, [])

  const pendingBufferRef = useRef<Record<string, string[]>>({})
  const batchQueueRef = useRef<Record<string, string[]>>({})
  const batchTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // 渲染进程批队列字节上限：每会话 128 KB；超过则从头丢弃旧块
  const BATCH_QUEUE_BYTE_LIMIT = 128 * 1024
  // 3 秒无匹配自动回退到 idle 的定时器
  const statusFallbackTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const STATUS_FALLBACK_MS = 3000

  useEffect(() => {
    const flushSession = (sessionId: string) => {
      const state = useAppStore.getState()
      const session = state.sessions.find(s => s.id === sessionId)
      if (!session) return

      const pending = pendingBufferRef.current[sessionId]
      const batched = batchQueueRef.current[sessionId]
      pendingBufferRef.current[sessionId] = []
      batchQueueRef.current[sessionId] = []

      const chunks: string[] = []
      if (pending && pending.length > 0) chunks.push(...pending)
      if (batched && batched.length > 0) chunks.push(...batched)
      if (chunks.length === 0) return

      const rawHistory = [...session.history, ...chunks]
      const newHistory = truncateHistory(rawHistory)
      const fullRaw = newHistory.join('')
      const cleanText = cleanTerminalOutput(fullRaw)
      const detectResult = detectStatusWithRules(fullRaw, state.rules)

      // 3 秒无匹配回退逻辑：
      //   - 命中规则  -> 立即应用，清除回退 timer
      //   - 未命中    -> 不立即回退 running，而是维持当前状态 3s，3s 内再无匹配才回退到 idle
      if (detectResult.matched) {
        const t = statusFallbackTimers.current[sessionId]
        if (t) { clearTimeout(t); delete statusFallbackTimers.current[sessionId] }
        state.updateSession(sessionId, {
          history: newHistory,
          previewText: cleanText,
          status: detectResult.status,
          matchedRuleName: detectResult.matchedRuleName,
          lastActivityAt: Date.now()
        })
      } else {
        // 没匹配：保存新的 history/preview，但不动 status
        state.updateSession(sessionId, {
          history: newHistory,
          previewText: cleanText,
          lastActivityAt: Date.now()
        })
        if (!statusFallbackTimers.current[sessionId]) {
          statusFallbackTimers.current[sessionId] = setTimeout(() => {
            delete statusFallbackTimers.current[sessionId]
            const s = useAppStore.getState()
            const sess = s.sessions.find(x => x.id === sessionId)
            if (!sess) return
            // 只有当前仍非 idle 时才回退，避免回退抖动
            if (sess.status !== 'idle') {
              s.updateSession(sessionId, { status: 'idle', matchedRuleName: undefined })
            }
          }, STATUS_FALLBACK_MS)
        }
      }
    }

    const handleOutput = (sessionId: string, data: string) => {
      const state = useAppStore.getState()
      const session = state.sessions.find(s => s.id === sessionId)

      if (!session) {
        if (!pendingBufferRef.current[sessionId]) {
          pendingBufferRef.current[sessionId] = []
        }
        pendingBufferRef.current[sessionId].push(data)
        return
      }

      if (!batchQueueRef.current[sessionId]) {
        batchQueueRef.current[sessionId] = []
      }
      const queue = batchQueueRef.current[sessionId]
      queue.push(data)

      // 字节上限：累计估算，若超过则从头丢弃旧块（保留最新 128 KB）
      let bytes = 0
      for (let i = queue.length - 1; i >= 0; i--) {
        bytes += queue[i].length
        if (bytes > BATCH_QUEUE_BYTE_LIMIT) {
          batchQueueRef.current[sessionId] = queue.slice(i + 1)
          break
        }
      }

      if (batchTimerRef.current[sessionId]) {
        clearTimeout(batchTimerRef.current[sessionId])
      }
      batchTimerRef.current[sessionId] = setTimeout(() => {
        flushSession(sessionId)
      }, 30)
    }

    const handleExit = (sessionId: string, exitCode: number) => {
      const timer = batchTimerRef.current[sessionId]
      if (timer) {
        clearTimeout(timer)
        delete batchTimerRef.current[sessionId]
      }
      // 进程退出时也要清掉回退 timer
      const fb = statusFallbackTimers.current[sessionId]
      if (fb) { clearTimeout(fb); delete statusFallbackTimers.current[sessionId] }

      const state = useAppStore.getState()
      const session = state.sessions.find(s => s.id === sessionId)

      if (session) {
        const pending = pendingBufferRef.current[sessionId] || []
        const batched = batchQueueRef.current[sessionId] || []
        delete pendingBufferRef.current[sessionId]
        delete batchQueueRef.current[sessionId]

        const allChunks = [...pending, ...batched]
        const exitMsg = `\r\n\x1b[33m[进程已退出，退出码: ${exitCode}]\x1b[0m\r\n`
        const newHistory = [...session.history, ...allChunks, exitMsg]
        const fullRaw = newHistory.join('')
        const cleanText = cleanTerminalOutput(fullRaw)

        state.updateSession(sessionId, {
          history: newHistory,
          previewText: cleanText,
          status: exitCode === 0 ? 'idle' : 'error',
        })
      } else {
        delete pendingBufferRef.current[sessionId]
        delete batchQueueRef.current[sessionId]
      }
    }

    const unsubOutput = window.electronAPI.onSessionOutput(handleOutput)
    const unsubExit = window.electronAPI.onSessionExit(handleExit)

    return () => {
      unsubOutput()
      unsubExit()
      Object.values(batchTimerRef.current).forEach(t => clearTimeout(t))
      batchTimerRef.current = {}
      batchQueueRef.current = {}
      pendingBufferRef.current = {}
      Object.values(statusFallbackTimers.current).forEach(t => clearTimeout(t))
      statusFallbackTimers.current = {}
    }
  }, [])

  // ========== 修复: 进入全屏时立即 flush 当前会话的批处理数据 ==========
  // 确保 FullscreenTerminal 的 replay 包含最新的数据，不会丢失最近 30ms 的输出
  const isFs = useAppStore((s) => s.isFullscreen)
  const activeId = useAppStore((s) => s.activeSessionId)
  useEffect(() => {
    if (isFs && activeId) {
      // 清除当前会话的 batch timer，立即 flush
      const timer = batchTimerRef.current[activeId]
      if (timer) {
        clearTimeout(timer)
        delete batchTimerRef.current[activeId]
      }
      // 手动 flush 一次（复用同一逻辑）
      const state = useAppStore.getState()
      const session = state.sessions.find((s: any) => s.id === activeId)
      if (session) {
        const pending = pendingBufferRef.current[activeId]
        const batched = batchQueueRef.current[activeId]
        const chunks: string[] = []
        if (pending && pending.length > 0) chunks.push(...pending)
        if (batched && batched.length > 0) chunks.push(...batched)
        if (chunks.length > 0) {
          pendingBufferRef.current[activeId] = []
          batchQueueRef.current[activeId] = []
          const rawHistory = [...session.history, ...chunks]
          const newHistory = truncateHistory(rawHistory)
          const fullRaw = newHistory.join('')
          const cleanText = cleanTerminalOutput(fullRaw)
          const detectResult = detectStatusWithRules(fullRaw, state.rules)
          if (detectResult.matched) {
            const t = statusFallbackTimers.current[activeId]
            if (t) { clearTimeout(t); delete statusFallbackTimers.current[activeId] }
            state.updateSession(activeId, {
              history: newHistory,
              previewText: cleanText,
              status: detectResult.status,
              matchedRuleName: detectResult.matchedRuleName,
              lastActivityAt: Date.now()
            })
          } else {
            state.updateSession(activeId, {
              history: newHistory,
              previewText: cleanText,
              lastActivityAt: Date.now()
            })
            if (!statusFallbackTimers.current[activeId]) {
              statusFallbackTimers.current[activeId] = setTimeout(() => {
                delete statusFallbackTimers.current[activeId]
                const s = useAppStore.getState()
                const sess = s.sessions.find(x => x.id === activeId)
                if (sess && sess.status !== 'idle') {
                  s.updateSession(activeId, { status: 'idle', matchedRuleName: undefined })
                }
              }, STATUS_FALLBACK_MS)
            }
          }
        }
      }
    }
  }, [isFs, activeId])

  const filteredSessions = useMemo(() => {
    const STATUS_PRIORITY: Record<string, number> = {
      'error': 0,
      'needs-confirm': 1,
      'needs-input': 2,
      'running': 3,
      'idle': 4,
    }

    let filtered = [...sessions]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(query)
      )
    }

    if (selectedGroupId) {
      filtered = filtered.filter(s => s.groupId === selectedGroupId)
    }

    if (statusFilter) {
      filtered = filtered.filter(s => s.status === statusFilter)
    }

    return filtered.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 5
      const pb = STATUS_PRIORITY[b.status] ?? 5
      if (pa !== pb) return pa - pb
      // 使用 createdAt + id 确保排序稳定，避免相同状态卡片位置跳动
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
      return a.id.localeCompare(b.id)
    })
  }, [sessions, searchQuery, selectedGroupId, statusFilter])

  const handleResetSession = (oldSession: import('./types').Session) => {
    setResetTarget(oldSession)
  }

  // 全局快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框内的按键
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return
      }

      const isMod = e.ctrlKey || e.metaKey

      // Ctrl+N / Cmd+N: 新建会话
      if (isMod && e.key === 'n') {
        e.preventDefault()
        setShowNewSession(true)
        return
      }

      // Ctrl+F / Cmd+F: 全屏当前选中的会话
      if (isMod && e.key === 'f') {
        e.preventDefault()
        const state = useAppStore.getState()
        if (state.sessions.length > 0) {
          const targetSession = state.activeSessionId
            ? state.sessions.find(s => s.id === state.activeSessionId)
            : state.sessions[0]
          if (targetSession) {
            state.setActiveSession(targetSession.id)
            state.setIsFullscreen(true)
          }
        }
        return
      }

      // Ctrl+S / Cmd+S: 保存快照
      if (isMod && e.key === 's') {
        e.preventDefault()
        const state = useAppStore.getState()
        if (state.sessions.length > 0) {
          const snapshot = {
            id: `snapshot-${Date.now()}`,
            name: `快照 ${new Date().toLocaleString()}`,
            data: {
              sessions: state.sessions.map(s => ({
                name: s.name,
                groupId: s.groupId,
                terminalType: s.terminalType,
                cwd: s.cwd,
                initialCommand: s.initialCommand,
                history: s.history
              })),
              groups: state.groups
            },
            createdAt: Date.now()
          }
          state.addSnapshot(snapshot)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (isFullscreen) {
    return (
      <ConfigProvider
        theme={{
          cssVar: true,
          algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: '#38bdf8',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: "'DM Sans', -apple-system, sans-serif",
          },
        }}
      >
        <ThemeSync />
        <FullscreenTerminal />
      </ConfigProvider>
    )
  }

  return (
    <ConfigProvider
      theme={{
        cssVar: true,
        algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#38bdf8',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: "'DM Sans', -apple-system, sans-serif",
        },
      }}
    >
      <ThemeSync />
      <div className="h-screen flex flex-col" style={{ background: 'var(--ant-color-bg-layout)' }}>
        <Toolbar
          onNewSession={() => setShowNewSession(true)} 
          onOpenPresets={() => setShowPresets(true)}
          onOpenSnapshots={() => setShowSnapshots(true)}
          onOpenRules={() => setShowRules(true)}
          statusCounts={statusCounts}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
        />
        
        <div className="flex flex-1 overflow-hidden">
          <Sidebar 
            collapsed={sidebarCollapsed} 
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} 
          />
          
          <main
            className="flex-1 overflow-auto"
            style={{
              padding: 16,
              background: 'var(--ant-color-bg-container)',
            }}
          >
            {/* 筛选栏：搜索 + 预览行数 + 当前激活的筛选条件
                高度与左侧 Sidebar 顶部 header (32px) 对齐，
                height 28 + 移除默认 size="small" 的 24 高度，使页面更协调。 */}
            <div className="mb-4 flex items-center gap-3 flex-wrap">
              <Input
                placeholder="搜索会话名称/内容..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }} />}
                allowClear
                size="small"
                style={{ width: 220, height: 28 }}
              />

              <Select
                value={previewLineCount}
                onChange={setPreviewLineCount}
                size="small"
                style={{ width: 120, height: 28 }}
                options={[
                  { value: 5, label: '5行预览' },
                  { value: 10, label: '10行预览' },
                  { value: 15, label: '15行预览' },
                  { value: 20, label: '20行预览' },
                ]}
              />

              {statusFilter && (
                <button
                  onClick={() => setStatusFilter(null)}
                  className="flex items-center gap-1 px-2 rounded-md transition-colors"
                  style={{
                    height: 22,
                    background: 'var(--ant-color-fill-quaternary)',
                    border: '1px solid var(--ant-color-border)',
                    color: 'var(--ant-color-text-secondary)',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  <span>状态: {statusFilter === 'error' ? '错误' : statusFilter === 'needs-confirm' ? '待确认' : statusFilter === 'needs-input' ? '待输入' : statusFilter === 'running' ? '运行中' : statusFilter}</span>
                  <CloseOutlined style={{ fontSize: 9 }} />
                </button>
              )}
            </div>

            {/* 批量操作工具栏 */}
            {selectedIds.size > 0 && (
              <div
                className="mb-4 flex items-center justify-between px-4 py-2 rounded-lg"
                style={{
                  background: 'var(--ant-color-primary-bg)',
                  border: '1px solid var(--ant-color-primary)',
                }}
              >
                <Space>
                  <Checkbox
                    checked={selectedIds.size === filteredSessions.length && filteredSessions.length > 0}
                    indeterminate={selectedIds.size > 0 && selectedIds.size < filteredSessions.length}
                    onChange={handleSelectAll}
                  />
                  <span style={{ fontSize: 12, color: 'var(--ant-color-text)' }}>
                    已选择 {selectedIds.size} 项
                  </span>
                </Space>
                <Space>
                  <Popconfirm
                    title="确认删除所选会话？"
                    description={`将删除 ${selectedIds.size} 个会话，该操作不可撤销`}
                    onConfirm={handleBatchDelete}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                  <Button
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    取消
                  </Button>
                </Space>
              </div>
            )}

            {filteredSessions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                {filteredSessions.map((session, index) => (
                  <div key={session.id} className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
                    <SessionCard
                      session={session}
                      onResetSession={handleResetSession}
                      selectable={true}
                      selected={selectedIds.has(session.id)}
                      onSelect={(id, sel) => {
                        if (sel) {
                          setSelectedIds(new Set([...selectedIds, id]))
                        } else {
                          const newSet = new Set(selectedIds)
                          newSet.delete(id)
                          setSelectedIds(newSet)
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                {statusFilter ? (
                  <EmptyState
                    icon={<CodeFilled style={{ fontSize: 28, color: STATUS_COLORS[statusFilter as keyof typeof STATUS_COLORS]?.color }} />}
                    tint={STATUS_COLORS[statusFilter as keyof typeof STATUS_COLORS]?.bg}
                    title={`没有${statusFilter === 'error' ? '错误' : statusFilter === 'needs-confirm' ? '待确认' : statusFilter === 'needs-input' ? '待输入' : statusFilter === 'running' ? '运行中' : statusFilter}的会话`}
                  >
                    <button
                      onClick={() => setStatusFilter(null)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--ant-color-primary)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      清除筛选
                    </button>
                  </EmptyState>
                ) : sessions.length === 0 ? (
                  <EmptyState
                    icon={<CodeFilled style={{ fontSize: 28, color: 'var(--primary)' }} />}
                    title="暂无终端会话"
                    description="创建一个新会话开始管理你的终端"
                  >
                    <Space>
                      <Dropdown menu={{ items: quickCreateItems as MenuProps['items'] }} trigger={['click']}>
                        <Button type="primary" icon={<PlusCircleFilled />} size="small">
                          快速创建
                        </Button>
                      </Dropdown>
                      <Button
                        icon={<SettingFilled />}
                        onClick={() => setShowNewSession(true)}
                        size="small"
                      >
                        详细配置
                      </Button>
                    </Space>
                  </EmptyState>
                ) : (
                  <div className="text-center">
                    <p style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
                      当前分组下没有会话
                    </p>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        <NewSessionDialog
          open={showNewSession || !!resetTarget}
          onClose={() => { setShowNewSession(false); setResetTarget(null) }}
          resetSession={resetTarget}
        />
        
        <PresetsDialog 
          open={showPresets} 
          onClose={() => setShowPresets(false)} 
        />

        <SnapshotsDialog
          open={showSnapshots}
          onClose={() => setShowSnapshots(false)}
        />

        <RulesDialog
          open={showRules}
          onClose={() => setShowRules(false)}
        />

        <LoadingMask />
      </div>
    </ConfigProvider>
  )
}

export default App
