/**
 * TCommander HTTP API Client
 * 
 * Simple HTTP client for interacting with TCommander's Hook server.
 * The Hook server runs on localhost:19527 by default.
 */

const http = require('http')

class TcommanderClient {
  constructor(port = 19527) {
    this.baseUrl = `http://127.0.0.1:${port}`
  }
  
  /**
   * Update session status
   * @param {string} sessionId - Session ID
   * @param {string} status - New status (running|idle|needs-input|needs-confirm|error|streaming)
   * @param {string} [message] - Optional message
   */
  async updateStatus(sessionId, status, message) {
    const body = { status }
    if (message) body.message = message
    return this.request('POST', `/api/session/${sessionId}/status`, body)
  }
  
  /**
   * List all sessions
   */
  async listSessions() {
    return this.request('GET', '/api/sessions')
  }
  
  /**
   * Get session details
   * @param {string} sessionId - Session ID
   */
  async getSession(sessionId) {
    return this.request('GET', `/api/session/${sessionId}/status`)
  }
  
  /**
   * Make HTTP request
   * @param {string} method - HTTP method (GET|POST|PUT|DELETE)
   * @param {string} path - API path
   * @param {object} [body] - Request body (for POST/PUT)
   */
  async request(method, path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl)
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: { 'Content-Type': 'application/json' }
      }
      
      const req = http.request(options, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            resolve(parsed)
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`))
          }
        })
      })
      
      req.on('error', (err) => {
        reject(new Error(`Request failed: ${err.message}. Is TCommander running?`))
      })
      
      req.setTimeout(5000, () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })
      
      if (body) {
        req.write(JSON.stringify(body))
      }
      req.end()
    })
  }
}

module.exports = { TcommanderClient }
