import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Button, Space, Checkbox, Divider, Popconfirm, message } from 'antd'
import { CodeFilled, SaveFilled, ReloadOutlined, ExclamationCircleFilled } from '@ant-design/icons'
import { useAppStore } from '../store'
import { Session } from '../types'
import { createSessionFromConfig } from '../utils/sessionActions'
import SessionConfigFields from './SessionConfigFields'

interface NewSessionDialogProps {
  open: boolean
  onClose: () => void
  resetSession?: Session | null
}

export default function NewSessionDialog({ open, onClose, resetSession }: NewSessionDialogProps) {
  const removeSession = useAppStore((s) => s.removeSession)
  const addPreset = useAppStore((s) => s.addPreset)
  const presets = useAppStore((s) => s.presets)
  const groups = useAppStore((s) => s.groups)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saveAsPreset, setSaveAsPreset] = useState(false)
  const [presetName, setPresetName] = useState('')

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
    }
  }, [open, resetSession])

  const handleCreate = async () => {
    try {
      setLoading(true)
      const values = await form.validateFields()

      const session = await createSessionFromConfig({
        name: values.name,
        terminalType: values.terminalType,
        cwd: values.cwd,
        initialCommand: values.initialCommand,
        groupId: values.groupId,
      })

      if (!session) {
        message.error('创建会话失败，请重试')
        setLoading(false)
        return
      }

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

  const handleReset = async () => {
    if (!resetSession) return
    try {
      setLoading(true)
      const values = await form.validateFields()

      await window.electronAPI.closeSession(resetSession.id)

      const session = await createSessionFromConfig({
        name: values.name,
        terminalType: values.terminalType,
        cwd: values.cwd,
        initialCommand: values.initialCommand,
        groupId: values.groupId,
        quickActions: resetSession.quickActions,
      })

      if (!session) {
        message.error('重置会话失败，请重试')
        setLoading(false)
        return
      }

      removeSession(resetSession.id)

      message.success('会话已重置')
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
            {isResetMode ? (
              <Popconfirm
                title="确认重置会话？"
                description={
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                    将关闭「{resetSession?.name}」并创建新的会话
                  </div>
                }
                onConfirm={handleReset}
                okText="确认重置"
                cancelText="取消"
                okButtonProps={{ danger: true, loading }}
              >
                <Button type="primary" danger icon={<ReloadOutlined />}>
                  重置会话
                </Button>
              </Popconfirm>
            ) : (
              <Button type="primary" loading={loading} onClick={handleCreate} icon={<CodeFilled />}>
                创建
              </Button>
            )}
          </Space>
        }
        width={480}
      >
        {isResetMode && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 12,
            color: 'var(--ant-color-text-secondary)',
          }}>
            <ExclamationCircleFilled style={{ color: '#ef4444', marginRight: 6 }} />
            修改配置后点击"重置会话"将关闭当前命令行并创建新的会话
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

        <Form form={form} layout="vertical" size="small" initialValues={{ terminalType: 'powershell' }}>
          <SessionConfigFields nameLabel="会话名称" namePlaceholder="输入会话名称" />

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
    </>
  )
}
