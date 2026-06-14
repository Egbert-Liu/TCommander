import { PlusCircleFilled, CameraFilled, SettingFilled, SunFilled, MoonFilled, HistoryOutlined, SafetyCertificateFilled } from '@ant-design/icons'
import { Button, Dropdown, Tooltip, Select, message } from 'antd'
import type { MenuProps } from 'antd'
import { useAppStore } from '../store'
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
  statusFilter: string | null
  onStatusFilterChange: (status: string | null) => void
}

export default function Toolbar({
  onNewSession,
  onOpenPresets,
  onOpenSnapshots,
  onOpenRules,
  statusCounts,
  statusFilter,
  onStatusFilterChange,
}: ToolbarProps) {
  const previewLineCount = useAppStore((s) => s.previewLineCount)
  const setPreviewLineCount = useAppStore((s) => s.setPreviewLineCount)
  const addSnapshot = useAppStore((s) => s.addSnapshot)
  const addSession = useAppStore((s) => s.addSession)
  const defaultQuickActions = useAppStore((s) => s.defaultQuickActions)
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)

  // 快捷创建会话
  const handleQuickCreate = async (terminalType: 'powershell' | 'cmd' | 'bash', name: string) => {
    try {
      const sessionId = await window.electronAPI.createSession({
        terminalType,
        cwd: undefined,
        initialCommand: undefined
      })

      if (!sessionId) {
        message.error('创建会话失败')
        return
      }

      addSession({
        id: sessionId,
        name,
        terminalType,
        cwd: '~',
        history: [],
        previewText: '',
        status: 'idle',
        quickActions: [...defaultQuickActions],
        createdAt: Date.now(),
        lastActivityAt: Date.now()
      })

      message.success(`已创建 ${name} 会话`)
    } catch (e) {
      message.error('创建会话失败')
    }
  }

  const newSessionItems: MenuProps['items'] = [
    {
      key: 'powershell',
      label: 'PowerShell',
      onClick: () => handleQuickCreate('powershell', 'PowerShell'),
    },
    {
      key: 'cmd',
      label: 'CMD',
      onClick: () => handleQuickCreate('cmd', 'CMD'),
    },
    {
      key: 'bash',
      label: 'Bash',
      onClick: () => handleQuickCreate('bash', 'Bash'),
    },
    { type: 'divider' },
    {
      key: 'custom',
      icon: <SettingFilled style={{ fontSize: 12 }} />,
      label: '详细配置...',
      onClick: onNewSession,
    },
  ]

  const handleSnapshot = () => {
    const sessions = useAppStore.getState().sessions
    const groups = useAppStore.getState().groups

    if (sessions.length === 0) {
      message.warning('当前没有活跃会话，无法创建快照')
      return
    }

    const snapshot = {
      id: `snapshot-${Date.now()}`,
      name: `快照 ${new Date().toLocaleString()}`,
      data: {
        sessions: sessions.map(s => ({
          name: s.name,
          groupId: s.groupId,
          terminalType: s.terminalType,
          cwd: s.cwd,
          initialCommand: s.initialCommand,
          history: s.history
        })),
        groups
      },
      createdAt: Date.now()
    }

    addSnapshot(snapshot)
    message.success('快照已保存')
  }

  const menuItems: MenuProps['items'] = [
    {
      key: 'presets',
      icon: <SettingFilled style={{ fontSize: 12 }} />,
      label: '预设管理',
      onClick: onOpenPresets
    },
    {
      key: 'restore',
      icon: <HistoryOutlined style={{ fontSize: 12 }} />,
      label: '快照管理',
      onClick: onOpenSnapshots
    },
    {
      key: 'rules',
      icon: <SafetyCertificateFilled style={{ fontSize: 12 }} />,
      label: '规则配置',
      onClick: onOpenRules
    }
  ]

  // 状态计数按钮：点击切换筛选
  const renderStatusBtn = (key: string, label: string, count: number, color: string) => {
    const active = statusFilter === key
    return (
      <button
        key={key}
        onClick={() => onStatusFilterChange(active ? null : key)}
        className="flex items-center gap-1 px-2 rounded-md transition-colors"
        style={{
          height: 22,
          background: active ? `${color}26` : `${color}14`,
          border: `1px solid ${active ? color : `${color}40`}`,
          color,
          fontSize: 10,
          cursor: 'pointer',
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
        // 注意：右侧 138px 留给原生窗口控制按钮（最小化/最大化/关闭），避免重叠
        WebkitAppRegion: 'drag',
        paddingRight: 138,
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
          {renderStatusBtn('running', '运行中', statusCounts.running, '#34d399')}
          {statusCounts.error > 0 && renderStatusBtn('error', '错误', statusCounts.error, '#f87171')}
          {statusCounts['needs-confirm'] > 0 && renderStatusBtn('needs-confirm', '待确认', statusCounts['needs-confirm'], '#fbbf24')}
          {statusCounts['needs-input'] > 0 && renderStatusBtn('needs-input', '待输入', statusCounts['needs-input'], '#38bdf8')}
        </div>
      </div>

      <div
        className="flex items-center gap-1.5"
        // 按钮区域必须设为 no-drag，否则点击会被当作拖拽窗口
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <Tooltip title="预览行数">
          <Select
            value={previewLineCount}
            onChange={setPreviewLineCount}
            size="small"
            style={{ width: 65 }}
            options={[
              { value: 5, label: '5行' },
              { value: 10, label: '10行' },
              { value: 15, label: '15行' },
              { value: 20, label: '20行' },
            ]}
          />
        </Tooltip>

        <Dropdown menu={{ items: newSessionItems }} trigger={['click']} placement="bottomLeft">
          <Button type="primary" icon={<PlusCircleFilled />} size="small" style={{ fontSize: 11 }}>
            新建
          </Button>
        </Dropdown>

        <Tooltip title="保存快照">
          <Button
            icon={<CameraFilled />}
            onClick={handleSnapshot}
            size="small"
            style={{ fontSize: 11 }}
          />
        </Tooltip>

        <Dropdown menu={{ items: menuItems }} placement="bottomRight">
          <Button icon={<SettingFilled />} size="small" style={{ fontSize: 11 }} />
        </Dropdown>

        <Tooltip title={darkMode ? '切换到亮色模式' : '切换到暗色模式'}>
          <Button
            icon={darkMode ? <SunFilled /> : <MoonFilled />}
            onClick={toggleDarkMode}
            size="small"
            style={{ fontSize: 11 }}
          />
        </Tooltip>
      </div>
    </div>
  )
}
