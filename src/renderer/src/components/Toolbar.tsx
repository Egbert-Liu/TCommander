import { PlusCircleFilled, CameraFilled, SettingFilled, SunFilled, MoonFilled } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
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
  onOpenSettings: () => void
  onOpenSnapshots: () => void
  statusCounts: StatusCounts
  statusFilter: string[]
  onStatusFilterChange: (status: string) => void
}

export default function Toolbar({
  onNewSession,
  onOpenSettings,
  onOpenSnapshots,
  statusCounts,
  statusFilter,
  onStatusFilterChange,
}: ToolbarProps) {
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)

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

        <Tooltip title="快照管理">
          <Button
            icon={<CameraFilled />}
            onClick={onOpenSnapshots}
            aria-label="快照管理"
            size="small"
            style={{ fontSize: 11 }}
          />
        </Tooltip>

        <Tooltip title="设置">
          <Button
            icon={<SettingFilled />}
            onClick={onOpenSettings}
            aria-label="设置"
            size="small"
            style={{ fontSize: 11 }}
          />
        </Tooltip>

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
