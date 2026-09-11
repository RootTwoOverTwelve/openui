import { create } from "zustand";
import { Node } from "@xyflow/react";

export interface Agent {
  id: string;
  name: string;
  command: string;
  description: string;
  color: string;
  icon: string;
}

export type AgentStatus = "running" | "waiting_input" | "tool_calling" | "idle" | "disconnected" | "error";

// Session panel width, persisted per browser
export const SIDEBAR_WIDTH_KEY = "openui-sidebar-width";
export const SIDEBAR_DEFAULT_WIDTH = 512;
export const SIDEBAR_MIN_WIDTH = 360;

export function clampSidebarWidth(width: number): number {
  const max = Math.max(SIDEBAR_MIN_WIDTH, Math.floor(window.innerWidth * 0.8));
  return Math.min(max, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function loadSidebarWidth(): number {
  try {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (saved >= SIDEBAR_MIN_WIDTH) return clampSidebarWidth(saved);
  } catch {}
  return SIDEBAR_DEFAULT_WIDTH;
}

export interface AgentSession {
  id: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  color: string;
  createdAt: string;
  cwd: string;
  originalCwd?: string; // Mother repo path when using worktrees
  gitBranch?: string;
  status: AgentStatus;
  customName?: string;
  customColor?: string;
  notes?: string;
  isRestored?: boolean;
  // Linear ticket info
  ticketId?: string;
  ticketTitle?: string;
  // Current tool being used (from plugin)
  currentTool?: string;
  // Claude Code's internal session ID (enables resume)
  claudeSessionId?: string;
  // First message sent when the session was spawned
  initialPrompt?: string;
  // Standing context appended to the system prompt on every launch
  systemPrompt?: string;
  // Fork lineage
  forkedFrom?: { sessionId: string; claudeSessionId?: string; name?: string; at: string };
  forkKind?: "consult" | "develop";
  model?: string;
  // Live context size vs the model's window, read from the transcript
  contextUsage?: { tokens: number; limit: number; pct: number; at: string };
}

interface AppState {
  // Config
  launchCwd: string;
  setLaunchCwd: (cwd: string) => void;

  // Agents
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;

  // Sessions / Nodes
  sessions: Map<string, AgentSession>;
  addSession: (nodeId: string, session: AgentSession) => void;
  updateSession: (nodeId: string, updates: Partial<AgentSession>) => void;
  removeSession: (nodeId: string) => void;

  // Canvas
  nodes: Node[];
  setNodes: (nodes: Node[]) => void;
  addNode: (node: Node) => void;
  updateNode: (nodeId: string, updates: Partial<Node>) => void;
  removeNode: (nodeId: string) => void;

  // UI State
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number | ((w: number) => number)) => void;
  sidebarResizing: boolean;
  setSidebarResizing: (resizing: boolean) => void;
  archivedCount: number;
  refreshArchivedCount: () => Promise<void>;
  archiveModalOpen: boolean;
  setArchiveModalOpen: (open: boolean) => void;
  forkForNodeId: string | null;
  setForkForNodeId: (id: string | null) => void;
  addAgentModalOpen: boolean;
  setAddAgentModalOpen: (open: boolean) => void;
  newSessionModalOpen: boolean;
  setNewSessionModalOpen: (open: boolean) => void;
  newSessionForNodeId: string | null;
  setNewSessionForNodeId: (nodeId: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  // Config
  launchCwd: "",
  setLaunchCwd: (cwd) => set({ launchCwd: cwd }),

  // Agents
  agents: [],
  setAgents: (agents) => set({ agents }),

  // Sessions
  sessions: new Map(),
  addSession: (nodeId, session) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.set(nodeId, session);
      return { sessions: newSessions };
    }),
  updateSession: (nodeId, updates) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      const session = newSessions.get(nodeId);
      if (session) {
        newSessions.set(nodeId, { ...session, ...updates });
      }
      return { sessions: newSessions };
    }),
  removeSession: (nodeId) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.delete(nodeId);
      return { sessions: newSessions };
    }),

  // Canvas
  nodes: [],
  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNode: (nodeId, updates) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...updates } : n
      ),
    })),
  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
    })),

  // UI State
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  sidebarWidth: loadSidebarWidth(),
  setSidebarWidth: (width) =>
    set((state) => ({
      sidebarWidth: clampSidebarWidth(typeof width === "function" ? width(state.sidebarWidth) : width),
    })),
  sidebarResizing: false,
  setSidebarResizing: (resizing) => set({ sidebarResizing: resizing }),
  archivedCount: 0,
  refreshArchivedCount: async () => {
    try {
      const res = await fetch("/api/sessions/archived");
      if (res.ok) set({ archivedCount: (await res.json()).length });
    } catch {}
  },
  archiveModalOpen: false,
  setArchiveModalOpen: (open) => set({ archiveModalOpen: open }),
  forkForNodeId: null,
  setForkForNodeId: (id) => set({ forkForNodeId: id }),
  addAgentModalOpen: false,
  setAddAgentModalOpen: (open) => set({ addAgentModalOpen: open }),
  newSessionModalOpen: false,
  setNewSessionModalOpen: (open) => set({ newSessionModalOpen: open }),
  newSessionForNodeId: null,
  setNewSessionForNodeId: (nodeId) => set({ newSessionForNodeId: nodeId }),
}));
