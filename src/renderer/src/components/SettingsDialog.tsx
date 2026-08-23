import { useState, useEffect } from 'react'
import { Modal, Tabs, Switch, Select, message } from 'antd'
import {
  SettingOutlined,
  BellOutlined,
  SoundOutlined,
  CodeOutlined,
  RobotFilled,
} from '@ant-design/icons'
import { useAppStore } from '../store'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  onOpenPresets: () => void
  onOpenSnapshots: () => void
  onOpenRules: () => void
}

export default function SettingsDialog({
  open,
  onClose,
  onOpenPresets,
  onOpenSnapshots,
  onOpenRules,
}: SettingsDialogProps) {
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)
  const markdownEnabled = useAppStore((s) => s.markdownEnabled)
  const setMarkdownEnabled = useAppStore((s) => s.setMarkdownEnabled)
  const previewLineCount = useAppStore((s) => s.previewLineCount)
  const setPreviewLineCount = useAppStore((s) => s.setPreviewLineCount)
  const notificationEnabled = useAppStore((s) => s.notificationEnabled)
  const setNotificationEnabled = useAppStore((s) => s.setNotificationEnabled)
  const notificationSoundEnabled = useAppStore((s) => s.notificationSoundEnabled)
  const setNotificationSoundEnabled = useAppStore((s) => s.setNotificationSoundEnabled)

  const [claudeIntegrated, setClaudeIntegrated] = useState(false)

  useEffect(() => {
    if (open) {
      window.electronAPI.claudeIntegrationStatus().then((status) => {
        setClaudeIntegrated(status.configured)
      }).catch(() => {})
    }
  }, [open])

  const handleToggleClaudeIntegration = async () => {
    try {
      if (claudeIntegrated) {
        const result = await window.electronAPI.claudeIntegrationDisable()
        if (result.success) {
          setClaudeIntegrated(false)
          message.success('已移除 Claude Code 集成配置')
        } else {
          message.error(`移除失败：${result.error}`)
        }
      } else {
        const result = await window.electronAPI.claudeIntegrationEnable()
        if (result.success) {
          setClaudeIntegrated(true)
          message.success('已配置 Claude Code 集成')
        } else {
          message.error(`配置失败：${result.error}`)
        }
      }
    } catch {
      message.error('操作失败')
    }
  }

  const tabItems = [
    {
      key: 'general',
      label: (
        <span>
          <SettingOutlined />
          通用
        </span>
      ),
      children: (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span>暗色模式</span>
            <Switch checked={darkMode} onChange={toggleDarkMode} />
          </div>
          <div className="flex items-center justify-between">
            <span>Markdown 渲染（全屏）</span>
            <Switch checked={markdownEnabled} onChange={setMarkdownEnabled} />
          </div>
          <div className="flex items-center justify-between">
            <span>预览行数</span>
            <Select
              value={previewLineCount}
              onChange={setPreviewLineCount}
              style={{ width: 100 }}
              options={[
                { value: 10, label: '10 行' },
                { value: 15, label: '15 行' },
                { value: 20, label: '20 行' },
                { value: 25, label: '25 行' },
              ]}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'notification',
      label: (
        <span>
          <BellOutlined />
          通知
        </span>
      ),
      children: (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span>启用系统通知</span>
            <Switch checked={notificationEnabled} onChange={setNotificationEnabled} />
          </div>
          <div className="flex items-center justify-between">
            <span>
              <SoundOutlined style={{ marginRight: 8 }} />
              通知音效
            </span>
            <Switch
              checked={notificationSoundEnabled}
              onChange={setNotificationSoundEnabled}
              disabled={!notificationEnabled}
            />
          </div>
          <div className="text-xs text-gray-500 mt-2">
            当会话状态变为「需要输入」「需要确认」或「错误」时，会发送系统通知提醒您。
          </div>
        </div>
      ),
    },
    {
      key: 'claude',
      label: (
        <span>
          <RobotFilled />
          Claude Code
        </span>
      ),
      children: (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span>Claude Code 集成</span>
            <Switch checked={claudeIntegrated} onChange={handleToggleClaudeIntegration} />
          </div>
          <div className="text-xs text-gray-500 mt-2">
            配置后，全屏 Markdown 视图将渲染 Claude Code 的结构化对话流（需重启 Claude Code 会话生效）。
          </div>
        </div>
      ),
    },
    {
      key: 'tools',
      label: (
        <span>
          <CodeOutlined />
          工具
        </span>
      ),
      children: (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              onClose()
              onOpenPresets()
            }}
            className="w-full px-4 py-3 text-left rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="font-medium">预设管理</div>
            <div className="text-xs text-gray-500 mt-1">配置常用终端预设</div>
          </button>
          <button
            onClick={() => {
              onClose()
              onOpenSnapshots()
            }}
            className="w-full px-4 py-3 text-left rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="font-medium">快照管理</div>
            <div className="text-xs text-gray-500 mt-1">保存和恢复会话状态</div>
          </button>
          <button
            onClick={() => {
              onClose()
              onOpenRules()
            }}
            className="w-full px-4 py-3 text-left rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="font-medium">规则配置</div>
            <div className="text-xs text-gray-500 mt-1">自定义状态检测规则</div>
          </button>
        </div>
      ),
    },
  ]

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title="设置"
      width={600}
      centered
    >
      <Tabs defaultActiveKey="general" items={tabItems} />
    </Modal>
  )
}
