import type { IPty } from "bun-pty";
import type { ServerWebSocket } from "bun";

export type AgentStatus = "running" | "waiting_input" | "tool_calling" | "idle" | "disconnected" | "error";

export interface Session {
  pty: IPty | null;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  originalCwd?: string; // The mother repo path when using worktrees
  gitBranch?: string;
  worktreePath?: string;
  createdAt: string;
  clients: Set<ServerWebSocket<WebSocketData>>;
  outputBuffer: string[];
  status: AgentStatus;
  lastOutputTime: number;
  lastInputTime: number;
  recentOutputSize: number;
  customName?: string;
  customColor?: string;
  notes?: string;
  nodeId: string;
  isRestored?: boolean;
  position?: { x: number; y: number };
  // Category this node sits in; position is then relative to it
  parentId?: string;
  // Linear ticket info
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
  // Plugin-reported status
  pluginReportedStatus?: boolean;
  lastPluginStatusTime?: number;
  // Claude Code's internal session ID (different from our sessionId)
  claudeSessionId?: string;
  // Optional first message, sent once when the session is first spawned
  initialPrompt?: string;
  // Standing context appended to the system prompt on every launch
  systemPrompt?: string;
  // Fork lineage
  forkedFrom?: ForkOrigin;
  forkKind?: ForkKind;
  // Heads-up for the parent, held until this fork has booted (in-memory only)
  pendingParentNotice?: { parentSessionId: string; text: string; expiry: ReturnType<typeof setTimeout> };
  // Current tool being used (from plugin)
  currentTool?: string;
  // Last hook event received
  lastHookEvent?: string;
  // Permission detection
  preToolTime?: number;
  permissionTimeout?: ReturnType<typeof setTimeout>;
}

export type ForkKind = "consult" | "develop";

export interface ForkOrigin {
  sessionId: string;
  claudeSessionId?: string;
  name?: string;
  at: string;
}

export interface LinearTicket {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: { name: string; color: string };
  priority: number;
  assignee?: { name: string };
  team?: { name: string; key: string };
}

export interface LinearConfig {
  apiKey?: string;
  defaultTeamId?: string;
  defaultBaseBranch?: string;
  createWorktree?: boolean;
  ticketPromptTemplate?: string;
}

export interface PersistedNode {
  nodeId: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  createdAt: string;
  customName?: string;
  customColor?: string;
  notes?: string;
  position: { x: number; y: number };
  parentId?: string;
  // Claude Code's internal session ID, used for `claude --resume`
  claudeSessionId?: string;
  initialPrompt?: string;
  systemPrompt?: string;
  forkedFrom?: ForkOrigin;
  forkKind?: ForkKind;
  // Archived: off the canvas and out of the live session map, but kept
  // so it can be restored without re-entering the Claude session ID
  archivedAt?: string;
}

export interface PersistedCategory {
  id: string;
  label: string;
  color: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

export interface PersistedState {
  nodes: PersistedNode[];
  categories?: PersistedCategory[];
}

export interface Agent {
  id: string;
  name: string;
  command: string;
  description: string;
  color: string;
  icon: string;
}

export interface WebSocketData {
  sessionId: string;
}
