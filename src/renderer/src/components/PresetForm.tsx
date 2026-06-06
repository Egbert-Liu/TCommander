import { useState } from 'react'
import { Modal, Form, Input, Select, Button, Space, message } from 'antd'
import { useAppStore } from '../store'
import { Preset } from '../types'

interface PresetFormProps {
  open: boolean
  onClose: () => void
  editingPreset?: Preset | null
}

export default function PresetForm({ open, onClose, editingPreset }: PresetFormProps) {
  const { addPreset, updatePreset } = useAppStore()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    try {
      setLoading(true)
      const values = await form.validateFields()
      
      if (editingPreset) {
        updatePreset(editingPreset.id, values)
        message.success('预设已更新')
      } else {
        const preset = {
          id: `preset-${Date.now()}`,
          ...values
        }
        addPreset(preset)
        message.success('预设已创建')
      }

      await window.electronAPI.storageSet('presets', useAppStore.getState().presets)
      form.resetFields()
      onClose()
    } catch (error) {
      console.error('保存预设失败:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={editingPreset ? '编辑预设' : '新建预设'}
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={handleSubmit}>
            保存
          </Button>
        </Space>
      }
      width={460}
    >
      <Form form={form} layout="vertical" size="small" initialValues={editingPreset || {}}>
        <Form.Item
          name="name"
          label="预设名称"
          rules={[{ required: true, message: '请输入预设名称' }]}
        >
          <Input placeholder="例如：开发环境" />
        </Form.Item>

        <Form.Item
          name="terminalType"
          label="终端类型"
          rules={[{ required: true, message: '请选择终端类型' }]}
        >
          <Select>
            <Select.Option value="powershell">PowerShell</Select.Option>
            <Select.Option value="cmd">CMD</Select.Option>
            <Select.Option value="bash">Bash</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item name="cwd" label="工作目录">
          <Input placeholder="例如：C:\Projects" />
        </Form.Item>

        <Form.Item name="initialCommand" label="初始命令">
          <Input placeholder="例如：npm run dev" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
