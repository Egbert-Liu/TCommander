import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { Button, Dropdown, Tooltip, message, Input } from 'antd'
import type { MenuProps } from 'antd'
import { ArrowLeftOutlined, CopyOutlined, SunFilled, MoonFilled, CheckOutlined, ReadOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../store'
import { Session, TranscriptEntry } from '../types'
import { getTerminalTheme, TERMINAL_THEMES } from '../utils/terminalThemes'
import { terminalPool } from '../utils/terminalPool'
import { useThrottledMarkdown } from '../utils/markdownView'

/** 递归提取 React 元素树内的纯文本（代码块复制用，rehype-highlight 后 code 内是多层 span） */
function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  const el = node as { props?: { children?: React.ReactNode } }
  if (el.props?.children != null) return extractText(el.props.children)
  return ''
}

/**
 * 代码块组件：语言标签 + 复制按钮（Wave Terminal 风格）。
 * react-markdown 的 components.pre 映射到这里；语言从子 code 元素的
 * className="language-xxx"（rehype-highlight 标注）中提取。
 */
function MarkdownCodeBlock({ children, ...rest }: React.ComponentPropsWithoutRef<'pre'>) {
  const [copied, setCopied] = useState(false)
  // 「已复制」状态自动复位的定时器 id：保存以便清理，避免组件卸载后仍 setState
  const copiedTimerRef = useRef<number | null>(null)
  const codeEl = Array.isArray(children) ? children[0] : children
  const className = ((codeEl as { props?: { className?: string } })?.props?.className) || ''
  const lang = /language-([\w-]+)/.exec(className)?.[1] ?? 'text'
  const codeText = extractText(children)

  // 卸载时清理定时器，防止组件卸载后回调里 setCopied 报错/泄漏
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current)
        copiedTimerRef.current = null
      }
    }
  }, [])

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(codeText)
      setCopied(true)
      // 连续点击复制时先清掉旧定时器，再重设新的复位定时器
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current)
      }
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      message.error('复制失败')
    }
  }

  return (
    <div className="md-code-block">
      <div className="md-code-header">
        <span className="md-code-lang">{lang}</span>
        <button
          type="button"
          className="md-code-copy"
          onClick={handleCopy}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {copied ? <CheckOutlined style={{ fontSize: 11 }} /> : <CopyOutlined style={{ fontSize: 11 }} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre {...rest}>{children}</pre>
    </div>
  )
}

/** react-markdown 组件映射：仅代码块需要定制，其余交给 CSS（.md-body）排版 */
const mdComponents: Components = {
  pre: MarkdownCodeBlock,
}

/** 插件数组提到模块级常量：避免每次渲染重建数组导致 react-markdown 误判插件变化全量重解析 */
const MD_REMARK_PLUGINS = [remarkGfm]
const MD_REHYPE_PLUGINS = [rehypeHighlight]

/** transcript 模式激活时传给 useThrottledMarkdown 的空 history：
 * 空数组引用稳定且 cleanMarkdownSource([]) 立即返回，完全跳过字节流清洗计算 */
const EMPTY_HISTORY: string[] = []

/** 取文本首行（工具调用摘要单行展示） */
function firstLine(text: string): string {
  const idx = text.indexOf('\n')
  const line = idx === -1 ? text : text.slice(0, idx)
  return line.length > 120 ? line.slice(0, 120) + '…' : line
}

/**
 * 对话流单条目（memo）：增量推送时仅新条目挂载，历史条目 props 不变不重渲。
 * - user：引用块风格消息
 * - assistant：Markdown 主体渲染（复用 .md-body 排版 + 代码块组件）
 * - tool-call / tool-result：<details> 折叠卡片（默认收起，点击展开）
 */
