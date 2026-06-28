#!/usr/bin/env node

/**
 * TCommander Hook CLI 工具
 * 
 * 用法：
 *   tcommander-cli status <sessionId> <status> [--message <msg>]
 *   tcommander-cli get <sessionId>
 *   tcommander-cli list
 * 
 * 示例：
 *   tcommander-cli status session-1234 error --message "Build failed"
 *   tcommander-cli get session-1234
 *   tcommander-cli list
 */

const http = require('http');

const DEFAULT_PORT = 19527;
const BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;

/**
 * 发送 HTTP 请求
 */
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Request failed: ${e.message}`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
TCommander Hook CLI 工具

用法：
  tcommander-cli status <sessionId> <status> [--message <msg>]
  tcommander-cli get <sessionId>
  tcommander-cli list

命令：
  status    更新会话状态
  get       查询单个会话状态
  list      列出所有会话

状态值：
  error           错误状态
  needs-input     需要输入
  needs-confirm   需要确认
  running         运行中
  idle            空闲

示例：
  tcommander-cli status session-1234 error --message "Build failed"
  tcommander-cli get session-1234
  tcommander-cli list

环境变量：
  TCOMMANDER_PORT    Hook 服务器端口（默认：19527）
`);
}

/**
 * 解析命令行参数
 */
function parseArgs(args) {
  const result = {
    command: null,
    sessionId: null,
    status: null,
    message: null
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }

    if (!result.command) {
      result.command = arg;
      i++;
      continue;
    }

    if (result.command === 'status') {
      if (!result.sessionId) {
        result.sessionId = arg;
      } else if (!result.status) {
        result.status = arg;
      }
    } else if (result.command === 'get') {
      if (!result.sessionId) {
        result.sessionId = arg;
      }
    }

    if (arg === '--message' || arg === '-m') {
      result.message = args[i + 1];
      i++;
    }

    i++;
  }

  return result;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(1);
  }

  const parsed = parseArgs(args);

  // 检查端口配置
  const port = process.env.TCOMMANDER_PORT || DEFAULT_PORT;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    switch (parsed.command) {
      case 'status': {
        if (!parsed.sessionId || !parsed.status) {
          console.error('错误：status 命令需要 <sessionId> 和 <status> 参数');
          console.error('用法：tcommander-cli status <sessionId> <status> [--message <msg>]');
          process.exit(1);
        }

        const validStatuses = ['error', 'needs-input', 'needs-confirm', 'running', 'idle'];
        if (!validStatuses.includes(parsed.status)) {
          console.error(`错误：无效的状态值 "${parsed.status}"`);
          console.error(`有效值：${validStatuses.join(', ')}`);
          process.exit(1);
        }

        const body = {
          status: parsed.status,
          action: 'update'
        };

        if (parsed.message) {
          body.message = parsed.message;
        }

        const response = await request('POST', `/api/session/${parsed.sessionId}/status`, body);
        
        if (response.success) {
          console.log(`✓ 会话状态已更新`);
          console.log(`  会话 ID: ${response.sessionId}`);
          console.log(`  新状态: ${parsed.status}`);
          if (parsed.message) {
            console.log(`  消息: ${parsed.message}`);
          }
        } else {
          console.error(`✗ 更新失败：${response.error}`);
          process.exit(1);
        }
        break;
      }

      case 'get': {
        if (!parsed.sessionId) {
          console.error('错误：get 命令需要 <sessionId> 参数');
          console.error('用法：tcommander-cli get <sessionId>');
          process.exit(1);
        }

        const response = await request('GET', `/api/session/${parsed.sessionId}/status`);
        
        if (response.success) {
          const data = response.data;
          console.log(`会话信息：`);
          console.log(`  ID: ${data.sessionId}`);
          console.log(`  名称: ${data.name}`);
          console.log(`  状态: ${data.status}`);
          console.log(`  最后活动: ${new Date(data.lastActivityAt).toLocaleString()}`);
          if (data.matchedRuleName) {
            console.log(`  匹配规则: ${data.matchedRuleName}`);
          }
        } else {
          console.error(`✗ 查询失败：${response.error}`);
          process.exit(1);
        }
        break;
      }

      case 'list': {
        const response = await request('GET', `/api/sessions`);
        
        if (response.success) {
          const sessions = response.data.sessions;
          
          if (sessions.length === 0) {
            console.log('没有活跃的会话');
          } else {
            console.log(`活跃会话（${sessions.length}）：\n`);
            sessions.forEach((session, index) => {
              console.log(`${index + 1}. ${session.name}`);
              console.log(`   ID: ${session.id}`);
              console.log(`   类型: ${session.kind}`);
              console.log(`   状态: ${session.status}`);
              console.log(`   最后活动: ${new Date(session.lastActivityAt).toLocaleString()}`);
              console.log('');
            });
          }
        } else {
          console.error(`✗ 查询失败：${response.error}`);
          process.exit(1);
        }
        break;
      }

      default:
        console.error(`错误：未知命令 "${parsed.command}"`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(`✗ 请求失败：${error.message}`);
    console.error('\n请确保：');
    console.error('  1. TCommander 正在运行');
    console.error('  2. Hook 服务器已启用（设置 -> 启用 HTTP Hook）');
    console.error(`  3. 端口 ${port} 未被占用`);
    process.exit(1);
  }
}

main();
