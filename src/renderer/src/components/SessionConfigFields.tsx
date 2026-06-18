import { Form, Input, Select, Radio, InputNumber } from 'antd'
import { DesktopOutlined, CloudOutlined } from '@ant-design/icons'

interface SessionConfigFieldsProps {
  nameLabel?: string
  namePlaceholder?: string
  cwdPlaceholder?: string
  commandPlaceholder?: string
}

/** 会话/预设共享的配置字段。
 *  顶部 Radio 切换「本地 / SSH」：本地走 terminalType + cwd，SSH 走 host + 认证。
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

      <Form.Item name="connectionType" label="连接类型">
        <Radio.Group buttonStyle="solid" optionType="button">
          <Radio.Button value="local">
            <DesktopOutlined /> 本地
          </Radio.Button>
          <Radio.Button value="ssh">
            <CloudOutlined /> SSH
          </Radio.Button>
        </Radio.Group>
      </Form.Item>

      {/* 本地字段：仅 connectionType !== 'ssh' 时显示 */}
      <Form.Item shouldUpdate={(prev, cur) => prev.connectionType !== cur.connectionType} noStyle>
        {({ getFieldValue }) =>
          getFieldValue('connectionType') !== 'ssh' ? (
            <>
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
            </>
          ) : (
            <>
              <Form.Item
                name="host"
                label="主机"
                rules={[{ required: true, message: '请输入主机地址' }]}
              >
                <Input placeholder="example.com 或 192.168.1.100" />
              </Form.Item>

              <Form.Item label="端口" style={{ display: 'inline-block', width: 'calc(40% - 8px)' }}>
                <Form.Item name="port" noStyle initialValue={22}>
                  <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                </Form.Item>
              </Form.Item>
              <Form.Item
                label="用户名"
                style={{ display: 'inline-block', width: '60%', marginLeft: 8 }}
              >
                <Form.Item
                  name="username"
                  noStyle
                  rules={[{ required: true, message: '请输入用户名' }]}
                >
                  <Input placeholder="root" />
                </Form.Item>
              </Form.Item>

              <Form.Item name="authMethod" label="认证方式">
                <Radio.Group>
                  <Radio value="password">密码</Radio>
                  <Radio value="privateKey">私钥</Radio>
                </Radio.Group>
              </Form.Item>

              {/* 密码认证：仅 authMethod === 'password' 时显示 */}
              <Form.Item shouldUpdate={(prev, cur) => prev.authMethod !== cur.authMethod} noStyle>
                {({ getFieldValue }) =>
                  getFieldValue('authMethod') !== 'privateKey' ? (
                    <Form.Item name="password" label="密码">
                      <Input.Password placeholder="留空则不存储（仅本次连接）" />
                    </Form.Item>
                  ) : (
                    <>
                      <Form.Item
                        name="privateKeyPath"
                        label="私钥路径"
                        rules={[{ required: true, message: '请输入私钥文件路径' }]}
                      >
                        <Input placeholder="C:\Users\you\.ssh\id_rsa 或 ~/.ssh/id_rsa" />
                      </Form.Item>
                      <Form.Item name="passphrase" label="私钥口令">
                        <Input.Password placeholder="无口令则留空" />
                      </Form.Item>
                    </>
                  )
                }
              </Form.Item>
            </>
          )
        }
      </Form.Item>

      <Form.Item name="initialCommand" label="初始命令">
        <Input placeholder={commandPlaceholder} />
      </Form.Item>
    </>
  )
}
