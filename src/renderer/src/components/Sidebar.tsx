import { useState, useMemo, useEffect, useRef } from 'react'
import { Tooltip, Popconfirm } from 'antd'
import { AppstoreFilled, PlusCircleFilled, FolderFilled, MenuFoldOutlined, MenuUnfoldOutlined, DeleteOutlined, EditOutlined, CaretRightOutlined, SearchOutlined } from '@ant-design/icons'
import { useAppStore } from '../store'
import { STATUS_COLORS } from '../utils/statusColors'
import { sortSessions } from '../utils/sessionSort'
import type { Session } from '../types'

const PRESET_COLORS = [
  '#38bdf8', '#818cf8', '#a78bfa', '#c084fc',
  '#f472b6', '#fb7185', '#f87171', '#ef4444',
  '#fb923c', '#f59e0b', '#fbbf24', '#facc15',
  '#34d399', '#4ade80', '#2dd4bf', '#22d3ee',
]

// 「全部会话」节点在展开/收起集合中的特殊 key
const ALL_SESSIONS_KEY = '__all__'

// 树重排防抖：状态/活跃度变化延迟应用的毫秒数。
// 会话增删仍即时生效；期间状态若持续翻转，计时器重置，顺序保持稳定
const TREE_REORDER_DELAY = 2000

/** 排序键：status + stableActivityAt 决定 sortSessions 的相对顺序 */
interface OrderKey {
  status: Session['status']
  stableAt: number
}

function getOrderKey(s: Session): OrderKey {
  return {
    status: s.status,
    stableAt: s.stableActivityAt ?? s.lastActivityAt ?? s.createdAt,
  }
}

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
            border: value === c ? '2px solid var(--ant-color-bg-elevated)' : '2px solid transparent',
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
  /** 非全屏模式下单击会话节点：由 App 滚动定位到对应卡片并高亮 */
  onNavigateSession?: (sessionId: string) => void
}

