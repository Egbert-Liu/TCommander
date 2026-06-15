import { Form, Input, Select } from 'antd'

interface SessionConfigFieldsProps {
  nameLabel?: string
  namePlaceholder?: string
  cwdPlaceholder?: string
  commandPlaceholder?: string
}

/** 会话/预设共享的配置字段：名称、终端类型、工作目录、初始命令。
 *  须渲染在 <Form> 内（字段按 name 绑定到最近的 form 实例）。 */
export default function SessionConfigFields({
  nameLabel = '名称',
  namePlaceholder = '输入名称',
  cwdPlaceholder = '留空使用默认目录',
  commandPlaceholder = '创建会话后自动执行的命令',
}: SessionConfigFieldsProps) {
  return (
    <>
      <Form.Item
        name="name"
        label={nameLabel}
        rules={[{ required: true, message: '请输入名称' }]}
      >
        <Input placeholder={namePlaceholder} />
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
        <Input placeholder={cwdPlaceholder} />
      </Form.Item>

      <Form.Item name="initialCommand" label="初始命令">
        <Input placeholder={commandPlaceholder} />
      </Form.Item>
    </>
  )
}
