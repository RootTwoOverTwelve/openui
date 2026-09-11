import { Hono } from "hono";
import type { Agent } from "../types";
import { sessions, createSession, deleteSession, buildLaunch, getUserShell, findClaudeSession } from "../services/sessionManager";
import { loadState, saveState, savePositions, getDataDir } from "../services/persistence";
import { debug } from "../services/log";
import {
  loadConfig,
  saveConfig,
  fetchTeams,
  fetchMyTickets,
  searchTickets,
  fetchTicketByIdentifier,
  validateApiKey,
  getCurrentUser,
} from "../services/linear";

const LAUNCH_CWD = process.env.LAUNCH_CWD || process.cwd();
const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);
const logError = QUIET ? () => {} : console.error.bind(console);

export const apiRoutes = new Hono();

apiRoutes.get("/config", (c) => {
  return c.json({ launchCwd: LAUNCH_CWD, dataDir: getDataDir() });
});

// Browse directories for file picker
apiRoutes.get("/browse", async (c) => {
  const { readdirSync, statSync } = await import("fs");
  const { join, resolve } = await import("path");
  const { homedir } = await import("os");

  let path = c.req.query("path") || LAUNCH_CWD;

  // Handle ~ for home directory
  if (path.startsWith("~")) {
    path = path.replace("~", homedir());
  }

  // Resolve to absolute path
  path = resolve(path);

  try {
    const entries = readdirSync(path, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => ({
        name: entry.name,
        path: join(path, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Get parent directory
    const parentPath = resolve(path, "..");

    return c.json({
      current: path,
      parent: parentPath !== path ? parentPath : null,
      directories,
    });
  } catch (e: any) {
    return c.json({ error: e.message, current: path }, 400);
  }
});

apiRoutes.get("/agents", (c) => {
  const agents: Agent[] = [
    {
      id: "claude",
      name: "Claude Code",
      command: "claude",
      description: "Anthropic's official CLI for Claude",
      color: "#F97316",
      icon: "sparkles",
    },
    {
      id: "opencode",
      name: "OpenCode",
      command: "opencode",
      description: "Open source AI coding assistant",
      color: "#22C55E",
      icon: "code",
    },
    {
      id: "ralph",
      name: "Ralph",
      command: "",
      description: "Autonomous dev loop (ralph, ralph-setup, ralph-import)",
      color: "#8B5CF6",
      icon: "brain",
    },
  ];
  return c.json(agents);
});

// Look up one Claude Code session by ID (for attaching an existing session)
apiRoutes.get("/claude/sessions/:id", (c) => {
  const id = c.req.param("id");
  const found = findClaudeSession(id);
  if (!found) return c.json({ found: false }, 404);
  let openInNodeId: string | undefined;
  for (const [, s] of sessions) {
    if (s.claudeSessionId === id) { openInNodeId = s.nodeId; break; }
  }
  return c.json({ found: true, ...found, openInNodeId });
});

apiRoutes.get("/sessions", (c) => {
  const sessionList = Array.from(sessions.entries()).map(([id, session]) => {
    return {
      sessionId: id,
      nodeId: session.nodeId,
      agentId: session.agentId,
      agentName: session.agentName,
      command: session.command,
      createdAt: session.createdAt,
      cwd: session.cwd,
      originalCwd: session.originalCwd, // Mother repo path when using worktrees
      gitBranch: session.gitBranch,
      status: session.status,
      customName: session.customName,
      customColor: session.customColor,
      notes: session.notes,
      isRestored: session.isRestored,
      ticketId: session.ticketId,
      ticketTitle: session.ticketTitle,
      claudeSessionId: session.claudeSessionId,
      initialPrompt: session.initialPrompt,
    };
  });
  return c.json(sessionList);
});

apiRoutes.get("/sessions/:sessionId/status", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  return c.json({ status: session.status, isRestored: session.isRestored });
});

apiRoutes.get("/state", (c) => {
  const state = loadState();
  const nodes = state.nodes.map(node => {
    const session = sessions.get(node.sessionId);
    return {
      ...node,
      status: session?.status || "disconnected",
      isAlive: !!session,
      isRestored: session?.isRestored,
    };
  }).filter(n => n.isAlive);
  return c.json({ nodes });
});

apiRoutes.post("/state/positions", async (c) => {
  const { positions } = await c.req.json();

  // Also update session positions in memory
  for (const [nodeId, pos] of Object.entries(positions)) {
    for (const [, session] of sessions) {
      if (session.nodeId === nodeId) {
        session.position = pos as { x: number; y: number };
        break;
      }
    }
  }

  // Save to disk
  savePositions(positions);
  return c.json({ success: true });
});

apiRoutes.post("/sessions", async (c) => {
  const body = await c.req.json();
  const {
    agentId,
    agentName,
    command,
    cwd,
    nodeId,
    customName,
    customColor,
    // Ticket and worktree options
    ticketId,
    ticketTitle,
    ticketUrl,
    branchName,
    baseBranch,
    createWorktree: createWorktreeFlag,
    initialPrompt,
    resumeClaudeSessionId,
  } = body;

  // One live process per Claude session: if it's already attached to a
  // node here, point the client at that node instead of spawning another.
  if (resumeClaudeSessionId) {
    for (const [existingId, s] of sessions) {
      if (s.claudeSessionId === resumeClaudeSessionId && s.pty) {
        return c.json({ error: "That Claude session is already running in OpenUI", sessionId: existingId, nodeId: s.nodeId }, 409);
      }
    }
  }

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const workingDir = cwd || LAUNCH_CWD;

  // Load ticket prompt template from Linear config
  const linearConfig = loadConfig();
  const ticketPromptTemplate = linearConfig.ticketPromptTemplate;

  const result = createSession({
    sessionId,
    agentId,
    agentName,
    command,
    cwd: workingDir,
    nodeId,
    customName,
    customColor,
    ticketId,
    ticketTitle,
    ticketUrl,
    branchName,
    baseBranch,
    createWorktreeFlag,
    ticketPromptTemplate,
    initialPrompt,
    resumeClaudeSessionId,
  });

  saveState(sessions);
  return c.json({
    sessionId,
    nodeId,
    cwd: result.cwd,
    gitBranch: result.gitBranch,
  });
});

apiRoutes.post("/sessions/:sessionId/restart", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);
  if (session.pty) return c.json({ error: "Session already running" }, 400);

  // Resume the previous Claude conversation if we know its ID and the
  // original command doesn't already pin one.
  const canResume =
    session.agentId === "claude" &&
    !!session.claudeSessionId &&
    !/--resume\b|--continue\b|(^|\s)-[cr]\b/.test(session.command);
  // On resume the conversation already has the initial prompt, so it is only
  // re-sent when we're starting the agent over from scratch.
  const launch = canResume
    ? { command: buildLaunch({ sessionId, agentId: session.agentId, command: `${session.command} --resume ${session.claudeSessionId}` }).command }
    : buildLaunch({ sessionId, agentId: session.agentId, command: session.command, initialPrompt: session.initialPrompt });

  const { spawn } = await import("bun-pty");
  const shell = getUserShell();
  const ptyProcess = spawn(shell.file, shell.args, {
    name: "xterm-256color",
    cwd: session.cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      // Pass our session ID so the plugin can include it in status updates
      OPENUI_SESSION_ID: sessionId,
    },
    rows: 30,
    cols: 120,
  });

  session.pty = ptyProcess;
  session.isRestored = false;
  session.status = "running";
  session.lastOutputTime = Date.now();
  // Drop the old process's scrollback: it is full of TUI control sequences
  // that would be replayed into the new shell. A resumed Claude session
  // re-renders its own conversation history anyway.
  session.outputBuffer = [];

  const resetInterval = setInterval(() => {
    if (!sessions.has(sessionId) || !session.pty) {
      clearInterval(resetInterval);
      return;
    }
    session.recentOutputSize = Math.max(0, session.recentOutputSize - 50);
  }, 500);

  ptyProcess.onData((data: string) => {
    session.outputBuffer.push(data);
    if (session.outputBuffer.length > 1000) {
      session.outputBuffer.shift();
    }

    session.lastOutputTime = Date.now();
    session.recentOutputSize += data.length;

    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "output", data }));
      }
    }
  });

  setTimeout(() => {
    ptyProcess.write(`${launch.command}\r`);
    if (launch.typedPrompt) {
      setTimeout(() => {
        ptyProcess.write(launch.typedPrompt + "\r");
      }, 2000);
    }
  }, 300);

  saveState(sessions);
  log(`\x1b[38;5;141m[session]\x1b[0m ${canResume ? "Resumed" : "Restarted"} ${sessionId}${canResume ? ` (claude: ${session.claudeSessionId})` : ""}`);
  return c.json({ success: true, resumed: canResume });
});

