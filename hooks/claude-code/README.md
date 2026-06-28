# TCommander Claude Code MCP Server

This MCP (Model Context Protocol) server allows Claude Code to interact with TCommander's Hook API, enabling intelligent session status updates.

## Features

- **tcommander_update_status**: Update session status (running/idle/needs-input/needs-confirm/error/streaming)
- **tcommander_list_sessions**: List all active TCommander sessions
- **tcommander_get_session**: Get detailed information about a specific session

## Installation

1. Install the MCP SDK dependency:

```bash
cd hooks/claude-code
npm install @modelcontextprotocol/sdk
```

2. Configure Claude Code to use this MCP server. Add the following to your Claude Code configuration (typically `~/.claude/config.json`):

```json
{
  "mcpServers": {
    "tcommander": {
      "command": "node",
      "args": ["/path/to/tcommander/hooks/claude-code/mcp-server.js"],
      "env": {
        "TCOMMANDER_SESSION_ID": "your-session-id"
      }
    }
  }
}
```

Replace `/path/to/tcommander` with the actual path to your TCommander installation.

## Usage

Once configured, Claude Code can automatically update TCommander session status:

```
# In Claude Code:
> Update the TCommander session status to "needs-input" because I'm waiting for user confirmation
> List all active TCommander sessions
> Get details about the current session
```

## Environment Variables

- `TCOMMANDER_SESSION_ID`: The session ID to operate on (can be overridden in tool calls)
- `TCOMMANDER_PORT`: Hook server port (default: 19527)

## Example Workflow

1. Start TCommander and create a session
2. Note the session ID (e.g., `session-1234567890-abcdef`)
3. Configure Claude Code with the session ID
4. Run Claude Code in that session
5. Claude Code will automatically update status based on context:
   - `streaming` when outputting data
   - `needs-input` when waiting for user input
   - `needs-confirm` when asking for confirmation
   - `error` when encountering errors
   - `idle` when command completes

## Troubleshooting

- **Connection refused**: Ensure TCommander is running and the Hook server is enabled (default port 19527)
- **Session not found**: Verify the session ID is correct and the session exists
- **MCP server not loading**: Check the Claude Code configuration and ensure the path to mcp-server.js is correct
