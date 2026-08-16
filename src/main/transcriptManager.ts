/**
 * Claude Code Transcript 管理器（主进程）
 *
 * 数据链路（参照 Wave/Warp 的"结构化数据源"思路，替代从终端字节流清洗 Markdown）：
 *   Claude Code hook 脚本（transcript-hook.js）
 *     → POST /api/session/:id/claude 报告 transcript JSONL 路径
 *     → 本模块 watch 文件、增量读取、解析为对话条目
 *     → IPC 'claude-transcript' 推送渲染进程（全屏 MD 模式渲染对话流）
 *
 * transcript JSONL 每行一条记录，关键字段：
 *   {"type":"user","message":{"role":"user","content":"..." | [{type:"text"|"tool_result",...}]}}
 *   {"type":"assistant","message":{"role":"assistant","content":[{type:"text",text},...,{type:"tool_use",name,input}]}}
 *   其余 type（summary/system 等）忽略。
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

/** 渲染进程与主进程共享的对话条目结构（保持可 IPC 序列化） */
export interface TranscriptEntry {
  kind: 'user' | 'assistant' | 'tool-call' | 'tool-result'
  /** user/assistant 文本；tool-call 为输入摘要；tool-result 为结果摘要 */
  text: string
  /** tool-call / tool-result 的工具名 */
  toolName?: string
  /** tool-result 是否为错误 */
  isError?: boolean
  /** 记录时间戳（ms，来自 transcript 的 ISO 时间） */
  ts?: number
}

interface WatchState {
  claudeSessionId: string
  transcriptPath: string
  /** transcript 所在目录（共享 watcher 的 key，用于解绑） */
  dirPath: string
  /** transcript 文件名（watcher 回调按文件名分发） */
  fileName: string
  /** 已读取到的文件字节偏移（增量读取游标） */
  lastOffset: number
  /** 上次读取残留的半行（JSONL 行可能被写一半） */
  partialLine: string
  /** change 事件防抖定时器 */
  debounce: NodeJS.Timeout | null
}

/**
 * 共享目录 watcher：同一目录（如同一项目的多个 Claude 会话都在
 * ~/.claude/projects/<proj>/ 下）只建一个 fs.watch，按文件名分发到各会话，
 * 避免 N 会话 × N watcher 重复监听同一目录。
 */
interface DirWatchState {
  watcher: fs.FSWatcher
  /** 文件名 → 监听该文件的会话集合 */
  files: Map<string, Set<string>>
}

export type TranscriptPushFn = (sessionId: string, appended: TranscriptEntry[]) => void

const CHANGE_DEBOUNCE_MS = 200
/** 单条 entry 文本上限：防止超长 tool_result（如 base64）撑爆 IPC/渲染 */
const ENTRY_TEXT_LIMIT = 20_000

function clampText(text: string): string {
  if (text.length <= ENTRY_TEXT_LIMIT) return text
  return text.slice(0, ENTRY_TEXT_LIMIT) + '\n…(已截断)'
}