// Stop the PTY but keep the node, so the Claude session can be resumed
// elsewhere (a terminal) or back here later. Mirrors what a server restart
// does to a session.
apiRoutes.post("/sessions/:sessionId/detach", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);
  if (!session.pty) return c.json({ success: true, alreadyDetached: true });

  session.pty.kill();
  session.pty = null;
  session.isRestored = true;
  session.status = "disconnected";
  for (const client of session.clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: "status", status: session.status, isRestored: true }));
    }
  }
  saveState(sessions);
  log(`\x1b[38;5;141m[session]\x1b[0m Detached ${sessionId}${session.claudeSessionId ? ` (claude: ${session.claudeSessionId})` : ""}`);
  return c.json({ success: true });
});

apiRoutes.patch("/sessions/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  const updates = await c.req.json();
  if (updates.customName !== undefined) session.customName = updates.customName;
  if (updates.customColor !== undefined) session.customColor = updates.customColor;
  if (updates.notes !== undefined) session.notes = updates.notes;

  saveState(sessions);
  return c.json({ success: true });
});

apiRoutes.delete("/sessions/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const success = deleteSession(sessionId);

  if (success) {
    saveState(sessions);
    return c.json({ success: true });
  }
  return c.json({ error: "Session not found" }, 404);
});

