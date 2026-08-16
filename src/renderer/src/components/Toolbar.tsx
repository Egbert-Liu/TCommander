import { PlusCircleFilled, CameraFilled, SettingFilled, SunFilled, MoonFilled, SafetyCertificateFilled, CheckOutlined, RobotFilled } from '@ant-design/icons'
import { Button, Dropdown, Tooltip, message } from 'antd'
import { useState, useEffect, useCallback } from 'react'
import type { MenuProps } from 'antd'
import { useAppStore } from '../store'
import { STATUS_COLORS } from '../utils/statusColors'
import AppIcon from './AppIcon'

interface StatusCounts {
  error: number
  'needs-confirm': number
  'needs-input': number
  running: number
  idle: number
}

interface ToolbarProps {
  onNewSession: () => void
  onOpenPresets: () => void
  onOpenSnapshots: () => void
  onOpenRules: () => void
  statusCounts: StatusCounts
  statusFilter: string[]
  onStatusFilterChange: (status: string) => void
  previewLineCount: number
  onPreviewLineCountChange: (count: number) => void
}

export default function Toolbar({
  onNewSession,
  onOpenPresets,
  onOpenSnapshots,
  onOpenRules,
  statusCounts,
  statusFilter,
  onStatusFilterChange,
  previewLineCount,
  onPreviewLineCountChange,
}: ToolbarProps) {
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)
  const markdownEnabled = useAppStore((s) => s.markdownEnabled)
  const setMarkdownEnabled = useAppStore((s) => s.setMarkdownEnabled)

  // Claude Code 集成状态（~/.claude/settings.json 的 transcript hooks 是否已配置）
  const [claudeIntegrated, setClaudeIntegrated] = useState(false)

  // 查询集成状态：菜单展开时读取一次 + 组件挂载时读取
  const refreshClaudeIntegration = useCallback(async () => {
    try {
      const status = await window.electronAPI.claudeIntegrationStatus()
      setClaudeIntegrated(status.configured)
    } catch {
      // 主进程未就绪等：保持默认
    }
  }, [])

  useEffect(() => {
    void refreshClaudeIntegration()
  }, [refreshClaudeIntegration])

  // 一键配置 Claude Code transcript 集成（MD 对话流数据源）
  const handleToggleClaudeIntegration = async () => {
    try {
      if (claudeIntegrated) {
        const result = await window.electronAPI.claudeIntegrationDisable()
        if (result.success) {
          setClaudeIntegrated(false)
          message.success('已移除 Claude Code 集成配置（transcript hooks）')
        } else {
          message.error(`移除失败：${result.error}`)
        }
      } else {
        const result = await window.electronAPI.claudeIntegrationEnable()
        if (result.success) {
          setClaudeIntegrated(true)
          message.success('已配置 Claude Code 集成，新会话的 Markdown 视图将显示对话流')
        } else {
          message.error(`配置失败：${result.error}`)
        }
      }
    } catch {
      message.error('操作失败')
    }
  }

  // 关闭应用：拦截在主进程（main/index.ts 的 `close` 事件），
  // 这里不再提供 UI 按钮，避免与原生右上角关闭按钮重复。

  const menuItems: MenuProps['items'] = [
    {
      key: 'presets',
      icon: <SettingFilled style={{ fontSize: 12 }} />,
      label: '预设管理',
      onClick: onOpenPresets
    },
    {
      key: 'rules',
      icon: <SafetyCertificateFilled style={{ fontSize: 12 }} />,
      label: '规则配置',
      onClick: onOpenRules
    },
    { type: 'divider' },
    {
      key: 'preview-lines',
      label: '预览行数',
      children: [
        { key: 'preview-10', label: <span>10 行 {previewLineCount === 10 && <CheckOutlined style={{ marginLeft: 8, color: 'var(--primary)' }} />}</span>, onClick: () => onPreviewLineCountChange(10) },
        { key: 'preview-15', label: <span>15 行 {previewLineCount === 15 && <CheckOutlined style={{ marginLeft: 8, color: 'var(--primary)' }} />}</span>, onClick: () => onPreviewLineCountChange(15) },
        { key: 'preview-20', label: <span>20 行 {previewLineCount === 20 && <CheckOutlined style={{ marginLeft: 8, color: 'var(--primary)' }} />}</span>, onClick: () => onPreviewLineCountChange(20) },
        { key: 'preview-25', label: <span>25 行 {previewLineCount === 25 && <CheckOutlined style={{ marginLeft: 8, color: 'var(--primary)' }} />}</span>, onClick: () => onPreviewLineCountChange(25) },
      ],
    },
    {
      // Markdown 实时渲染仅在全屏终端生效（卡片预览不渲染），此处为全局开关
      key: 'markdown-view',
      label: 'Markdown 渲染（全屏）',
      children: [
        { key: 'md-on', label: <span>开启 {markdownEnabled && <CheckOutlined style={{ marginLeft: 8, color: 'var(--primary)' }} />}</span>, onClick: () => setMarkdownEnabled(true) },
        { key: 'md-off', label: <span>关闭 {!markdownEnabled && <CheckOutlined style={{ marginLeft: 8, color: 'var(--primary)' }} />}</span>, onClick: () => setMarkdownEnabled(false) },
      ],
    },
    {
      // Claude Code transcript 集成：写入 ~/.claude/settings.json hooks，
      // MD 全屏视图优先渲染结构化对话流（未配置时回退终端字节流清洗）
      key: 'claude-integration',
      icon: <RobotFilled style={{ fontSize: 12 }} />,
      label: (
        <span
          title="配置后，全屏 Markdown 视图将渲染 Claude Code 的结构化对话流（需重启 Claude Code 会话生效）"
        >
          Claude Code 集成 {claudeIntegrated && <CheckOutlined style={{ marginLeft: 8, color: 'var(--primary)' }} />}
        </span>
      ),
      onClick: handleToggleClaudeIntegration,
    },
  ]

  // 状态计数按钮：点击切换筛选
  // 用 .status-pill 统一胶囊样式 + data-active 控制放大（控制栏放大动效）
  const renderStatusBtn = (key: string, label: string, count: number, color: string) => {
    const active = statusFilter.includes(key)
    return (
      <button
        key={key}
        data-active={active}
        className="status-pill"
        onClick={() => onStatusFilterChange(key)}
        style={{
          background: active ? `${color}33` : `${color}14`,
          border: `1px solid ${active ? color : `${color}40`}`,
          color,
        }}
        title={active ? `点击清除「${label}」筛选` : `只看「${label}」的会话`}
      >
        <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{count}</span>
        <span>{label}</span>
      </button>
    )
  }

  return (
    <div
      className="h-9 px-3 flex items-center justify-between"
      style={{
        borderBottom: '1px solid var(--ant-color-border-secondary)',
        background: 'var(--ant-color-bg-layout)',
        // 让整个 Toolbar 成为窗口拖拽区域（替代被隐藏的系统标题栏）
        // 右侧留出原生窗口控制按钮区（Windows 三按钮；macOS 无），避免重叠
        WebkitAppRegion: 'drag',
        paddingRight: 'var(--titlebar-control-width)',
      }}
    >
      <div className="flex items-center gap-2">
        <AppIcon size={24} />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ant-color-text)',
            letterSpacing: '-0.02em'
          }}
        >
          TCommander
        </span>

        <div
          className="flex items-center gap-1.5 ml-3 pl-3"
          style={{
            borderLeft: '1px solid var(--ant-color-border-secondary)',
            // 状态筛选按钮可点击，需要从拖拽区域中排除
            WebkitAppRegion: 'no-drag',
          }}
        >
          {/* 状态胶囊全部常显（含 0 计数），点击筛选逻辑一致 */}
          {renderStatusBtn('error', '错误', statusCounts.error, STATUS_COLORS.error.color)}
          {renderStatusBtn('needs-confirm', '待确认', statusCounts['needs-confirm'], STATUS_COLORS['needs-confirm'].color)}
          {renderStatusBtn('needs-input', '待输入', statusCounts['needs-input'], STATUS_COLORS['needs-input'].color)}
          {renderStatusBtn('running', '运行中', statusCounts.running, STATUS_COLORS.running.color)}
          {renderStatusBtn('idle', '空闲', statusCounts.idle, STATUS_COLORS.idle.color)}
        </div>
      </div>

      <div
        className="flex items-center gap-1.5"
        // 按钮区域必须设为 no-drag，否则点击会被当作拖拽窗口
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <Button type="primary" icon={<PlusCircleFilled />} size="small" onClick={onNewSession} style={{ fontSize: 11 }}>
          新建
        </Button>

        {/* 快照管理：保存与恢复入口合并（保存弹窗内嵌在 SnapshotsDialog，
            支持选择「全部会话/窗口」或某个分组作为快照范围） */}
        <Tooltip title="快照管理">
          <Button
            icon={<CameraFilled />}
            onClick={onOpenSnapshots}
            aria-label="快照管理"
            size="small"
            style={{ fontSize: 11 }}
          />
        </Tooltip>

        <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
          <Button icon={<SettingFilled />} aria-label="管理（预设/规则/设置）" size="small" style={{ fontSize: 11 }} />
        </Dropdown>

        <Tooltip title={darkMode ? '切换到亮色模式' : '切换到暗色模式'}>
          <Button
            icon={darkMode ? <SunFilled /> : <MoonFilled />}
            onClick={toggleDarkMode}
            aria-label={darkMode ? '切换到亮色模式' : '切换到暗色模式'}
            size="small"
            style={{ fontSize: 11 }}
          />
        </Tooltip>

        {/* 关闭应用按钮：已移除（用户原意是原生右上角的 X 关闭按钮做确认，
            现在由主进程的 `close` 事件拦截 + 二次确认对话框承担。
            Toolbar 内不再单独提供电源按钮，避免与原生按钮重复。 */}
      </div>
    </div>
  )
}
