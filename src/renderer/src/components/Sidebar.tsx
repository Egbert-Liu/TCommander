import { useState } from 'react'
import { Tooltip, Popconfirm } from 'antd'
import { AppstoreFilled, PlusCircleFilled, FolderFilled, MenuFoldOutlined, MenuUnfoldOutlined, DeleteOutlined } from '@ant-design/icons'
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

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const groups = useAppStore((s) => s.groups)
  const selectedGroupId = useAppStore((s) => s.selectedGroupId)
  const sessions = useAppStore((s) => s.sessions)
  const setSelectedGroupId = useAppStore((s) => s.setSelectedGroupId)
  const addGroup = useAppStore((s) => s.addGroup)
  const updateGroup = useAppStore((s) => s.updateGroup)
  const removeGroup = useAppStore((s) => s.removeGroup)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[0])
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [duplicateError, setDuplicateError] = useState(false)

  const handleAddGroup = async () => {
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

  const handleSaveEdit = async () => {
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

  const handleSelectItem = (groupId: string | null) => {
    setSelectedGroupId(groupId)
  }

  const renderCollapsedItem = (icon: React.ReactNode, label: string, groupId: string | null, isActive: boolean) => (
    <Tooltip title={label} placement="right" mouseEnterDelay={0.1} mouseLeaveDelay={0.05}>
      <button
        onClick={() => handleSelectItem(groupId)}
        className="w-full flex items-center justify-center"
        style={{
          height: 36,
          borderRadius: 6,
          background: isActive ? 'var(--accent-dim)' : 'transparent',
          color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontSize: 15,
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'var(--accent-dim)'
            e.currentTarget.style.color = 'var(--accent)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }
        }}
      >
        {icon}
      </button>
    </Tooltip>
  )

  const renderExpandedItem = (icon: React.ReactNode, label: React.ReactNode, groupId: string | null, isActive: boolean) => (
    <button
      onClick={() => handleSelectItem(groupId)}
      className="w-full flex items-center gap-2.5"
      style={{
        height: 32,
        borderRadius: 6,
        padding: '0 10px',
        background: isActive ? 'var(--accent-dim)' : 'transparent',
        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontSize: 13,
        textAlign: 'left',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'var(--accent-dim)'
          e.currentTarget.style.color = 'var(--accent)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-secondary)'
        }
      }}
    >
      <span style={{ fontSize: 14, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )

  return (
    <div
      className="flex flex-col transition-all duration-200 overflow-hidden"
      style={{
        width: collapsed ? 52 : 208,
        minWidth: collapsed ? 52 : 208,
        maxWidth: collapsed ? 52 : 208,
        borderRight: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
      }}
    >
      <div
        className="flex items-center justify-between px-2 h-10 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        {!collapsed && (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.5px' }}>
            分组
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            marginLeft: collapsed ? 'auto' : undefined,
            marginRight: collapsed ? 'auto' : undefined,
            fontSize: 14,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.background = 'var(--accent-dim)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1" style={{ padding: collapsed ? '4px 6px' : '4px 8px' }}>
        {collapsed ? (
          <div className="flex flex-col gap-1">
            {renderCollapsedItem(
              <AppstoreFilled />,
              '全部会话',
              null,
              !selectedGroupId
            )}
            {groups.map(group => (
              renderCollapsedItem(
                <FolderFilled style={{ color: group.color, filter: `drop-shadow(0 0 3px ${group.color}50)` }} />,
                group.name,
                group.id,
                selectedGroupId === group.id
              )
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {renderExpandedItem(
              <AppstoreFilled />,
              '全部会话',
              null,
              !selectedGroupId
            )}
            {groups.map(group => (
              <div key={group.id}>
                {editingGroupId === group.id ? (
                  <div className="flex items-center gap-1" style={{ padding: '0 10px', height: 32 }}>
                    <FolderFilled style={{ fontSize: 14, color: group.color, flexShrink: 0 }} />
                    <input
                      value={editingName}
                      onChange={(e) => { setEditingName(e.target.value); setDuplicateError(false) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingGroupId(null) }}
                      onBlur={handleSaveEdit}
                      autoFocus
                      style={{
                        fontSize: 12,
                        background: 'var(--bg-primary)',
                        border: duplicateError ? '1px solid var(--danger)' : '1px solid var(--accent)',
                        borderRadius: 3,
                        color: 'var(--text-primary)',
                        outline: 'none',
                        width: '100%',
                        padding: '0 4px',
                        height: 22,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center group">
                    <div className="flex-1 min-w-0">
                      {renderExpandedItem(
                        <FolderFilled style={{ color: group.color, filter: `drop-shadow(0 0 3px ${group.color}50)` }} />,
                        <span
                          onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit(group.id, group.name) }}
                          title="双击编辑名称"
                          style={{ cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          {group.name}
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                            {sessions.filter(s => s.groupId === group.id).length}
                          </span>
                        </span>,
                        group.id,
                        selectedGroupId === group.id
                      )}
                    </div>
                    <Popconfirm
                      title="删除分组"
                      description="会话将移至未分组状态"
                      onConfirm={() => removeGroup(group.id)}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true, size: 'small' }}
                      cancelButtonProps={{ size: 'small' }}
                    >
                      <button
                        className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 3,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          transition: 'opacity 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--danger)'
                          e.currentTarget.style.background = 'rgba(248,113,113,0.1)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--text-muted)'
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <DeleteOutlined />
                      </button>
                    </Popconfirm>
                  </div>
                )}
              </div>
            ))}
            {duplicateError && (
              <div style={{ color: 'var(--danger)', fontSize: 10, padding: '0 10px', marginTop: 2 }}>
                分组名称已存在
              </div>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="flex-shrink-0" style={{ padding: '8px', borderTop: '1px solid var(--border-color)' }}>
          {showAddGroup ? (
            <div className="flex flex-col gap-2">
              <input
                value={newGroupName}
                onChange={(e) => { setNewGroupName(e.target.value); setDuplicateError(false) }}
                placeholder="分组名称"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddGroup(); if (e.key === 'Escape') setShowAddGroup(false) }}
                autoFocus
                style={{
                  fontSize: 12,
                  background: 'var(--bg-primary)',
                  border: duplicateError ? '1px solid var(--danger)' : '1px solid var(--border-color)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  width: '100%',
                  padding: '4px 8px',
                  height: 28,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              <ColorPicker value={newGroupColor} onChange={setNewGroupColor} />
              <div className="flex gap-1">
                <button
                  onClick={handleAddGroup}
                  style={{
                    flex: 1,
                    height: 26,
                    borderRadius: 4,
                    background: 'var(--accent)',
                    color: '#0a0e17',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  确定
                </button>
                <button
                  onClick={() => { setShowAddGroup(false); setDuplicateError(false) }}
                  style={{
                    flex: 1,
                    height: 26,
                    borderRadius: 4,
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  取消
                </button>
              </div>
              {duplicateError && (
                <div style={{ color: 'var(--danger)', fontSize: 10 }}>分组名称已存在</div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowAddGroup(true)}
              className="w-full flex items-center justify-center gap-1.5"
              style={{
                height: 28,
                borderRadius: 4,
                background: 'var(--accent-dim)',
                border: '1px dashed var(--border-color)',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-glow)'
                e.currentTarget.style.borderColor = 'var(--accent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent-dim)'
                e.currentTarget.style.borderColor = 'var(--border-color)'
              }}
            >
              <PlusCircleFilled style={{ fontSize: 11 }} />
              新建分组
            </button>
          )}
        </div>
      )}

      {collapsed && (
        <div className="flex-shrink-0 flex justify-center py-2">
          <Tooltip title="新建分组" placement="right" mouseEnterDelay={0.1}>
            <button
              onClick={() => {
                // Expand sidebar first, then show add group form
                onToggleCollapse()
                setTimeout(() => setShowAddGroup(true), 250)
              }}
              style={{
                width: 32,
                height: 32,
                borderRadius: 4,
                background: 'var(--accent-dim)',
                border: '1px dashed var(--border-color)',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PlusCircleFilled />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
