import { useState, useEffect } from 'react'
import { Modal, Form, Button, Space, message } from 'antd'
import { useAppStore } from '../store'
import { Preset } from '../types'
import SessionConfigFields from './SessionConfigFields'

interface PresetFormProps {
  open: boolean
  onClose: () => void
  editingPreset?: Preset | null
}

export default function PresetForm({ open, onClose, editingPreset }: PresetFormProps) {
  const { addPreset, updatePreset } = useAppStore()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  // Update form values when editingPreset changes
  useEffect(() => {
    if (open) {
      if (editingPreset) {
        form.setFieldsValue(editingPreset)
      } else {
        form.resetFields()
      }
    } else {
      // 关闭时重置表单，确保下次打开时是干净的
      form.resetFields()
    }
  }, [open, editingPreset, form])

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
        <SessionConfigFields
          nameLabel="预设名称"
          namePlaceholder="例如：开发环境"
          cwdPlaceholder="例如：C:\Projects"
          commandPlaceholder="例如：npm run dev"
        />
      </Form>
    </Modal>
  )
}
