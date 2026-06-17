/**
 * ANSI 转义序列 → HTML 渲染器
 *
 * 为什么需要它：
 *   卡片预览区此前用 cleanTerminalOutput（stripAnsi）渲染，导致所有颜色丢失——
 *   进入 Claude Code 等 CLI 工具时终端里有彩色输出，但在卡片外看是纯白文字。
 *
 *   这里改为：保留 ANSI SGR 序列，转换成带内联颜色的 <span>，让预览区
 *   与终端 (xterm.js) 配色完全一致（直接复用当前终端主题的 16 色调色板）。
 *
 * 支持的 SGR 参数：
 *   - 0       reset
 *   - 1       bold（加粗，通过 fontWeight 体现）
 *   - 2       dim（变暗）
 *   - 3       italic
 *   - 4       underline
 *   - 22/23/24 取消 bold/dim、italic、underline
 *   - 30-37   标准 8 色前景
 *   - 90-97   高亮 8 色前景
 *   - 38;5;n  256 色前景
 *   - 38;2;r;g;b  24bit 真彩前景
 *   - 39      默认前景色
 *
 * 其它（背景色、光标移动等）做最小化处理：移除控制序列，保留可见文本。
 * 安全：所有输出文本先 HTML 转义，再用 dangerouslySetInnerHTML 渲染。
 */
import type { TerminalTheme } from './terminalThemes'

const SGR_RE = /\x1b\[([\d;]*)m/g
// 其它 CSI（光标移动、擦除等）直接剥离，保留可见字符
const CSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 256 色调色板（按需惰性生成，缓存）
let palette256: string[] | null = null
function build256Palette(): string[] {
  if (palette256) return palette256
  const p: string[] = new Array(256)
  // 0-15: 标准与高亮（占位，实际由主题色覆盖，这里仅给兜底值）
  const base = [
    '#000000', '#cc0000', '#4e9a06', '#c4a000', '#3465a4', '#75507b', '#06989a', '#d3d7cf',
    '#555753', '#ef2929', '#8ae234', '#fce94f', '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec',
  ]
  for (let i = 0; i < 16; i++) p[i] = base[i]
  // 16-231: 6x6x6 立方体
  const steps = [0, 95, 135, 175, 215, 255]
  let idx = 16
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++)
        p[idx++] = `rgb(${steps[r]},${steps[g]},${steps[b]})`
  // 232-255: 灰阶
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10
    p[232 + i] = `rgb(${v},${v},${v})`
  }
  palette256 = p
  return p
}

function buildColorTable(theme: TerminalTheme): string[] {
  // 标准前景（30-37 / 90-97 取明亮色）映射到主题
  const basic = [
    theme.colors.black, theme.colors.red, theme.colors.green, theme.colors.yellow,
    theme.colors.blue, theme.colors.magenta, theme.colors.cyan, theme.colors.white,
  ]
  const bright = [
    theme.colors.brightBlack, theme.colors.brightRed, theme.colors.brightGreen, theme.colors.brightYellow,
    theme.colors.brightBlue, theme.colors.brightMagenta, theme.colors.brightCyan, theme.colors.brightWhite,
  ]
  // 标准 ANSI 表（0-15）= basic + bright；随后拼 256 色与灰阶
  const table = [...basic, ...bright, ...build256Palette().slice(16)]
  return table
}

interface StyleState {
  color: string | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
}

function styleToCss(s: StyleState): string {
  const parts: string[] = []
  if (s.color) parts.push(`color:${s.color}`)
  if (s.bold) parts.push('font-weight:700')
  if (s.dim) parts.push('opacity:0.6')
  if (s.italic) parts.push('font-style:italic')
  if (s.underline) parts.push('text-decoration:underline')
  return parts.join(';')
}

/**
 * 将带 ANSI 转义的文本转成可安全 innerHTML 的 HTML 片段。
 * @param raw 原始终端输出（含 \x1b[...m 等）
 * @param theme 当前终端主题（决定前景色映射）
 */
export function ansiToHtml(raw: string, theme: TerminalTheme): string {
  if (!raw) return ''
  // 先剥离 OSC（标题设置）与无关 CSI
  let text = raw.replace(OSC_RE, '')
  text = text.replace(CSI_RE, (m) => (SGR_RE.test(m) ? m : ''))
  SGR_RE.lastIndex = 0

  const table = buildColorTable(theme)
  const defaultFg = theme.colors.foreground

  const out: string[] = []
  let state: StyleState = { color: null, bold: false, dim: false, italic: false, underline: false }
  // 当前已打开 span 的 CSS，用于判断是否需要重开/关闭
  let openCss: string | null = null
  let last = 0

  const closeSpan = () => {
    if (openCss !== null) {
      out.push('</span>')
      openCss = null
    }
  }
  const openSpan = () => {
    const css = styleToCss(state)
    if (css) {
      out.push(`<span style="${css}">`)
      openCss = css
    } else {
      openCss = null
    }
  }
  const reopen = () => {
    closeSpan()
    openSpan()
  }

  let match: RegExpExecArray | null
  while ((match = SGR_RE.exec(text)) !== null) {
    // 把上一段纯文本先 flush（在当前样式 span 内）
    if (match.index > last) {
      if (openCss === null) openSpan()
      out.push(escapeHtml(text.slice(last, match.index)))
    }
    last = SGR_RE.lastIndex

    const params = match[1] === '' ? '0' : match[1]
    const codes = params.split(';').map((c) => parseInt(c, 10))
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]
      switch (code) {
        case 0:
          state = { color: null, bold: false, dim: false, italic: false, underline: false }
          reopen()
          break
        case 1:
          if (!state.bold) { state.bold = true; reopen() }
          break
        case 2:
          if (!state.dim) { state.dim = true; reopen() }
          break
        case 3:
          if (!state.italic) { state.italic = true; reopen() }
          break
        case 4:
          if (!state.underline) { state.underline = true; reopen() }
          break
        case 22:
          state.bold = false; state.dim = false; reopen(); break
        case 23:
          state.italic = false; reopen(); break
        case 24:
          state.underline = false; reopen(); break
        case 39:
          if (state.color !== null) { state.color = null; reopen() }
          break
        case 38: {
          // 扩展前景色：38;5;n 或 38;2;r;g;b
          if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            state.color = table[codes[i + 2]] ?? defaultFg
            i += 2
            reopen()
          } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            state.color = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`
            i += 4
            reopen()
          }
          break
        }
        default:
          if (code >= 30 && code <= 37) {
            state.color = table[code - 30]; reopen()
          } else if (code >= 90 && code <= 97) {
            state.color = table[code - 90 + 8]; reopen()
          }
          break
      }
    }
  }

  // 末尾剩余文本
  if (last < text.length) {
    if (openCss === null) openSpan()
    out.push(escapeHtml(text.slice(last)))
  }
  closeSpan()
  return out.join('')
}

/** 兜底：判断某段输出是否含 ANSI 序列（用于决定是否走渲染路径） */
export function hasAnsi(raw: string): boolean {
  return raw.includes('\x1b[')
}
