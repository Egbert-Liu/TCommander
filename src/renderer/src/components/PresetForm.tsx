import { useState, useEffect } from 'react'
import { Modal, Form, Button, Space, message } from 'antd'
import { useAppStore } from '../store'
import { Preset, SshSessionConfig } from '../types'
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
        if (editingPreset.kind === 'ssh' && editingPreset.sshConfig) {
          form.setFieldsValue({
            name: editingPreset.name,
            connectionType: 'ssh',
            host: editingPreset.sshConfig.host,
            port: editingPreset.sshConfig.port || 22,
            username: editingPreset.sshConfig.username,
            authMethod: editingPreset.sshConfig.authMethod,
            privateKeyPath: editingPreset.sshConfig.privateKeyPath,
            groupId: editingPreset.groupId || undefined,
            initialCommand: editingPreset.initialCommand || '',
          })
        } else {
          form.setFieldsValue({
            name: editingPreset.name,
            connectionType: 'local',
            terminalType: editingPreset.terminalType,
            cwd: editingPreset.cwd,
            initialCommand: editingPreset.initialCommand || '',
            groupId: editingPreset.groupId || undefined,
          })
        }
      } else {
        form.resetFields()
      }
    } else {
      form.resetFields()
    }
  }, [open, editingPreset, form])

  const handleSubmit = async () => {
    try {
      setLoading(true)
      const values = await form.validateFields()

      if (values.connectionType === 'ssh') {
        await saveSshPreset(values)
      } else {
        saveLocalPreset(values)
      }

      form.resetFields()
      onClose()
    } catch (error) {
      console.error('保存预设失败:', error)
    } finally {
      setLoading(false)
    }
  }

  function saveLocalPreset(values: any) {
    const presetData = {
      name: values.name,
      kind: 'local' as const,
      terminalType: values.terminalType,
      cwd: values.cwd || '~',
      initialCommand: values.initialCommand || '',
      groupId: values.groupId || undefined,
    }
    if (editingPreset) {
      updatePreset(editingPreset.id, presetData)
      message.success('预设已更新')
    } else {
      addPreset({ id: `preset-${Date.now()}`, ...presetData })
      message.success('预设已创建')
    }
  }

  async function saveSshPreset(values: any) {
    const sshConfig: SshSessionConfig = editingPreset?.sshConfig
      ? { ...editingPreset.sshConfig }
      : {
          host: values.host,
          port: values.port || 22,
          username: values.username,
          authMethod: values.authMethod || 'password',
        }

    // 更新连接基本信息（host/port/user 可能被改）
    sshConfig.host = values.host
    sshConfig.port = values.port || 22
    sshConfig.username = values.username
    sshConfig.authMethod = values.authMethod || 'password'

    // 密码：用户重新输入了才更新引用，否则保持原有
    if (values.authMethod !== 'privateKey' && values.password) {
      const ref = `pwd-${values.host}-${values.username}-${Date.now()}`
      await window.electronAPI.secretSet(ref, values.password)
      sshConfig.passwordRef = ref
    }

    // 私钥路径 + 口令
    if (values.authMethod === 'privateKey') {
      sshConfig.privateKeyPath = values.privateKeyPath
      if (values.passphrase) {
        const ref = `pp-${values.host}-${values.username}-${Date.now()}`
        await window.electronAPI.secretSet(ref, values.passphrase)
        sshConfig.passphraseRef = ref
      }
    }

    const presetData = {
      name: values.name,
      kind: 'ssh' as const,
      terminalType: 'bash' as const,
      cwd: '~',
      initialCommand: values.initialCommand || '',
      groupId: values.groupId || undefined,
      sshConfig,
    }

    if (editingPreset) {
      updatePreset(editingPreset.id, presetData)
      message.success('预设已更新')
    } else {
      addPreset({ id: `preset-${Date.now()}`, ...presetData })
      message.success('预设已创建')
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