// Status update endpoint for Claude Code plugin
apiRoutes.post("/status-update", async (c) => {
  const body = await c.req.json();
  const { status, openuiSessionId, claudeSessionId, cwd, hookEvent, toolName, stopReason, sessionSource } = body;

  // Log the full raw payload for debugging
  debug(`\x1b[38;5;82m[plugin-hook]\x1b[0m ${hookEvent || 'unknown'}: status=${status} tool=${toolName || 'none'} openui=${openuiSessionId || 'none'}${sessionSource ? ` source=${sessionSource}` : ''}`);
  debug(`\x1b[38;5;245m[plugin-raw]\x1b[0m ${JSON.stringify(body, null, 2)}`);

  if (!status) {
    return c.json({ error: "status is required" }, 400);
  }

  let session = null;

  // Primary: Use OpenUI session ID if provided (this is definitive)
  if (openuiSessionId) {
    session = sessions.get(openuiSessionId);
  }

  // Fallback: Try to match by Claude session ID (for older plugin versions)
  if (!session && claudeSessionId) {
    for (const [id, s] of sessions) {
      if (s.claudeSessionId === claudeSessionId) {
        session = s;
        break;
      }
    }
  }

  if (session) {
    // Store Claude session ID mapping if we have it. Latest wins so a
    // resumed/forked session stays resumable. Persist right away so it
    // survives an unclean shutdown before the next periodic save.
    if (claudeSessionId && session.claudeSessionId !== claudeSessionId) {
      session.claudeSessionId = claudeSessionId;
      saveState(sessions);
    }

    // No PTY means OpenUI isn't attached (detached, or restored after a
    // restart). Hooks from a dying process or a terminal copy of the same
    // session must not make the node look live here.
    if (!session.pty) {
      return c.json({ success: true, ignored: "detached" });
    }

    // Handle pre_tool/post_tool for permission detection
    let effectiveStatus = status;

    if (status === "pre_tool") {
      // PreToolUse fired - tool is about to run (or waiting for permission)
      // Stay as running, track the tool, and start a timer
      effectiveStatus = "running";
      session.currentTool = toolName;
      session.preToolTime = Date.now();

      // Clear any existing permission timeout
      if (session.permissionTimeout) {
        clearTimeout(session.permissionTimeout);
      }

      // If we don't get post_tool within 2.5 seconds, assume waiting for permission
      session.permissionTimeout = setTimeout(() => {
        // Only switch to waiting_input if we haven't received post_tool yet
        if (session.preToolTime) {
          session.status = "waiting_input";
          // Broadcast the status change
          for (const client of session.clients) {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: "status",
                status: "waiting_input",
                isRestored: session.isRestored,
                currentTool: session.currentTool,
                hookEvent: "permission_timeout",
              }));
            }
          }
        }
      }, 2500);
    } else if (status === "post_tool") {
      // PostToolUse fired - tool completed, clear the permission timeout
      effectiveStatus = "running";
      session.preToolTime = undefined;
      if (session.permissionTimeout) {
        clearTimeout(session.permissionTimeout);
        session.permissionTimeout = undefined;
      }
      // Keep currentTool to show what just ran
    } else {
      // For other statuses, clear tool tracking if not actively using tools
      if (status !== "tool_calling" && status !== "running") {
        session.currentTool = undefined;
      }
      session.preToolTime = undefined;
      if (session.permissionTimeout) {
        clearTimeout(session.permissionTimeout);
        session.permissionTimeout = undefined;
      }
    }

    session.status = effectiveStatus;
    session.pluginReportedStatus = true;
    session.lastPluginStatusTime = Date.now();
    session.lastHookEvent = hookEvent;

    // Broadcast status change to connected clients
    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: "status",
          status: session.status,
          isRestored: session.isRestored,
          currentTool: session.currentTool,
          hookEvent: hookEvent,
        }));
      }
    }

    return c.json({ success: true });
  }

  // No session found
  debug(`\x1b[38;5;141m[plugin]\x1b[0m Status update (no session): ${status} for openui:${openuiSessionId} claude:${claudeSessionId}`);
  return c.json({ success: true, warning: "No matching session found" });
});

