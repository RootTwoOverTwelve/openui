#!/bin/bash

# OpenUI Status Reporter for Claude Code
# Reports agent status and metrics to OpenUI server via HTTP

# Don't use strict mode - we want to always exit 0
STATUS="${1:-}"
OPENUI_PORT="${OPENUI_PORT:-6969}"
OPENUI_HOST="${OPENUI_HOST:-localhost}"
DEBUG_LOG="/tmp/openui-plugin-debug.log"

# Get OpenUI session ID from environment (passed by OpenUI when spawning the PTY)
OPENUI_SID="${OPENUI_SESSION_ID:-}"

# Read the hook input from stdin (JSON)
INPUT=$(cat)

# Extract all available fields from the input JSON
if command -v jq &> /dev/null; then
  # Core fields
  CLAUDE_SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")
  HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null || echo "")

  # Tool-related fields (PreToolUse/PostToolUse)
  TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
  TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // empty' 2>/dev/null || echo "")

  # Stop-related fields (Stop/SubagentStop)
  STOP_REASON=$(echo "$INPUT" | jq -r '.reason // empty' 2>/dev/null || echo "")
  STOP_RESULT=$(echo "$INPUT" | jq -r '.stop_hook_result // empty' 2>/dev/null || echo "")

  # Notification fields
  NOTIFICATION_TYPE=$(echo "$INPUT" | jq -r '.notification // empty' 2>/dev/null || echo "")
  NOTIFICATION_MESSAGE=$(echo "$INPUT" | jq -r '.message // empty' 2>/dev/null || echo "")

  # Session info
  TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")

  # User prompt (for UserPromptSubmit - truncate if too long)
  USER_PROMPT=$(echo "$INPUT" | jq -r '.user_prompt // empty' 2>/dev/null | head -c 500 || echo "")

  # Model info
  MODEL=$(echo "$INPUT" | jq -r '.model // empty' 2>/dev/null || echo "")

  # Subagent info (for SubagentStop)
  SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.subagent_type // empty' 2>/dev/null || echo "")

  # SessionStart source (startup/resume/clear/compact)
  SESSION_SOURCE=$(echo "$INPUT" | jq -r '.source // empty' 2>/dev/null || echo "")
else
  # Fallback to grep/sed for systems without jq
  CLAUDE_SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"//' | sed 's/"$//' || echo "")
  CWD=$(echo "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"//' | sed 's/"$//' || echo "")
  HOOK_EVENT=$(echo "$INPUT" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"//' | sed 's/"$//' || echo "")
  TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"//' | sed 's/"$//' || echo "")
  NOTIFICATION_TYPE=$(echo "$INPUT" | grep -o '"notification"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"//' | sed 's/"$//' || echo "")
  STOP_REASON=""
  TOOL_INPUT=""
  TRANSCRIPT_PATH=""
  USER_PROMPT=""
  MODEL=""
  SUBAGENT_TYPE=""
  NOTIFICATION_MESSAGE=""
  STOP_RESULT=""
  SESSION_SOURCE=""
fi

# Build the JSON payload with all available data
if [ -n "$STATUS" ]; then
  # Start JSON payload
  PAYLOAD="{\"status\":\"${STATUS}\",\"openuiSessionId\":\"${OPENUI_SID}\",\"claudeSessionId\":\"${CLAUDE_SESSION_ID}\",\"cwd\":\"${CWD}\""

  # Add hook event name
  if [ -n "$HOOK_EVENT" ]; then
    PAYLOAD="${PAYLOAD},\"hookEvent\":\"${HOOK_EVENT}\""
  fi

  # Add tool name if present (PreToolUse/PostToolUse)
  if [ -n "$TOOL_NAME" ]; then
    PAYLOAD="${PAYLOAD},\"toolName\":\"${TOOL_NAME}\""
  fi

  # Add tool input if present and it's valid JSON
  if [ -n "$TOOL_INPUT" ] && [ "$TOOL_INPUT" != "null" ] && [ "$TOOL_INPUT" != "" ]; then
    # Escape the tool input for JSON embedding
    PAYLOAD="${PAYLOAD},\"toolInput\":${TOOL_INPUT}"
  fi

  # Add stop reason if present (Stop/SubagentStop)
  if [ -n "$STOP_REASON" ]; then
    PAYLOAD="${PAYLOAD},\"stopReason\":\"${STOP_REASON}\""
  fi

  # Add stop result if present
  if [ -n "$STOP_RESULT" ]; then
    PAYLOAD="${PAYLOAD},\"stopResult\":\"${STOP_RESULT}\""
  fi

  # Add notification info if present
  if [ -n "$NOTIFICATION_TYPE" ]; then
    PAYLOAD="${PAYLOAD},\"notificationType\":\"${NOTIFICATION_TYPE}\""
  fi
  if [ -n "$NOTIFICATION_MESSAGE" ]; then
    # Escape quotes in message
    ESCAPED_MESSAGE=$(echo "$NOTIFICATION_MESSAGE" | sed 's/"/\\"/g' | tr '\n' ' ')
    PAYLOAD="${PAYLOAD},\"notificationMessage\":\"${ESCAPED_MESSAGE}\""
  fi

  # Add transcript path if present
  if [ -n "$TRANSCRIPT_PATH" ]; then
    PAYLOAD="${PAYLOAD},\"transcriptPath\":\"${TRANSCRIPT_PATH}\""
  fi

  # Add model info if present
  if [ -n "$MODEL" ]; then
    PAYLOAD="${PAYLOAD},\"model\":\"${MODEL}\""
  fi

  # Add subagent type if present
  if [ -n "$SUBAGENT_TYPE" ]; then
    PAYLOAD="${PAYLOAD},\"subagentType\":\"${SUBAGENT_TYPE}\""
  fi

  # Add session start source if present
  if [ -n "$SESSION_SOURCE" ]; then
    PAYLOAD="${PAYLOAD},\"sessionSource\":\"${SESSION_SOURCE}\""
  fi

  # Add truncated user prompt if present (useful for understanding what user asked)
  if [ -n "$USER_PROMPT" ]; then
    # Escape quotes and newlines in prompt
    ESCAPED_PROMPT=$(echo "$USER_PROMPT" | sed 's/"/\\"/g' | tr '\n' ' ')
    PAYLOAD="${PAYLOAD},\"userPrompt\":\"${ESCAPED_PROMPT}\""
  fi

  PAYLOAD="${PAYLOAD}}"

  # Send to OpenUI server
  RESPONSE=$(curl -s -X POST "http://${OPENUI_HOST}:${OPENUI_PORT}/api/status-update" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    --max-time 2 2>&1) || true
fi

# Always exit successfully so we don't block Claude
exit 0
