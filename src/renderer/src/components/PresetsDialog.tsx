import { useState } from 'react'
import { Modal, Table, Button, Space, Popconfirm, message } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SettingOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useAppStore } from '../store'
import PresetForm from './PresetForm'
import { Preset } from '../types'

interface PresetsDialogProps {
  open: boolean
  onClose: () => void
}

export default function PresetsDialog({ open, onClose }: PresetsDialogProps) {
  const { presets, removePreset } = useAppStore()
  const [showForm, setShowForm] = useState(false)
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null)

  const handleDelete = async (id: string) => {
    removePreset(id)
    await window.electronAPI.storageSet('presets', useAppStore.getState().presets)
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
          color: 'var(--accent)', 
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
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--terminal-green)' }}>
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
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除此预设?"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
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
            <SettingOutlined style={{ color: 'var(--accent)' }} />
            <span>预设管理</span>
          </Space>
        }
        open={open}
        onCancel={onClose}
        footer={null}
        width={660}
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
            style={{ color: 'var(--text-muted)', fontSize: 13 }}
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