// Categories (groups)
apiRoutes.get("/categories", (c) => {
  const state = loadState();
  return c.json(state.categories || []);
});

apiRoutes.post("/categories", async (c) => {
  const state = loadState();
  const category = await c.req.json();

  if (!state.categories) state.categories = [];
  state.categories.push(category);

  const { writeFileSync } = require("fs");
  const { join } = require("path");
  const DATA_DIR = join(process.env.LAUNCH_CWD || process.cwd(), ".openui");
  writeFileSync(join(DATA_DIR, "state.json"), JSON.stringify(state, null, 2));

  return c.json({ success: true });
});

apiRoutes.patch("/categories/:categoryId", async (c) => {
  const categoryId = c.req.param("categoryId");
  const updates = await c.req.json();
  const state = loadState();

  if (!state.categories) return c.json({ error: "Category not found" }, 404);

  const category = state.categories.find(cat => cat.id === categoryId);
  if (!category) return c.json({ error: "Category not found" }, 404);

  Object.assign(category, updates);

  const { writeFileSync } = require("fs");
  const { join } = require("path");
  const DATA_DIR = join(process.env.LAUNCH_CWD || process.cwd(), ".openui");
  writeFileSync(join(DATA_DIR, "state.json"), JSON.stringify(state, null, 2));

  return c.json({ success: true });
});

apiRoutes.delete("/categories/:categoryId", (c) => {
  const categoryId = c.req.param("categoryId");
  const state = loadState();

  if (!state.categories) return c.json({ error: "Category not found" }, 404);

  const index = state.categories.findIndex(cat => cat.id === categoryId);
  if (index === -1) return c.json({ error: "Category not found" }, 404);

  state.categories.splice(index, 1);

  const { writeFileSync } = require("fs");
  const { join } = require("path");
  const DATA_DIR = join(process.env.LAUNCH_CWD || process.cwd(), ".openui");
  writeFileSync(join(DATA_DIR, "state.json"), JSON.stringify(state, null, 2));

  return c.json({ success: true });
});

// ============ Linear Integration ============

// Default ticket prompt template
const DEFAULT_TICKET_PROMPT = "Here is the ticket for this session: {{url}}\n\nPlease use the Linear MCP tool or fetch the URL to read the full ticket details before starting work.";

// Get Linear config
apiRoutes.get("/linear/config", (c) => {
  const config = loadConfig();
  // Don't expose full API key, just whether it's set
  return c.json({
    hasApiKey: !!config.apiKey,
    defaultTeamId: config.defaultTeamId,
    defaultBaseBranch: config.defaultBaseBranch || "main",
    createWorktree: config.createWorktree ?? true,
    ticketPromptTemplate: config.ticketPromptTemplate || DEFAULT_TICKET_PROMPT,
  });
});

// Save Linear config
apiRoutes.post("/linear/config", async (c) => {
  const body = await c.req.json();
  const config = loadConfig();

  if (body.apiKey !== undefined) config.apiKey = body.apiKey;
  if (body.defaultTeamId !== undefined) config.defaultTeamId = body.defaultTeamId;
  if (body.defaultBaseBranch !== undefined) config.defaultBaseBranch = body.defaultBaseBranch;
  if (body.createWorktree !== undefined) config.createWorktree = body.createWorktree;
  if (body.ticketPromptTemplate !== undefined) config.ticketPromptTemplate = body.ticketPromptTemplate;

  saveConfig(config);
  return c.json({ success: true });
});

