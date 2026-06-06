import { SearchOutlined, PlusCircleFilled, CameraFilled, SettingFilled, ThunderboltFilled } from '@ant-design/icons'
import { Input, Button, Dropdown, Tooltip, message } from 'antd'
import type { MenuProps } from 'antd'
import { useAppStore } from '../store'

interface ToolbarProps {
  onNewSession: () => void
  onOpenPresets: () => void
}

export default function Toolbar({ onNewSession, onOpenPresets }: ToolbarProps) {
  const { searchQuery, setSearchQuery, addSnapshot } = useAppStore()

  const handleSnapshot = async () => {
    const sessions = useAppStore.getState().sessions
    const groups = useAppStore.getState().groups
    
    const snapshot = {
      id: `snapshot-${Date.now()}`,
      name: `快照 ${new Date().toLocaleString()}`,
      data: {
        sessions: sessions.map(s => ({
          name: s.name,
          groupId: s.groupId,
          terminalType: s.terminalType,
          cwd: s.cwd,
          history: s.history
        })),
        groups
      },
      createdAt: Date.now()
    }
    
    addSnapshot(snapshot)
    await window.electronAPI.storageSet('snapshots', [...useAppStore.getState().snapshots, snapshot])
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
      </div>
    </div>
  )
}
