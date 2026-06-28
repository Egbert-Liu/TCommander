#!/bin/bash
# TCommander Codex Wrapper Script
# 
# This wrapper script integrates Codex CLI with TCommander's Hook API.
# It automatically updates session status based on command output patterns.
#
# Usage:
#   export TCOMMANDER_SESSION_ID="session-xxx"
#   ./tcommander-codex-wrapper.sh [codex-args...]
#
# Environment Variables:
#   TCOMMANDER_SESSION_ID - Required: The TCommander session ID
#   TCOMMANDER_PORT       - Optional: Hook server port (default: 19527)

set -e

SESSION_ID="${TCOMMANDER_SESSION_ID}"
TC_PORT="${TCOMMANDER_PORT:-19527}"
TC_URL="http://127.0.0.1:${TC_PORT}"

if [ -z "$SESSION_ID" ]; then
  echo "Error: TCOMMANDER_SESSION_ID environment variable not set" >&2
  echo "Usage: export TCOMMANDER_SESSION_ID=\"session-xxx\" && $0 [args...]" >&2
  exit 1
fi

# Function to update TCommander status
update_status() {
  local status="$1"
  local message="${2:-}"
  
  curl -s -X POST "${TC_URL}/api/session/${SESSION_ID}/status" \
    -H "Content-Type: application/json" \
    -d "{\"status\":\"${status}\",\"message\":\"${message}\"}" > /dev/null 2>&1 || true
}

# Function to detect status patterns from output
detect_status() {
  local line="$1"
  
  # Error patterns
  if echo "$line" | grep -qiE "(error|failed|exception|fatal|panic|crash)"; then
    update_status "error" "$line"
    return
  fi
  
  # Confirmation patterns
  if echo "$line" | grep -qiE "(continue|proceed|y/n|yes/no|confirm|are you sure)"; then
    update_status "needs-confirm" "$line"
    return
  fi
  
  # Input prompt patterns
  if echo "$line" | grep -qE "(\?|:)\s*$"; then
    update_status "needs-input" "$line"
    return
  fi
}

# Mark session as running at start
update_status "running" "Codex command started"

# Execute codex with all arguments, capturing output
codex "$@" 2>&1 | while IFS= read -r line; do
  # Echo the line to stdout (preserve normal output)
  echo "$line"
  
  # Detect status patterns
  detect_status "$line"
done

# Get exit code from codex
EXIT_CODE=${PIPESTATUS[0]}

# Mark session based on exit code
if [ $EXIT_CODE -eq 0 ]; then
  update_status "idle" "Codex command completed successfully"
else
  update_status "error" "Codex command exited with code $EXIT_CODE"
fi

exit $EXIT_CODE
