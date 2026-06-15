import { useState } from 'react'
import { Modal, Switch, Button, Input, Select, Tag, Space, Popconfirm, Empty, Divider, message, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined, InfoCircleFilled, EditFilled, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { useAppStore } from '../store'
import { TriggerRule, TriggerType, SessionStatus } from '../types'
import { STATUS_COLORS } from '../utils/statusColors'

interface RulesDialogProps {
  open: boolean
  onClose: () => void
}

const TRIGGER_TYPE_OPTIONS: { value: TriggerType; label: string; desc: string }[] = [
  { value: 'contains', label: '包含', desc: '输出中包含指定文本' },
  { value: 'equals', label: '等于', desc: '输出最后一行完全匹配' },
  { value: 'startsWith', label: '开头是', desc: '输出以指定文本开头' },
  { value: 'endsWith', label: '结尾是', desc: '输出以指定文本结尾' },
  { value: 'regex', label: '正则匹配', desc: '使用正则表达式匹配' },
]

const STATUS_OPTIONS: { value: SessionStatus; label: string; color: string }[] = [
  { value: 'error', label: '错误', color: STATUS_COLORS.error.color },
  { value: 'needs-confirm', label: '需确认', color: STATUS_COLORS['needs-confirm'].color },
  { value: 'needs-input', label: '待输入', color: STATUS_COLORS['needs-input'].color },
  { value: 'running', label: '运行中', color: STATUS_COLORS.running.color },
  { value: 'idle', label: '空闲', color: STATUS_COLORS.idle.color },
]

export default function RulesDialog({ open, onClose }: RulesDialogProps) {
  const rules = useAppStore((s) => s.rules)
  const addRule = useAppStore((s) => s.addRule)
  const updateRule = useAppStore((s) => s.updateRule)
  const removeRule = useAppStore((s) => s.removeRule)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<TriggerRule>>({})

  const systemRules = rules.filter(r => r.isSystem)
  const customRules = rules.filter(r => !r.isSystem)

  const handleAddRule = () => {
    const newRule: TriggerRule = {
      id: `rule-${Date.now()}`,
      name: '新规则',
      triggerType: 'contains',
      pattern: '',
      status: 'needs-confirm',
      enabled: true,
      isSystem: false,
      caseSensitive: false,
      description: '',
    }
    addRule(newRule)
    setEditingId(newRule.id)
    setEditForm(newRule)
    message.success('已添加新规则')
  }

  const handleToggle = (id: string, enabled: boolean) => {
    updateRule(id, { enabled })
  }

  const handleDelete = (id: string) => {
    removeRule(id)
    if (editingId === id) {
      setEditingId(null)
      setEditForm({})
    }
  }

  const handleStartEdit = (rule: TriggerRule) => {
    setEditingId(rule.id)
    setEditForm({ ...rule })
  }

  const handleSaveEdit = () => {
    if (editingId && editForm) {
      if (!editForm.pattern?.trim()) {
        message.warning('匹配内容不能为空')
        return
      }
      updateRule(editingId, {
        name: editForm.name,
        triggerType: editForm.triggerType,
        pattern: editForm.pattern,
        status: editForm.status,
        caseSensitive: editForm.caseSensitive,
        description: editForm.description,
      })
      setEditingId(null)
      setEditForm({})
      message.success('规则已保存')
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const renderRuleItem = (rule: TriggerRule) => {
    const isEditing = editingId === rule.id
    const typeLabel = TRIGGER_TYPE_OPTIONS.find(t => t.value === rule.triggerType)?.label || rule.triggerType
    const statusOpt = STATUS_OPTIONS.find(s => s.value === rule.status)

    if (isEditing) {
      return (
        <div
          key={rule.id}
          style={{
            background: 'var(--ant-color-bg-elevated)',
            border: '1px solid var(--ant-color-primary)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                value={editForm.name || ''}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="规则名称"
                size="small"
                style={{ flex: 1 }}
              />
              <Select
                value={editForm.status || 'needs-confirm'}
                onChange={(v) => setEditForm({ ...editForm, status: v })}
                size="small"
                style={{ width: 100 }}
                options={STATUS_OPTIONS.map(s => ({
                  value: s.value,
                  label: <span style={{ color: s.color }}>{s.label}</span>,
                }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Select
                value={editForm.triggerType || 'contains'}
                onChange={(v) => setEditForm({ ...editForm, triggerType: v })}
                size="small"
                style={{ width: 120 }}
                options={TRIGGER_TYPE_OPTIONS.map(t => ({
                  value: t.value,
                  label: (
                    <Tooltip title={t.desc}>
                      <span>{t.label}</span>
                    </Tooltip>
                  ),
                }))}
              />
              <Input
                value={editForm.pattern || ''}
                onChange={(e) => setEditForm({ ...editForm, pattern: e.target.value })}
                placeholder={
                  editForm.triggerType === 'regex'
                    ? '正则表达式，如 \\[y\\/n\\]'
                    : '匹配内容'
                }
                size="small"
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input
                value={editForm.description || ''}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="描述（可选）"
                size="small"
                style={{ flex: 1 }}
              />
              <label style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <Switch
                  checked={editForm.caseSensitive || false}
                  onChange={(v) => setEditForm({ ...editForm, caseSensitive: v })}
                  size="small"
                />
                区分大小写
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
              <Button size="small" icon={<CloseOutlined />} onClick={handleCancelEdit}>取消</Button>
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handleSaveEdit}>保存</Button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        key={rule.id}
        style={{
          background: rule.enabled ? 'var(--ant-color-bg-elevated)' : 'var(--ant-color-bg-elevated)',
          border: `1px solid ${rule.enabled ? 'var(--ant-color-border)' : 'transparent'}`,
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 6,
          opacity: rule.enabled ? 1 : 0.5,
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch
            checked={rule.enabled}
            onChange={(v) => handleToggle(rule.id, v)}
            size="small"
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ant-color-text)' }}>
                {rule.name}
              </span>
              <Tag
                style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: '16px',
                  background: `${statusOpt?.color}15`,
                  border: `1px solid ${statusOpt?.color}30`,
                  color: statusOpt?.color,
                  borderRadius: 3,
                  padding: '0 4px',
                }}
              >
                {statusOpt?.label}
              </Tag>
              <Tag
                style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: '16px',
                  background: 'var(--ant-color-primary-bg)',
                  border: 'none',
                  color: 'var(--ant-color-primary)',
                  borderRadius: 3,
                  padding: '0 4px',
                }}
              >
                {typeLabel}
              </Tag>
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--ant-color-text-tertiary)',
                fontFamily: "'JetBrains Mono', monospace",
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: 2,
              }}
            >
              {rule.pattern}
            </div>
          </div>

          <Space size={2}>
            {!rule.isSystem && (
              <>
                <Button
                  type="text"
                  icon={<EditFilled style={{ fontSize: 10 }} />}
                  onClick={() => handleStartEdit(rule)}
                  size="small"
                  style={{ minWidth: 22, width: 22, height: 22 }}
                />
                <Popconfirm
                  title="确认删除"
                  description="确定要删除此规则吗？"
                  onConfirm={() => handleDelete(rule.id)}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true, size: 'small' }}
                  cancelButtonProps={{ size: 'small' }}
                >
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                    size="small"
                    style={{ minWidth: 22, width: 22, height: 22 }}
                  />
                </Popconfirm>
              </>
            )}
            {rule.isSystem && (
              <Tooltip title={rule.description || '系统规则'}>
                <InfoCircleFilled style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }} />
              </Tooltip>
            )}
          </Space>
        </div>
      </div>
    )
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="规则配置"
      width={620}
      footer={null}
      styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
    >
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
          配置状态检测规则，当终端输出匹配时触发对应状态
        </span>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddRule}
          size="small"
        >
          新增规则
        </Button>
      </div>

      <Divider orientation="left" style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)', margin: '8px 0 8px' }}>
        系统规则
      </Divider>

      {systemRules.length > 0 ? (
        systemRules.map(renderRuleItem)
      ) : (
        <Empty description="无系统规则" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      <Divider orientation="left" style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)', margin: '12px 0 8px' }}>
        自定义规则
      </Divider>

      {customRules.length > 0 ? (
        customRules.map(renderRuleItem)
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
          暂无自定义规则，点击"新增规则"添加
        </div>
      )}
    </Modal>
  )
}
