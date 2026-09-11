# OpenUI Status Plugin for Claude Code

Reports Claude Code agent status to OpenUI in real-time for accurate status display (Working, Using Tools, Idle, etc.).

## Installation

**Automatic:** OpenUI automatically pulls and installs this plugin when you run it. No manual installation required.

**Manual (if needed):**
```bash
curl -fsSL https://raw.githubusercontent.com/RootTwoOverTwelve/openui/main/claude-code-plugin/install.sh | bash
```

This installs to `~/.openui/claude-code-plugin/`. OpenUI automatically uses it when starting Claude agents.

## How It Works

The plugin uses Claude Code hooks to report status:

| Hook Event | Status |
|------------|--------|
| `SessionStart` | `starting` |
| `UserPromptSubmit` | `running` |
| `PreToolUse` | `tool_calling` |
| `PostToolUse` | `running` |
| `Stop` | `idle` |
| `Notification` (idle_prompt) | `waiting_input` |
| `SessionEnd` | `disconnected` |

## Configuration

The plugin sends status to `localhost:4242` by default. To change:

```bash
export OPENUI_HOST=localhost
export OPENUI_PORT=4242
```

## Verify Installation

In Claude Code:
```
/plugins
```

You should see `openui-status` listed.

## Troubleshooting

1. Check plugin is loaded: `/plugins`
2. Check OpenUI is running on port 4242
3. Check OpenUI server logs for `[plugin]` messages

## Uninstall

**Marketplace install:**
```
/plugin uninstall openui-status@openui-plugins
```

**Curl install:**
```bash
rm -rf ~/.openui/claude-code-plugin
```
