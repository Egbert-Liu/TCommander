import { SessionStatus, TriggerRule } from '../types'

export const DEFAULT_SYSTEM_RULES: TriggerRule[] = [
  {
    id: 'sys-error',
    name: '错误检测',
    triggerType: 'regex',
    pattern: '(?:error|Error|ERROR)',
    status: 'error',
    enabled: true,
    isSystem: true,
    caseSensitive: false,
    description: '检测终端输出中的错误信息',
  },
  {
    id: 'sys-confirm-yn',
    name: '确认提示 (Y/N)',
    triggerType: 'regex',
    // 覆盖主流 Y/N 提示格式：方括号/圆括号、单/双字符、y/N 各种大小写组合
    pattern:
      '\\[\\s*y\\s*\\/\\s*n\\s*\\]|' +
      '\\[\\s*yes\\s*\\/\\s*no\\s*\\]|' +
      '\\[\\s*y\\/N\\s*\\]|' +
      '\\[\\s*Y\\/n\\s*\\]|' +
      '\\(\\s*y\\s*\\/\\s*n\\s*\\)|' +
      '\\(\\s*yes\\s*\\/\\s*no\\s*\\)|' +
      '\\[\\s*y\\/n\\/c\\s*\\]|' +
      '\\(Y\\/N\\/C\\)',
    status: 'needs-confirm',
    enabled: true,
    isSystem: true,
    caseSensitive: false,
    description: '检测 [y/n]、(yes/no) 等确认提示',
  },
  {
    id: 'sys-confirm-question',
    name: '确认提示 (Do you want)',
    triggerType: 'regex',
    // 扩展：do you want / are you sure / would you like / Proceed? / Continue? / Apply? / Press Y to ...
    pattern:
      'do you want to|' +
      'are you sure|' +
      'would you like|' +
      'do you wish to|' +
      'proceed\\s*\\?|' +
      'continue\\s*\\?|' +
      'apply\\s*\\?|' +
      'overwrite\\s*\\?|' +
      'replace\\s*\\?|' +
      'delete\\s*\\?|' +
      'press\\s+[yYnN]\\s+to',
    status: 'needs-confirm',
    enabled: true,
    isSystem: true,
    caseSensitive: false,
    description: '检测"是否确认"类提示',
  },
  {
    id: 'sys-confirm-choice',
    name: '选择菜单',
    triggerType: 'regex',
    // 扩展：❯ 1. / > 1. / * 1. / [1] / 1) / 1: / 1. Yes / 1. No
    pattern:
      '\\u276F\\s*\\d+\\.|' +
      '>\\s*\\d+\\.\\s|' +
      '\\*\\s*\\d+\\.\\s|' +
      '\\[\\s*\\d+\\s*\\]\\s|' +
      '\\d+\\)\\s|' +
      '\\d+:\\s|' +
      '\\d+\\.\\s*(?:Yes|No|yes|no|Y|N)\\b',
    status: 'needs-confirm',
    enabled: true,
    isSystem: true,
    caseSensitive: false,
    description: '检测编号选择菜单（❯ 1. / > 1. / [1] / 1) / 1. Yes）',
  },
  {
    id: 'sys-trust-folder',
    name: '信任文件夹',
    triggerType: 'regex',
    // 扩展：trust the authors / do you trust / trust this folder / accept incoming
    pattern:
      '\\btrust\\b.*\\bfolder\\b|' +
      '\\btrust\\b.*\\bauthors?\\b|' +
      '\\bdo you trust\\b|' +
      '\\b(accept|reject)\\b.*\\b(folder|connection|incoming)\\b',
    status: 'needs-confirm',
    enabled: true,
    isSystem: true,
    caseSensitive: false,
    description: '检测"是否信任此文件夹 / 作者"提示',
  },
  {
    id: 'sys-needs-input',
    name: '输入提示',
    triggerType: 'regex',
    pattern: '\\?\\s*$|:\\s*$',
    status: 'needs-input',
    enabled: true,
    isSystem: true,
    caseSensitive: false,
    description: '检测末尾以 ? 或 : 结尾的输入提示',
  },
  {
    id: 'sys-idle-prompt',
    name: '空闲提示符',
    triggerType: 'regex',
    pattern: '[#>$]\\s*$',
    status: 'idle',
    enabled: true,
    isSystem: true,
    caseSensitive: false,
    description: '检测命令行提示符（$、>、#）',
  },
]

const STATUS_PRIORITY: Record<string, number> = {
  'error': 0,
  'needs-confirm': 1,
  'needs-input': 2,
  'running': 3,
  'idle': 4,
}

function testRule(cleanLine: string, _rawLine: string, rule: TriggerRule): boolean {
  const text = rule.caseSensitive ? cleanLine : cleanLine.toLowerCase()
  const pattern = rule.caseSensitive ? rule.pattern : rule.pattern.toLowerCase()

  switch (rule.triggerType) {
    case 'contains':
      return text.includes(pattern)
    case 'equals':
      return text === pattern
    case 'startsWith':
      return text.startsWith(pattern)
    case 'endsWith':
      return text.endsWith(pattern)
    case 'regex':
      try {
        const flags = rule.caseSensitive ? 'g' : 'gi'
        return new RegExp(rule.pattern, flags).test(cleanLine)
      } catch {
        return false
      }
    default:
      return false
  }
}