const TranscriptItem = memo(function TranscriptItem({ entry }: { entry: TranscriptEntry }) {
  if (entry.kind === 'user') {
    return (
      <div className="md-chat-user">
        <span className="md-chat-role">用户</span>
        <div className="md-chat-user-text">{entry.text}</div>
      </div>
    )
  }

  if (entry.kind === 'assistant') {
    return (
      <div className="md-chat-assistant">
        <div className="md-body">
          <ReactMarkdown
            remarkPlugins={MD_REMARK_PLUGINS}
            rehypePlugins={MD_REHYPE_PLUGINS}
            components={mdComponents}
          >
            {entry.text}
          </ReactMarkdown>
        </div>
      </div>
    )
  }

  if (entry.kind === 'tool-call') {
    return (
      <details className="md-chat-tool">
        <summary>
          <span className="md-chat-tool-badge">工具</span>
          <span className="md-chat-tool-name">{entry.toolName}</span>
          <span className="md-chat-tool-summary">{firstLine(entry.text)}</span>
        </summary>
        <pre className="md-chat-tool-detail">{entry.text}</pre>
      </details>
    )
  }

  // tool-result
  return (
    <details className={`md-chat-tool-result${entry.isError ? ' is-error' : ''}`}>
      <summary>
        <span className="md-chat-tool-badge">{entry.isError ? '错误' : '结果'}</span>
        <span className="md-chat-tool-summary">{firstLine(entry.text)}</span>
      </summary>
      <pre className="md-chat-tool-detail">{entry.text}</pre>
    </details>
  )
})

/** Claude Code 对话流：transcript 结构化条目列表（Wave AI 面板 / Warp agent block 的思路） */
function ClaudeConversation({ entries }: { entries: TranscriptEntry[] }) {
  return (
    <div className="md-chat">
      {/* 稳定 id 作 key（store 分配）：500 条截断时仅卸载头部条目，
          index key 会让全部条目错位 remount → ReactMarkdown 全量重解析 */}
      {entries.map((entry) => (
        <TranscriptItem key={entry.id ?? entry.ts ?? entry.text.slice(0, 32)} entry={entry} />
      ))}
    </div>
  )
}

/**
 * 全屏 Markdown 渲染层：独立子组件，仅在 markdownEnabled 开启时挂载。
 *
 * 双数据源（业界调研结论：终端字节流清洗不可能是好的 Markdown 源）：
 * 1. 优先：Claude Code transcript（hook 报告 → 主进程 watch → IPC 增量推送），
 *    结构化对话流渲染（user / assistant Markdown / 工具调用折叠卡片）；
 * 2. 回退：无 transcript（未配置集成 / 非 Claude Code 会话）时，沿用
 *    终端尾部字节流清洗 + react-markdown 渲染（视口语义）。
 *
 * data-md-theme 跟随终端主题明暗（dark/light），控制 hljs token 配色（见 index.css）。
 * sticky-bottom 自动跟随：内容更新时若用户停留在底部附近则自动滚到底；
 * 用户手动上滚查看时暂停跟随，滚回底部附近自动恢复。
 */
