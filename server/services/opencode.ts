import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";
import type { AgentStatus, Session } from "../types";
import { debug } from "./log";

// OpenCode integration.
//
// Everything the Claude Code path has to reverse-engineer — status from
// plugin hooks, context size from scraping a transcript tail, compaction
// from parsing boundary records, forking by re-launching the CLI — OpenCode
// publishes as a documented HTTP API on its background service. So instead
// of hooks we subscribe to its event stream and write the *same* session
// fields the Claude hooks write (`status`, `contextUsage`, `model`), which
// means the cards, pips and context bars light up without knowing which
// agent they're looking at.
//
// The session ID is ours: `opencode --session <id>` continues that session
// or creates it if it doesn't exist, so one flag covers both start and
// resume and there is nothing to discover after launch.

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? (..._args: unknown[]) => {} : console.log.bind(console);

interface Service {
  url: string;
  password: string;
}

let cached: Service | null = null;
let cachedAt = 0;
// Long, because a port change announces itself: any failed request clears
// the cache, so the next call re-reads `service status` anyway. Shorter
// would only mean spawning that process under the status poll for nothing.
const SERVICE_TTL = 600_000;

// The background service picks a port at startup and records the password
// in the user's config. `opencode service status` prints the URL, and
// starts the service if it isn't running.
function resolveService(): Service | null {
  if (cached && Date.now() - cachedAt < SERVICE_TTL) return cached;
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), ".config", "opencode", "service.json"), "utf-8"));
    if (!cfg?.password) return null;
    const out = execSync("opencode service status", { encoding: "utf-8", timeout: 8000 }).trim();
    const url = out.split("\n")[0]!.trim();
    if (!/^https?:\/\//.test(url)) return null;
    cached = { url, password: cfg.password };
    cachedAt = Date.now();
    return cached;
  } catch {
    return null;
  }
}

export function isOpencodeAvailable(): boolean {
  return resolveService() !== null;
}

function authHeader(svc: Service): string {
  return `Basic ${Buffer.from(`opencode:${svc.password}`).toString("base64")}`;
}

