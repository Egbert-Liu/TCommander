import { SessionStatus } from '../types'

export function detectStatus(output: string): SessionStatus {
  const cleanOutput = stripAnsi(output)
  const lines = cleanOutput.split('\n').filter(l => l.trim())
  const tailLines = lines.slice(-4)
  const tailText = tailLines.join('\n')

  if (/(?:error|Error|ERROR)/.test(cleanOutput)) {
    return 'error'
  }

  if (hasConfirmationPattern(tailText)) {
    return 'needs-confirm'
  }

  if (cleanOutput.includes('?') || cleanOutput.includes(':')) {
    const lastLine = lines.pop() || ''
    if (lastLine.includes('?') || lastLine.endsWith(':')) {
      return 'needs-input'
    }
  }

  if (cleanOutput.includes('$') || cleanOutput.includes('>') || cleanOutput.includes('#')) {
    return 'idle'
  }

  return 'running'
}

function hasConfirmationPattern(text: string): boolean {
  const lower = text.toLowerCase()

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
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

export function truncateHistory(history: string[], maxLines: number = 200): string[] {
  if (history.length <= maxLines) return history
  return history.slice(-maxLines)
}
