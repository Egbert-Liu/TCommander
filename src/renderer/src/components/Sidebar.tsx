import { useState } from 'react'
import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import { FolderOutlined, PlusOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useAppStore } from '../store'

export default function Sidebar() {
  const { groups, selectedGroupId, setSelectedGroupId, addGroup } = useAppStore()
  const [newGroupName, setNewGroupName] = useState('')

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      const colors = ['#38bdf8', '#f87171', '#fbbf24', '#34d399', '#a78bfa', '#fb923c', '#f472b6']
      addGroup({
        id: `group-${Date.now()}`,
        name: newGroupName,
        color: colors[groups.length % colors.length],
        order: groups.length
      })
      setNewGroupName('')
    }
  }

  const menuItems: MenuProps['items'] = [
    {
      key: 'all',
      icon: <AppstoreOutlined />,
      label: '全部会话',
    },
    ...groups.map(group => ({
      key: group.id,
      icon: (
        <span 
          style={{ 
            display: 'inline-block', 
            width: 7, 
            height: 7, 
            borderRadius: '50%', 
            backgroundColor: group.color,
            boxShadow: `0 0 6px ${group.color}40`
          }} 
        />
      ),
      label: group.name,
    }))
  ]

  const handleMenuClick = (e: { key: string }) => {
    if (e.key === 'all') {
      setSelectedGroupId(null)
    } else {
      setSelectedGroupId(e.key)
    }
  }

  return (
    <div 
      className="w-48 flex flex-col"
      style={{ 
        borderRight: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)'
      }}
    >
      <div className="px-3 pt-4 pb-2">
        <span 
          style={{ 
            fontSize: 10, 
            fontWeight: 600, 
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace"
          }}
        >
          分组
        </span>
      </div>

      <Menu
        mode="inline"
        selectedKeys={selectedGroupId ? [selectedGroupId] : ['all']}
        onClick={handleMenuClick}
        className="border-r-0 bg-transparent flex-1"
        items={menuItems}
      />
      
      <div className="p-3" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
            placeholder="新分组"
            className="flex-1 px-2 py-1 text-xs rounded"
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: "'DM Sans', sans-serif"
            }}
          />
          <button
            onClick={handleAddGroup}
            className="w-7 h-7 flex items-center justify-center rounded text-xs"
            style={{
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              border: '1px solid var(--border-color)'
            }}
          >
            <PlusOutlined style={{ fontSize: 11 }} />
          </button>
        </div>
      </div>
    </div>
  )
}
