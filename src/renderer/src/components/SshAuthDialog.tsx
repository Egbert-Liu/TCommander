import { useState, useEffect, useRef } from 'react'
import { Modal, Input, Button } from 'antd'
import { KeyOutlined } from '@ant-design/icons'

interface SshAuthDialogProps {
  open: boolean
  prompt: string
  sessionId: string
  onReply: (answer: string | null) => void
}

/**
 * SSH 交互式认证输入框。
 *
 * 触发链：ssh2 'keyboard-interactive' 事件 -> SshBackend 调 authBridge.requestAuth
 * -> 主进程 send 'ssh-auth-prompt' -> App.tsx 订阅 -> 本组件弹出 ->
 * 用户输入 -> replySshAuth 回传主进程 -> 唤醒 SshBackend 的 await。
 *
 * 样式参照 CloseConfirmDialog：顶部图标区 + 标题 + prompt 描述 + 输入框 + 取消/确认。
 */
export default function SshAuthDialog({ open, prompt, sessionId, onReply }: SshAuthDialogProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<any>(null)

  useEffect(() => {
    if (open) {
      setValue('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, sessionId])

  const handleConfirm = () => {
    onReply(value || null)
    setValue('')
  }

  const handleCancel = () => {
    onReply(null)
    setValue('')
  }

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      centered
      width={420}
      footer={null}
      closable={false}
      maskClosable={false}
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 0 16px',
            background: 'linear-gradient(180deg, rgba(96,165,250,0.16) 0%, rgba(96,165,250,0) 100%)',
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
              background: 'rgba(96, 165, 250, 0.14)',
              border: '1px solid rgba(96, 165, 250, 0.30)',
              color: '#60a5fa',
            }}
          >
            <KeyOutlined style={{ fontSize: 22 }} />
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
            SSH 交互式认证
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--ant-color-text-secondary)',
              lineHeight: 1.6,
              fontFamily: "'JetBrains Mono', monospace",
              background: 'var(--ant-color-fill-quaternary)',
              borderRadius: 6,
              padding: '8px 12px',
              textAlign: 'left',
              wordBreak: 'break-all',
            }}
          >
            {prompt}
          </div>
        </div>

        <div style={{ padding: '12px 28px 0' }}>
          <Input.Password
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onPressEnter={handleConfirm}
            placeholder="输入密码..."
            size="large"
            style={{ borderRadius: 8 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '16px 28px 22px' }}>
          <Button
            block
            size="large"
            onClick={handleCancel}
            style={{ borderRadius: 8, height: 38, fontWeight: 500 }}
          >
            取消
          </Button>
          <Button
            block
            size="large"
            type="primary"
            icon={<KeyOutlined />}
            onClick={handleConfirm}
            style={{ borderRadius: 8, height: 38, fontWeight: 600 }}
          >
            确认
          </Button>
        </div>
      </div>
    </Modal>
  )
}
