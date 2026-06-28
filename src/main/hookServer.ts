import http from 'http'
import { URL } from 'url'

/**
 * Hook 请求处理器类型
 */
export type HookRequestHandler = (
  sessionId: string,
  payload: HookPayload
) => Promise<HookResponse>

/**
 * Hook 请求载荷
 */
export interface HookPayload {
  status: 'error' | 'needs-input' | 'needs-confirm' | 'running' | 'idle'
  message?: string
  metadata?: Record<string, any>
  action?: 'get' | 'update'
}

/**
 * Hook 响应
 */
export interface HookResponse {
  success: boolean
  sessionId?: string
  previousStatus?: string
  newStatus?: string
  error?: string
  data?: any
}

/**
 * 创建 HTTP Hook 服务器
 * 
 * @param port 监听端口（默认 19527）
 * @param onRequest 请求处理回调
 * @returns HTTP 服务器实例
 */
export function createHookServer(
  port: number,
  onRequest: HookRequestHandler
): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS 支持
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    // 预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }
    
    const url = new URL(req.url!, `http://localhost:${port}`)
    const path = url.pathname
    
    try {
      // POST /api/session/:sessionId/status
      if (req.method === 'POST' && /^\/api\/session\/[^/]+\/status$/.test(path)) {
        const parts = path.split('/')
        const sessionId = parts[3]
        
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', async () => {
          try {
            const payload: HookPayload = JSON.parse(body)
            payload.action = 'update'
            
            const result = await onRequest(sessionId, payload)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              success: false,
              error: `Invalid JSON: ${(error as Error).message}`
            }))
          }
        })
        return
      }
      
      // GET /api/session/:sessionId/status
      if (req.method === 'GET' && /^\/api\/session\/[^/]+\/status$/.test(path)) {
        const parts = path.split('/')
        const sessionId = parts[3]
        
        const result = await onRequest(sessionId, { 
          action: 'get',
          status: 'running' 
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
        return
      }
      
      // GET /api/sessions
      if (req.method === 'GET' && path === '/api/sessions') {
        const result = await onRequest('', { 
          action: 'get',
          status: 'running' 
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
        return
      }
      
      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'Not found' }))
    } catch (error) {
      console.error('Hook server error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        success: false, 
        error: (error as Error).message 
      }))
    }
  })
  
  // 仅监听本地地址，提高安全性
  server.listen(port, '127.0.0.1', () => {
    console.log(`[Hook] Server listening on http://127.0.0.1:${port}`)
  })
  
  // 错误处理
  server.on('error', (error) => {
    console.error('[Hook] Server error:', error)
  })
  
  return server
}
