import { useState } from 'react'
import { Modal, Form, Input, Select, Button, Space } from 'antd'
import { TerminalPlatform } from '@ant-design/icons'
import { useAppStore } from '../store'

interface NewSessionDialogProps {
  open: boolean
  onClose: () => void
}

export default function NewSessionDialog({ open, onClose }: NewSessionDialogProps) {
  const { addSession, presets } = useAppStore()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

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

      if (values.initialCommand) {
        setTimeout(async () => {
          await window.electronAPI.sendInput(sessionId, values.initialCommand + '\r')
        }, 500)
      }

      form.resetFields()
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
      title={<Space><TerminalPlatform /> 新建会话</Space>}
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
      width={500}
    >
      {presets.length > 0 && (
        <Form.Item label="从预设选择">
          <Select
            placeholder="选择预设自动填充"
            onChange={handleSelectPreset}
            allowClear
          >
            {presets.map(preset => (
              <Select.Option key={preset.id} value={preset.id}>
                {preset.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      )}
      
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="会话名称"
          rules={[{ required: true, message: '请输入会话名称' }]}
        >
          <Input placeholder="输入会话名称" />
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

        <Form.Item
          name="cwd"
          label="工作目录"
        >
          <Input placeholder="留空使用默认目录" />
        </Form.Item>

        <Form.Item
          name="initialCommand"
          label="初始命令"
        >
          <Input placeholder="创建会话后自动执行的命令" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
