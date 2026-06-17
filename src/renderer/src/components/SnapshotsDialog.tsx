import { Modal, Button, Popconfirm, message } from 'antd'
import { HistoryOutlined, DeleteOutlined, UndoOutlined } from '@ant-design/icons'
import { useAppStore } from '../store'
import EmptyState from './EmptyState'
import { createSessionFromConfig } from '../utils/sessionActions'

interface SnapshotsDialogProps {
  open: boolean
  onClose: () => void
}

export default function SnapshotsDialog({ open, onClose }: SnapshotsDialogProps) {
  const snapshots = useAppStore((s) => s.snapshots)
  const removeSnapshot = useAppStore((s) => s.removeSnapshot)
  const setGroups = useAppStore((s) => s.setGroups)

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
      {snapshots.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <EmptyState
            icon={<HistoryOutlined style={{ fontSize: 28, color: 'var(--primary)' }} />}
            title="暂无快照"
            description='点击工具栏"保存快照"创建'
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
