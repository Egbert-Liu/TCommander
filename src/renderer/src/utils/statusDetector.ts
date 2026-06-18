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
  // 注意：不再有 sys-idle-prompt 规则。
  // 旧逻辑用 `[#>$]\s*$` 把「有提示符输出」判成 idle，但这违背了
  // 「有输出就不可能是空闲」的语义 —— 空闲的本质是「长期无输出」，
  // 应该由时间维度判定（见 App.tsx 的空闲检测定时器），而不是靠规则匹配。
]

const STATUS_PRIORITY: Record<string, number> = {
  'error': 0,
  'needs-confirm': 1,
  'needs-input': 2,
  'running': 3,
  'idle': 4,
}

/**
 * 「有状态」= error / needs-confirm / needs-input
 * 这三种是需要用户关注的异常状态，排序时永远排在最前。
 * running / idle 是中性状态，按时间维度排序。
 */
export function hasStatus(s: string): boolean {
  return s === 'error' || s === 'needs-confirm' || s === 'needs-input'
}

/** 空闲判定阈值：超过此毫秒数没有新输出，会话从 running 回落到 idle。 */
export const IDLE_THRESHOLD_MS = 10_000

/** 排序用的状态优先级（仅用于「有状态」组内部排序）。 */
export function statusPriority(s: string): number {
  return STATUS_PRIORITY[s] ?? 5
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

/**
 * 从 raw 输出中截取尾部「完整行」片段，用于状态检测与预览清洗。
 *
 * 为什么需要它：cleanTerminalOutputKeepColor / detectStatusWithRules 都是逐行处理的，
 * 但每次 flush 都对整个 history（最多 400 行/512KB）全量重算，会话越长越慢。
 * 而状态规则只看最后 8 行、预览也只需尾部几行，所以只需截取尾部即可。
 *
 * 截取时保证从「换行符之后」开始，避免第一行被截断导致 \\r 覆盖处理错误。
 */
export function tailLines(raw: string, maxBytes: number = 16 * 1024): string {
  if (raw.length <= maxBytes) return raw
  let start = raw.length - maxBytes
  const nl = raw.indexOf('\n', start)
  if (nl >= 0 && nl < raw.length - 1) start = nl + 1
  return raw.slice(start)
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

/**
 * 保留 ANSI 颜色的终端输出清洗 —— 模拟终端 cell buffer。
 *
 * 核心机制：用一个 cells[] 数组模拟终端每一行的字符缓冲区，逐字节处理输入，
 * 正确模拟以下控制序列的终端效果（而非简单剥离）：
 *   - \r        回到行首（col=0），后续字符覆盖旧内容
 *   - \b        光标左移一格
 *   - \x1b[K    EL 擦除光标到行尾（浏览历史命令时擦除旧字符尾部，关键！）
 *   - \x1b[<n>C CUF 光标前移
 *   - \x1b[<n>D CUB 光标后移
 *   - \x1b[<n>G CHA 光标设到绝对列
 *   - \x1b[...m SGR 颜色/样式，累积到每个 cell 上，最终输出保留
 *
 * 这样 shell（PowerShell/bash/zsh）浏览历史命令、退格编辑等交互产生的
 * 光标移动 + 行擦除序列都能被正确还原，避免预览文字「纯累积不替换」。
 *
 * 用于：卡片预览区 previewText 的存储。
 */
export function cleanTerminalOutputKeepColor(raw: string): string {
  if (!raw) return ''
  // 1. 剥离 OSC（设置窗口标题等）
  let s = raw.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  // 2. 剥离单字节转义（字符集切换等，不影响光标/擦除）
  s = s.replace(/\x1b[()*+]/g, '')
  // 注意：不再在此处批量剥离 CSI 序列！
  //   \x1b[K(EL 擦除行)、\x1b[<n>C(CUF 前移)、\x1b[<n>D(CUB 后移)、\x1b[<n>G(CHA 绝对列)
  //   等控制序列对「行覆盖」语义至关重要，必须在下面的 cell 循环里逐个模拟其效果，
  //   否则 shell（如 PowerShell/PSReadLine）浏览历史命令时发送的 \r+新命令+\x1b[K 会被
  //   拆开处理，导致旧命令尾部字符无法被擦除，表现为预览文字「纯累积不替换」。

  // 3. 逐行处理：模拟终端 cell buffer，正确处理 \r 覆盖 + 光标移动 + 行擦除 + SGR 样式
  const lines = s.split('\n')
  const outLines: string[] = []

  for (const line of lines) {
    const cells: { ch: string; ansi: string }[] = []
    const segments = line.split('\r')
    for (const seg of segments) {
      let col = 0
      let curAnsi = ''
      let i = 0
      while (i < seg.length) {
        const code = seg.charCodeAt(i)

        // \b backspace：光标左移一格（PowerShell 退格键常用）
        if (code === 0x08) {
          if (col > 0) col--
          i++
          continue
        }

        if (code === 0x1b) {
          // SGR: \x1b[<params>m —— 颜色/样式，累积到 curAnsi
          const sgr = /^\x1b\[([0-9;]*)m/.exec(seg.slice(i))
          if (sgr) {
            if (sgr[1] === '' || sgr[1] === '0') curAnsi = ''
            else curAnsi += sgr[0]
            i += sgr[0].length
            continue
          }
          // EL —— Erase in Line: \x1b[K / \x1b[0K / \x1b[1K / \x1b[2K
          const el = /^\x1b\[([012])?K/.exec(seg.slice(i))
          if (el) {
            const mode = el[1] ?? '0'
            if (mode === '0') {
              // 擦除从光标到行尾（最常见，浏览历史时清旧字符）
              if (cells.length > col) cells.length = col
            } else if (mode === '1') {
              // 擦除从行首到光标
              for (let c = 0; c < col && c < cells.length; c++) cells[c] = { ch: ' ', ansi: '' }
            } else {
              // 擦除整行
              cells.length = 0
              col = 0
            }
            i += el[0].length
            continue
          }
          // CUF —— Cursor Forward: \x1b[<n>C
          const cuf = /^\x1b\[([0-9]*)C/.exec(seg.slice(i))
          if (cuf) {
            col += cuf[1] === '' ? 1 : parseInt(cuf[1], 10)
            i += cuf[0].length
            continue
          }
          // CUB —— Cursor Back: \x1b[<n>D
          const cub = /^\x1b\[([0-9]*)D/.exec(seg.slice(i))
          if (cub) {
            col = Math.max(0, col - (cub[1] === '' ? 1 : parseInt(cub[1], 10)))
            i += cub[0].length
            continue
          }
          // CHA —— Cursor Horizontal Absolute: \x1b[<n>G（1-based）
          const cha = /^\x1b\[([0-9]*)G/.exec(seg.slice(i))
          if (cha) {
            col = Math.max(0, (cha[1] === '' ? 1 : parseInt(cha[1], 10)) - 1)
            i += cha[0].length
            continue
          }
          // 其它未识别 CSI，整体跳过
          const otherCsi = /^\x1b\[[0-9;?!]*[A-Za-z]/.exec(seg.slice(i))
          if (otherCsi) {
            i += otherCsi[0].length
            continue
          }
          // 单字节转义，跳过
          i++
          continue
        }

        if (code < 0x20) {
          // 跳过其它控制字符（\r 已被 split 消化）
          i++
          continue
        }
        const ch = seg[i]
        while (cells.length <= col) cells.push({ ch: ' ', ansi: '' })
        cells[col] = { ch, ansi: curAnsi }
        col++
        i++
      }
    }

    // 重构该行：相邻相同样式合并，末尾 reset
    let result = ''
    let lastAnsi = '__none__'
    for (const c of cells) {
      const a = c.ansi || ''
      if (a !== lastAnsi) {
        result += a
        lastAnsi = a
      }
      result += c.ch
    }
    if (result.trim().length > 0) {
      if (lastAnsi !== '__none__' && lastAnsi !== '') result += '\x1b[0m'
      outLines.push(result.trimEnd())
    }
  }

  // 5. 连续空行去重（与 cleanTerminalOutput 行为对齐）
  const deduped: string[] = []
  for (const line of outLines) {
    if (line.length === 0) continue
    if (deduped.length > 0 && stripAnsi(deduped[deduped.length - 1]) === stripAnsi(line)) continue
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
