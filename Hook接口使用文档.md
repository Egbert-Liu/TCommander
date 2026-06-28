# Hook 接口使用文档

## 概述

Hook 接口允许外部工具通过 HTTP API 精确控制 TCommander 会话状态，避免正则匹配的误判问题。

## 启用 Hook 服务器

1. 打开 TCommander 设置
2. 启用「HTTP Hook 服务器」
3. 设置端口（默认 19527）
4. 重启应用

## HTTP API 接口

### 1. 更新会话状态

**请求**
```http
POST /api/session/{sessionId}/status
Content-Type: application/json

{
  "status": "error",
  "message": "构建失败：缺少依赖"
}
```

**状态值**
- `error` - 错误状态（红色高亮）
- `needs-input` - 需要用户输入（黄色高亮）
- `needs-confirm` - 需要用户确认（橙色高亮）
- `running` - 运行中（正常状态）
- `idle` - 空闲（灰色状态）

**响应**
```json
{
  "success": true,
  "sessionId": "session-1234567890-abcdef"
}
```

### 2. 查询单个会话状态

**请求**
```http
GET /api/session/{sessionId}/status
```

**响应**
```json
{
  "success": true,
  "data": {
    "sessionId": "session-1234567890-abcdef",
    "name": "Build Server",
    "status": "running",
    "lastActivityAt": 1703123456789,
    "matchedRuleName": "hook-triggered"
  }
}
```

### 3. 列出所有会话

**请求**
```http
GET /api/sessions
```

**响应**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "session-1234567890-abcdef",
        "name": "Build Server",
        "status": "running",
        "kind": "local",
        "lastActivityAt": 1703123456789
      },
      {
        "id": "session-1234567890-ghijkl",
        "name": "Production Deploy",
        "status": "needs-confirm",
        "kind": "ssh",
        "lastActivityAt": 1703123400000
      }
    ]
  }
}
```

## CLI 工具使用

### 安装

CLI 工具位于 `scripts/tcommander-cli.js`，可以通过 npm 全局安装或直接运行。

### 命令

#### 1. 更新会话状态

```bash
node scripts/tcommander-cli.js status <sessionId> <status> [--message <msg>]
```

**示例**
```bash
# 标记会话为错误状态
node scripts/tcommander-cli.js status session-1234567890-abcdef error --message "构建失败"

# 标记会话为需要输入
node scripts/tcommander-cli.js status session-1234567890-abcdef needs-input --message "请输入密码"

# 标记会话为需要确认
node scripts/tcommander-cli.js status session-1234567890-abcdef needs-confirm --message "确认部署？"

# 恢复为运行状态
node scripts/tcommander-cli.js status session-1234567890-abcdef running

# 标记为空闲
node scripts/tcommander-cli.js status session-1234567890-abcdef idle
```

#### 2. 查询单个会话

```bash
node scripts/tcommander-cli.js get <sessionId>
```

**示例**
```bash
node scripts/tcommander-cli.js get session-1234567890-abcdef
```

**输出**
```
会话信息：
  ID: session-1234567890-abcdef
  名称: Build Server
  状态: running
  最后活动: 2024/12/21 15:30:56
  匹配规则: hook-triggered
```

#### 3. 列出所有会话

```bash
node scripts/tcommander-cli.js list
```

**输出**
```
活跃会话（2）：

1. Build Server
   ID: session-1234567890-abcdef
   类型: local
   状态: running
   最后活动: 2024/12/21 15:30:56

2. Production Deploy
   ID: session-1234567890-ghijkl
   类型: ssh
   状态: needs-confirm
   最后活动: 2024/12/21 15:30:00
```

### 环境变量

- `TCOMMANDER_PORT` - Hook 服务器端口（默认：19527）

**示例**
```bash
TCOMMANDER_PORT=19528 node scripts/tcommander-cli.js list
```

## 集成示例

### Bash 脚本集成

```bash
#!/bin/bash

# 获取当前会话 ID（通过环境变量或其他方式）
SESSION_ID=${TCOMMANDER_SESSION_ID:-"session-1234567890-abcdef"}

