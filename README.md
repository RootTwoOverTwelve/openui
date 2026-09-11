# OpenUI

https://github.com/user-attachments/assets/0a1979ab-f093-447d-8fe7-bcf6830051ee

A canvas for running several AI coding agents in parallel. Each agent is a node with a live terminal, status, and context usage; drag them into groups, fork them, archive them, and pick any of them back up after a restart.

This is a personal fork of [Fallomai/openui](https://github.com/Fallomai/openui). It is not published to npm and is not meant to be merged back. See [What this fork adds](#what-this-fork-adds).

## Installation

Requires [Bun](https://bun.sh) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) on your PATH.

```bash
git clone https://github.com/RootTwoOverTwelve/openui.git
cd openui
bun install
cd client && bun install && cd ..
bun run build          # builds the web client into client/dist

bun link               # makes the `openui` command available globally
```

`bun link` puts the command in `~/.bun/bin`. If `which openui` comes back empty, add that directory to your PATH:

```bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc && exec zsh
```

To update: `git pull && bun run build`.

## Quick start

```bash
cd your-project
openui
```

The browser opens at `http://localhost:6969`. **New Agent** spawns a Claude Code session in that directory; click a node to open its terminal.

There is one canvas no matter where you launch from: state lives in `~/.openui/workspaces/default/`, and the launch directory is only the default working directory for new agents — so you can run agents rooted anywhere in a monorepo, or in different repos, from one screen. `openui --workspace <name>` opens a separate canvas. (State from an older `<project>/.openui/` is imported automatically the first time and left in place.)

The server binds to `127.0.0.1` only and rejects requests from other origins, so it is not reachable from other machines or from other web pages.

On first run the Claude Code plugin is copied to `~/.openui/claude-code-plugin/` — it reports status, context, and briefings back to OpenUI through Claude Code hooks. It is only fetched when missing, so after pulling a change to `claude-code-plugin/hooks/`, re-sync it by hand:

```bash
cp claude-code-plugin/hooks/* ~/.openui/claude-code-plugin/hooks/
```

## What this fork adds

**Sessions survive everything.** Claude Code's session ID is captured from the plugin hooks and persisted, so after a server restart or a closed laptop every node comes back **Disconnected** with a one-click **Resume** that continues the same conversation (`claude --resume`). State is saved on SIGINT, SIGTERM and SIGHUP.

**Move between OpenUI and a terminal.** Each panel shows the exact `cd … && claude --resume <id>` command with **Copy** and **Hand off to terminal** (which stops the process here first, so only one process ever runs a session). The reverse works too: **New Agent** accepts an existing Claude session ID and attaches to it.

**Fork a session.** Right-click → **Fork…** starts a new agent with the parent's full conversation under a new session ID (`--fork-session`); the parent keeps running. Two kinds: *Consult* (brainstorm/research, read-only by convention) and *Develop* (will edit, warned about sharing a worktree). The fork's briefing is delivered through the plugin's `SessionStart` hook so it survives restarts and compaction, and the optional heads-up to the parent is sent only after the fork has booted so the fork can't inherit it.

**Archive.** Right-click → **Archive** parks a session off the canvas; the header's archive button lists them with **Restore** and **Delete**. Delete only removes OpenUI's record — Claude Code's transcript is never touched.

**Real groups.** Drop an agent into a category and it moves with the category. Positions are stored absolute on disk with the group as an annotation, so nothing can ever be displaced by a lost link.

**At-a-glance load.** Every card shows a **Context** bar (read from the transcript: exactly what `/compact` acts on) and a subagent badge. The panel has a tab strip for a session's subagents with a read-only, live-updating view of each one's transcript.

**One canvas, any directory.** State is global (`~/.openui/workspaces/`), not per launch directory; `--workspace` for separate canvases.

**Quality of life.** Resizable panel with the canvas buttons sliding out of its way; optional initial prompt when spawning; the open session in the URL (`#/session/<id>`); pan/zoom and layout persisted; collapsible details footer; `OPENUI_DEBUG=1` for verbose logs (raw hook payloads are no longer logged by default, nor written to `/tmp`).

## Development

```bash
bun run dev      # server on 6968 with --watch, Vite UI on 6969 proxying to it
bun run start    # production: serves the built client on 6969
```

`bun run dev` restarts the server on every server-file save, which kills every agent PTY. When developing OpenUI *from inside* OpenUI, use `bun run start` and restart it by hand between server changes; client changes only need `bun run build` and a reload.

The plugin is loaded from `~/.openui/claude-code-plugin/` if present, else from the repo's `claude-code-plugin/`.

## Tech stack

Bun · Hono · bun-pty · React · React Flow · xterm.js · Zustand

## License

MIT
