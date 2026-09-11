import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, cpSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { PersistedState, PersistedNode, Session } from "../types";
import { debug } from "./log";

// One canvas regardless of where openui is launched from: the workspace
// lives under ~/.openui/workspaces/<name> (default "default"). The launch
// directory is only the default cwd for new agents. OPENUI_DATA_DIR
// overrides the location outright.
const LAUNCH_CWD = process.env.LAUNCH_CWD || process.cwd();
export const WORKSPACE = process.env.OPENUI_WORKSPACE || "default";
const DATA_DIR =
  process.env.OPENUI_DATA_DIR || join(homedir(), ".openui", "workspaces", WORKSPACE);
const STATE_FILE = join(DATA_DIR, "state.json");

// Earlier versions kept state in <launch dir>/.openui. Bring it across the
// first time the global workspace is empty; the original is left in place.
export function importLegacyState(): string | null {
  const legacyDir = join(LAUNCH_CWD, ".openui");
  if (legacyDir === DATA_DIR) return null;
  if (existsSync(STATE_FILE) || !existsSync(join(legacyDir, "state.json"))) return null;
  ensureDirs();
  for (const entry of ["state.json", "config.json", ".env", "buffers", "prompts"]) {
    const src = join(legacyDir, entry);
    if (existsSync(src)) {
      try { cpSync(src, join(DATA_DIR, entry), { recursive: true }); } catch (e) { console.error(`Failed to import ${entry}:`, e); }
    }
  }
  return legacyDir;
}
const BUFFERS_DIR = join(DATA_DIR, "buffers");
const PROMPTS_DIR = join(DATA_DIR, "prompts");

// Ensure directories exist
function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(BUFFERS_DIR)) mkdirSync(BUFFERS_DIR, { recursive: true });
  if (!existsSync(PROMPTS_DIR)) mkdirSync(PROMPTS_DIR, { recursive: true });
}

export function loadState(): PersistedState {
  ensureDirs();
  try {
    if (existsSync(STATE_FILE)) {
      const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      debug(`\x1b[38;5;245m[persistence]\x1b[0m Loaded state from ${STATE_FILE}`);
      return data;
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
  return { nodes: [] };
}

export function saveState(sessions: Map<string, Session>) {
  ensureDirs();
  const savedState = loadState();

  // Preserve categories from existing state
  const state: PersistedState = {
    nodes: savedState.nodes.filter(n => n.archivedAt),
    categories: savedState.categories || [],
  };

  for (const [sessionId, session] of sessions) {
    // Preserve existing position if we have one
    const existingNode = savedState.nodes.find(n => n.sessionId === sessionId);
    state.nodes.push(sessionToNode(sessionId, session, existingNode));
    saveBuffer(sessionId, session.outputBuffer);
  }

  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

export type NodePlacement = { x: number; y: number; parentId?: string | null };

export function sessionToNode(sessionId: string, session: Session, existing?: PersistedNode): PersistedNode {
  return {
    nodeId: session.nodeId,
    sessionId,
    agentId: session.agentId,
    agentName: session.agentName,
    command: session.command,
    cwd: session.cwd,
    createdAt: session.createdAt,
    customName: session.customName,
    customColor: session.customColor,
    notes: session.notes,
    position: session.position || existing?.position || { x: 0, y: 0 },
    parentId: session.parentId,
    claudeSessionId: session.claudeSessionId,
    initialPrompt: session.initialPrompt,
    systemPrompt: session.systemPrompt,
    forkedFrom: session.forkedFrom,
    forkKind: session.forkKind,
    transcriptPath: session.transcriptPath,
    model: session.model,
  };
}

export function savePositions(positions: Record<string, NodePlacement>) {
  ensureDirs();
  const state = loadState();

  let updated = 0;
  for (const [nodeId, pos] of Object.entries(positions)) {
    const node = state.nodes.find(n => n.nodeId === nodeId);
    if (node) {
      node.position = { x: pos.x, y: pos.y };
      node.parentId = pos.parentId || undefined;
      updated++;
    } else {
      debug(`\x1b[38;5;245m[persistence]\x1b[0m Node ${nodeId} not found in state`);
    }
  }

  if (updated > 0) {
    try {
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      debug(`\x1b[38;5;245m[persistence]\x1b[0m Saved ${updated} positions to ${STATE_FILE}`);
    } catch (e) {
      console.error("Failed to save positions:", e);
    }
  }
}

export function saveBuffer(sessionId: string, buffer: string[]) {
  ensureDirs();
  const bufferFile = join(BUFFERS_DIR, `${sessionId}.txt`);
  try {
    writeFileSync(bufferFile, buffer.join(""));
  } catch (e) {
    console.error("Failed to save buffer:", e);
  }
}

export function loadBuffer(sessionId: string): string[] {
  ensureDirs();
  const bufferFile = join(BUFFERS_DIR, `${sessionId}.txt`);
  try {
    if (existsSync(bufferFile)) {
      return [readFileSync(bufferFile, "utf-8")];
    }
  } catch (e) {
    console.error("Failed to load buffer:", e);
  }
  return [];
}

// The initial prompt is handed to the agent via a file so it survives
// shell parsing intact (multi-line text, quotes, $, backticks).
export function writePromptFile(sessionId: string, prompt: string): string {
  ensureDirs();
  const promptFile = join(PROMPTS_DIR, `${sessionId}.txt`);
  writeFileSync(promptFile, prompt);
  return promptFile;
}

export function removePromptFile(sessionId: string) {
  const promptFile = join(PROMPTS_DIR, `${sessionId}.txt`);
  try {
    if (existsSync(promptFile)) unlinkSync(promptFile);
  } catch (e) {
    console.error("Failed to remove prompt file:", e);
  }
}

export function writeState(state: PersistedState) {
  ensureDirs();
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

export function getDataDir() {
  return DATA_DIR;
}
