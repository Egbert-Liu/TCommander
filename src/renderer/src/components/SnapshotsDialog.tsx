import { Modal, Button, Popconfirm, message, Input, Select } from 'antd'
import { HistoryOutlined, DeleteOutlined, UndoOutlined, CameraFilled, AppstoreOutlined } from '@ant-design/icons'
import { useState, useMemo } from 'react'
import { useAppStore } from '../store'
import EmptyState from './EmptyState'
import { createSessionFromConfig } from '../utils/sessionActions'

interface SnapshotsDialogProps {
  open: boolean
  onClose: () => void
}

/** 快照范围选择值：'all' = 全部会话（整个窗口），否则为 groupId */
type SnapshotScope = 'all' | string

export default function SnapshotsDialog({ open, onClose }: SnapshotsDialogProps) {
  const snapshots = useAppStore((s) => s.snapshots)
  const groups = useAppStore((s) => s.groups)
  const addSnapshot = useAppStore((s) => s.addSnapshot)
  const removeSnapshot = useAppStore((s) => s.removeSnapshot)
  const setGroups = useAppStore((s) => s.setGroups)

  // ===== 保存快照（内嵌弹窗，支持选择范围：全部会话 / 某个分组）=====
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')
  const [snapshotDescription, setSnapshotDescription] = useState('')
  const [scope, setScope] = useState<SnapshotScope>('all')

  // 范围下拉选项：全部 + 各分组（附各组会话数；空组也可选，保存时提示）
  const scopeOptions = useMemo(() => {
    const sessions = useAppStore.getState().sessions
    const countOf = (groupId: string) => sessions.filter(s => s.groupId === groupId).length
    return [
      { value: 'all', label: `全部会话（${sessions.length}）` },
      ...groups.map(g => ({
        value: g.id,
        label: `分组：${g.name}（${countOf(g.id)}）`,
      })),
    ]
  }, [groups, open]) // open 变化时刷新计数（打开弹窗时拿到最新会话数）

  const openSaveModal = () => {
    const sessions = useAppStore.getState().sessions
    if (sessions.length === 0) {
      message.warning('当前没有活跃会话，无法创建快照')
      return
    }
    setSnapshotName(`快照 ${new Date().toLocaleString()}`)
    setSnapshotDescription('')
    setScope('all')
    setSaveModalOpen(true)
  }

  const handleSaveSnapshot = () => {
    const state = useAppStore.getState()
    const name = snapshotName.trim() || `快照 ${new Date().toLocaleString()}`
    const description = snapshotDescription.trim() || undefined

    // 范围筛选：全部 → 所有会话与分组；分组 → 仅该组会话与该组定义
    const scopedSessions = scope === 'all'
      ? state.sessions
      : state.sessions.filter(s => s.groupId === scope)
    if (scopedSessions.length === 0) {
      message.warning('所选范围内没有会话，无法创建快照')
      return
    }
    const scopedGroups = scope === 'all'
      ? state.groups
      : state.groups.filter(g => g.id === scope)

    addSnapshot({
      id: `snapshot-${Date.now()}`,
      name,
      description,
      scope,
      data: {
        sessions: scopedSessions.map(s => ({
          name: s.name,
          groupId: s.groupId,
          terminalType: s.terminalType,
          cwd: s.cwd,
          initialCommand: s.initialCommand,
          history: s.history,
        })),
        groups: scopedGroups,
      },
      createdAt: Date.now(),
    })
    message.success(`快照已保存（${scopedSessions.length} 个会话）`)
    setSaveModalOpen(false)
  }

  /** 范围展示标签：全部 / 组名（组已删则回退「已删除分组」；旧快照无 scope 视为全部） */
  const scopeLabel = (snapshotScope?: SnapshotScope) => {
    if (!snapshotScope || snapshotScope === 'all') return '全部'
    return groups.find(g => g.id === snapshotScope)?.name ?? '已删除分组'
  }

  const handleRestore = async (snapshotId: string) => {
    const snapshot = snapshots.find(s => s.id === snapshotId)
    if (!snapshot) return

    const setGlobalLoading = useAppStore.getState().setGlobalLoading
    setGlobalLoading(true, `正在从快照恢复 ${snapshot.data.sessions.length} 个会话...`)
    try {
      const existingGroups = useAppStore.getState().groups
      const newGroups = [...existingGroups]
      for (const g of snapshot.data.groups) {
        if (!newGroups.some(eg => eg.id === g.id)) {
          newGroups.push(g)
        }
      }
      setGroups(newGroups)

      for (const sessionData of snapshot.data.sessions) {
        await createSessionFromConfig({
          name: sessionData.name,
          terminalType: sessionData.terminalType as 'powershell' | 'cmd' | 'bash',
          cwd: sessionData.cwd,
          initialCommand: sessionData.initialCommand,
          groupId: sessionData.groupId,
        })
      }

      message.success(`已从快照恢复 ${snapshot.data.sessions.length} 个会话`)
      onClose()
    } catch (e) {
      message.error('快照恢复失败，请重试')
      console.error('snapshot restore failed:', e)
    } finally {
      setGlobalLoading(false)
    }
  }

  const handleDelete = (snapshotId: string) => {
    removeSnapshot(snapshotId)
    message.success('快照已删除')
  }

  return (
    <>
      <Modal
        title={
          <>
            <HistoryOutlined style={{ color: 'var(--ant-color-primary)', marginRight: 8 }} />
            快照管理
          </>
        }
        open={open}
        onCancel={onClose}
        footer={null}
        width={520}
      >
        {/* 顶部操作行：保存快照入口（含范围选择） */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Button
            type="primary"
            icon={<CameraFilled />}
            size="small"
            onClick={openSaveModal}
          >
            保存快照
          </Button>
        </div>

        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <EmptyState
              icon={<HistoryOutlined style={{ fontSize: 28, color: 'var(--primary)' }} />}
              title="暂无快照"
              description='点击右上角「保存快照」创建（支持选择全部会话或某个分组）'
            />
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {snapshots.map(snapshot => (
              <div
                key={snapshot.id}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--ant-color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--ant-color-text)' }}>
                    {snapshot.name}
                  </div>
                  {snapshot.description && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--ant-color-text-secondary)',
                        marginTop: 2,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {snapshot.description}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '1px 6px',
                        borderRadius: 4,
                        border: '1px solid var(--ant-color-border-secondary)',
                        background: 'var(--ant-color-fill-quaternary)',
                        color: 'var(--ant-color-text-secondary)',
                      }}
                      title={snapshot.scope && snapshot.scope !== 'all' ? '分组快照' : '窗口快照（全部会话）'}
                    >
                      <AppstoreOutlined style={{ fontSize: 10 }} />
                      {scopeLabel(snapshot.scope)}
                    </span>
                    <span>{snapshot.data.sessions.length} 个会话 · {snapshot.data.groups.length} 个分组</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<UndoOutlined />}
                    onClick={() => handleRestore(snapshot.id)}
                  >
                    快照恢复
                  </Button>
                  <Popconfirm
                    title="确定删除此快照?"
                    onConfirm={() => handleDelete(snapshot.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 保存快照弹窗（原 Toolbar 的保存弹窗迁移至此，新增范围选择） */}
      <Modal
        title={
          <>
            <CameraFilled style={{ color: 'var(--ant-color-primary)', marginRight: 8 }} />
            保存快照
          </>
        }
        open={saveModalOpen}
        onOk={handleSaveSnapshot}
        onCancel={() => setSaveModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={460}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          <div>
            <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--ant-color-text-secondary)' }}>
              快照范围
            </div>
            <Select
              value={scope}
              onChange={(v) => setScope(v as SnapshotScope)}
              options={scopeOptions}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--ant-color-text-secondary)' }}>
              快照名称
            </div>
            <Input
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder="为这个快照起个名字"
              maxLength={64}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--ant-color-text-secondary)' }}>
              描述（可选）
            </div>
            <Input.TextArea
              value={snapshotDescription}
              onChange={(e) => setSnapshotDescription(e.target.value)}
              placeholder="比如：部署前的稳定状态、某个调试配置..."
              autoSize={{ minRows: 3, maxRows: 6 }}
              maxLength={500}
              showCount
            />
          </div>
        </div>
      </Modal>
    </>
  )
}
