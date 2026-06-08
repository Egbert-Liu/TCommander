import { SessionStatus } from '../types'

export function detectStatus(output: string): SessionStatus {
  const cleanOutput = stripAnsi(output)
  const lines = cleanOutput.split('\n').filter(l => l.trim())
  const tailLines = lines.slice(-8)
  const tailText = tailLines.join('\n')
  const lowerTail = tailText.toLowerCase()

  // Only check recent output for errors, not the entire history
  if (/(?:error|Error|ERROR)/.test(tailText)) {
    return 'error'
  }

  if (hasConfirmationPattern(tailText, lowerTail)) {
    return 'needs-confirm'
  }

  if (tailText.includes('?') || tailText.includes(':')) {
    const lastLine = lines[lines.length - 1] || ''
    if (lastLine.includes('?') || lastLine.endsWith(':')) {
      return 'needs-input'
    }
  }

  if (tailText.includes('$') || tailText.includes('>') || tailText.includes('#')) {
    return 'idle'
  }

  return 'running'
}

function hasConfirmationPattern(text: string, lower: string): boolean {
  if (/❯\s*\d+\./i.test(text)) {
    return true
  }

  if (/\d+\.\s*(?:Yes|No|yes|no)\b/.test(text)) {
    return true
  }

  if (/\[y\/n\]/i.test(text) || /\(y\/n\)/i.test(text)) {
    return true
  }

  if (/\[yes\/no\]/i.test(text) || /\(yes\/no\)/i.test(text)) {
    return true
  }

  if (/\(y\/n\/[a-z]\)/i.test(text) || /\[y\/n\/[a-z]\]/i.test(text)) {
    return true
  }

  if (/\byes\b.*\b(no|exit)\b/i.test(lower) || /\bno\b.*\b(yes|continue)\b/i.test(lower)) {
    return true
  }

  if (/do you want to/i.test(lower) || /are you sure/i.test(lower) || /would you like/i.test(lower)) {
    return true
  }

  if (/confirm/i.test(lower) && (/\[y\/n\]/i.test(text) || /\(y\/n\)/i.test(text) || /\(yes\/no\)/i.test(text))) {
    return true
  }

  if (/press\s+[yYnN]\s+to/i.test(text)) {
    return true
  }

  if (/\btrust\b.*\bfolder\b/i.test(lower)) {
    return true
  }

  if (/\b(accept|reject)\b/i.test(text)) {
    return true
  }

  if (/\?\s*\[y\/n\]/i.test(text) || /\?\s*\(yes\/no\)/i.test(text) || /\?\s*\(y\/n\)/i.test(text)) {
    return true
  }

  return false
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
  let cleaned = stripAnsi(raw)

  const lines = cleaned.split('\n')
  const processed: string[] = []

  for (const line of lines) {
    const parts = line.split('\r')
    let resolved = ''

    if (parts.length === 1) {
      resolved = parts[0]
    } else {
      let accumulated = ''
      for (const part of parts) {
        if (part.length >= accumulated.length) {
          accumulated = part
        } else {
          accumulated = part + accumulated.slice(part.length)
        }
      }
      resolved = accumulated
    }

    const trimmed = resolved.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trimEnd()

    if (trimmed.length === 0) continue

    if (processed.length > 0 && processed[processed.length - 1] === trimmed) {
      continue
    }

    processed.push(trimmed)
  }

  // Keep only last 200 lines to prevent unbounded growth in preview
  const maxPreviewLines = 200
  if (processed.length > maxPreviewLines) {
    return processed.slice(-maxPreviewLines).join('\n')
  }

  return processed.join('\n')
}

export function truncateHistory(history: string[], maxChunks: number = 500): string[] {
  if (history.length <= maxChunks) return history
  return history.slice(-maxChunks)
}