/** JSONL 单行 → 0..n 条对话条目 */
function parseRecordLine(line: string): TranscriptEntry[] {
  let record: any
  try {
    record = JSON.parse(line)
  } catch {
    return [] // 容忍坏行/半行
  }
  if (!record || typeof record !== 'object') return []

  const ts = record.timestamp ? Date.parse(record.timestamp) || undefined : undefined
  const message = record.message
  if (!message || typeof message !== 'object') {
    // summary 等元记录：忽略
    return []
  }

  const entries: TranscriptEntry[] = []

  if (record.type === 'user') {
    const content = message.content
    if (typeof content === 'string') {
      const text = content.trim()
      if (text) entries.push({ kind: 'user', text: clampText(text), ts })
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          entries.push({ kind: 'user', text: clampText(block.text.trim()), ts })
        }
        // tool_result 块：提取文本内容做结果摘要
        if (block && block.type === 'tool_result') {
          let resultText = ''
          if (typeof block.content === 'string') {
            resultText = block.content
          } else if (Array.isArray(block.content)) {
            resultText = block.content
              .filter((c: any) => c && c.type === 'text' && typeof c.text === 'string')
              .map((c: any) => c.text)
              .join('\n')
          }
          resultText = resultText.trim()
          if (resultText) {
            // 工具名在对应 tool_use 侧，此处仅做结果摘要
            entries.push({
              kind: 'tool-result',
              text: clampText(resultText),
              isError: !!block.is_error,
              ts
            })
          }
        }
      }
    }
    return entries
  }

  if (record.type === 'assistant') {
    const content = message.content
    if (!Array.isArray(content)) return entries
    // 同一消息内多个 text block 合并为一条 assistant 条目（保持 Markdown 连贯）
    const texts: string[] = []
    for (const block of content) {
      if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        texts.push(block.text.trim())
      }
      if (block && block.type === 'tool_use') {
        entries.push({
          kind: 'tool-call',
          toolName: String(block.name || 'tool'),
          text: clampText(summarizeToolInput(block.input)),
          ts
        })
      }
    }
    if (texts.length > 0) {
      entries.push({ kind: 'assistant', text: clampText(texts.join('\n\n')), ts })
    }
    return entries
  }

  return entries
}