# 开始构建
echo "开始构建..."
npm run build

# 检查构建结果
if [ $? -eq 0 ]; then
  # 构建成功
  node scripts/tcommander-cli.js status $SESSION_ID idle --message "构建成功"
else
  # 构建失败
  node scripts/tcommander-cli.js status $SESSION_ID error --message "构建失败：编译错误"
  exit 1
fi
```

### Python 集成

```python
import requests
import os

SESSION_ID = os.environ.get('TCOMMANDER_SESSION_ID', 'session-1234567890-abcdef')
HOOK_URL = 'http://127.0.0.1:19527'

def update_status(status, message=None):
    """更新 TCommander 会话状态"""
    payload = {'status': status}
    if message:
        payload['message'] = message
    
    try:
        response = requests.post(
            f'{HOOK_URL}/api/session/{SESSION_ID}/status',
            json=payload,
            timeout=5
        )
        return response.json()['success']
    except Exception as e:
        print(f'Hook 请求失败: {e}')
        return False

# 使用示例
update_status('running', '开始执行任务')

# 执行任务...
import time
time.sleep(2)

# 任务完成
update_status('idle', '任务完成')
```

### Node.js 集成

```javascript
const http = require('http');

const SESSION_ID = process.env.TCOMMANDER_SESSION_ID || 'session-1234567890-abcdef';
const HOOK_PORT = process.env.TCOMMANDER_PORT || 19527;

function updateStatus(status, message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ status, message });
    
    const options = {
      hostname: '127.0.0.1',
      port: HOOK_PORT,
      path: `/api/session/${SESSION_ID}/status`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 使用示例
async function main() {
  await updateStatus('running', '开始处理');
  
  // 执行任务...
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await updateStatus('idle', '处理完成');
}

main().catch(console.error);
```

## 会话 ID 获取

### 方法 1：通过环境变量

在启动工具时设置环境变量：

```bash
# Linux/macOS
export TCOMMANDER_SESSION_ID="session-1234567890-abcdef"
./my-tool.sh

# Windows PowerShell
$env:TCOMMANDER_SESSION_ID="session-1234567890-abcdef"
.\my-tool.ps1
```

### 方法 2：通过 API 查询

```bash
# 列出所有会话，找到目标会话的 ID
node scripts/tcommander-cli.js list
```

### 方法 3：通过 TCommander UI

1. 在 TCommander 中右键点击会话卡片
2. 选择「复制会话 ID」
3. 粘贴到脚本中使用

## 安全说明

- Hook 服务器仅监听 `127.0.0.1`，不接受外部连接
- 建议仅在本地开发环境使用
- 生产环境请确保防火墙配置正确

## 故障排查

### 问题：CLI 工具连接失败

**检查项**
1. TCommander 是否正在运行
2. Hook 服务器是否已启用
3. 端口是否正确（默认 19527）
4. 防火墙是否阻止连接

**解决方案**
```bash
# 检查端口是否被占用
netstat -ano | findstr :19528

# 更换端口
# 在 TCommander 设置中修改 Hook 端口
```

### 问题：状态更新后 UI 没有变化

**检查项**
1. 会话 ID 是否正确
2. 状态值是否有效
3. 浏览器控制台是否有错误日志

**解决方案**
```bash
# 查看 TCommander 控制台日志
# 按 F12 打开开发者工具，查看 Console 标签
```

## 最佳实践

1. **及时更新状态**：任务开始、完成、失败时都应及时更新状态
2. **提供有意义的消息**：message 字段应包含足够的上下文信息
3. **错误处理**：Hook 请求失败时应有降级方案
4. **避免频繁更新**：不要在高循环中频繁调用 Hook API

## 与正则匹配的关系

- Hook 接口优先级高于正则匹配
- 当 Hook 触发后，`matchedRuleName` 会设置为 `hook-triggered`
- 后续输出仍会触发正则匹配，但 Hook 状态会覆盖正则结果
- 建议：对于支持 Hook 的工具，可以禁用相关的正则规则
