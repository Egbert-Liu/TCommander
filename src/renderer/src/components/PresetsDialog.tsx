import { useState, useMemo } from 'react'
import { Modal, Table, Button, Space, Popconfirm, message } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SettingOutlined, PlayCircleOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useAppStore } from '../store'
import PresetForm from './PresetForm'
import EmptyState from './EmptyState'
import { createSessionFromConfig } from '../utils/sessionActions'
import { Preset } from '../types'
import { sortPresets } from '../utils/presetSort'

interface PresetsDialogProps {
  open: boolean
  onClose: () => void
}

export default function PresetsDialog({ open, onClose }: PresetsDialogProps) {
  const presets = useAppStore((s) => s.presets)
  const removePreset = useAppStore((s) => s.removePreset)
  const updatePreset = useAppStore((s) => s.updatePreset)
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
    const session = await createSessionFromConfig({
      name: preset.name,
      kind: preset.kind || 'local',
      terminalType: preset.terminalType,
      cwd: preset.cwd,
      initialCommand: preset.initialCommand,
      groupId: preset.groupId,
      existingSshConfig: preset.sshConfig,
    })
    if (!session) {
      message.error('创建会话失败')
      return
    }
    
    // 更新使用次数
    updatePreset(preset.id, { usageCount: (preset.usageCount || 0) + 1 })
    
    message.success(`会话"${preset.name}"已创建`)
  }

  // 按优先级和使用次数排序
  const sortedPresets = useMemo(() => sortPresets(presets), [presets])

  const columns: ColumnsType<Preset> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (name: string, record: Preset) => (
        <div style={{ 
          fontFamily: "'JetBrains Mono', monospace", 
          fontSize: 12,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }} title={name}>
          {record.kind === 'ssh' ? '🔐 ' : ''}{name}
        </div>
      )
    },
    {
      title: '连接',
      key: 'connection',
      width: 120,
      render: (_, record: Preset) => {
        if (record.kind === 'ssh' && record.sshConfig) {
          return (
            <div style={{ 
              fontFamily: "'JetBrains Mono', monospace", 
              fontSize: 11, 
              color: 'rgba(34, 197, 94, 0.9)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }} title={`${record.sshConfig.username}@${record.sshConfig.host}${record.sshConfig.port !== 22 ? `:${record.sshConfig.port}` : ''}`}>
              {record.sshConfig.username}@{record.sshConfig.host}
              {record.sshConfig.port !== 22 ? `:${record.sshConfig.port}` : ''}
            </div>
          )
        }
        return (
          <span style={{
            color: 'var(--ant-color-primary)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11
          }}>
            {record.terminalType.toUpperCase()}
          </span>
        )
      }
    },
    {
      title: '工作目录',
      dataIndex: 'cwd',
      key: 'cwd',
      width: 150,
      render: (cwd: string, record: Preset) => {
        if (record.kind === 'ssh') return '-'
        return (
          <div style={{ 
            fontFamily: "'JetBrains Mono', monospace", 
            fontSize: 11,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }} title={cwd}>
            {cwd}
          </div>
        )
      },
    },
    {
      title: '初始命令',
      dataIndex: 'initialCommand',
      key: 'initialCommand',
      width: 200,
      render: (cmd: string) => cmd ? (
        <div style={{ 
          fontFamily: "'JetBrains Mono', monospace", 
          fontSize: 11, 
          color: 'var(--ant-color-text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }} title={cmd}>
          {cmd}
        </div>
      ) : '-'
    },
    {
      title: '使用次数',
      dataIndex: 'usageCount',
      key: 'usageCount',
      width: 80,
      render: (count: number) => (
        <span style={{ 
          fontFamily: "'JetBrains Mono', monospace", 
          fontSize: 11,
          color: count > 0 ? 'var(--ant-color-primary)' : 'var(--ant-color-text-tertiary)'
        }}>
          {count || 0}
        </span>
      ),
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
        width={900}
      >
        <div className="mb-3 flex justify-end">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="small">
            新建预设
          </Button>
        </div>
        
        {sortedPresets.length > 0 ? (
          <Table
            columns={columns}
            dataSource={sortedPresets}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 py-10">
            <EmptyState
              icon={<SettingOutlined style={{ fontSize: 28, color: 'var(--primary)' }} />}
              title="暂无预设"
              description='点击"新建预设"创建'
            />
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
