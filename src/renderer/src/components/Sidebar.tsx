import { useState } from 'react'
import { Menu, Popover, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { AppstoreFilled, PlusCircleFilled, FolderFilled, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { useAppStore } from '../store'

const collapsedMenuStyles = `
  .ant-menu-inline-collapsed .ant-menu-item {
    padding: 0 calc(50% - 13px) !important;
  }
  .ant-menu-inline-collapsed .ant-menu-item .ant-menu-title-content {
    display: none !important;
  }
  .ant-menu-inline-collapsed .ant-menu-item .anticon {
    margin-inline-end: 0 !important;
  }
`.replace(/\n\s*/g, ' ').trim()

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

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const groups = useAppStore((s) => s.groups)
  const selectedGroupId = useAppStore((s) => s.selectedGroupId)
  const setSelectedGroupId = useAppStore((s) => s.setSelectedGroupId)
  const addGroup = useAppStore((s) => s.addGroup)
  const updateGroup = useAppStore((s) => s.updateGroup)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[0])
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [duplicateError, setDuplicateError] = useState(false)

  const handleAddGroup = () => {
    const trimmed = newGroupName.trim()
    if (!trimmed) return
    if (groups.some(g => g.name === trimmed)) {
      setDuplicateError(true)
      return
    }
    addGroup({
      id: `group-${Date.now()}`,
      name: trimmed,
      color: newGroupColor,
      order: groups.length
    })
    setNewGroupName('')
    setNewGroupColor(PRESET_COLORS[(groups.length + 1) % PRESET_COLORS.length])
    setShowAddGroup(false)
    setDuplicateError(false)
  }

  const handleStartEdit = (groupId: string, currentName: string) => {
    setEditingGroupId(groupId)
    setEditingName(currentName)
    setDuplicateError(false)
  }

  const handleSaveEdit = () => {
    if (!editingGroupId) return
    const trimmed = editingName.trim()
    if (!trimmed) {
      setEditingGroupId(null)
      return
    }
    if (groups.some(g => g.id !== editingGroupId && g.name === trimmed)) {
      setDuplicateError(true)
      return
    }
    updateGroup(editingGroupId, { name: trimmed })
    setEditingGroupId(null)
    setDuplicateError(false)
  }

  const menuItems: MenuProps['items'] = [
    {
      key: 'all',
      icon: collapsed ? (
        <Tooltip title="全部会话" placement="right">
          <AppstoreFilled style={{ fontSize: 13 }} />
        </Tooltip>
      ) : (
        <AppstoreFilled style={{ fontSize: 13 }} />
      ),
      label: collapsed ? '' : '全部会话',
    },
    ...groups.map(group => ({
      key: group.id,
      icon: collapsed ? (
        <Tooltip title={group.name} placement="right">
          <FolderFilled
            style={{ fontSize: 13, color: group.color, filter: `drop-shadow(0 0 3px ${group.color}50)` }}
          />
        </Tooltip>
      ) : (
        <FolderFilled
          style={{ fontSize: 13, color: group.color, filter: `drop-shadow(0 0 3px ${group.color}50)` }}
        />
      ),
      label: collapsed ? '' : (
        editingGroupId === group.id ? (
          <input
            value={editingName}
            onChange={(e) => { setEditingName(e.target.value); setDuplicateError(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingGroupId(null) }}
            onBlur={handleSaveEdit}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 12,
              background: 'var(--bg-primary)',
              border: duplicateError ? '1px solid var(--danger)' : '1px solid var(--accent)',
              borderRadius: 3,
              color: 'var(--text-primary)',
              outline: 'none',
              width: '100%',
              padding: '0 4px',
              height: 20,
              fontFamily: "'DM Sans', sans-serif"
            }}
          />
        ) : (
          <span
            onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit(group.id, group.name) }}
            title="双击编辑名称"
            style={{ cursor: 'text' }}
          >
            {group.name}
          </span>
        )
      ),
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
      className="flex flex-col transition-all duration-200 overflow-hidden"
      style={{
        width: collapsed ? 52 : 208,
        minWidth: collapsed ? 52 : 208,
        maxWidth: collapsed ? 52 : 208,
        borderRight: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)'
      }}
    >
      <style>{collapsedMenuStyles}</style>

      <div
        className="flex items-center justify-between px-3 h-9"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        {!collapsed && (
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
        )}
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center w-6 h-6 rounded-md transition-colors"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            marginLeft: collapsed ? 'auto' : undefined,
            marginRight: collapsed ? 'auto' : undefined,
          }}
        >
          {collapsed ? <MenuUnfoldOutlined style={{ fontSize: 13 }} /> : <MenuFoldOutlined style={{ fontSize: 13 }} />}
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <Menu
          mode="inline"
          selectedKeys={selectedGroupId ? [selectedGroupId] : ['all']}
          onClick={handleMenuClick}
          className="border-r-0 bg-transparent"
          items={menuItems}
          inlineCollapsed={collapsed}
          style={{ overflow: 'hidden' }}
        />
      </div>

      {!collapsed && (
        <div className="p-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          {showAddGroup ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => { setNewGroupName(e.target.value); setDuplicateError(false) }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                placeholder="分组名称"
                autoFocus
                className="w-full px-2.5 py-1.5 text-xs rounded-md"
                style={{
                  background: 'var(--bg-primary)',
                  border: duplicateError ? '1px solid var(--danger)' : '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: "'DM Sans', sans-serif"
                }}
              />
              {duplicateError && (
                <span style={{ fontSize: 10, color: 'var(--danger)' }}>该分组名称已存在</span>
              )}
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
                  onClick={() => { setShowAddGroup(false); setDuplicateError(false) }}
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
      )}
    </div>
  )
}
