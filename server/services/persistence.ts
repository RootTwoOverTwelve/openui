import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import type { PersistedState, Session } from "../types";
import { debug } from "./log";

// Use local .openui folder where user ran openui from
const LAUNCH_CWD = process.env.LAUNCH_CWD || process.cwd();
const DATA_DIR = join(LAUNCH_CWD, ".openui");
const STATE_FILE = join(DATA_DIR, "state.json");
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
    nodes: [],
    categories: savedState.categories || [],
  };

  for (const [sessionId, session] of sessions) {
    // Preserve existing position if we have one
    const existingNode = savedState.nodes.find(n => n.sessionId === sessionId);

    state.nodes.push({
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
      icon: session.icon,
      position: session.position || existingNode?.position || { x: 0, y: 0 },
      claudeSessionId: session.claudeSessionId,
      initialPrompt: session.initialPrompt,
    });

    saveBuffer(sessionId, session.outputBuffer);
  }

  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

export function savePositions(positions: Record<string, { x: number; y: number }>) {
  ensureDirs();
  const state = loadState();

  let updated = 0;
  for (const [nodeId, pos] of Object.entries(positions)) {
    const node = state.nodes.find(n => n.nodeId === nodeId);
    if (node) {
      node.position = pos;
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

export function getDataDir() {
  return DATA_DIR;
}