async function call(path: string, init: RequestInit = {}): Promise<any | null> {
  const svc = resolveService();
  if (!svc) return null;
  try {
    const res = await fetch(`${svc.url}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(svc),
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      debug(`[opencode] ${init.method || "GET"} ${path} -> ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    debug(`[opencode] ${init.method || "GET"} ${path} failed: ${e}`);
    // The service may have been restarted on a new port
    cached = null;
    return null;
  }
}

// Our OpenUI session id is not a legal OpenCode id, which must start "ses".
export function opencodeSessionId(sessionId: string): string {
  return `ses_${sessionId.replace(/[^A-Za-z0-9]/g, "")}`;
}

// Copy a session's history into a new one. Without `before` the whole
// history is copied; with it, everything up to (not including) that message
// — a fork point Claude Code cannot express.
export async function forkOpencodeSession(parentId: string, before?: string): Promise<string | null> {
  const body = await call(`/api/session/${encodeURIComponent(parentId)}/fork`, {
    method: "POST",
    body: JSON.stringify(before ? { before } : {}),
  });
  return body?.data?.id || null;
}

// Send a message without typing into the terminal. Returns true if queued.
export async function promptOpencodeSession(id: string, text: string): Promise<boolean> {
  const body = await call(`/api/session/${encodeURIComponent(id)}/prompt`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return !!body?.data;
}

export async function compactOpencodeSession(id: string): Promise<boolean> {
  const body = await call(`/api/session/${encodeURIComponent(id)}/compact`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return !!body?.data;
}

// Context windows come from the model catalogue rather than being guessed
// from the model name, so there is no [1m]-style marker to sniff for.
const limits = new Map<string, number>();
let limitsLoadedAt = 0;

async function loadLimits(): Promise<void> {
  if (limits.size && Date.now() - limitsLoadedAt < 300_000) return;
  const body = await call("/api/model");
  if (!body) return;
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const rec = node as Record<string, any>;
    const context = rec.limit?.context;
    if (typeof rec.id === "string" && typeof rec.providerID === "string" && typeof context === "number") {
      limits.set(`${rec.providerID}/${rec.id}`, context);
    }
    for (const value of Object.values(rec)) walk(value);
  };
  walk(body.data ?? body);
  limitsLoadedAt = Date.now();
  debug(`[opencode] loaded ${limits.size} model context limits`);
}

function limitFor(model: { providerID?: string; id?: string } | undefined): number {
  if (!model?.providerID || !model.id) return 200_000;
  return limits.get(`${model.providerID}/${model.id}`) || 200_000;
}

// Step events report tokens but not which model produced them, and the model
// can be switched mid-session from the TUI, so the session record is the
// source of truth. Cached briefly to keep this to one request per turn.
interface CachedModel {
  model?: { providerID: string; id: string };
  at: number;
}
const modelBySession = new Map<string, CachedModel>();
const MODEL_TTL = 60_000;

async function modelOf(opencodeId: string): Promise<{ providerID: string; id: string } | undefined> {
  const hit = modelBySession.get(opencodeId);
  if (hit && Date.now() - hit.at < MODEL_TTL) return hit.model;
  const body = await call(`/api/session/${encodeURIComponent(opencodeId)}`);
  const model = body?.data?.model;
  const resolved = model?.providerID && model?.id
    ? { providerID: model.providerID as string, id: model.id as string }
    : undefined;
  modelBySession.set(opencodeId, { model: resolved, at: Date.now() });
  return resolved;
}

// Map an OpenCode event to one of our pip states. Events carry the session
// id, so a single stream drives every node.
const STATUS_BY_EVENT: Record<string, AgentStatus> = {
  "session.execution.started": "running",
  "session.compaction.started": "running",
  "session.tool.called": "tool_calling",
  "session.tool.success": "running",
  "session.tool.error": "running",
  "session.execution.succeeded": "idle",
  "session.execution.failed": "error",
  "session.idle": "idle",
};

type Broadcast = (session: Session, event: string) => void;

let watching = false;

// The stream sends a heartbeat every 15 seconds, so three missed ones mean
// the socket is wedged. A connection reset that the runtime never surfaces
// as an error leaves `read()` waiting forever, and because status only ever
// arrives on this stream every node then freezes on whatever it last saw —
// typically "Working", long after the turn ended.
const STREAM_SILENCE_MS = 45_000;

// `/api/session/active` answers "which sessions are executing right now" for
// every session in one request, so it is cheap enough to poll underneath the
// stream as a safety net: a terminal event lost to a drop self-corrects.
const ACTIVE_POLL_MS = 10_000;

// Don't let a poll whose answer was computed before an `execution.started`
// event push a session that has only just begun back to idle.
const IDLE_GRACE_MS = 5_000;

function isBusy(status: AgentStatus | undefined): boolean {
  return status === "running" || status === "tool_calling";
}

// Subscribe to the event stream and keep session records current. The
// stream is documented as volatile — a slow consumer is dropped and events
// during a disconnection are missed — so this reconnects, watches for
// silence, and reconciles every tracked session against the service's own
// idea of what is running, both on reconnect and on a timer.
export function startOpencodeWatcher(sessions: Map<string, Session>, broadcast: Broadcast): void {
  if (watching) return;
  watching = true;

  const byOpencodeId = (id: string): Session | undefined => {
    for (const session of sessions.values()) {
      if (session.claudeSessionId === id && session.agentId === "opencode") return session;
    }
    return undefined;
  };

  const seqs = new Map<string, number>();

  const setStatus = (session: Session, next: AgentStatus, event: string): void => {
    session.status = next;
    session.pluginReportedStatus = true;
    session.lastPluginStatusTime = Date.now();
    session.lastHookEvent = event;
    broadcast(session, event);
  };

  const applyUsage = async (session: Session, opencodeId: string, tokens: any): Promise<void> => {
    // Live context is the prompt this step was served with: fresh input
    // plus whatever was read from cache. The session-level `tokens` field
    // is cumulative spend instead, so it must not be used here.
    const used = (tokens?.input || 0) + (tokens?.cache?.read || 0);
    if (!used) return;
    const model = await modelOf(opencodeId);
    const limit = limitFor(model);
    session.contextUsage = {
      tokens: used,
      limit,
      pct: Math.min(100, Math.round((used / limit) * 1000) / 10),
      at: new Date().toISOString(),
    };
    if (model?.id) session.model = model.id;
  };

  const handle = (event: any): void => {
    const sessionId: string | undefined = event?.data?.sessionID;
    if (!sessionId) return;
    const session = byOpencodeId(sessionId);
    if (!session) return;

    const seq = event?.durable?.seq;
    if (typeof seq === "number") {
      const previous = seqs.get(sessionId);
      if (previous !== undefined && seq > previous + 1) {
        debug(`[opencode] ${sessionId} seq gap ${previous} -> ${seq}`);
      }
      seqs.set(sessionId, seq);
    }

    if (event.type === "session.step.ended") {
      applyUsage(session, sessionId, event.data?.tokens).catch(() => {});
    }

    const next = STATUS_BY_EVENT[event.type];
    if (!next) return;

    // No PTY means OpenUI isn't attached: a terminal copy of the same
    // session must not make a detached node look live, exactly as the
    // Claude hook path decides.
    if (!session.pty) return;

    if (event.type === "session.tool.called") {
      session.currentTool = event.data?.tool || event.data?.name || session.currentTool;
    } else if (next === "idle" || next === "error") {
      session.currentTool = undefined;
    }

    setStatus(session, next, event.type);
  };

  // Bring every attached session back in line with what the service says is
  // executing. An `error` is left alone: it is a verdict on the last turn,
  // and only a fresh event should clear it.
  const reconcile = async (): Promise<void> => {
    const body = await call("/api/session/active");
    const data = body?.data;
    if (!data || typeof data !== "object") return;
    const active = new Set(Object.keys(data));

    for (const session of sessions.values()) {
      if (session.agentId !== "opencode" || !session.pty || !session.claudeSessionId) continue;
      const running = active.has(session.claudeSessionId);
      if (running) {
        if (isBusy(session.status)) continue;
        setStatus(session, "running", "poll:active");
      } else {
        if (!isBusy(session.status)) continue;
        if (Date.now() - (session.lastPluginStatusTime || 0) < IDLE_GRACE_MS) continue;
        session.currentTool = undefined;
        setStatus(session, "idle", "poll:idle");
      }
    }
  };

  const pollForever = async (): Promise<void> => {
    for (;;) {
      await reconcile().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, ACTIVE_POLL_MS));
    }
  };

  let failures = 0;

  const connect = async (): Promise<void> => {
    const svc = resolveService();
    if (!svc) {
      if (failures++ === 0) log(`\x1b[38;5;42m[opencode]\x1b[0m Service not reachable; retrying`);
      setTimeout(connect, 10_000);
      return;
    }
    await loadLimits();

    const controller = new AbortController();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        debug(`[opencode] no traffic for ${STREAM_SILENCE_MS}ms; reconnecting`);
        controller.abort();
      }, STREAM_SILENCE_MS);
    };

    try {
      arm();
      const res = await fetch(`${svc.url}/api/event`, {
        headers: { Authorization: authHeader(svc) },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      if (failures) log(`\x1b[38;5;42m[opencode]\x1b[0m Reconnected to ${svc.url}/api/event`);
      else log(`\x1b[38;5;42m[opencode]\x1b[0m Watching ${svc.url}/api/event`);
      failures = 0;
      // Anything that happened while we were away is already settled, so
      // take the service's word for it before trusting the stream again.
      reconcile().catch(() => {});

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            handle(JSON.parse(line.slice(5).trim()));
          } catch {
            // A partial or non-JSON frame; the next event will resync
          }
        }
      }
      debug("[opencode] event stream closed");
    } catch (e) {
      if (failures++ === 0) log(`\x1b[38;5;42m[opencode]\x1b[0m Event stream dropped (${e}); reconnecting`);
      else debug(`[opencode] event stream ended: ${e}`);
      cached = null;
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }
    // Reconnect; the reconcile above re-syncs whatever the gap swallowed
    setTimeout(connect, 3000);
  };

  connect();
  pollForever();
}