// Validate API key
apiRoutes.post("/linear/validate", async (c) => {
  const { apiKey } = await c.req.json();
  if (!apiKey) return c.json({ valid: false, error: "No API key provided" });

  try {
    const valid = await validateApiKey(apiKey);
    if (valid) {
      const user = await getCurrentUser(apiKey);
      return c.json({ valid: true, user });
    }
    return c.json({ valid: false, error: "Invalid API key" });
  } catch (e: any) {
    return c.json({ valid: false, error: e.message });
  }
});

// Get Linear teams
apiRoutes.get("/linear/teams", async (c) => {
  const config = loadConfig();
  if (!config.apiKey) return c.json({ error: "Linear not configured" }, 400);

  try {
    const teams = await fetchTeams(config.apiKey);
    return c.json(teams);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Get my tickets
apiRoutes.get("/linear/tickets", async (c) => {
  debug(`\x1b[38;5;141m[api]\x1b[0m GET /linear/tickets called`);
  const config = loadConfig();
  debug(`\x1b[38;5;141m[api]\x1b[0m Config loaded, hasApiKey:`, !!config.apiKey);

  if (!config.apiKey) {
    debug(`\x1b[38;5;141m[api]\x1b[0m No API key, returning 400`);
    return c.json({ error: "Linear not configured" }, 400);
  }

  const teamId = c.req.query("teamId") || config.defaultTeamId;
  debug(`\x1b[38;5;141m[api]\x1b[0m TeamId:`, teamId || "(none)");

  try {
    const tickets = await fetchMyTickets(config.apiKey, teamId);
    debug(`\x1b[38;5;141m[api]\x1b[0m Returning ${tickets.length} tickets`);
    return c.json(tickets);
  } catch (e: any) {
    logError(`\x1b[38;5;141m[api]\x1b[0m Error fetching tickets:`, e.message);
    return c.json({ error: e.message }, 500);
  }
});

// Search tickets
apiRoutes.get("/linear/search", async (c) => {
  const config = loadConfig();
  if (!config.apiKey) return c.json({ error: "Linear not configured" }, 400);

  const query = c.req.query("q");
  if (!query) return c.json({ error: "Search query required" }, 400);

  const teamId = c.req.query("teamId") || config.defaultTeamId;

  try {
    const tickets = await searchTickets(config.apiKey, query, teamId);
    return c.json(tickets);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Get ticket by identifier
apiRoutes.get("/linear/ticket/:identifier", async (c) => {
  const config = loadConfig();
  if (!config.apiKey) return c.json({ error: "Linear not configured" }, 400);

  const identifier = c.req.param("identifier");

  try {
    const ticket = await fetchTicketByIdentifier(config.apiKey, identifier);
    if (!ticket) return c.json({ error: "Ticket not found" }, 404);
    return c.json(ticket);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ============ GitHub Integration ============
import {
  fetchGitHubIssues,
  fetchGitHubIssue,
  searchGitHubIssues,
  parseGitHubUrl,
} from "../services/github";

// Get issues from a GitHub repo (no auth needed for public repos)
apiRoutes.get("/github/issues", async (c) => {
  const owner = c.req.query("owner");
  const repo = c.req.query("repo");
  const repoUrl = c.req.query("repoUrl");

  let resolvedOwner = owner;
  let resolvedRepo = repo;

  // If repoUrl provided, parse it
  if (repoUrl && !owner && !repo) {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return c.json({ error: "Invalid GitHub URL" }, 400);
    }
    resolvedOwner = parsed.owner;
    resolvedRepo = parsed.repo;
  }

  if (!resolvedOwner || !resolvedRepo) {
    return c.json({ error: "owner and repo are required (or provide repoUrl)" }, 400);
  }

  try {
    const issues = await fetchGitHubIssues(resolvedOwner, resolvedRepo);
    return c.json(issues);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Search GitHub issues
apiRoutes.get("/github/search", async (c) => {
  const owner = c.req.query("owner");
  const repo = c.req.query("repo");
  const q = c.req.query("q");

  if (!owner || !repo) {
    return c.json({ error: "owner and repo are required" }, 400);
  }
  if (!q) {
    return c.json({ error: "Search query (q) is required" }, 400);
  }

  try {
    const issues = await searchGitHubIssues(owner, repo, q);
    return c.json(issues);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Get single GitHub issue
apiRoutes.get("/github/issue/:owner/:repo/:number", async (c) => {
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = parseInt(c.req.param("number"), 10);

  if (isNaN(number)) {
    return c.json({ error: "Invalid issue number" }, 400);
  }

  try {
    const issue = await fetchGitHubIssue(owner, repo, number);
    if (!issue) return c.json({ error: "Issue not found" }, 404);
    return c.json(issue);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
