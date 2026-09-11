import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// Claude Code writes each subagent's conversation beside the parent's
// transcript: <transcript dir>/<sessionId>/subagents/agent-<id>.jsonl, with
// an agent-<id>.meta.json describing what the parent asked for.

export interface SubagentSummary {
  agentId: string;
  description: string;
  agentType: string;
  model?: string;
  startedAt: string;
  lastActive: string;
  running: boolean;
  turns: number;
  tokens: number;   // last prompt size, same measure as the main context bar
}

export interface SubagentMessage {
  role: "user" | "assistant" | "tool" | "result";
  text: string;
  ts?: string;
}

const RUNNING_WINDOW_MS = 12_000;
const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

function subagentsDir(transcriptPath: string): string | null {
  const dir = transcriptPath.replace(/\.jsonl$/, "") + "/subagents";
  return existsSync(dir) ? dir : null;
}

function readRecords(file: string): any[] {
  const out: any[] = [];
  let raw: string;
  try { raw = readFileSync(file, "utf-8"); } catch { return out; }
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

function textOf(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

// One line for a tool call, enough to follow along without the payload
function describeToolUse(block: any): string {
  const input = block.input || {};
  const name = block.name || "tool";
  const arg =
    input.command || input.file_path || input.pattern || input.path || input.query || input.url ||
    input.description || input.prompt || "";
  const short = String(arg).replace(/\s+/g, " ").slice(0, 120);
  return short ? `${name}: ${short}` : name;
}

export function listSubagents(transcriptPath?: string): SubagentSummary[] {
  if (!transcriptPath) return [];
  const dir = subagentsDir(transcriptPath);
  if (!dir) return [];
  const now = Date.now();
  const items: SubagentSummary[] = [];

  for (const name of readdirSync(dir)) {
    const m = name.match(/^agent-(.+)\.jsonl$/);
    if (!m) continue;
    const agentId = m[1];
    const file = join(dir, name);
    let meta: any = {};
    try { meta = JSON.parse(readFileSync(join(dir, `agent-${agentId}.meta.json`), "utf-8")); } catch {}

    let st;
    try { st = statSync(file); } catch { continue; }
    const records = readRecords(file);
    const turns = records.filter((r) => r.type === "assistant").length;
    let tokens = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      const u = records[i]?.message?.usage;
      if (records[i].type === "assistant" && u) {
        tokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        break;
      }
    }
    const first = records.find((r) => r.timestamp)?.timestamp;

    items.push({
      agentId,
      description: meta.description || "Subagent",
      agentType: meta.agentType || "general-purpose",
      model: meta.model,
      startedAt: first || st.birthtime.toISOString(),
      lastActive: st.mtime.toISOString(),
      running: now - st.mtimeMs < RUNNING_WINDOW_MS,
      turns,
      tokens,
    });
  }

  return items.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function readSubagentTranscript(transcriptPath: string, agentId: string): SubagentMessage[] | null {
  if (!ID_RE.test(agentId)) return null;
  const dir = subagentsDir(transcriptPath);
  if (!dir) return null;
  const file = join(dir, `agent-${agentId}.jsonl`);
  if (!existsSync(file)) return null;

  const out: SubagentMessage[] = [];
  for (const rec of readRecords(file)) {
    if (rec.isMeta) continue;
    const content = rec.message?.content;
    if (rec.type === "user") {
      // Tool results come back as user records
      if (Array.isArray(content) && content.some((b) => b?.type === "tool_result")) {
        for (const b of content) {
          if (b?.type !== "tool_result") continue;
          const body = textOf(b.content) || (typeof b.content === "string" ? b.content : "");
          const lines = body.split("\n").length;
          out.push({ role: "result", text: body.length > 600 ? `${body.slice(0, 600)}\n… (${lines} lines)` : body, ts: rec.timestamp });
        }
        continue;
      }
      const text = textOf(content);
      if (text) out.push({ role: "user", text, ts: rec.timestamp });
    } else if (rec.type === "assistant") {
      const text = textOf(content);
      if (text) out.push({ role: "assistant", text, ts: rec.timestamp });
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === "tool_use") out.push({ role: "tool", text: describeToolUse(b), ts: rec.timestamp });
        }
      }
    }
  }
  return out;
}

// Cheap enough for the 1s session poll: one readdir + a stat per agent
export function subagentCounts(transcriptPath?: string): { total: number; running: number } | undefined {
  if (!transcriptPath) return undefined;
  const dir = subagentsDir(transcriptPath);
  if (!dir) return undefined;
  const now = Date.now();
  let total = 0, running = 0;
  for (const name of readdirSync(dir)) {
    if (!/^agent-.+\.jsonl$/.test(name)) continue;
    total++;
    try {
      if (now - statSync(join(dir, name)).mtimeMs < RUNNING_WINDOW_MS) running++;
    } catch {}
  }
  return total ? { total, running } : undefined;
}
