import { useEffect, useRef, useState } from 'react'
import { cleanTerminalOutput, joinTail } from './statusDetector'

/** 参与渲染的字节上限：限制单次清理/解析的输入规模，防止长会话卡顿 */
const MD_RENDER_BYTE_LIMIT = 64 * 1024
/** 参与渲染的尾部行数上限：只渲染「终端视口附近」的最新内容（而非全部历史堆着），输出增长时配合 sticky-bottom 自动跟随 */
const MD_RENDER_LINE_LIMIT = 120

/**
 * 清理会话历史为 Markdown 源文本（不做 HTML 转换）。
 *
 * 渲染交给 react-markdown（AST → React 组件，天然无 XSS，无需 DOMPurify）：
 *   joinTail 只拼接尾部 ≤64KB 的分块（避免 join 整个 512KB 历史）
 *   → cleanTerminalOutput 清理 ANSI/光标控制为纯文本
 *   → 再按行截取尾部 ≤120 行（终端视口语义：内容是「当前屏幕附近」而非历史堆积）
 *   → 额外去掉每行行尾空白（marked breaks 时代的残留噪声源之一）。
 *
 * 注意：不开 remark-breaks（等价 marked 的 breaks:true）——
 * 终端流每行换行都变 <br> 会让段落支离破碎，是旧版「丑」的主要根因。
 */
export function cleanMarkdownSource(history: string[]): string {
  if (history.length === 0) return ''
  const tail = joinTail(history, MD_RENDER_BYTE_LIMIT)
  if (!tail) return ''
  const cleanText = cleanTerminalOutput(tail)
  if (!cleanText.trim()) return ''
  const lines = cleanText.split('\n')
  const visible = lines.length > MD_RENDER_LINE_LIMIT ? lines.slice(-MD_RENDER_LINE_LIMIT) : lines
  // 行尾空白会破坏 Markdown 的硬换行/列表语义，统一去掉
  return visible
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
}

/**
 * 节流版 Markdown 源文本 hook：返回清理后的源文本（渲染由 react-markdown 组件完成）。
 *
 * history 引用随 PTY 输出高频变化（App 侧约每 100ms flush 一次），
 * 这里把清理频率压到 ≤ intervalMs（默认 300ms）：
 *   - 初次挂载：useState 初始化器内立即执行一次；
 *   - 后续变化：前缘（距上次执行超间隔则立即）+ 后缘（间隔结束时用最新 history 补执行）节流。
 *
 * 实现注意：后缘定时器不能在 effect cleanup 中清理——
 * history 高频变化会让 cleanup 反复取消定时器，导致后缘执行永远不触发；
 * 因此定时器常驻 ref，仅在组件卸载时统一清理。
 */
export function useThrottledMarkdown(history: string[], intervalMs = 300): string {
  const [source, setSource] = useState<string>(() => cleanMarkdownSource(history))
  // 最新 history 引用：后缘定时器触发时取最新值，而非 effect 闭包捕获的旧值
  const historyRef = useRef(history)
  historyRef.current = history
  // 上次执行时间戳；初次执行发生在 useState 初始化器，这里记录起点
  const lastRunRef = useRef(Date.now())
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const now = Date.now()
    const elapsed = now - lastRunRef.current

    if (elapsed >= intervalMs) {
      // 前缘：距上次执行已超过间隔，立即执行
      lastRunRef.current = now
      setSource(cleanMarkdownSource(history))
    } else if (timerRef.current == null) {
      // 后缘：间隔结束时用「最新」history 补一次执行（期间的变化不再重设定时器）
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        lastRunRef.current = Date.now()
        setSource(cleanMarkdownSource(historyRef.current))
      }, intervalMs - elapsed)
    }
  }, [history, intervalMs])

  // 仅卸载时清理后缘定时器
  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  return source
}
