import { useState } from 'react'
import { Modal, Table, Button, Space, Popconfirm, message } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SettingOutlined, PlayCircleOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useAppStore } from '../store'
import PresetForm from './PresetForm'
import { Preset } from '../types'

interface PresetsDialogProps {
  open: boolean
  onClose: () => void
}

export default function PresetsDialog({ open, onClose }: PresetsDialogProps) {
  const presets = useAppStore((s) => s.presets)
  const removePreset = useAppStore((s) => s.removePreset)
  const addSession = useAppStore((s) => s.addSession)
  const defaultQuickActions = useAppStore((s) => s.defaultQuickActions)
  const [showForm, setShowForm] = useState(false)
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null)

  const handleDelete = (id: string) => {
    removePreset(id)
    message.success('预设已删除')
  }

  const handleEdit = (preset: Preset) => {
    setEditingPreset(preset)
    setShowForm(true)
  }

  const handleAdd = () => {
    setEditingPreset(null)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingPreset(null)
  }

  const handleCreateFromPreset = async (preset: Preset) => {
    try {
      const sessionId = await window.electronAPI.createSession({
        terminalType: preset.terminalType as 'powershell' | 'cmd' | 'bash',
        cwd: preset.cwd || undefined,
        initialCommand: preset.initialCommand || undefined
      })

      if (!sessionId) {
        message.error('创建会话失败')
        return
      }

      addSession({
        id: sessionId,
        name: preset.name,
        groupId: preset.groupId,
        terminalType: preset.terminalType as 'powershell' | 'cmd' | 'bash',
        cwd: preset.cwd || '~',
        initialCommand: preset.initialCommand || undefined,
        history: [],
        previewText: '',
        status: 'idle',
        quickActions: [...defaultQuickActions],
        createdAt: Date.now(),
        lastActivityAt: Date.now()
      })

      message.success(`会话"${preset.name}"已创建`)
    } catch {
      message.error('创建会话失败')
    }
  }

  const columns: ColumnsType<Preset> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{name}</span>
      )
    },
    {
      title: '终端',
      dataIndex: 'terminalType',
      key: 'terminalType',
      width: 90,
      render: (type: string) => (
        <span style={{ 
          color: 'var(--ant-color-primary)', 
          fontFamily: "'JetBrains Mono', monospace", 
          fontSize: 11 
        }}>
          {type.toUpperCase()}
        </span>
      )
    },
    {
      title: '工作目录',
      dataIndex: 'cwd',
      key: 'cwd',
      ellipsis: true,
    },
    {
      title: '初始命令',
      dataIndex: 'initialCommand',
      key: 'initialCommand',
      ellipsis: true,
      render: (cmd: string) => cmd ? (
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#a6e3a1' }}>
          {cmd}
        </span>
      ) : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleCreateFromPreset(record)}
            title="从此预设创建会话"
          >
            创建
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="编辑" />
          <Popconfirm
            title="确定删除此预设?"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} title="删除" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Modal
        title={
          <Space>
            <SettingOutlined style={{ color: 'var(--ant-color-primary)' }} />
            <span>预设管理</span>
          </Space>
        }
        open={open}
        onCancel={onClose}
        footer={null}
        width={700}
      >
        <div className="mb-3 flex justify-end">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="small">
            新建预设
          </Button>
        </div>
        
        {presets.length > 0 ? (
          <Table
            columns={columns}
            dataSource={presets}
            rowKey="id"
            pagination={false}
            size="small"
          />
        ) : (
          <div 
            className="text-center py-10"
            style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 13 }}
          >
            暂无预设，点击"新建预设"创建
          </div>
        )}
      </Modal>

      <PresetForm
        open={showForm}
        onClose={handleFormClose}
        editingPreset={editingPreset}
      />
    </>
  )
}
