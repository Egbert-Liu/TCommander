import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Button, Space, Checkbox, Divider, message } from 'antd'
import { CodeFilled, SaveFilled, ReloadOutlined, ExclamationCircleFilled } from '@ant-design/icons'
import { useAppStore } from '../store'
import { Session } from '../types'

interface NewSessionDialogProps {
  open: boolean
  onClose: () => void
  resetSession?: Session | null
}

export default function NewSessionDialog({ open, onClose, resetSession }: NewSessionDialogProps) {
  const addSession = useAppStore((s) => s.addSession)
  const removeSession = useAppStore((s) => s.removeSession)
  const addPreset = useAppStore((s) => s.addPreset)
  const presets = useAppStore((s) => s.presets)
  const groups = useAppStore((s) => s.groups)
  const defaultQuickActions = useAppStore((s) => s.defaultQuickActions)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saveAsPreset, setSaveAsPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const isResetMode = !!resetSession

  useEffect(() => {
    if (open && resetSession) {
      form.setFieldsValue({
        name: resetSession.name,
        terminalType: resetSession.terminalType,
        cwd: resetSession.cwd,
        initialCommand: resetSession.initialCommand || '',
        groupId: resetSession.groupId || undefined,
      })
    }
    if (!open) {
      form.resetFields()
      setSaveAsPreset(false)
      setPresetName('')
      setConfirmReset(false)
    }
  }, [open, resetSession])

  const handleCreate = async () => {
    try {
      setLoading(true)
      const values = await form.validateFields()

      if (isResetMode && resetSession) {
        setConfirmReset(true)
        setLoading(false)
        return
      }

      const sessionId = await window.electronAPI.createSession({
        terminalType: values.terminalType,
        cwd: values.cwd || undefined,
        initialCommand: values.initialCommand || undefined
      })

      if (!sessionId) {
        message.error('创建会话失败，请重试')
        return
      }

      addSession({
        id: sessionId,
        name: values.name,
        groupId: values.groupId,
        terminalType: values.terminalType,
        cwd: values.cwd || '~',
        initialCommand: values.initialCommand || undefined,
        history: [],
        previewText: '',
        status: 'idle' as const,
        quickActions: [...defaultQuickActions],
        createdAt: Date.now(),
        lastActivityAt: Date.now()
      })

      if (saveAsPreset) {
        const name = presetName.trim() || values.name
        addPreset({
          id: `preset-${Date.now()}`,
          name,
          terminalType: values.terminalType,
          cwd: values.cwd || '~',
          initialCommand: values.initialCommand || '',
          groupId: values.groupId || undefined
        })
        message.success(`预设"${name}"已保存`)
      }

      form.resetFields()
      setSaveAsPreset(false)
      setPresetName('')
      onClose()
    } catch (error) {
      console.error('创建会话失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmReset = async () => {
    if (!resetSession) return
    try {
      setLoading(true)
      const values = await form.validateFields()

      await window.electronAPI.closeSession(resetSession.id)

      const sessionId = await window.electronAPI.createSession({
        terminalType: values.terminalType,
        cwd: values.cwd || undefined,
        initialCommand: values.initialCommand || undefined
      })

      if (!sessionId) {
        message.error('重置会话失败，请重试')
        return
      }

      removeSession(resetSession.id)

      addSession({
        id: sessionId,
        name: values.name,
        groupId: values.groupId,
        terminalType: values.terminalType,
        cwd: values.cwd || '~',
        initialCommand: values.initialCommand || undefined,
        history: [],
        previewText: '',
        status: 'idle' as const,
        quickActions: [...resetSession.quickActions],
        createdAt: Date.now(),
        lastActivityAt: Date.now()
      })

      message.success('会话已重置')
      setConfirmReset(false)
      onClose()
    } catch (error) {
      console.error('重置会话失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId)
    if (preset) {
      form.setFieldsValue({
        name: preset.name,
        terminalType: preset.terminalType,
        cwd: preset.cwd,
        initialCommand: preset.initialCommand || '',
        groupId: preset.groupId || undefined
      })
    }
  }

  return (
    <>
      <Modal
        title={
          <Space>
            {isResetMode ? (
              <ReloadOutlined style={{ color: '#f59e0b', fontSize: 16 }} />
            ) : (
              <CodeFilled style={{ color: 'var(--ant-color-primary)', fontSize: 16 }} />
            )}
            <span>{isResetMode ? '重置会话' : '新建会话'}</span>
          </Space>
        }
        open={open}
        onCancel={onClose}
        footer={
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button
              type="primary"
              loading={loading}
              onClick={handleCreate}
              danger={isResetMode}
              icon={isResetMode ? <ReloadOutlined /> : undefined}
            >
              {isResetMode ? '下一步' : '创建'}
            </Button>
          </Space>
        }
        width={480}
      >
        {isResetMode && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 12,
            color: 'var(--ant-color-text-secondary)',
          }}>
            <ExclamationCircleFilled style={{ color: '#f59e0b', marginRight: 6 }} />
            重置将关闭当前命令行并创建新的会话，请确认配置后点击"下一步"
          </div>
        )}

        {!isResetMode && presets.length > 0 && (
          <div className="mb-4">
            <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12, marginBottom: 6, fontWeight: 500 }}>
              从预设选择
            </div>
            <Select
              placeholder="选择预设自动填充"
              onChange={handleSelectPreset}
              allowClear
              className="w-full"
            >
              {presets.map(preset => (
                <Select.Option key={preset.id} value={preset.id}>
                  {preset.name}
                </Select.Option>
              ))}
            </Select>
          </div>
        )}

        <Form form={form} layout="vertical" size="small">
          <Form.Item
            name="name"
            label="会话名称"
            rules={[{ required: true, message: '请输入会话名称' }]}
          >
            <Input placeholder="输入会话名称" />
          </Form.Item>

          <Form.Item name="groupId" label="所属分组">
            <Select placeholder="选择分组（可选）" allowClear>
              {groups.map(g => (
                <Select.Option key={g.id} value={g.id}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, display: 'inline-block' }} />
                    {g.name}
                  </span>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="terminalType"
            label="终端类型"
            rules={[{ required: true, message: '请选择终端类型' }]}
            initialValue="powershell"
          >
            <Select>
              <Select.Option value="powershell">PowerShell</Select.Option>
              <Select.Option value="cmd">CMD</Select.Option>
              <Select.Option value="bash">Bash</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="cwd" label="工作目录">
            <Input placeholder="留空使用默认目录" />
          </Form.Item>

          <Form.Item name="initialCommand" label="初始命令">
            <Input placeholder="创建会话后自动执行的命令" />
          </Form.Item>
        </Form>

        {!isResetMode && (
          <>
            <Divider style={{ borderColor: 'var(--ant-color-border)', margin: '12px 0' }} />
            <div>
              <Checkbox
                checked={saveAsPreset}
                onChange={(e) => setSaveAsPreset(e.target.checked)}
                style={{ color: 'var(--ant-color-text-secondary)' }}
              >
                <Space>
                  <SaveFilled style={{ color: 'var(--ant-color-primary)', fontSize: 12 }} />
                  保存为预设
                </Space>
              </Checkbox>

              {saveAsPreset && (
                <Input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="预设名称（留空则使用会话名称）"
                  className="mt-2"
                  size="small"
                />
              )}
            </div>
          </>
        )}
      </Modal>

      <Modal
        title={
          <Space>
            <ExclamationCircleFilled style={{ color: '#ef4444', fontSize: 18 }} />
            <span>确认重置</span>
          </Space>
        }
        open={confirmReset}
        onCancel={() => setConfirmReset(false)}
        footer={
          <Space>
            <Button onClick={() => setConfirmReset(false)}>取消</Button>
            <Button
              type="primary"
              danger
              loading={loading}
              onClick={handleConfirmReset}
              icon={<ReloadOutlined />}
            >
              确认重置
            </Button>
          </Space>
        }
        width={400}
      >
        <div style={{ fontSize: 13, color: 'var(--ant-color-text)', lineHeight: 1.8 }}>
          <p style={{ margin: 0 }}>
            即将执行以下操作：
          </p>
          <ul style={{ margin: '8px 0', paddingLeft: 20, color: 'var(--ant-color-text-secondary)' }}>
            <li>关闭当前命令行进程（<strong style={{ color: '#ef4444' }}>{resetSession?.name}</strong>）</li>
            <li>清除所有历史输出</li>
            <li>使用新配置创建新的命令行会话</li>
          </ul>
          <p style={{ margin: 0, color: '#ef4444', fontWeight: 600 }}>
            ⚠ 此操作不可撤销
          </p>
        </div>
      </Modal>
    </>
  )
}