/** 工具输入对象 → 单行摘要（Bash 显示命令、Edit 显示文件路径等） */
function summarizeToolInput(input: any): string {
  if (input == null) return ''
  if (typeof input === 'string') return input
  if (typeof input === 'object') {
    // 常见字段优先，取到即止
    for (const key of ['command', 'cmd', 'file_path', 'path', 'pattern', 'url', 'query', 'prompt', 'description']) {
      const v = (input as Record<string, unknown>)[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    try {
      return JSON.stringify(input)
    } catch {
      return ''
    }
  }
  return String(input)
}

export function createTranscriptManager(push: TranscriptPushFn) {
  /** ourSessionId → watch 状态 */
  const states = new Map<string, WatchState>()
  /** 目录路径 → 共享 watcher（多会话同目录时复用） */
  const dirWatchers = new Map<string, DirWatchState>()

  /** 增量读取并解析：从 lastOffset 读到文件尾，按行解析，推送新增条目 */
  function readIncrement(sessionId: string): void {
    const state = states.get(sessionId)
    if (!state) return

    let content: string
    try {
      const fd = fs.openSync(state.transcriptPath, 'r')
      try {
        const size = fs.fstatSync(fd).size
        if (size < state.lastOffset) {
          // 文件被重写/收缩（如 compact）：重置游标全量读
          state.lastOffset = 0
          state.partialLine = ''
        }
        const length = size - state.lastOffset
        if (length <= 0) return
        const buf = Buffer.alloc(length)
        fs.readSync(fd, buf, 0, length, state.lastOffset)
        content = buf.toString('utf8')
        state.lastOffset = size
      } finally {
        fs.closeSync(fd)
      }
    } catch {
      return // 文件暂时不可读（重命名中间态等），下次再试
    }

    // 行拼装：partialLine + 新内容，最后一段若不以 \n 结尾则继续留存
    const joined = state.partialLine + content
    const lines = joined.split('\n')
    state.partialLine = lines.pop() ?? ''

    const appended: TranscriptEntry[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      appended.push(...parseRecordLine(trimmed))
    }
    if (appended.length > 0) {
      push(sessionId, appended)
    }
  }

  /** 获取（或创建）目录共享 watcher；目录暂不可用时返回 null（bind 重试时再来） */
  function acquireDirWatcher(dirPath: string): DirWatchState | null {
    const existing = dirWatchers.get(dirPath)
    if (existing) return existing
    try {
      // 监听目录（而非文件）：Claude Code 原子替换/重命名文件时 watch(file) 会失效
      const watcher = fs.watch(dirPath, (_event, filename) => {
        const dw = dirWatchers.get(dirPath)
        if (!dw) return
        if (filename) {
          // 按文件名精确分发到监听该文件的会话
          const ids = dw.files.get(filename)
          if (ids) ids.forEach((sid) => scheduleRead(sid))
        } else {
          // 平台未提供文件名：通知该目录下全部会话
          dw.files.forEach((ids) => ids.forEach((sid) => scheduleRead(sid)))
        }
      })
      watcher.on('error', () => {
        // watch 异常（目录被删等）：关闭并移除共享 watcher，各会话状态保留待 bind 重试
        const dw = dirWatchers.get(dirPath)
        if (!dw) return
        dw.files.clear()
        try { dw.watcher.close() } catch { /* ignore */ }
        dirWatchers.delete(dirPath)
      })
      const dw: DirWatchState = { watcher, files: new Map() }
      dirWatchers.set(dirPath, dw)
      return dw
    } catch {
      return null
    }
  }

  /** 把会话挂到目录共享 watcher（按 fileName 记录分发关系） */
  function attachWatcher(sessionId: string): void {
    const state = states.get(sessionId)
    if (!state) return
    const dw = acquireDirWatcher(state.dirPath)
    if (!dw) return
    let ids = dw.files.get(state.fileName)
    if (!ids) {
      ids = new Set()
      dw.files.set(state.fileName, ids)
    }
    ids.add(sessionId)
  }

  /** 从共享 watcher 解绑会话；目录下已无会话时关闭 watcher */
  function detachWatcher(sessionId: string): void {
    const state = states.get(sessionId)
    if (!state) return
    const dw = dirWatchers.get(state.dirPath)
    if (!dw) return
    const ids = dw.files.get(state.fileName)
    if (ids) {
      ids.delete(sessionId)
      if (ids.size === 0) dw.files.delete(state.fileName)
    }
    if (dw.files.size === 0) {
      try { dw.watcher.close() } catch { /* ignore */ }
      dirWatchers.delete(state.dirPath)
    }
  }

  function scheduleRead(sessionId: string): void {
    const state = states.get(sessionId)
    if (!state) return
    if (state.debounce) clearTimeout(state.debounce)
    state.debounce = setTimeout(() => {
      state.debounce = null
      readIncrement(sessionId)
    }, CHANGE_DEBOUNCE_MS)
  }

  return {
    /**
     * hook 报告 transcript 路径（幂等）：
     * 新路径 → 重置游标全量读 + watch；同路径 → 仅触发一次增量读
     */
    bind(sessionId: string, claudeSessionId: string, transcriptPath: string): void {
      const normalized = path.resolve(transcriptPath.replace(/^~(?=$|[\\/])/, getUserHome()))
      const existing = states.get(sessionId)

      if (existing && existing.transcriptPath === normalized) {
        scheduleRead(sessionId)
        return
      }

      if (existing) {
        detachWatcher(sessionId)
        if (existing.debounce) clearTimeout(existing.debounce)
      }

      states.set(sessionId, {
        claudeSessionId,
        transcriptPath: normalized,
        dirPath: path.dirname(normalized),
        fileName: path.basename(normalized),
        lastOffset: 0,
        partialLine: '',
        debounce: null
      })
      attachWatcher(sessionId)
      readIncrement(sessionId)
    },

    /** 会话删除时清理（渲染进程 closeSession 后主进程调用） */
    cleanup(sessionId: string): void {
      const state = states.get(sessionId)
      if (!state) return
      detachWatcher(sessionId)
      if (state.debounce) clearTimeout(state.debounce)
      states.delete(sessionId)
    },

    dispose(): void {
      for (const [sessionId] of states) {
        this.cleanup(sessionId)
      }
    }
  }
}

function getUserHome(): string {
  return os.homedir()
}

export type TranscriptManager = ReturnType<typeof createTranscriptManager>
