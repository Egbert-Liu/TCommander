import { useState } from 'react'
import { Menu, Popover } from 'antd'
import type { MenuProps } from 'antd'
import { AppstoreFilled, PlusCircleFilled, FolderFilled } from '@ant-design/icons'
import { useAppStore } from '../store'

const PRESET_COLORS = [
  '#38bdf8', '#818cf8', '#a78bfa', '#c084fc',
  '#f472b6', '#fb7185', '#f87171', '#ef4444',
  '#fb923c', '#f59e0b', '#fbbf24', '#facc15',
  '#34d399', '#4ade80', '#2dd4bf', '#22d3ee',
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1.5 p-1">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-5 h-5 rounded-full transition-transform"
          style={{
            backgroundColor: c,
            border: value === c ? '2px solid white' : '2px solid transparent',
            transform: value === c ? 'scale(1.2)' : 'scale(1)',
            boxShadow: value === c ? `0 0 8px ${c}60` : 'none',
          }}
        />
      ))}
    </div>
  )
}

export default function Sidebar() {
  const { groups, selectedGroupId, setSelectedGroupId, addGroup } = useAppStore()
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[0])
  const [showAddGroup, setShowAddGroup] = useState(false)

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      addGroup({
        id: `group-${Date.now()}`,
        name: newGroupName,
        color: newGroupColor,
        order: groups.length
      })
      setNewGroupName('')
      setNewGroupColor(PRESET_COLORS[(groups.length + 1) % PRESET_COLORS.length])
      setShowAddGroup(false)
    }
  }

  const menuItems: MenuProps['items'] = [
    {
      key: 'all',
      icon: <AppstoreFilled style={{ fontSize: 13 }} />,
      label: '全部会话',
    },
    ...groups.map(group => ({
      key: group.id,
      icon: (
        <FolderFilled 
          style={{ 
            fontSize: 13, 
            color: group.color,
            filter: `drop-shadow(0 0 3px ${group.color}50)`
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
      className="w-52 flex flex-col"
      style={{ 
        borderRight: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)'
      }}
    >
      <div className="px-3 pt-4 pb-2">
        <span 
          style={{ 
            fontSize: 10, 
            fontWeight: 700, 
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
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
        {showAddGroup ? (
          <div className="space-y-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
              placeholder="分组名称"
              autoFocus
              className="w-full px-2.5 py-1.5 text-xs rounded-md"
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: "'DM Sans', sans-serif"
              }}
            />
            <div className="flex items-center gap-2">
              <Popover 
                content={<ColorPicker value={newGroupColor} onChange={setNewGroupColor} />}
                trigger="click"
                placement="rightTop"
              >
                <button
                  className="w-6 h-6 rounded-full flex-shrink-0"
                  style={{ 
                    backgroundColor: newGroupColor,
                    border: '2px solid rgba(255,255,255,0.15)',
                    boxShadow: `0 0 8px ${newGroupColor}40`
                  }}
                />
              </Popover>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>选择颜色</span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setShowAddGroup(false)}
                className="flex-1 px-2 py-1.5 text-xs rounded-md"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                }}
              >
                取消
              </button>
              <button
                onClick={handleAddGroup}
                className="flex-1 px-2 py-1.5 text-xs rounded-md font-medium"
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#0a0e17',
                }}
              >
                添加
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddGroup(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors"
            style={{
              background: 'transparent',
              border: '1px dashed var(--border-color)',
              color: 'var(--text-muted)',
            }}
          >
            <PlusCircleFilled style={{ fontSize: 12, color: 'var(--accent)' }} />
            添加分组
          </button>
        )}
      </div>
    </div>
  )
}
