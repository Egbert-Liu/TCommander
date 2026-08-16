#!/usr/bin/env node
/**
 * TCommander Claude Code Transcript Hook
 *
 * Claude Code 在 UserPromptSubmit / PostToolUse / Stop 等 hook 事件触发时执行本脚本，
 * stdin 传入事件 JSON（含 session_id、transcript_path、hook_event_name）。
 * 脚本把 transcript 路径报告给 TCommander Hook 服务器，主进程随后 watch 该
 * JSONL 文件并增量推送对话内容到 Markdown 渲染层（全屏 MD 模式）。
 *
 * 前提：终端由 TCommander 启动（PTY 环境变量含 TCOMMANDER_SESSION_ID），
 * 否则静默退出，不影响 Claude Code 正常使用。
 *
 * 配置示例（~/.claude/settings.json，可由 TCommander 设置页一键写入）：
 * {
 *   "hooks": {
 *     "UserPromptSubmit": [
 *       { "hooks": [ { "type": "command", "command": "node \"<path>/transcript-hook.js\"" } ] }
 *     ],
 *     "PostToolUse": [ { "hooks": [ { "type": "command", "command": "..." } ] } ],
 *     "Stop":         [ { "hooks": [ { "type": "command", "command": "..." } ] } ]
 *   }
 * }
 */
'use strict'

const sessionId = process.env.TCOMMANDER_SESSION_ID
const port = Number(process.env.TCOMMANDER_PORT || 19527)

// 不在 TCommander 终端内运行：静默退出
if (!sessionId) {
  process.exit(0)
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    process.exit(0) // 非 JSON 输入，不干扰 Claude Code
  }

  const transcriptPath = payload && payload.transcript_path
  if (!transcriptPath) process.exit(0)

  const body = JSON.stringify({
    claudeSessionId: payload.session_id || '',
    transcriptPath,
    event: payload.hook_event_name || ''
  })

  const req = require('http').request({
    hostname: '127.0.0.1',
    port,
    path: `/api/session/${encodeURIComponent(sessionId)}/claude`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    },
    timeout: 2000
  })

  // Hook 服务器不在线等异常：静默失败（不能阻塞/报错影响 Claude Code）
  req.on('error', () => process.exit(0))
  req.on('timeout', () => { req.destroy(); process.exit(0) })
  req.end(body)
})

// stdin 无数据（理论不会发生）时防止挂起
setTimeout(() => process.exit(0), 3000).unref()
