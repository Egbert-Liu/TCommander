import { Modal, Button } from 'antd'
import { PoweroffOutlined } from '@ant-design/icons'

interface CloseConfirmDialogProps {
  open: boolean
  sessionCount: number
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 关闭应用确认对话框（替代丑陋的原生 dialog.showMessageBox）
 *
 * 触发链：用户点原生 X -> 主进程拦截 close -> IPC 通知渲染进程 ->
 * 本组件弹出 -> 用户选择 -> IPC 回传主进程 -> 主进程决定是否真正关闭。
 *
 * 样式：图标 + 标题 + 描述 + 活跃会话数提示 + 取消(默认聚焦)/确认关闭(危险色)。
 */
export default function CloseConfirmDialog({ open, sessionCount, onConfirm, onCancel }: CloseConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      centered
      width={400}
      footer={null}
      closable={false}
      maskClosable
      styles={{
        mask: { background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' },
        content: {
          padding: 0,
          borderRadius: 14,
          overflow: 'hidden',
          background: 'var(--ant-color-bg-elevated, #1f1f1f)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* 顶部图标区：柔和的红色渐变背景 + 关机图标 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 0 16px',
            background: 'linear-gradient(180deg, rgba(248,113,113,0.16) 0%, rgba(248,113,113,0) 100%)',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(248, 113, 113, 0.14)',
              border: '1px solid rgba(248, 113, 113, 0.30)',
              color: '#f87171',
            }}
          >
            <PoweroffOutlined style={{ fontSize: 22 }} />
          </div>
        </div>

        <div style={{ padding: '0 28px 8px', textAlign: 'center' }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--ant-color-text)',
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: 8,
            }}
          >
            确认关闭 TCommander？
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--ant-color-text-secondary)',
              lineHeight: 1.6,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            关闭后将释放所有 PTY 进程与终端资源。
            {sessionCount > 0 && (
              <span style={{ display: 'block', marginTop: 6, color: '#fbbf24' }}>
                当前有 {sessionCount} 个会话
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '16px 28px 22px',
          }}
        >
          <Button
            block
            size="large"
            onClick={onCancel}
            autoFocus
            style={{ borderRadius: 8, height: 38, fontWeight: 500 }}
          >
            取消
          </Button>
          <Button
            block
            size="large"
            type="primary"
            danger
            icon={<PoweroffOutlined />}
            onClick={onConfirm}
            style={{ borderRadius: 8, height: 38, fontWeight: 600 }}
          >
            确认关闭
          </Button>
        </div>
      </div>
    </Modal>
  )
}