function FullscreenMarkdownOverlay({ session }: { session: Session }) {
  const terminalThemeId = useAppStore((s) => s.terminalTheme)
  const transcript = useAppStore((s) => s.claudeTranscripts[session.id])
  const theme = getTerminalTheme(terminalThemeId)
  const useTranscript = transcript != null && transcript.length > 0
  // 回退数据源：字节流清洗（300ms 节流）。transcript 模式激活时传空数组——
  // hook 需无条件调用（React Hooks 规则），但空输入让 cleanMarkdownSource
  // 立即返回空串，完全跳过清洗计算（旧实现即便用不上也每 300ms 白算一次）
  const fallbackSource = useThrottledMarkdown(useTranscript ? EMPTY_HISTORY : session.history)

  const scrollRef = useRef<HTMLDivElement>(null)
  // 是否吸附底部：初次挂载默认吸附（直接显示最新输出）
  const stickRef = useRef(true)
  // 待执行的跟随滚动 rAF id：effect 每次内容变化都会调度新 rAF，
  // ref 只存最新 id，组件卸载时 cancel，避免操作已卸载的 DOM
  const rafRef = useRef<number | null>(null)

  // 用户滚动时更新吸附状态：距底部 ≤40px 视为「在底部」
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
  }, [])

  // 内容更新后跟随：吸附状态下滚到底部（next frame 等 DOM 完成布局）。
  // 依赖：transcript 条目数（对话流）或清洗文本（回退源）
  const transcriptLength = transcript?.length ?? 0
  useEffect(() => {
    if (!stickRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = scrollRef.current
      if (el && stickRef.current) el.scrollTop = el.scrollHeight
    })
  }, [useTranscript ? transcriptLength : fallbackSource])

  // 卸载清理：取消仍未执行的跟随滚动 rAF
  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={scrollRef}
      className="md-overlay md-overlay-full"
      style={{ background: theme.colors.background }}
      data-md-theme={theme.group}
      onScroll={handleScroll}
      // 点击层内任意位置聚焦终端：键盘输入仍走 xterm。
      // 用 click 而非 mousedown：不干扰层内拖选文本；不拦截 wheel，保证层内正常滚动。
      onClick={() => terminalPool.getTerminal(session.id)?.focus()}
    >
      {useTranscript ? (
        <ClaudeConversation entries={transcript} />
      ) : (
        <div className="md-body">
          <ReactMarkdown
            remarkPlugins={MD_REMARK_PLUGINS}
            rehypePlugins={MD_REHYPE_PLUGINS}
            components={mdComponents}
          >
            {fallbackSource}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}

export default function FullscreenTerminal() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  // 窄化订阅：只选中「当前会话对象」。旧实现订阅整个 sessions 数组，
  // 任何会话每 100ms 的 flush（history 更新）都会导致全屏组件重渲染；
  // 现在仅当「本会话」条目被替换时才更新（zustand Object.is 比较）
  const currentSession = useAppStore((s) =>
    s.activeSessionId ? s.sessions.find(x => x.id === s.activeSessionId) ?? null : null
  )
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setIsFullscreen = useAppStore((s) => s.setIsFullscreen)
  const terminalThemeId = useAppStore((s) => s.terminalTheme)
  const setTerminalTheme = useAppStore((s) => s.setTerminalTheme)
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)
  const updateSession = useAppStore((s) => s.updateSession)
  const markdownEnabled = useAppStore((s) => s.markdownEnabled)
  const setMarkdownEnabled = useAppStore((s) => s.setMarkdownEnabled)

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  const termRef = useRef<HTMLDivElement>(null)
  const resizeTimerRef = useRef<number | null>(null)
  // 用一个 ref 容器接收 Dropdown / Popover 的 portal 弹出层，
  // 并把这个容器标为 WebkitAppRegion: no-drag，避免 Electron 拖拽吃掉点击事件
  const noDragRef = useRef<HTMLDivElement>(null)
  const getNoDragPopupContainer = useCallback(() => noDragRef.current ?? document.body, [])

  // ========== 从终端池 attach xterm 实例到全屏容器 ==========
  // 不再新建/销毁 xterm：pool 中的实例已包含完整 buffer，DOM 转移即可
  useEffect(() => {
    if (!termRef.current || !activeSessionId) return

    terminalPool.attach(activeSessionId, termRef.current, 'fullscreen')

    // 聚焦终端，方便直接输入
    const terminal = terminalPool.getTerminal(activeSessionId)
    terminal?.focus()

    return () => {
      // 全屏退出时 detach（xterm 回到 pool，由卡片重新 attach）
      terminalPool.detach(activeSessionId)
    }
  }, [activeSessionId])

  // ========== MD 全屏 clip 输入模式：Markdown 开启时仅露出 xterm 底部输入区 ==========
  // 全屏 MD 模式下渲染层盖住终端上部，键盘回显不可见；clip 方案不改变容器尺寸
  // （不 fit / 不 resize / 无 SIGWINCH），仅 clip-path 裁掉上部露出底部输入区，
  // Claude Code 等 TUI 的输入框恰好在屏幕底部，回显可见。
  useEffect(() => {
    if (!activeSessionId || !markdownEnabled) return

    // 开启 clip 并聚焦：键盘输入直接进入终端
    terminalPool.setClipMode(activeSessionId, true)
    terminalPool.getTerminal(activeSessionId)?.focus()

    return () => {
      // cleanup 闭包捕获「当前」activeSessionId：切换会话时先把旧会话恢复完整显示。
      // 若旧会话已被 attach 切走（attachedTo !== 'fullscreen'），setClipMode 内部
      // 安全 no-op；attach 时也会重置内联样式兜底
      if (activeSessionId) {
        terminalPool.setClipMode(activeSessionId, false)
      }
    }
  }, [activeSessionId, markdownEnabled])

  // ========== 窗口尺寸变化时重新 fit ==========
  useEffect(() => {
    const handleResize = () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
      }
      resizeTimerRef.current = window.setTimeout(() => {
        if (activeSessionId) {
          terminalPool.fit(activeSessionId)
        }
      }, 150) // 150ms 防抖
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
    }
  }, [activeSessionId])

  // ========== Ctrl+Alt+左右方向键快速切换终端 ==========
  // 使用 window 级 keydown，不侵入 pool 中 xterm 的 keyEventHandler；
  // 会话列表经 getState() 实时读取（避免订阅整个 sessions 导致重渲染）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        // 输入框内不拦截
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

        e.preventDefault()
        const sessions = useAppStore.getState().sessions
        const currentIndex = sessions.findIndex(s => s.id === activeSessionId)
        if (currentIndex === -1) return

        const targetIndex = e.key === 'ArrowLeft'
          ? (currentIndex > 0 ? currentIndex - 1 : sessions.length - 1)
          : (currentIndex < sessions.length - 1 ? currentIndex + 1 : 0)

        const targetSession = sessions[targetIndex]
        if (targetSession) {
          setActiveSession(targetSession.id)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSessionId, setActiveSession])

  const themeItems: MenuProps['items'] = [
    {
      type: 'group',
      label: '暗色主题',
      children: TERMINAL_THEMES.filter(t => t.group === 'dark').map(t => ({
        key: t.id,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
              {[t.colors.background, t.colors.red, t.colors.green, t.colors.yellow, t.colors.blue, t.colors.magenta, t.colors.foreground].map((c, i) => (
                <div key={i} style={{ width: 6, height: 22, background: c }} />
              ))}
            </div>
            <span style={{ fontSize: 13, color: 'var(--ant-color-text)', flex: 1 }}>{t.name}</span>
            {terminalThemeId === t.id && <CheckOutlined style={{ color: 'var(--primary)', fontSize: 12 }} />}
          </div>
        ),
        onClick: () => setTerminalTheme(t.id),
      })),
    },
    {
      type: 'group',
      label: '亮色主题',
      children: TERMINAL_THEMES.filter(t => t.group === 'light').map(t => ({
        key: t.id,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
              {[t.colors.background, t.colors.red, t.colors.green, t.colors.yellow, t.colors.blue, t.colors.magenta, t.colors.foreground].map((c, i) => (
                <div key={i} style={{ width: 6, height: 22, background: c }} />
              ))}
            </div>
            <span style={{ fontSize: 13, color: 'var(--ant-color-text)', flex: 1 }}>{t.name}</span>
            {terminalThemeId === t.id && <CheckOutlined style={{ color: 'var(--primary)', fontSize: 12 }} />}
          </div>
        ),
        onClick: () => setTerminalTheme(t.id),
      })),
    },
  ]

  const handleBack = () => {
    setIsFullscreen(false)
    setActiveSession(null)
  }

  const handleStartEditName = () => {
    if (!currentSession) return
    setNameValue(currentSession.name)
    setEditingName(true)
  }

  const handleSaveName = () => {
    const trimmed = nameValue.trim()
    if (trimmed && currentSession) {
      updateSession(currentSession.id, { name: trimmed })
    }
    setEditingName(false)
  }

  const handleCancelName = () => {
    setEditingName(false)
  }

  const handleCopy = async () => {
    if (!activeSessionId) return
    const terminal = terminalPool.getTerminal(activeSessionId)
    if (terminal) {
      const selection = terminal.getSelection()
      if (selection) {
        await navigator.clipboard.writeText(selection)
        message.success('已复制')
      }
    }
  }

  // 终端式右键交互：有选中 → 复制；无选中 → 粘贴
  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!activeSessionId) return
    const terminal = terminalPool.getTerminal(activeSessionId)
    if (!terminal) return

    try {
      if (terminal.hasSelection()) {
        const selection = terminal.getSelection()
        if (selection) {
          await navigator.clipboard.writeText(selection)
          terminal.clearSelection()
          message.success('已复制')
        }
      } else {
        const text = await navigator.clipboard.readText()
        if (text) {
          terminal.paste(text)
        }
      }
    } catch {
      message.error('剪贴板操作失败')
    }
  }

  if (!currentSession) return null

  const themeBg = getTerminalTheme(terminalThemeId).colors.background

  return (
    <div
      style={{
        // 嵌套在 App 全屏分支的 flex 容器中：100% 填充，不再自己 fixed 全屏
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 'var(--z-fullscreen)',
        background: 'var(--ant-color-bg-base)',
        position: 'relative',
      }}
    >
      {/* 顶部栏：返回 + 会话名 + 主题/明暗/复制 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          height: 48,
          paddingRight: 'var(--titlebar-control-width)',
          background: 'var(--ant-color-bg-layout)',
          borderBottom: '1px solid var(--ant-color-border)',
          flexShrink: 0,
          WebkitAppRegion: 'drag',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            WebkitAppRegion: 'no-drag',
          }}
        >
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            style={{ color: 'var(--ant-color-text)' }}
          >
            返回
          </Button>
          {editingName ? (
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onPressEnter={handleSaveName}
              onKeyDown={(e) => { if (e.key === 'Escape') handleCancelName() }}
              onBlur={handleSaveName}
              autoFocus
              size="small"
              style={{ width: 200, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}
            />
          ) : (
            <span
              style={{ color: 'var(--ant-color-text)', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer' }}
              onDoubleClick={handleStartEditName}
              title="双击编辑名称"
            >
              {currentSession.name}
            </span>
          )}
        </div>
        <div
          ref={noDragRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            WebkitAppRegion: 'no-drag',
          }}
        >
          <Dropdown
            menu={{ items: themeItems, style: { minWidth: 220 } }}
            placement="bottomRight"
            trigger={['click']}
            getPopupContainer={getNoDragPopupContainer}
          >
            <Button
              type="text"
              style={{ color: 'var(--ant-color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px' }}
            >
              {(() => {
                const tc = getTerminalTheme(terminalThemeId).colors
                return (
                  <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                    {[tc.background, tc.red, tc.green, tc.blue, tc.foreground].map((c, i) => (
                      <div key={i} style={{ width: 4, height: 14, background: c }} />
                    ))}
                  </div>
                )
              })()}
              配色
            </Button>
          </Dropdown>

          <Tooltip title={darkMode ? '切换到亮色模式' : '切换到暗色模式'}>
            <Button
              type="text"
              icon={darkMode ? <SunFilled /> : <MoonFilled />}
              onClick={toggleDarkMode}
              aria-label={darkMode ? '切换到亮色模式' : '切换到暗色模式'}
              style={{ color: 'var(--ant-color-text-secondary)' }}
            />
          </Tooltip>

          {/* Markdown 视图切换：开启后终端区叠加实时渲染的 Markdown 层 */}
          <Tooltip title={markdownEnabled ? '关闭 Markdown 视图' : '开启 Markdown 视图'}>
            <Button
              type="text"
              icon={<ReadOutlined />}
              onClick={() => setMarkdownEnabled(!markdownEnabled)}
              aria-label="Markdown 视图"
              style={{
                // 激活态主色高亮，非激活跟随次要文本色
                color: markdownEnabled ? 'var(--primary)' : 'var(--ant-color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              MD
            </Button>
          </Tooltip>

          <Button
            type="text"
            icon={<CopyOutlined />}
            onClick={handleCopy}
            style={{ color: 'var(--ant-color-text-secondary)' }}
            title="复制选中文本"
          >
            复制
          </Button>
        </div>
      </div>

      {/* 终端区：pool.attach 把 xterm containerDiv 挂到这里。
          position:relative 作为 Markdown 叠加层（absolute 定位）的定位上下文 */}
      <div
        ref={termRef}
        className="fullscreen-terminal"
        onContextMenu={handleContextMenu}
        style={{
          flex: 1,
          padding: '8px',
          overflow: 'hidden',
          background: themeBg,
          position: 'relative',
        }}
      >
        {/* Markdown 渲染层：开启时叠加在终端区上方，底部避让输入区 */}
        {markdownEnabled && <FullscreenMarkdownOverlay session={currentSession} />}

        {/* Markdown 模式的输入区装饰：边框 + 「终端输入」标签。
            容器 pointer-events:none（纯装饰，不挡 xterm 原生选择/右键/滚轮），
            标签可点击聚焦终端，键盘输入仍走 xterm。 */}
        {markdownEnabled && (
          <div className="md-input-zone">
            <span
              className="md-input-zone-label"
              onClick={() => terminalPool.getTerminal(currentSession.id)?.focus()}
              title="点击聚焦终端输入"
            >
              ⌨ 终端输入
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