export interface DetectResult {
  status: SessionStatus
  matchedRuleName?: string
  /**
   * 是否有任何规则在尾部行上命中。
   * - true  => 调用方应立即应用新状态（或者维持），并清掉「3 秒无匹配回退」计时器
   * - false => 尾部未命中任何规则。调用方应启动回退计时器，3s 内若仍无匹配则回退到 idle
   *
   * 区分这两种情况是为了让"没有任何状态特征"和"命中了 idle 规则"语义不同。
   */
  matched: boolean
}

export function detectStatusWithRules(
  rawOutput: string,
  rules: TriggerRule[]
): DetectResult {
  const cleanOutput = stripAnsi(rawOutput)
  const lines = cleanOutput.split('\n').filter(l => l.trim())
  if (lines.length === 0) return { status: 'running', matched: false }

  const tailLines = lines.slice(-8)
  const tailText = tailLines.join('\n')
  const lastLine = lines[lines.length - 1]

  const activeRules = rules.filter(r => r.enabled)

  const matches: { status: SessionStatus; priority: number; ruleName: string }[] = []

  for (const rule of activeRules) {
    const targetText = rule.status === 'idle' ? lastLine : tailText
    if (testRule(targetText, targetText, rule)) {
      matches.push({
        status: rule.status,
        priority: STATUS_PRIORITY[rule.status] ?? 5,
        ruleName: rule.name,
      })
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => a.priority - b.priority)
    return {
      status: matches[0].status,
      matchedRuleName: matches[0].ruleName,
      matched: true,
    }
  }

  return { status: 'running', matched: false }
}

export function detectStatus(rawOutput: string): DetectResult {
  return detectStatusWithRules(rawOutput, DEFAULT_SYSTEM_RULES)
}

export function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;:?!]*[A-Za-z]/g, '')
    .replace(/\x1b\[[0-9;:?!]*~/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[()][0-9A-Z]/g, '')
    .replace(/\x1b[%#*+<=>?\\^]/g, '')
    .replace(/[\x80-\x9f]/g, '')
}

export function cleanTerminalOutput(raw: string): string {
  const withoutAnsi = stripAnsi(raw)
  const outputLines: string[] = []
  let cursorCol = 0
  let currentLine = ''
  let i = 0

  while (i < withoutAnsi.length) {
    const ch = withoutAnsi[i]

    if (ch === '\r') {
      cursorCol = 0
      i++
      continue
    }

    if (ch === '\n') {
      outputLines.push(currentLine.trimEnd())
      currentLine = ''
      cursorCol = 0
      i++
      continue
    }

    if (ch.charCodeAt(0) < 0x20) {
      i++
      continue
    }

    while (currentLine.length < cursorCol) {
      currentLine += ' '
    }

    if (cursorCol < currentLine.length) {
      currentLine = currentLine.slice(0, cursorCol) + ch + currentLine.slice(cursorCol + 1)
    } else {
      currentLine += ch
    }
    cursorCol++
    i++
  }

  if (currentLine.length > 0) {
    outputLines.push(currentLine.trimEnd())
  }

  const deduped: string[] = []
  for (const line of outputLines) {
    if (line.length === 0) continue
    if (deduped.length > 0 && deduped[deduped.length - 1] === line) continue
    deduped.push(line)
  }

  return deduped.join('\n')
}

/** 渲染进程每会话历史缓存上限：512 KB（按字符串长度估算） */
export const RENDER_HISTORY_BYTE_LIMIT = 512 * 1024
/** 渲染进程每会话历史行数上限 */
export const RENDER_HISTORY_LINE_LIMIT = 400

/**
 * 在保留尾部的同时，截断到行数 + 字符数双上限。
 * - 行数上限：`maxLines`（默认 400 行）
 * - 字节上限：`maxBytes`（默认 512 KB）
 *
 * 两道门槛都过：避免「很多短行 + 极少字节」或「少量长行 + 极多字节」两种极端。
 * 任何一项越界都从头开始 pop，直到两者都满足。
 */
export function truncateHistory(
  history: string[],
  maxLines: number = RENDER_HISTORY_LINE_LIMIT,
  maxBytes: number = RENDER_HISTORY_BYTE_LIMIT
): string[] {
  let trimmed = history
  if (trimmed.length > maxLines) {
    trimmed = trimmed.slice(-maxLines)
  }
  // 累计字节判断（仅做一次 O(n) 扫描）
  let total = 0
  for (let i = trimmed.length - 1; i >= 0; i--) {
    total += trimmed[i].length
    if (total > maxBytes) {
      // i 之前的所有元素都丢掉
      trimmed = trimmed.slice(i + 1)
      break
    }
  }
  return trimmed
}
