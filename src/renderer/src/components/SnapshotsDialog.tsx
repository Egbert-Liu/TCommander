import { Modal, Button, Popconfirm, message } from 'antd'
import { HistoryOutlined, DeleteOutlined, UndoOutlined } from '@ant-design/icons'
import { useAppStore } from '../store'

interface SnapshotsDialogProps {
  open: boolean
  onClose: () => void
}

export default function SnapshotsDialog({ open, onClose }: SnapshotsDialogProps) {
  const snapshots = useAppStore((s) => s.snapshots)
  const removeSnapshot = useAppStore((s) => s.removeSnapshot)
  const setGroups = useAppStore((s) => s.setGroups)
  const defaultQuickActions = useAppStore((s) => s.defaultQuickActions)

  const handleRestore = async (snapshotId: string) => {
    const snapshot = snapshots.find(s => s.id === snapshotId)
    if (!snapshot) return

    const existingGroups = useAppStore.getState().groups
    const newGroups = [...existingGroups]
    for (const g of snapshot.data.groups) {
      if (!newGroups.some(eg => eg.id === g.id)) {
        newGroups.push(g)
      }
    }
    setGroups(newGroups)

    for (const sessionData of snapshot.data.sessions) {
      const config = {
        name: sessionData.name,
        terminalType: sessionData.terminalType as 'powershell' | 'cmd' | 'bash',
        cwd: sessionData.cwd,
        initialCommand: sessionData.initialCommand,
        groupId: sessionData.groupId,
      }
      try {
        const sessionId = await window.electronAPI.createSession(config)
        useAppStore.getState().addSession({
          id: sessionId,
          ...config,
          history: [],
          previewText: '',
          status: 'idle',
          quickActions: [...defaultQuickActions],
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
        })
      } catch (e) {
        console.error('恢复会话失败:', e)
      }
    }

    message.success(`已从快照恢复 ${snapshot.data.sessions.length} 个会话`)
    onClose()
  }

  const handleDelete = (snapshotId: string) => {
    removeSnapshot(snapshotId)
    message.success('快照已删除')
  }

  return (
    <Modal
      title={
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14 }}>
          <HistoryOutlined style={{ marginRight: 8, color: 'var(--ant-color-primary)' }} />
          快照管理
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
    >
      {snapshots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ant-color-text-tertiary)' }}>
          <HistoryOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
          暂无快照，点击工具栏"保存快照"创建
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
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--ant-color-text)' }}>
                  {snapshot.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', marginTop: 2 }}>
                  {snapshot.data.sessions.length} 个会话 · {snapshot.data.groups.length} 个分组
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
  )
}
