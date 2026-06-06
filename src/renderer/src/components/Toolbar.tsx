import { SearchOutlined, PlusOutlined, CameraOutlined, SettingOutlined } from '@ant-design/icons'
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
    <div className="h-14 px-4 flex items-center justify-between border-b bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-blue-600 dark:text-blue-400 m-0">
          Client Manager
        </h1>
      </div>
      
      <div className="flex items-center gap-3">
        <Input.Search
          placeholder="搜索会话..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-64"
          prefix={<SearchOutlined />}
          allowClear
        />

        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={onNewSession}
          size="middle"
        >
          新建会话
        </Button>
        
        <Dropdown menu={{ items }} placement="bottomRight">
          <Button icon={<SettingOutlined />} size="middle">
            更多
          </Button>
        </Dropdown>
      </div>
    </div>
  )
}
