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
    pattern: '\\[y\\/n\\]|\\(y\\/n\\)|\\[yes\\/no\\]|\\(yes\\/no\\)|\\(y\\/n\\/[a-z]\\)|\\[y\\/n\\/[a-z]\\]',
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
    pattern: 'do you want to|are you sure|would you like|confirm\\?|press\\s+[yYnN]\\s+to',
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
    pattern: '❯\\s*\\d+\\.|\\d+\\.\\s*(?:Yes|No|yes|no)\\b',
    status: 'needs-confirm',
    enabled: true,
    isSystem: true,
    caseSensitive: false,
    description: '检测编号选择菜单（如 ❯ 1. Yes）',
  },
  {
    id: 'sys-trust-folder',
    name: '信任文件夹',
    triggerType: 'regex',
    pattern: '\\btrust\\b.*\\bfolder\\b|\\b(accept|reject)\\b',
    status: 'needs-confirm',
    enabled: true,
    isSystem: true,
    caseSensitive: false,
    description: '检测"是否信任此文件夹"提示',
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
}

export function detectStatusWithRules(
  rawOutput: string,
  rules: TriggerRule[]
): DetectResult {
  const cleanOutput = stripAnsi(rawOutput)
  const lines = cleanOutput.split('\n').filter(l => l.trim())
  if (lines.length === 0) return { status: 'running' }

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
    }
  }

  return { status: 'running' }
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

export function truncateHistory(history: string[], maxLines: number = 200): string[] {
  if (history.length <= maxLines) return history
  return history.slice(-maxLines)
}
