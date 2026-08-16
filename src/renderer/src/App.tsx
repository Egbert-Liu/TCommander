import { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue } from 'react'
import { ConfigProvider, theme, Button, Checkbox, Space, Popconfirm, Input, Tooltip } from 'antd'
import { PlusCircleFilled, CodeFilled, DeleteOutlined, CloseOutlined, SettingFilled, SearchOutlined, ArrowUpOutlined, ArrowDownOutlined, EnterOutlined } from '@ant-design/icons'
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
import SshAuthDialog from './components/SshAuthDialog'
import { detectStatusWithRules, truncateHistory, joinTail, hasStatus, IDLE_THRESHOLD_MS } from './utils/statusDetector'
import { STATUS_COLORS } from './utils/statusColors'
import { sortSessions } from './utils/sessionSort'
import { terminalPool } from './utils/terminalPool'
import { getTerminalTheme } from './utils/terminalThemes'

/**
 * 主工作区顶部筛选栏（搜索框 + 状态多选筛选）显示开关。
 * 当前临时隐藏：改为 true 即恢复显示，筛选逻辑与状态始终保留。
 */
const SHOW_FILTER_BAR = false

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
  const terminalThemeId = useAppStore((s) => s.terminalTheme)
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
  // SSH 交互式认证输入框：主进程推 prompt 后弹出，用户输入后回传
  const [sshAuth, setSshAuth] = useState<{ open: boolean; prompt: string; sessionId: string }>({ open: false, prompt: '', sessionId: '' })
  const [batchInput, setBatchInput] = useState('')
  // 侧边栏会话节点导航：目标卡片 2s 主色描边高亮
  const [highlightSessionId, setHighlightSessionId] = useState<string | null>(null)
  const highlightTimerRef = useRef<number | null>(null)
  // 普通布局的 main 滚动容器：导航时在其中查找目标卡片
  const mainRef = useRef<HTMLElement>(null)

  // 侧边栏会话节点单击回调：滚动定位到对应卡片（smooth + 居中）并高亮 2s
  const handleNavigateSession = useCallback((sessionId: string) => {
    const el = mainRef.current?.querySelector(`[data-session-id="${sessionId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightSessionId(sessionId)
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => setHighlightSessionId(null), 2000)
  }, [])

  // 卸载时清理高亮复位定时器，避免组件卸载后仍触发 setHighlightSessionId
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = null
      }
    }
  }, [])

  // 计算各状态数量
  const statusCounts = useMemo(() => {
    const counts = { error: 0, 'needs-confirm': 0, 'needs-input': 0, running: 0, idle: 0 }
    sessions.forEach(s => {
      if (counts[s.status] !== undefined) counts[s.status]++
    })
    return counts
  }, [sessions])

  // Hook 服务器状态更新处理
  // 依赖数组为空：回调内经 getState() 读最新 sessions，
  // 避免每次 sessions 变化（每 100ms flush）都取消/重订阅 IPC 监听
  useEffect(() => {
    const unsub = window.electronAPI.onHookStatusUpdate((sessionId, payload) => {
      const { status, message } = payload
      const session = useAppStore.getState().sessions.find(s => s.id === sessionId)
      if (session) {
        useAppStore.getState().updateSession(sessionId, {
          status: status as any,
          matchedRuleName: message || 'Hook 状态更新',
        })
      }
    })
    return () => {
      unsub()
    }
  }, [])

  // Claude Code transcript 增量推送：主进程 transcriptManager watch 到新对话后回调
  useEffect(() => {
    const unsub = window.electronAPI.onClaudeTranscript((sessionId, appended) => {
      useAppStore.getState().appendClaudeTranscript(sessionId, appended)
    })
    return () => {
      unsub()
    }
  }, [])

  // 暴露 Hook 查询接口给主进程（依赖空数组 + getState()：注册一次即可，
  // 旧实现依赖 sessions 导致每次 flush 都重注册 window 函数）
  useEffect(() => {
    ;(window as any).__getHookSessionData = (sessionId: string) => {
      const session = useAppStore.getState().sessions.find(s => s.id === sessionId)
      if (!session) return null
      return {
        id: session.id,
        name: session.name,
        status: session.status,
        kind: session.kind,
        lastActivityAt: session.lastActivityAt,
        matchedRuleName: session.matchedRuleName,
      }
    }

    ;(window as any).__getHookAllSessions = () => {
      return {
        sessions: useAppStore.getState().sessions.map(s => ({
          id: s.id,
          name: s.name,
          status: s.status,
          kind: s.kind,
          lastActivityAt: s.lastActivityAt,
          matchedRuleName: s.matchedRuleName,
        })),
      }
    }

    return () => {
      delete (window as any).__getHookSessionData
      delete (window as any).__getHookAllSessions
    }
  }, [])

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
      terminalPool.destroy(id)
      removeSession(id)
    }
    setSelectedIds(new Set())
  }

  const handleBatchSend = async () => {
    const text = batchInput.trim()
    if (!text) return
    for (const id of selectedIds) {
      await window.electronAPI.sendInput(id, text + '\r')
    }
    setBatchInput('')
  }

  // 批量快捷操作：向所有选中会话发送特殊按键
  const handleBatchAction = async (key: string) => {
    const map: Record<string, string> = {
      'CtrlC': '\x03',
      'Y': 'y\r',
      'N': 'n\r',
      'Enter': '\r',
      'Up': '\x1b[A',
      'Down': '\x1b[B',
    }
    const data = map[key]
    if (!data) return
    for (const id of selectedIds) {
      await window.electronAPI.sendInput(id, data)
    }
  }

  // 状态多选筛选：toggle 某个状态到/从筛选数组
  // 与分组筛选互斥：有状态筛选时清空分组
  const handleStatusFilterChange = (status: string) => {
    const current = useAppStore.getState().statusFilter
    const next = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status]
    setStatusFilter(next)
    if (next.length > 0) setSelectedGroupId(null)
  }

  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        const [savedPresets, savedGroups, savedSnapshots, savedDarkMode, savedRules, savedTerminalTheme, savedMarkdownEnabled] = await Promise.all([
          window.electronAPI.storageGet('presets'),
          window.electronAPI.storageGet('groups'),
          window.electronAPI.storageGet('snapshots'),
          window.electronAPI.storageGet('darkMode'),
          window.electronAPI.storageGet('rules'),
          window.electronAPI.storageGet('terminalTheme'),
          window.electronAPI.storageGet('markdownEnabled'),
        ])
        if (savedPresets && Array.isArray(savedPresets)) setPresets(savedPresets)
        if (savedGroups && Array.isArray(savedGroups)) setGroups(savedGroups)
        if (savedSnapshots && Array.isArray(savedSnapshots)) setSnapshots(savedSnapshots)
        if (typeof savedDarkMode === 'boolean') setDarkMode(savedDarkMode)
        if (savedRules && Array.isArray(savedRules) && savedRules.length > 0) setRules(savedRules)
        if (typeof savedTerminalTheme === 'string') {
          useAppStore.getState().setTerminalTheme(savedTerminalTheme)
        }
        // Markdown 渲染层开关：仅在有持久化值时恢复（未存过则保持默认 false）
        if (typeof savedMarkdownEnabled === 'boolean') {
          useAppStore.getState().setMarkdownEnabled(!!savedMarkdownEnabled)
        }
      } catch (e) {
        console.error('加载持久化数据失败:', e)
      }
    }
    loadPersistedData()

    // 初始化终端实例池：统一订阅 PTY 输出，按 sessionId 分发到 xterm 实例
    terminalPool.init()

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
    // 监听 SSH 交互式认证请求（keyboard-interactive），弹出密码输入框
    const unsubSshAuth = window.electronAPI.onSshAuthPrompt((sessionId, prompt) => {
      setSshAuth({ open: true, prompt, sessionId })
    })
    return () => { unsubClosing(); unsubCloseConfirm(); unsubSshAuth(); terminalPool.dispose() }
  }, [])

  // 终端主题切换：热更新所有 xterm 实例的主题色（不重建实例）
  useEffect(() => {
    terminalPool.setTheme(getTerminalTheme(terminalThemeId))
  }, [terminalThemeId])

  const pendingBufferRef = useRef<Record<string, string[]>>({})
  const batchQueueRef = useRef<Record<string, string[]>>({})
  // 每会话批队列累计字节（近似值，按 string.length）：增量维护避免每个数据块
  // 都对整个队列做 O(n) 累加（旧实现高频输出时是 O(n²)）
  const batchBytesRef = useRef<Record<string, number>>({})
  const lastFlushTimeRef = useRef<Record<string, number>>({})
  const trailingTimerRef = useRef<Record<string, NodeJS.Timeout>>({})
  const FLUSH_INTERVAL = 100 // 状态检测 flush 间隔 100ms
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
    delete batchBytesRef.current[sessionId]

    const chunks: string[] = []
    if (pending && pending.length > 0) chunks.push(...pending)
    if (batched && batched.length > 0) chunks.push(...batched)
    if (chunks.length === 0) return

    const rawHistory = [...session.history, ...chunks]
    const newHistory = truncateHistory(rawHistory)
    // 性能优化：状态检测只需尾部内容。joinTail 从后向前只拼接尾部 16KB 的分块，
    // 避免 join 整个 512KB history（会话越长延迟越高）。
    // 注意：不再计算 previewText（cleanTerminalOutputKeepColor 的 2D 屏幕模拟）——
    // 卡片预览已是真实 xterm、MD 回退源用 history，previewText 在 UI 中已无消费者。
    const tailRaw = joinTail(newHistory, 16 * 1024)
    const detectResult = detectStatusWithRules(tailRaw, state.rules)

    if (detectResult.matched) {
      // 命中规则：应用新状态（可能是 error/needs-confirm/needs-input）
      // 状态变化时更新 stableActivityAt（排序防抖：仅在状态转换时更新）
      const statusChanged = detectResult.status !== session.status
      state.updateSession(sessionId, {
        history: newHistory,
        status: detectResult.status,
        matchedRuleName: detectResult.matchedRuleName,
        lastActivityAt: Date.now(),
        ...(statusChanged ? { stableActivityAt: Date.now() } : {})
      })
    } else {
      // 未命中但有新输出：会话在活动。
      // 关键：若之前处于「有状态」(error/needs-confirm/needs-input)，新输出已不再匹配，
      // 说明触发条件已过（例如错误被后续输出覆盖），立即清除状态回到 running。
      const prevHadStatus = hasStatus(session.status)
      state.updateSession(sessionId, {
        history: newHistory,
        status: 'running',
        matchedRuleName: prevHadStatus ? undefined : session.matchedRuleName,
        lastActivityAt: Date.now(),
        // 状态从有状态→running 是状态转换，更新 stableActivityAt
        ...(prevHadStatus ? { stableActivityAt: Date.now() } : {})
      })
    }
  }, [])

  useEffect(() => {
    const handleOutput = (sessionId: string, data: string) => {
      const state = useAppStore.getState()
      const session = state.sessions.find(s => s.id === sessionId)

      if (!session) {
        // 会话尚不存在（store 里还没有）：缓存到 pendingBuffer 等待匹配。
        // 同样施加字节上限——否则已删除会话的残余输出会无限堆积（内存泄漏）
        let pending = pendingBufferRef.current[sessionId]
        if (!pending) {
          pending = []
          pendingBufferRef.current[sessionId] = pending
        }
        pending.push(data)
        if (pending.length > 32) {
          // 粗粒度修剪：超过 32 块时按字节上限从头丢弃（低频操作，可接受 O(n)）
          let bytes = 0
          let cut = -1
          for (let i = pending.length - 1; i >= 0; i--) {
            bytes += pending[i].length
            if (bytes > BATCH_QUEUE_BYTE_LIMIT) { cut = i; break }
          }
          if (cut >= 0) pendingBufferRef.current[sessionId] = pending.slice(cut + 1)
        }
        return
      }

      let queue = batchQueueRef.current[sessionId]
      if (!queue) {
        queue = []
        batchQueueRef.current[sessionId] = queue
      }
      queue.push(data)

      // 字节上限：增量计数，超限时一次性从头修剪（保留最新 128 KB）
      const bytes = (batchBytesRef.current[sessionId] ?? 0) + data.length
      batchBytesRef.current[sessionId] = bytes
      if (bytes > BATCH_QUEUE_BYTE_LIMIT) {
        let kept = 0
        let cut = 0
        for (let i = queue.length - 1; i >= 0; i--) {
          kept += queue[i].length
          if (kept > BATCH_QUEUE_BYTE_LIMIT) { cut = i + 1; break }
        }
        if (cut > 0) {
          const trimmed = queue.slice(cut)
          batchQueueRef.current[sessionId] = trimmed
          batchBytesRef.current[sessionId] = trimmed.reduce((s, c) => s + c.length, 0)
        }
      }

      // 双定时器策略：前缘立即 flush + 后缘 30ms 节流
      const now = Date.now()
      const lastFlush = lastFlushTimeRef.current[sessionId] || 0
      const timeSinceLastFlush = now - lastFlush

      if (timeSinceLastFlush >= FLUSH_INTERVAL) {
        // 前缘：距离上次 flush 已超过间隔，立即 flush
        flushSession(sessionId)
        lastFlushTimeRef.current[sessionId] = now
      } else {
        // 后缘：设置定时器确保在间隔结束时 flush
        if (trailingTimerRef.current[sessionId] == null) {
          trailingTimerRef.current[sessionId] = setTimeout(() => {
            delete trailingTimerRef.current[sessionId]
            flushSession(sessionId)
            lastFlushTimeRef.current[sessionId] = Date.now()
          }, FLUSH_INTERVAL - timeSinceLastFlush)
        }
      }
    }

    const handleExit = (sessionId: string, exitCode: number) => {
      // 取消可能 pending 的后缘定时器 flush：进程已退出，handleExit 自己做最终 flush
      const trailingTimer = trailingTimerRef.current[sessionId]
      if (trailingTimer != null) {
        clearTimeout(trailingTimer)
        delete trailingTimerRef.current[sessionId]
      }

      const state = useAppStore.getState()
      const session = state.sessions.find(s => s.id === sessionId)

      if (session) {
        const pending = pendingBufferRef.current[sessionId] || []
        const batched = batchQueueRef.current[sessionId] || []
        delete pendingBufferRef.current[sessionId]
        delete batchQueueRef.current[sessionId]
        delete batchBytesRef.current[sessionId]

        const allChunks = [...pending, ...batched]
        const exitMsg = `\r\n\x1b[33m[进程已退出，退出码: ${exitCode}]\x1b[0m\r\n`
        const newHistory = [...session.history, ...allChunks, exitMsg]

        state.updateSession(sessionId, {
          history: newHistory,
          status: exitCode === 0 ? 'idle' : 'error',
          // 进程退出是状态转换，更新 stableActivityAt（排序防抖）
          stableActivityAt: Date.now(),
        })
      } else {
        delete pendingBufferRef.current[sessionId]
        delete batchQueueRef.current[sessionId]
        delete batchBytesRef.current[sessionId]
      }
    }

    const unsubOutput = window.electronAPI.onSessionOutput(handleOutput)
    const unsubExit = window.electronAPI.onSessionExit(handleExit)
    const unsubConnStatus = window.electronAPI.onSessionConnStatus((sessionId, status) => {
      useAppStore.getState().updateSession(sessionId, { connectionStatus: status as any })
    })

    return () => {
      unsubOutput()
      unsubExit()
      unsubConnStatus()
      Object.values(trailingTimerRef.current).forEach(id => clearTimeout(id))
      trailingTimerRef.current = {}
      lastFlushTimeRef.current = {}
      batchQueueRef.current = {}
      batchBytesRef.current = {}
      pendingBufferRef.current = {}
    }
  }, [flushSession])

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
          // running→idle 是状态转换，更新 stableActivityAt（排序防抖）
          state.updateSession(s.id, { status: 'idle', stableActivityAt: now })
          changed = true
        }
      }
      // updateSession 已触发 store 通知，无需额外动作
      void changed
    }, IDLE_CHECK_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  // 筛选栏隐藏期间清空残留的搜索词/状态筛选：隐藏后无 UI 入口可解除，
  // 不清空会导致会话列表「莫名」被过滤（两者均不持久化，重启本会清空，此处兜底）
  useEffect(() => {
    if (!SHOW_FILTER_BAR) {
      const state = useAppStore.getState()
      if (state.searchQuery) state.setSearchQuery('')
      if (state.statusFilter.length > 0) state.setStatusFilter([])
    }
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

    if (statusFilter.length > 0) {
      filtered = filtered.filter(s => statusFilter.includes(s.status))
    }

    // 排序规则（用户要求）：
    //   1. 「有状态」(error/needs-confirm/needs-input) 的会话永远排最前，
    //      组内按严重程度排：error < needs-confirm < needs-input。
    //   2. 「无状态」(running/idle) 的会话排在所有有状态会话之后，
    //      组内按 stableActivityAt 倒序——仅状态转换时更新，避免持续输出会话互相换位（抖动）。
    return sortSessions(filtered)
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
            scope: 'all' as const,
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
        {/* 全屏分支：外层 fixed 全屏遮罩，左右布局——左侧会话树 Sidebar，右侧全屏终端 */}
        <div
          className="fixed inset-0 flex"
          style={{ zIndex: 'var(--z-fullscreen)', background: 'var(--ant-color-bg-base)' }}
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            onNavigateSession={handleNavigateSession}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <FullscreenTerminal />
          </div>
        </div>
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
        <SshAuthDialog
          open={sshAuth.open}
          prompt={sshAuth.prompt}
          sessionId={sshAuth.sessionId}
          onReply={(answer) => {
            setSshAuth({ open: false, prompt: '', sessionId: '' })
            window.electronAPI.replySshAuth(answer)
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
          previewLineCount={previewLineCount}
          onPreviewLineCountChange={setPreviewLineCount}
        />
        
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            onNavigateSession={handleNavigateSession}
          />

          <main
            ref={mainRef}
            className="flex-1 overflow-auto"
            style={{
              padding: 16,
              background: 'var(--ant-color-bg-container)',
            }}
          >
            {/* 筛选栏：搜索 + 状态多选筛选
                高度与左侧 Sidebar 顶部 header (32px) 对齐，
                控件高度 28px 垂直居中于 32px 容器。
                SHOW_FILTER_BAR = false 临时隐藏整条筛选栏（代码保留，
                恢复时改回 true 即可）；搜索/筛选的过滤逻辑不受影响。 */}
            {SHOW_FILTER_BAR && (
            <div className="mb-4 flex items-center gap-3 flex-wrap" style={{ minHeight: 32 }}>
              <Input
                placeholder="搜索会话名称/内容..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }} />}
                allowClear
                size="small"
                style={{ width: 220, height: 28 }}
              />

              {/* 状态多选筛选：胶囊样式与 header pills 一致，水平展开不溢出 */}
              <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                {([
                  { key: 'error', label: '错误', count: statusCounts.error },
                  { key: 'needs-confirm', label: '待确认', count: statusCounts['needs-confirm'] },
                  { key: 'needs-input', label: '待输入', count: statusCounts['needs-input'] },
                  { key: 'running', label: '运行中', count: statusCounts.running },
                  { key: 'idle', label: '空闲', count: statusCounts.idle },
                ] as const).map(({ key, label, count }) => {
                  const active = statusFilter.includes(key)
                  const color = STATUS_COLORS[key as keyof typeof STATUS_COLORS]?.color || '#999'
                  return (
                    <button
                      key={key}
                      onClick={() => handleStatusFilterChange(key)}
                      className="status-pill"
                      data-active={active}
                      style={{
                        background: active ? `${color}33` : `${color}14`,
                        border: `1px solid ${active ? color : `${color}40`}`,
                        color,
                        flexShrink: 0,
                      }}
                      title={active ? `点击清除「${label}」筛选` : `只看「${label}」的会话`}
                    >
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{count}</span>
                      <span>{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            )}

            {selectedIds.size >= 2 && (
              <div className="mb-3 flex items-center gap-2" style={{ padding: '6px 12px', background: 'var(--ant-color-primary-bg)', borderRadius: 6, border: '1px solid var(--ant-color-primary-border)' }}>
                <Input
                  placeholder={`批量输入到 ${selectedIds.size} 个会话...`}
                  value={batchInput}
                  onChange={(e) => setBatchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleBatchSend() } }}
                  size="small"
                  style={{ flex: 1, height: 28 }}
                />
                <Button type="primary" size="small" onClick={handleBatchSend} disabled={!batchInput.trim()}>
                  发送到 {selectedIds.size} 个会话
                </Button>
                <span style={{ width: 1, height: 20, background: 'var(--ant-color-border)', flexShrink: 0 }} />
                <Tooltip title="向所有选中会话发送 Ctrl+C">
                  <Button size="small" onClick={() => handleBatchAction('CtrlC')} style={{ height: 28, minWidth: 28, padding: 0, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>^C</Button>
                </Tooltip>
                <Tooltip title="发送 Y">
                  <Button size="small" onClick={() => handleBatchAction('Y')} style={{ height: 28, minWidth: 28, padding: 0, fontSize: 11 }}>Y</Button>
                </Tooltip>
                <Tooltip title="发送 N">
                  <Button size="small" onClick={() => handleBatchAction('N')} style={{ height: 28, minWidth: 28, padding: 0, fontSize: 11 }}>N</Button>
                </Tooltip>
                <Tooltip title="发送 Enter">
                  <Button size="small" onClick={() => handleBatchAction('Enter')} icon={<EnterOutlined style={{ fontSize: 11 }} />} style={{ height: 28, minWidth: 28, padding: 0 }} />
                </Tooltip>
                <Tooltip title="发送 ↑">
                  <Button size="small" onClick={() => handleBatchAction('Up')} icon={<ArrowUpOutlined style={{ fontSize: 11 }} />} style={{ height: 28, minWidth: 28, padding: 0 }} />
                </Tooltip>
                <Tooltip title="发送 ↓">
                  <Button size="small" onClick={() => handleBatchAction('Down')} icon={<ArrowDownOutlined style={{ fontSize: 11 }} />} style={{ height: 28, minWidth: 28, padding: 0 }} />
                </Tooltip>
              </div>
            )}

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
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))' }}>
                {filteredSessions.map((session, index) => (
                  <div
                    key={session.id}
                    data-session-id={session.id}
                    className="animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <SessionCard
                      session={session}
                      onResetSession={handleResetSession}
                      selectable={true}
                      selected={selectedIds.has(session.id)}
                      onSelect={handleSelectToggle}
                      highlight={highlightSessionId === session.id}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                {statusFilter.length > 0 ? (
                  <EmptyState
                    icon={<CodeFilled style={{ fontSize: 28, color: STATUS_COLORS[statusFilter[0] as keyof typeof STATUS_COLORS]?.color }} />}
                    tint={STATUS_COLORS[statusFilter[0] as keyof typeof STATUS_COLORS]?.bg}
                    title={`没有匹配的会话（筛选: ${statusFilter.map(f => f === 'error' ? '错误' : f === 'needs-confirm' ? '待确认' : f === 'needs-input' ? '待输入' : f === 'running' ? '运行中' : f).join('、')}）`}
                  >
                    <button
                      onClick={() => setStatusFilter([])}
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
                      <Button type="primary" icon={<PlusCircleFilled />} size="small" onClick={() => setShowNewSession(true)}>
                        新建会话
                      </Button>
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
        <SshAuthDialog
          open={sshAuth.open}
          prompt={sshAuth.prompt}
          sessionId={sshAuth.sessionId}
          onReply={(answer) => {
            setSshAuth({ open: false, prompt: '', sessionId: '' })
            window.electronAPI.replySshAuth(answer)
          }}
        />
      </div>
    </ConfigProvider>
  )
}

export default App
