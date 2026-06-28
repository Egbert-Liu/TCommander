/**
 * TCommander MCP Server for Claude Code
 * 
 * This MCP server allows Claude Code to interact with TCommander via the HTTP Hook API.
 * It provides tools for updating session status and listing sessions.
 * 
 * Usage:
 * 1. Install dependencies: npm install @modelcontextprotocol/sdk
 * 2. Configure Claude Code to use this server (see README.md)
 * 3. Claude Code can now call tcommander_update_status and tcommander_list_sessions
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { TcommanderClient } = require('./tcommander-client.js')

const server = new Server({
  name: 'tcommander-hook',
  version: '1.0.0'
})

const tcClient = new TcommanderClient()

// Register available tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'tcommander_update_status',
        description: 'Update TCommander session status. Use this when you want to signal the session state (e.g., when waiting for input, when an error occurs, when streaming output).',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { 
              type: 'string', 
              description: 'The session ID to update. If not provided, will use TCOMMANDER_SESSION_ID env var.' 
            },
            status: { 
              type: 'string', 
              enum: ['running', 'idle', 'needs-input', 'needs-confirm', 'error', 'streaming'],
              description: 'The new status. Use "needs-input" when waiting for user input, "needs-confirm" when waiting for confirmation, "error" when an error occurred, "streaming" when outputting data, "running" when executing, "idle" when done.'
            },
            message: { 
              type: 'string', 
              description: 'Optional message to display with the status update' 
            }
          },
          required: ['status']
        }
      },
      {
        name: 'tcommander_list_sessions',
        description: 'List all TCommander sessions. Use this to see what sessions are available and their current status.',
        inputSchema: { 
          type: 'object', 
          properties: {} 
        }
      },
      {
        name: 'tcommander_get_session',
        description: 'Get detailed information about a specific TCommander session.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { 
              type: 'string', 
              description: 'The session ID to query. If not provided, will use TCOMMANDER_SESSION_ID env var.' 
            }
          },
          required: []
        }
      }
    ]
  }
})

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params
  
  try {
    if (name === 'tcommander_update_status') {
      const sessionId = args.sessionId || process.env.TCOMMANDER_SESSION_ID
      if (!sessionId) {
        return { 
          content: [{ type: 'text', text: 'Error: No sessionId provided and TCOMMANDER_SESSION_ID env var not set' }], 
          isError: true 
        }
      }
      
      await tcClient.updateStatus(sessionId, args.status, args.message)
      return { 
        content: [{ type: 'text', text: `✓ Session ${sessionId} status updated to "${args.status}"${args.message ? `: ${args.message}` : ''}` }] 
      }
    }
    
    if (name === 'tcommander_list_sessions') {
      const result = await tcClient.listSessions()
      if (result.success && result.data) {
        const sessions = result.data.sessions || []
        if (sessions.length === 0) {
          return { content: [{ type: 'text', text: 'No active sessions found.' }] }
        }
        
        const sessionList = sessions.map(s => {
          const statusEmoji = {
            'error': '❌',
            'needs-confirm': '⚠️',
            'needs-input': '💬',
            'streaming': '📤',
            'running': '▶️',
            'idle': '⏸️'
          }[s.status] || '❓'
          
          return `${statusEmoji} ${s.name} (${s.id})\n   Status: ${s.status}\n   Kind: ${s.kind}\n   Last Activity: ${new Date(s.lastActivityAt).toLocaleString()}`
        }).join('\n\n')
        
        return { 
          content: [{ type: 'text', text: `Found ${sessions.length} session(s):\n\n${sessionList}` }] 
        }
      } else {
        return { 
          content: [{ type: 'text', text: `Error listing sessions: ${result.error || 'Unknown error'}` }], 
          isError: true 
        }
      }
    }
    
    if (name === 'tcommander_get_session') {
      const sessionId = args.sessionId || process.env.TCOMMANDER_SESSION_ID
      if (!sessionId) {
        return { 
          content: [{ type: 'text', text: 'Error: No sessionId provided and TCOMMANDER_SESSION_ID env var not set' }], 
          isError: true 
        }
      }
      
      const result = await tcClient.getSession(sessionId)
      if (result.success && result.data) {
        const s = result.data
        const info = [
          `Session: ${s.name}`,
          `ID: ${s.id}`,
          `Status: ${s.status}`,
          `Last Activity: ${new Date(s.lastActivityAt).toLocaleString()}`,
          s.matchedRuleName ? `Matched Rule: ${s.matchedRuleName}` : null
        ].filter(Boolean).join('\n')
        
        return { content: [{ type: 'text', text: info }] }
      } else {
        return { 
          content: [{ type: 'text', text: `Error getting session: ${result.error || 'Session not found'}` }], 
          isError: true 
        }
      }
    }
    
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
  } catch (error) {
    return { 
      content: [{ type: 'text', text: `Error: ${error.message}` }], 
      isError: true 
    }
  }
})

// Start the server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('TCommander MCP Server started')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
