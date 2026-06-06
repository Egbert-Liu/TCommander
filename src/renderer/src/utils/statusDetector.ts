import { SessionStatus } from '../types'

export function detectStatus(output: string): SessionStatus {
  const cleanOutput = stripAnsi(output)
  
  if (cleanOutput.includes('error') || cleanOutput.includes('Error') || cleanOutput.includes('ERROR')) {
    return 'error'
  }
  
  if (cleanOutput.includes('[Y/n]') || cleanOutput.includes('[y/N]') || 
      cleanOutput.includes('(Y/n)') || cleanOutput.includes('(y/N)')) {
    return 'needs-confirm'
  }
  
  if (cleanOutput.includes('?') || cleanOutput.includes(':')) {
    const lastLine = cleanOutput.split('\n').filter(l => l.trim()).pop() || ''
    if (lastLine.includes('?') || lastLine.endsWith(':')) {
      return 'needs-input'
    }
  }
  
  if (cleanOutput.includes('$') || cleanOutput.includes('>') || cleanOutput.includes('#')) {
    return 'idle'
  }
  
  return 'running'
}

export function stripAnsi(str: string): string {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

export function truncateHistory(history: string[], maxLines: number = 200): string[] {
  if (history.length <= maxLines) return history
  return history.slice(-maxLines)
}
