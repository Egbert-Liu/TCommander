import { SearchOutlined, PlusOutlined, CameraOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Input, Button, Dropdown, message } from 'antd'
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
      icon: <SettingOutlined />,
      label: '预设管理',
      onClick: onOpenPresets
    },
    {
      key: 'snapshot',
      icon: <CameraOutlined />,
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
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: 'var(--accent-dim)' }}
        >
          <ThunderboltOutlined style={{ color: 'var(--accent)', fontSize: 14 }} />
        </div>
        <span 
          style={{ 
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            fontWeight: 600,
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
          className="w-52"
          size="small"
        />

        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={onNewSession}
          size="small"
        >
          新建
        </Button>
        
        <Dropdown menu={{ items }} placement="bottomRight">
          <Button icon={<SettingOutlined />} size="small" />
        </Dropdown>
      </div>
    </div>
  )
}
