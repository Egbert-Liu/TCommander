import { useState } from 'react'
import { Modal, Table, Button, Space, Popconfirm, message } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
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
    },
    {
      title: '终端类型',
      dataIndex: 'terminalType',
      key: 'terminalType',
      render: (type: string) => type.toUpperCase()
    },
    {
      title: '工作目录',
      dataIndex: 'cwd',
      key: 'cwd',
    },
    {
      title: '初始命令',
      dataIndex: 'initialCommand',
      key: 'initialCommand',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button 
            type="link" 
            size="small" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此预设?"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              type="link" 
              size="small" 
              danger 
              icon={<DeleteOutlined />}
            >
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
        title="预设管理"
        open={open}
        onCancel={onClose}
        footer={null}
        width={700}
      >
        <div className="mb-4 flex justify-end">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
          >
            新建预设
          </Button>
        </div>
        
        <Table
          columns={columns}
          dataSource={presets}
          rowKey="id"
          pagination={false}
          size="small"
        />
        
        {presets.length === 0 && (
          <div className="text-center text-gray-500 py-8">
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
