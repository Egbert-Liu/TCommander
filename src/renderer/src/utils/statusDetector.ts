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

/**
 * 截断到「最后一次屏幕清除」之后的内容。
 *
 * 终端的整屏擦除序列会把此前所有可见行从屏幕上抹掉（真实终端里就看不见了），
 * 但我们的预览是基于原始 PTY 流做行级重放的，若不识别这些序列，
 * 已被擦除的旧内容会继续显示，导致整块内容重复（例如 PowerShell banner 出现两次）。
 *
 * 视为「清屏」的序列（取所有出现位置里最后一次的之后）：
 *   - \x1b[2J   ED mode 2：擦除整个屏幕
 *   - \x1b[3J   ED mode 3：擦除滚动缓冲（更强，xterm 扩展）
 *
 * 注：alt-screen（\x1b[?1049h）刻意不在此处理 —— TUI 退出后真实终端会恢复主屏，
 *     若在此截断反而会显示已退出的 TUI 残影。清屏序列才是「永久擦除」语义。
 */
export function truncateAtLastScreenClear(s: string): string {
  if (!s) return ''
  let lastIdx = -1
  for (const c of ['\x1b[2J', '\x1b[3J']) {
    const idx = s.lastIndexOf(c)
    if (idx !== -1) lastIdx = Math.max(lastIdx, idx + c.length)
  }
  return lastIdx < 0 ? s : s.substring(lastIdx)
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
 * 保留 ANSI 颜色的终端输出清洗 —— 2D 屏幕缓冲模拟。
 *
 * 核心机制：用一个 rows × cols 的字符网格（screen[][]）模拟整个终端屏幕，
 * 维护全局光标 (row, col) 与当前 SGR 样式，逐字节重放原始 PTY 流。
 * 这与 xterm.js 等真实终端模拟器的核心数据结构一致。
 *
 * 正确模拟以下控制序列的终端效果（而非简单剥离）：
 *   - \r \n \b \t     回车 / 换行 / 退格 / 制表符
 *   - \x1b[r;cH       CUP 光标绝对定位（row+col，TUI 重绘关键！）
 *   - \x1b[nA/B/C/D   CUU/CUD/CUF/CUB 光标上/下/前/后移
 *   - \x1b[cG         CHA 光标绝对列
 *   - \x1b[K          EL 行擦除（0/1/2 三种模式）
 *   - \x1b[J          ED 屏幕擦除（0/1/2/3 四种模式）
 *   - \x1b[nX/P/@     ECH/DCH/ICH 字符擦除/删除/插入
 *   - \x1b[nL/M       IL/DL 行插入/删除
 *   - \x1b[nS/T       SU/SD 屏幕滚动
 *   - \x1b[...m       SGR 颜色/样式，累积到每个 cell 上，最终输出保留
 *
 * 这样无论是 shell（PowerShell/bash/zsh）的行内编辑、退格、历史命令浏览，
 * 还是 TUI 程序（Claude Code / vim / htop / less）的全屏重绘、spinner 动画，
 * 都能被正确还原，避免预览「纯累积不替换」「整屏重复 N 次」等问题。
 *
 * 用于：卡片预览区 previewText 的存储。
 */
export function cleanTerminalOutputKeepColor(raw: string): string {
  if (!raw) return ''
  // 0. 截断到最后一次屏幕清除之后：真实终端的 \x1b[2J 会擦除此前所有可见行，
  //    预览也必须跟随，否则已被清掉的旧内容会重复显示（如 PowerShell banner 出现两次）。
  //    必须在剥离任何转义之前做，否则会丢失清屏序列的上下文。
  let s = truncateAtLastScreenClear(raw)
  // 1. 剥离 OSC（设置窗口标题等）
  s = s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  // 2. 剥离单字节转义（字符集切换等，不影响光标/擦除）
  s = s.replace(/\x1b[()*+]/g, '')
  // 注意：不再在此处批量剥离 CSI 序列！
  //   \x1b[K(EL 擦除行)、\x1b[<n>C(CUF 前移)、\x1b[<n>D(CUB 后移)、\x1b[<n>G(CHA 绝对列)
  //   等控制序列对「行覆盖」语义至关重要，必须在下面的 cell 循环里逐个模拟其效果，
  //   否则 shell（如 PowerShell/PSReadLine）浏览历史命令时发送的 \r+新命令+\x1b[K 会被
  //   拆开处理，导致旧命令尾部字符无法被擦除，表现为预览文字「纯累积不替换」。

  // 3. 2D 屏幕缓冲模拟。
  //    用 rows × cols 的字符网格模拟终端屏幕，维护全局光标 (row, col) 与当前 SGR 样式。
  //    这是正确处理 TUI 程序（Claude Code / vim / htop / less 等）所必需的——它们用
  //    \x1b[<row>;<col>H（CUP）跳到屏幕任意位置重绘（如 spinner 每一帧）。旧的「逐行独立」
  //    模型会丢弃 row 维度，导致每次重绘都被追加显示而非覆盖，表现为整屏内容重复 N 次、
  //    spinner 每一帧各占一块。2D 网格 + 全局光标能正确还原覆盖语义。
  type Cell = { ch: string; ansi: string }
  const screen: Cell[][] = [[]]
  let row = 0
  let col = 0
  let curAnsi = ''

  const ensureRow = (r: number) => {
    while (screen.length <= r) screen.push([])
  }
  const ensureCell = (r: number, c: number) => {
    ensureRow(r)
    const cells = screen[r]
    while (cells.length <= c) cells.push({ ch: ' ', ansi: '' })
  }

  let i = 0
  while (i < s.length) {
    const code = s.charCodeAt(i)

    // LF —— 换行（convertEol 语义：换到下一行并回到列 0，与 xterm convertEol:true 一致）
    if (code === 0x0a) { row++; col = 0; i++; continue }
    // CR —— 回车
    if (code === 0x0d) { col = 0; i++; continue }
    // BS —— 退格，光标左移一格
    if (code === 0x08) { if (col > 0) col--; i++; continue }
    // HT —— 水平制表符，跳到下一个 8 列 tab stop
    if (code === 0x09) { col = (Math.floor(col / 8) + 1) * 8; i++; continue }

    if (code === 0x1b) {
      const rest = s.slice(i)

      // SGR —— 颜色/样式，累积到 curAnsi
      const sgr = /^\x1b\[([0-9;]*)m/.exec(rest)
      if (sgr) {
        if (sgr[1] === '' || sgr[1] === '0') curAnsi = ''
        else curAnsi += sgr[0]
        i += sgr[0].length
        continue
      }
      // CUP / HVP —— Cursor Position: \x1b[<row>;<col>H 或 \x1b[<row>;<col>f（均 1-based）
      // 关键：同时更新 row 和 col —— 这是 TUI 重绘（如 spinner 每帧）能正确覆盖的前提。
      const cup = /^\x1b\[([0-9;]*)[Hf]/.exec(rest)
      if (cup) {
        const ps = cup[1].split(';')
        const rParam = ps[0] !== '' ? parseInt(ps[0], 10) : 1
        const cParam = ps.length >= 2 && ps[1] !== '' ? parseInt(ps[1], 10) : 1
        row = Math.max(0, rParam - 1)
        col = Math.max(0, cParam - 1)
        i += cup[0].length
        continue
      }
      // CHA —— Cursor Horizontal Absolute: \x1b[<col>G（1-based）
      const cha = /^\x1b\[([0-9]*)G/.exec(rest)
      if (cha) {
        col = Math.max(0, (cha[1] === '' ? 1 : parseInt(cha[1], 10)) - 1)
        i += cha[0].length
        continue
      }
      // CUF —— Cursor Forward: \x1b[<n>C
      const cuf = /^\x1b\[([0-9]*)C/.exec(rest)
      if (cuf) {
        col += cuf[1] === '' ? 1 : parseInt(cuf[1], 10)
        i += cuf[0].length
        continue
      }
      // CUB —— Cursor Back: \x1b[<n>D
      const cub = /^\x1b\[([0-9]*)D/.exec(rest)
      if (cub) {
        col = Math.max(0, col - (cub[1] === '' ? 1 : parseInt(cub[1], 10)))
        i += cub[0].length
        continue
      }
      // CUU —— Cursor Up: \x1b[<n>A
      const cuu = /^\x1b\[([0-9]*)A/.exec(rest)
      if (cuu) {
        row = Math.max(0, row - (cuu[1] === '' ? 1 : parseInt(cuu[1], 10)))
        i += cuu[0].length
        continue
      }
      // CUD —— Cursor Down: \x1b[<n>B
      const cud = /^\x1b\[([0-9]*)B/.exec(rest)
      if (cud) {
        row += cud[1] === '' ? 1 : parseInt(cud[1], 10)
        i += cud[0].length
        continue
      }
      // EL —— Erase in Line: \x1b[K / \x1b[0K / \x1b[1K / \x1b[2K
      const el = /^\x1b\[([012])?K/.exec(rest)
      if (el) {
        ensureRow(row)
        const cells = screen[row]
        const mode = el[1] ?? '0'
        if (mode === '0') {
          if (cells.length > col) cells.length = col
        } else if (mode === '1') {
          for (let c = 0; c < col && c < cells.length; c++) cells[c] = { ch: ' ', ansi: '' }
        } else {
          cells.length = 0
        }
        i += el[0].length
        continue
      }
      // ED —— Erase in Display: \x1b[J / \x1b[0J / \x1b[1J / \x1b[2J / \x1b[3J
      const ed = /^\x1b\[([0-3])?J/.exec(rest)
      if (ed) {
        ensureRow(row)
        const mode = ed[1] ?? '0'
        if (mode === '0') {
          if (screen[row].length > col) screen[row].length = col
          for (let r = row + 1; r < screen.length; r++) screen[r] = []
        } else if (mode === '1') {
          for (let r = 0; r < row && r < screen.length; r++) screen[r] = []
          for (let c = 0; c <= col; c++) if (c < screen[row].length) screen[row][c] = { ch: ' ', ansi: '' }
        } else {
          for (let r = 0; r < screen.length; r++) screen[r] = []
        }
        i += ed[0].length
        continue
      }
      // ECH —— Erase Characters: \x1b[<n>X（从光标起 n 个字符置空，光标不动）
      const ech = /^\x1b\[([0-9]*)X/.exec(rest)
      if (ech) {
        const n = ech[1] === '' ? 1 : parseInt(ech[1], 10)
        ensureRow(row)
        const cells = screen[row]
        for (let c = col; c < col + n && c < cells.length; c++) cells[c] = { ch: ' ', ansi: '' }
        i += ech[0].length
        continue
      }
      // DCH —— Delete Characters: \x1b[<n>P（删光标处 n 个字符，右侧左移）
      const dch = /^\x1b\[([0-9]*)P/.exec(rest)
      if (dch) {
        const n = dch[1] === '' ? 1 : parseInt(dch[1], 10)
        ensureRow(row)
        if (col < screen[row].length) screen[row].splice(col, Math.min(n, screen[row].length - col))
        i += dch[0].length
        continue
      }
      // ICH —— Insert Characters: \x1b[<n>@（光标处插入 n 个空格，右侧右移）
      const ich = /^\x1b\[([0-9]*)@/.exec(rest)
      if (ich) {
        const n = ich[1] === '' ? 1 : parseInt(ich[1], 10)
        ensureRow(row)
        for (let k = 0; k < n; k++) screen[row].splice(col, 0, { ch: ' ', ansi: '' })
        i += ich[0].length
        continue
      }
      // IL —— Insert Lines: \x1b[<n>L（在光标行处插入 n 个空行，下方下移）
      const il = /^\x1b\[([0-9]*)L/.exec(rest)
      if (il) {
        const n = il[1] === '' ? 1 : parseInt(il[1], 10)
        ensureRow(row)
        for (let k = 0; k < n; k++) screen.splice(row, 0, [])
        i += il[0].length
        continue
      }
      // DL —— Delete Lines: \x1b[<n>M（删光标行起 n 行，上方上移）
      const dl = /^\x1b\[([0-9]*)M/.exec(rest)
      if (dl) {
        const n = dl[1] === '' ? 1 : parseInt(dl[1], 10)
        ensureRow(row)
        screen.splice(row, Math.min(n, screen.length - row))
        if (screen.length === 0) screen.push([])
        i += dl[0].length
        continue
      }
      // SU —— Scroll Up: \x1b[<n>S（整屏向上滚 n 行，顶部 n 行消失）
      const su = /^\x1b\[([0-9]*)S/.exec(rest)
      if (su) {
        const n = su[1] === '' ? 1 : parseInt(su[1], 10)
        screen.splice(0, Math.min(n, screen.length))
        if (screen.length === 0) screen.push([])
        row = Math.max(0, row - n)
        i += su[0].length
        continue
      }
      // SD —— Scroll Down: \x1b[<n>T（整屏向下滚 n 行，顶部补 n 空行）
      const sd = /^\x1b\[([0-9]*)T/.exec(rest)
      if (sd) {
        const n = sd[1] === '' ? 1 : parseInt(sd[1], 10)
        for (let k = 0; k < n; k++) screen.splice(0, 0, [])
        row += n
        i += sd[0].length
        continue
      }
      // 其它未识别 CSI，整体跳过
      const otherCsi = /^\x1b\[[0-9;?!]*[A-Za-z]/.exec(rest)
      if (otherCsi) {
        i += otherCsi[0].length
        continue
      }
      // 单字节 ESC，跳过
      i++
      continue
    }

    // 其它控制字符，跳过
    if (code < 0x20) { i++; continue }

    // 普通可打印字符：写入网格 (row, col)
    ensureCell(row, col)
    screen[row][col] = { ch: s[i], ansi: curAnsi }
    col++
    i++
  }

  // 4. 网格 → 文本：逐行合并相邻相同样式、trim 行尾空格、跳过空行
  const outLines: string[] = []
  for (const cells of screen) {
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

  // 5. 连续重复行（忽略 ANSI 比较）去重：兜底处理 TUI 重绘残留 / 重复 banner
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
