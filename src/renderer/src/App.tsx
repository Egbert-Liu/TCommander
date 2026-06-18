import { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue } from 'react'
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
import CloseConfirmDialog from './components/CloseConfirmDialog'
import { cleanTerminalOutputKeepColor, detectStatusWithRules, truncateHistory, tailLines, hasStatus, IDLE_THRESHOLD_MS, statusPriority } from './utils/statusDetector'
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
  // 关闭应用确认框：主进程拦截原生 X 后通过 IPC 请求弹出
  const [closeConfirm, setCloseConfirm] = useState<{ open: boolean; sessionCount: number }>({ open: false, sessionCount: 0 })

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
    // 监听主进程发来的「请求关闭确认」事件（用户点了原生 X），
    // 弹出自定义 antd Modal 替代丑陋的原生 dialog。
    // 会话数直接从 store 读取（含已退出的卡片记录），保证 PTY 退出后仍能弹框。
    const unsubCloseConfirm = window.electronAPI.onRequestCloseConfirm(() => {
      setCloseConfirm({ open: true, sessionCount: useAppStore.getState().sessions.length })
    })
    return () => { unsubClosing(); unsubCloseConfirm() }
  }, [])

  const pendingBufferRef = useRef<Record<string, string[]>>({})
  const batchQueueRef = useRef<Record<string, string[]>>({})
  // 用 requestAnimationFrame 节流替代 setTimeout+clearTimeout。
  // 旧实现每来一个 chunk 都 clearTimeout 重设 timer，导致连续输出流中 flush 被无限推迟，
  // 表现为「按键后预览迟迟不更新」。rAF 在下一帧绘制前统一 flush 累积 chunk：
  //   - 首字节延迟 ≤ 1 帧(~16ms)，且不会被后续 chunk 推迟
  //   - 同一帧内多个 chunk 自动合并为一次 flush
  const rafIdRef = useRef<Record<string, number>>({})
  // 渲染进程批队列字节上限：每会话 128 KB；超过则从头丢弃旧块
  const BATCH_QUEUE_BYTE_LIMIT = 128 * 1024

  // ========== flushSession：抽出为稳定 useCallback，消除两处重复实现 ==========
  // 状态判定新逻辑（用户要求）：
  //   1. 「有输出就不可能是空闲」——空闲只由时间维度判定（见下方空闲检测定时器），不靠规则。
  //   2. 命中规则      -> 应用该状态（error/needs-confirm/needs-input）
  //   3. 未命中但有新输出 -> 会话仍在活动：若之前是「有状态」但新输出不再匹配，立即清除回 running。
  //      这样用户继续操作、错误信息被新输出冲走后，状态会自动消失。
  //   4. 不再有「3 秒无匹配回退」计时器——idle 完全由空闲定时器负责。
  const flushSession = useCallback((sessionId: string) => {
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
    // 性能优化：状态检测与预览清洗都只需尾部内容。
    // cleanTerminalOutputKeepColor / detectStatusWithRules 均为逐行处理，
    // 截取尾部 16KB 完整行即可，避免对整个 512KB history 全量重算（会话越长延迟越高）。
    const tailRaw = tailLines(fullRaw, 16 * 1024)
    const cleanText = cleanTerminalOutputKeepColor(tailRaw)
    const detectResult = detectStatusWithRules(tailRaw, state.rules)

    if (detectResult.matched) {
      // 命中规则：应用新状态（可能是 error/needs-confirm/needs-input）
      state.updateSession(sessionId, {
        history: newHistory,
        previewText: cleanText,
        status: detectResult.status,
        matchedRuleName: detectResult.matchedRuleName,
        lastActivityAt: Date.now()
      })
    } else {
      // 未命中但有新输出：会话在活动。
      // 关键：若之前处于「有状态」(error/needs-confirm/needs-input)，新输出已不再匹配，
      // 说明触发条件已过（例如错误被后续输出覆盖），立即清除状态回到 running。
      const prevHadStatus = hasStatus(session.status)
      state.updateSession(sessionId, {
        history: newHistory,
        previewText: cleanText,
        status: 'running',
        matchedRuleName: prevHadStatus ? undefined : session.matchedRuleName,
        lastActivityAt: Date.now()
      })
    }
  }, [])

  useEffect(() => {
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

      if (rafIdRef.current[sessionId] != null) {
        // 本帧已调度过 flush，后续 chunk 累积进 queue，本帧结束前一并 flush
        return
      }
      rafIdRef.current[sessionId] = requestAnimationFrame(() => {
        delete rafIdRef.current[sessionId]
        flushSession(sessionId)
      })
    }

    const handleExit = (sessionId: string, exitCode: number) => {
      // 取消可能 pending 的 rAF flush：进程已退出，handleExit 自己做最终 flush
      const rafId = rafIdRef.current[sessionId]
      if (rafId != null) {
        cancelAnimationFrame(rafId)
        delete rafIdRef.current[sessionId]
      }

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
        const tailRaw = tailLines(fullRaw, 16 * 1024)
        const cleanText = cleanTerminalOutputKeepColor(tailRaw)

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
      Object.values(rafIdRef.current).forEach(id => cancelAnimationFrame(id))
      rafIdRef.current = {}
      batchQueueRef.current = {}
      pendingBufferRef.current = {}
    }
  }, [flushSession])

  // ========== 修复: 进入全屏时立即 flush 当前会话的批处理数据 ==========
  // 确保 FullscreenTerminal 的 replay 包含最新的数据，不会丢失未 flush 的输出
  const isFs = useAppStore((s) => s.isFullscreen)
  const activeId = useAppStore((s) => s.activeSessionId)
  useEffect(() => {
    if (isFs && activeId) {
      // 取消可能 pending 的 rAF，改为立即 flush，保证全屏 replay 不丢数据
      const rafId = rafIdRef.current[activeId]
      if (rafId != null) {
        cancelAnimationFrame(rafId)
        delete rafIdRef.current[activeId]
      }
      // 直接调用统一的 flushSession，无需再重复实现
      flushSession(activeId)
    }
  }, [isFs, activeId, flushSession])

  // ========== 空闲检测定时器（用户要求：空闲 = 长期无输出） ==========
  // 「有输出就不可能是空闲」。每秒扫描一次所有会话：
  //   - 处于 running 且距 lastActivityAt 超过 IDLE_THRESHOLD_MS(10s) -> 标记为 idle
  //   - 有状态(error/needs-confirm/needs-input) 的会话不被动到（用户需关注的异常保持高亮）
  // 这样 idle 完全由时间维度驱动，不再依赖任何输出内容规则。
  useEffect(() => {
    const IDLE_CHECK_INTERVAL = 1000
    const interval = setInterval(() => {
      const state = useAppStore.getState()
      const now = Date.now()
      let changed = false
      for (const s of state.sessions) {
        // 只对「无状态且正在运行」的会话做空闲回落
        if (s.status === 'running' && now - s.lastActivityAt > IDLE_THRESHOLD_MS) {
          state.updateSession(s.id, { status: 'idle' })
          changed = true
        }
      }
      // updateSession 已触发 store 通知，无需额外动作
      void changed
    }, IDLE_CHECK_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  // 搜索关键词用 useDeferredValue 延迟：输入框立即响应（store 即时更新），
  // 但昂贵的 filter+sort 放到低优先级 transition 里，避免大列表下输入卡顿。
  const deferredSearch = useDeferredValue(searchQuery)

  const filteredSessions = useMemo(() => {
    let filtered = [...sessions]

    if (deferredSearch) {
      const query = deferredSearch.toLowerCase()
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

    // 排序规则（用户要求）：
    //   1. 「有状态」(error/needs-confirm/needs-input) 的会话永远排最前，
    //      组内按严重程度排：error < needs-confirm < needs-input。
    //   2. 「无状态」(running/idle) 的会话排在所有有状态会话之后，
    //      组内按最后输出时间(lastActivityAt)倒序——最近活动的在前，
    //      长期无输出的(idle)自然沉底。
    return filtered.sort((a, b) => {
      const aHas = hasStatus(a.status)
      const bHas = hasStatus(b.status)
      if (aHas && bHas) {
        // 两组都有状态：按严重程度
        const diff = statusPriority(a.status) - statusPriority(b.status)
        if (diff !== 0) return diff
      }
      if (aHas !== bHas) {
        // 有状态的排前面
        return aHas ? -1 : 1
      }
      // 同为无状态，或同为有状态且优先级相同：按最后输出时间倒序（新的在前）
      if (a.lastActivityAt !== b.lastActivityAt) return b.lastActivityAt - a.lastActivityAt
      // 时间也相同：用 createdAt + id 兜底，保证排序稳定，避免卡片位置跳动
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
      return a.id.localeCompare(b.id)
    })
  }, [sessions, deferredSearch, selectedGroupId, statusFilter])

  // useCallback 包装：保证 SessionCard (React.memo) 的 props 引用稳定，
  // 父组件因 searchQuery/darkMode 等变化重渲染时不会波及所有卡片
  const handleResetSession = useCallback((oldSession: import('./types').Session) => {
    setResetTarget(oldSession)
  }, [])

  // 批量选择的 toggle：用 functional setState 避免依赖 selectedIds，保持引用稳定
  const handleSelectToggle = useCallback((id: string, sel: boolean) => {
    setSelectedIds(prev => {
      if (sel) {
        return new Set([...prev, id])
      }
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

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
        {/* 全屏模式下也要挂载关闭确认框与 loading 蒙板，否则点 X 时主进程会一直 await */}
        <LoadingMask />
        <CloseConfirmDialog
          open={closeConfirm.open}
          sessionCount={closeConfirm.sessionCount}
          onCancel={() => {
            setCloseConfirm({ open: false, sessionCount: 0 })
            window.electronAPI.closeConfirmResponse(false)
          }}
          onConfirm={() => {
            setCloseConfirm({ open: false, sessionCount: 0 })
            window.electronAPI.closeConfirmResponse(true)
          }}
        />
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
                    // 与搜索框/下拉框对齐：高度 28px，字号 11
                    height: 28,
                    background: 'var(--ant-color-fill-quaternary)',
                    border: '1px solid var(--ant-color-border)',
                    color: 'var(--ant-color-text-secondary)',
                    fontSize: 11,
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
                      onSelect={handleSelectToggle}
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

        <CloseConfirmDialog
          open={closeConfirm.open}
          sessionCount={closeConfirm.sessionCount}
          onCancel={() => {
            setCloseConfirm({ open: false, sessionCount: 0 })
            window.electronAPI.closeConfirmResponse(false)
          }}
          onConfirm={() => {
            setCloseConfirm({ open: false, sessionCount: 0 })
            window.electronAPI.closeConfirmResponse(true)
          }}
        />
      </div>
    </ConfigProvider>
  )
}

export default App
