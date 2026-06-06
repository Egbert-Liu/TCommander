import { useState } from 'react'
import { Modal, Form, Input, Select, Button, Space, Checkbox, Divider, message } from 'antd'
import { CodeFilled, SaveFilled } from '@ant-design/icons'
import { useAppStore } from '../store'

interface NewSessionDialogProps {
  open: boolean
  onClose: () => void
}

export default function NewSessionDialog({ open, onClose }: NewSessionDialogProps) {
  const { addSession, addPreset, presets, groups } = useAppStore()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saveAsPreset, setSaveAsPreset] = useState(false)
  const [presetName, setPresetName] = useState('')

  const handleCreate = async () => {
    try {
      setLoading(true)
      const values = await form.validateFields()
      
      const sessionId = await window.electronAPI.createSession({
        terminalType: values.terminalType,
        cwd: values.cwd || undefined
      })

      const session = {
        id: sessionId,
        name: values.name,
        groupId: values.groupId,
        terminalType: values.terminalType,
        cwd: values.cwd || '~',
        history: [],
        status: 'idle' as const,
        createdAt: Date.now(),
        lastActivityAt: Date.now()
      }

      addSession(session)

      // 如果勾选了保存为预设
      if (saveAsPreset) {
        const name = presetName.trim() || values.name
        const preset = {
          id: `preset-${Date.now()}`,
          name,
          terminalType: values.terminalType,
          cwd: values.cwd || '~',
          initialCommand: values.initialCommand || ''
        }
        addPreset(preset)
        await window.electronAPI.storageSet('presets', useAppStore.getState().presets)
        message.success(`预设"${name}"已保存`)
      }

      if (values.initialCommand) {
        setTimeout(async () => {
          await window.electronAPI.sendInput(sessionId, values.initialCommand + '\r')
        }, 500)
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

  const handleSelectPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId)
    if (preset) {
      form.setFieldsValue({
        name: preset.name,
        terminalType: preset.terminalType,
        cwd: preset.cwd,
        initialCommand: preset.initialCommand || ''
      })
    }
  }

  return (
    <Modal
      title={
        <Space>
          <CodeFilled style={{ color: 'var(--accent)', fontSize: 16 }} />
          <span>新建会话</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={handleCreate}>
            创建
          </Button>
        </Space>
      }
      width={480}
    >
      {presets.length > 0 && (
        <div className="mb-4">
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6, fontWeight: 500 }}>
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

      <Divider style={{ borderColor: 'var(--border-color)', margin: '12px 0' }} />

      <div>
        <Checkbox 
          checked={saveAsPreset} 
          onChange={(e) => setSaveAsPreset(e.target.checked)}
          style={{ color: 'var(--text-secondary)' }}
        >
          <Space>
            <SaveFilled style={{ color: 'var(--accent)', fontSize: 12 }} />
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
    </Modal>
  )
}
