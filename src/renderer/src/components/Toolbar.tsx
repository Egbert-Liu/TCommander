import { SearchOutlined, PlusCircleFilled, CameraFilled, SettingFilled, ThunderboltFilled, SunFilled, MoonFilled, HistoryOutlined } from '@ant-design/icons'
import { Input, Button, Dropdown, Tooltip, Select, message } from 'antd'
import type { MenuProps } from 'antd'
import { useAppStore } from '../store'

interface ToolbarProps {
  onNewSession: () => void
  onOpenPresets: () => void
  onOpenSnapshots: () => void
}

export default function Toolbar({ onNewSession, onOpenPresets, onOpenSnapshots }: ToolbarProps) {
  const searchQuery = useAppStore((s) => s.searchQuery)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)
  const previewLineCount = useAppStore((s) => s.previewLineCount)
  const setPreviewLineCount = useAppStore((s) => s.setPreviewLineCount)
  const addSnapshot = useAppStore((s) => s.addSnapshot)
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)

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

  const items: MenuProps['items'] = [
    {
      key: 'presets',
      icon: <SettingFilled style={{ fontSize: 12 }} />,
      label: '预设管理',
      onClick: onOpenPresets
    },
    {
      key: 'snapshot',
      icon: <CameraFilled style={{ fontSize: 12 }} />,
      label: '保存快照',
      onClick: handleSnapshot
    },
    {
      key: 'restore',
      icon: <HistoryOutlined style={{ fontSize: 12 }} />,
      label: '从快照恢复',
      onClick: onOpenSnapshots
    }
  ]

  return (
    <div 
      className="h-12 px-4 flex items-center justify-between"
      style={{ 
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)'
      }}
    >
      <div className="flex items-center gap-2.5">
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ 
            background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
            boxShadow: '0 2px 8px rgba(56, 189, 248, 0.3)'
          }}
        >
          <ThunderboltFilled style={{ color: '#fff', fontSize: 15 }} />
        </div>
        <span 
          style={{ 
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em'
          }}
        >
          Client Manager
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <Input
          placeholder="搜索会话..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          prefix={<SearchOutlined style={{ color: 'var(--text-muted)', fontSize: 12 }} />}
          allowClear
          className="w-56"
          size="small"
        />

        <Tooltip title="预览行数">
          <Select
            value={previewLineCount}
            onChange={setPreviewLineCount}
            size="small"
            style={{ width: 80 }}
            options={[
              { value: 5, label: '5 行' },
              { value: 10, label: '10 行' },
              { value: 15, label: '15 行' },
              { value: 20, label: '20 行' },
              { value: 30, label: '30 行' },
              { value: 50, label: '50 行' },
            ]}
          />
        </Tooltip>

        <Button 
          type="primary" 
          icon={<PlusCircleFilled />}
          onClick={onNewSession}
          size="small"
        >
          新建会话
        </Button>
        
        <Dropdown menu={{ items }} placement="bottomRight">
          <Button icon={<SettingFilled />} size="small" />
        </Dropdown>

        <Tooltip title={darkMode ? '切换到亮色模式' : '切换到暗色模式'}>
          <Button
            icon={darkMode ? <SunFilled /> : <MoonFilled />}
            onClick={toggleDarkMode}
            size="small"
          />
        </Tooltip>
      </div>
    </div>
  )
}