export default function Sidebar({ collapsed, onToggleCollapse, onNavigateSession }: SidebarProps) {
  const groups = useAppStore((s) => s.groups)
  const selectedGroupId = useAppStore((s) => s.selectedGroupId)
  const sessions = useAppStore((s) => s.sessions)
  const setSelectedGroupId = useAppStore((s) => s.setSelectedGroupId)
  const setStatusFilter = useAppStore((s) => s.setStatusFilter)
  const addGroup = useAppStore((s) => s.addGroup)
  const updateGroup = useAppStore((s) => s.updateGroup)
  const removeGroup = useAppStore((s) => s.removeGroup)
  const isFullscreen = useAppStore((s) => s.isFullscreen)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setIsFullscreen = useAppStore((s) => s.setIsFullscreen)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[0])
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [duplicateError, setDuplicateError] = useState(false)
  // 树内搜索关键词
  const [treeSearch, setTreeSearch] = useState('')
  // 收起集合（默认空 = 全部展开；后加的新分组天然默认展开）
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const searchKeyword = treeSearch.trim().toLowerCase()

  // ===== 树重排防抖 =====
  // 排序键（status + stableAt）延迟 TREE_REORDER_DELAY 应用：
  // - 新会话的键立即记录（新节点即时出现）
  // - 已有会话的键变化先挂起，静止 2s 后一次性应用（状态来回翻转时顺序不跳）
  // 树内展示的会话对象仍是实时的（状态色点等不受延迟影响），仅顺序用延迟键计算
  const [orderKeys, setOrderKeys] = useState<Record<string, OrderKey>>(() =>
    Object.fromEntries(sessions.map(s => [s.id, getOrderKey(s)]))
  )
  const orderKeysRef = useRef(orderKeys)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  useEffect(() => {
    const prev = orderKeysRef.current
    const merged: Record<string, OrderKey> = {}
    let hasPending = false
    for (const s of sessions) {
      const key = getOrderKey(s)
      const old = prev[s.id]
      if (!old) {
        merged[s.id] = key // 新会话：立即记录
      } else if (old.status === key.status && old.stableAt === key.stableAt) {
        merged[s.id] = key // 未变化
      } else {
        merged[s.id] = old // 变化挂起：暂用旧键
        hasPending = true
      }
    }

    const membershipChanged =
      Object.keys(merged).length !== Object.keys(prev).length ||
      sessions.some(s => !prev[s.id])

    if (membershipChanged || hasPending) {
      orderKeysRef.current = merged
      setOrderKeys(merged)
    }
    if (!hasPending) return

    // 静止 TREE_REORDER_DELAY 后应用最新键（读当时最新 sessions）
    const timer = setTimeout(() => {
      const latest = Object.fromEntries(sessionsRef.current.map(s => [s.id, getOrderKey(s)]))
      orderKeysRef.current = latest
      setOrderKeys(latest)
    }, TREE_REORDER_DELAY)
    return () => clearTimeout(timer)
  }, [sessions])

  // 用延迟键排序得到 id 顺序，再映射回实时会话对象（展示实时、顺序延迟）
  const orderedSessions = useMemo(() => {
    const liveById = new Map(sessions.map(s => [s.id, s]))
    const withDelayedKeys = sessions.map(s => {
      const k = orderKeys[s.id]
      return k ? { ...s, status: k.status, stableActivityAt: k.stableAt } : s
    })
    return sortSessions(withDelayedKeys)
      .map(s => liveById.get(s.id))
      .filter((s): s is Session => !!s)
  }, [sessions, orderKeys])

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
    // 互斥：选分组时清空状态筛选
    if (groupId) setStatusFilter([])
  }

  // 切换分组节点展开/收起
  const toggleExpand = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 搜索时命中的分组自动展开（搜索态强制展开所有可见分组），否则看收起集合
  const isNodeExpanded = (key: string) => (searchKeyword ? true : !collapsedGroups.has(key))

  // 会话节点单击：非全屏 → 通知 App 滚动定位卡片；全屏 → 切换终端（不退出全屏）
  const handleSessionClick = (sessionId: string) => {
    if (isFullscreen) {
      setActiveSession(sessionId)
    } else {
      onNavigateSession?.(sessionId)
    }
  }

  // 会话节点双击：非全屏 → 进入该会话全屏（单击的导航已发生，无妨）；全屏 → 与单击一致
  const handleSessionDoubleClick = (sessionId: string) => {
    setActiveSession(sessionId)
    if (!isFullscreen) setIsFullscreen(true)
  }

  // 溢出检测：hover 时计算内容超出容器的距离写入 CSS 变量，驱动 CSS 跑马灯动画；未溢出不滚动
  const handleMarqueeEnter = (e: React.MouseEvent<HTMLSpanElement>) => {
    const outer = e.currentTarget
    const inner = outer.firstElementChild as HTMLElement | null
    if (!inner) return
    const dist = inner.scrollWidth - outer.clientWidth
    outer.dataset.overflow = dist > 0 ? 'true' : 'false'
    if (dist > 0) outer.style.setProperty('--marquee-dist', `-${dist}px`)
  }

  // 分组会话数：一次遍历统计全部分组计数（替代每个分组各自 filter 的 O(G×N)）
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of sessions) {
      if (s.groupId) counts.set(s.groupId, (counts.get(s.groupId) ?? 0) + 1)
    }
    return counts
  }, [sessions])

  // ===== 树数据：搜索过滤 + 会话排序（防抖后的顺序，与卡片列表规则一致） =====
  // 过滤规则：关键词匹配分组名 → 保留整组全部会话；匹配会话名 → 保留该会话及其所属分组节点。
  // 「全部会话」节点在搜索时同样按会话名过滤；清空关键词恢复完整树。
  const treeData = useMemo(() => {
    // 一次遍历按组分流（组内保持 orderedSessions 相对顺序），替代每分组一次 filter
    const byGroup = new Map<string, Session[]>()
    for (const g of groups) byGroup.set(g.id, [])
    for (const s of orderedSessions) {
      const arr = s.groupId ? byGroup.get(s.groupId) : undefined
      if (arr) arr.push(s)
    }
    if (!searchKeyword) {
      return {
        allSessions: orderedSessions,
        groupEntries: groups.map(g => ({
          group: g,
          nameMatched: false,
          sessions: byGroup.get(g.id) ?? [],
        })),
      }
    }
    const allSessions = orderedSessions.filter(s => s.name.toLowerCase().includes(searchKeyword))
    const groupEntries = groups
      .map(g => {
        const nameMatched = g.name.toLowerCase().includes(searchKeyword)
        const groupSessions = byGroup.get(g.id) ?? []
        return {
          group: g,
          nameMatched,
          // 分组名命中 → 保留整组全部会话；否则只保留会话名命中的
          sessions: nameMatched
            ? groupSessions
            : groupSessions.filter(s => s.name.toLowerCase().includes(searchKeyword)),
        }
      })
      // 分组名命中（即使 0 会话也保留分组节点）或组内有命中会话
      .filter(e => e.nameMatched || e.sessions.length > 0)
    return { allSessions, groupEntries }
  }, [orderedSessions, groups, searchKeyword])

  const renderCollapsedItem = (icon: React.ReactNode, label: string, groupId: string | null, isActive: boolean) => (
    <Tooltip title={label} placement="right" mouseEnterDelay={0.1} mouseLeaveDelay={0.05}>
      <button
        onClick={() => handleSelectItem(groupId)}
        className={`w-full flex items-center justify-center sb-nav-item${isActive ? ' sb-nav-item-active' : ''}`}
        style={{
          height: 28,
          borderRadius: 4,
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontSize: 13,
        }}
      >
        {icon}
      </button>
    </Tooltip>
  )

  // 展开态的分组/全部会话节点行：箭头（展开旋转 90°）+ 图标 + 名称，点击 = 筛选 + 切换展开
  const renderExpandedItem = (
    nodeKey: string,
    icon: React.ReactNode,
    label: React.ReactNode,
    groupId: string | null,
    isActive: boolean
  ) => (
    <button
      onClick={() => { handleSelectItem(groupId); toggleExpand(nodeKey) }}
      className={`w-full flex items-center gap-1 sb-nav-item${isActive ? ' sb-nav-item-active' : ''}`}
      style={{
        height: 26,
        borderRadius: 4,
        padding: '0 6px',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontSize: 12,
        textAlign: 'left',
        width: '100%',
      }}
    >
      <CaretRightOutlined
        style={{
          fontSize: 10,
          flexShrink: 0,
          color: 'var(--ant-color-text-tertiary)',
          transition: 'transform 0.15s ease',
          transform: isNodeExpanded(nodeKey) ? 'rotate(90deg)' : 'rotate(0deg)',
        }}
      />
      <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>{label}</span>
    </button>
  )

  // 会话子节点：状态色点 + 会话名（溢出 hover 跑马灯），当前全屏会话左侧主色条高亮
  const renderSessionNode = (session: Session) => {
    const isActive = activeSessionId === session.id
    return (
      <button
        key={session.id}
        onClick={() => handleSessionClick(session.id)}
        onDoubleClick={() => handleSessionDoubleClick(session.id)}
        className={`w-full flex items-center gap-1.5 sb-nav-item${isActive ? ' sb-nav-item-active' : ''}`}
        style={{
          height: 22,
          borderRadius: 4,
          padding: '0 6px 0 18px',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontSize: 11,
          textAlign: 'left',
          ...(isActive ? { boxShadow: 'inset 2px 0 0 var(--primary)' } : null),
        }}
        title={session.name}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: STATUS_COLORS[session.status]?.color ?? STATUS_COLORS.idle.color,
            flexShrink: 0,
          }}
        />
        <span className="sb-marquee" style={{ flex: 1 }} onMouseEnter={handleMarqueeEnter}>
          <span className="sb-marquee-inner">{session.name}</span>
        </span>
      </button>
    )
  }

  return (
    <div
      className="flex flex-col transition-all duration-200 overflow-hidden"
      style={{
        width: collapsed ? 44 : 168,
        minWidth: collapsed ? 44 : 168,
        maxWidth: collapsed ? 44 : 168,
        borderRight: '1px solid var(--ant-color-border-secondary)',
        background: 'var(--ant-color-bg-layout)',
      }}
    >
      <div
        className="flex items-center justify-between px-1.5 h-8 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--ant-color-border-secondary)' }}
      >
        {!collapsed && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ant-color-text-tertiary)', fontFamily: "'JetBrains Mono', monospace" }}>
            分组
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          className="flex items-center justify-center sb-icon-btn"
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            border: 'none',
            cursor: 'pointer',
            marginLeft: collapsed ? 'auto' : undefined,
            marginRight: collapsed ? 'auto' : undefined,
            fontSize: 12,
            transition: 'all 0.15s ease',
          }}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </button>
      </div>

      {/* 树内搜索框：展开态、标题下方，过滤分组/会话名 */}
      {!collapsed && (
        <div className="flex-shrink-0" style={{ padding: '4px 6px 2px' }}>
          <div
            className="flex items-center gap-1"
            style={{
              height: 22,
              borderRadius: 4,
              border: '1px solid var(--ant-color-border-secondary)',
              background: 'var(--ant-color-bg-elevated)',
              padding: '0 4px 0 6px',
            }}
          >
            <SearchOutlined style={{ fontSize: 10, color: 'var(--ant-color-text-tertiary)', flexShrink: 0 }} />
            <input
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              placeholder="搜索会话"
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--ant-color-text)',
                fontSize: 11,
                height: 20,
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-0.5" style={{ padding: collapsed ? '2px 4px' : '2px 6px' }}>
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
            {/* 全部会话节点：子节点为所有会话（含未分组），搜索时同样过滤 */}
            <div>
              {renderExpandedItem(
                ALL_SESSIONS_KEY,
                <AppstoreFilled />,
                '全部会话',
                null,
                !selectedGroupId
              )}
              {isNodeExpanded(ALL_SESSIONS_KEY) && treeData.allSessions.map(renderSessionNode)}
            </div>
            {treeData.groupEntries.map(({ group, sessions: groupSessions }) => (
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
                        background: 'var(--ant-color-bg-elevated)',
                        border: duplicateError ? '1px solid var(--ant-color-error)' : '1px solid var(--ant-color-primary)',
                        borderRadius: 3,
                        color: 'var(--ant-color-text)',
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
                        group.id,
                        <FolderFilled style={{ color: group.color, filter: `drop-shadow(0 0 3px ${group.color}50)` }} />,
                        <span
                          onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit(group.id, group.name) }}
                          title="双击编辑名称"
                          style={{ cursor: 'text', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}
                        >
                          <span className="sb-marquee" onMouseEnter={handleMarqueeEnter}>
                            <span className="sb-marquee-inner">{group.name}</span>
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--ant-color-text-tertiary)', fontWeight: 400, flexShrink: 0 }}>
                            {groupCounts.get(group.id) ?? 0}
                          </span>
                        </span>,
                        group.id,
                        selectedGroupId === group.id
                      )}
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 sb-icon-btn"
                      aria-label={`重命名分组「${group.name}」`}
                      onClick={(e) => { e.stopPropagation(); handleStartEdit(group.id, group.name) }}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 3,
                        border: 'none',
                        cursor: 'pointer',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      <EditOutlined />
                    </button>
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
                        className="opacity-0 group-hover:opacity-100 sb-danger-btn"
                        aria-label={`删除分组「${group.name}」`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 3,
                          border: 'none',
                          cursor: 'pointer',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          transition: 'opacity 0.15s ease',
                        }}
                      >
                        <DeleteOutlined />
                      </button>
                    </Popconfirm>
                  </div>
                )}
                {isNodeExpanded(group.id) && groupSessions.map(renderSessionNode)}
              </div>
            ))}
            {duplicateError && (
              <div style={{ color: 'var(--ant-color-error)', fontSize: 10, padding: '0 10px', marginTop: 2 }}>
                分组名称已存在
              </div>
            )}
            {/* 搜索无结果提示 */}
            {searchKeyword && treeData.allSessions.length === 0 && treeData.groupEntries.length === 0 && (
              <div style={{ color: 'var(--ant-color-text-quaternary)', fontSize: 10, padding: '4px 10px' }}>
                无匹配会话
              </div>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="flex-shrink-0" style={{ padding: '4px 6px', borderTop: '1px solid var(--ant-color-border-secondary)' }}>
          {showAddGroup ? (
            <div className="flex flex-col gap-1.5">
              <input
                value={newGroupName}
                onChange={(e) => { setNewGroupName(e.target.value); setDuplicateError(false) }}
                placeholder="分组名称"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddGroup(); if (e.key === 'Escape') setShowAddGroup(false) }}
                autoFocus
                style={{
                  fontSize: 11,
                  background: 'var(--ant-color-bg-elevated)',
                  border: duplicateError ? '1px solid var(--ant-color-error)' : '1px solid var(--ant-color-border)',
                  borderRadius: 4,
                  color: 'var(--ant-color-text)',
                  width: '100%',
                  padding: '3px 6px',
                  height: 22,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              <ColorPicker value={newGroupColor} onChange={setNewGroupColor} />
              <div className="flex gap-1">
                <button
                  onClick={handleAddGroup}
                  style={{
                    flex: 1,
                    height: 22,
                    borderRadius: 4,
                    background: 'var(--ant-color-primary)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  确定
                </button>
                <button
                  onClick={() => { setShowAddGroup(false); setDuplicateError(false) }}
                  style={{
                    flex: 1,
                    height: 22,
                    borderRadius: 4,
                    background: 'transparent',
                    color: 'var(--ant-color-text-tertiary)',
                    border: '1px solid var(--ant-color-border)',
                    cursor: 'pointer',
                    fontSize: 10,
                  }}
                >
                  取消
                </button>
              </div>
              {duplicateError && (
                <div style={{ color: 'var(--ant-color-error)', fontSize: 11 }}>分组名称已存在</div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowAddGroup(true)}
              className="w-full flex items-center justify-center gap-1 sb-add-btn"
              style={{
                height: 22,
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
            >
              <PlusCircleFilled style={{ fontSize: 10 }} />
              新建分组
            </button>
          )}
        </div>
      )}

      {collapsed && (
        <div className="flex-shrink-0 flex justify-center py-1.5">
          <Tooltip title="新建分组" placement="right" mouseEnterDelay={0.1}>
            <button
              onClick={() => {
                onToggleCollapse()
                setTimeout(() => setShowAddGroup(true), 200)
              }}
              aria-label="新建分组"
              className="sb-add-btn"
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
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
