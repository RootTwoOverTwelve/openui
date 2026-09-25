import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { apiRoutes } from "./routes/api";
import { sessions, restoreSessions } from "./services/sessionManager";
import { saveState, importLegacyState, getDataDir, WORKSPACE } from "./services/persistence";
import { modeSequence } from "./services/termModes";
import type { WebSocketData } from "./types";

const app = new Hono();
const PORT = Number(process.env.PORT) || 6968;

const ALLOWED_ORIGINS = new Set([
  `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`,
  "http://localhost:6969", "http://127.0.0.1:6969",
]);

function originOk(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

const QUIET = !!process.env.OPENUI_QUIET;

// Conditionally log only in dev mode
const log = QUIET ? () => {} : console.log.bind(console);

// Middleware
app.use("*", async (c, next) => {
  if (!originOk(c.req.raw)) return c.text("Forbidden", 403);
  await next();
});

// API Routes
app.route("/api", apiRoutes);

// Serve static files. Asset filenames are content-hashed, so only the HTML
// shell must be revalidated; otherwise a rebuilt UI needs a hard refresh.
app.use("/*", async (c, next) => {
  await next();
  if (c.res.headers.get("content-type")?.includes("text/html")) {
    c.res.headers.set("Cache-Control", "no-cache");
  }
});
app.use("/*", serveStatic({ root: "./client/dist" }));

// WebSocket server
Bun.serve<WebSocketData>({
  port: PORT,
  hostname: "127.0.0.1",
  fetch(req, server) {
    if (!originOk(req)) return new Response("Forbidden", { status: 403 });
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) return new Response("Session ID required", { status: 400 });

      const session = sessions.get(sessionId);
      if (!session) return new Response("Session not found", { status: 404 });

      const upgraded = server.upgrade(req, { data: { sessionId } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const { sessionId } = ws.data;
      const session = sessions.get(sessionId);

      if (!session) {
        ws.close(1008, "Session not found");
        return;
      }

      log(`\x1b[38;5;245m[ws]\x1b[0m Connected to ${sessionId}`);
      session.clients.add(ws);

      if (session.pty && !session.isRestored) {
        // Bring this terminal up to the modes the agent has already set (most
        // importantly bracketed paste), then replay the scrollback. Flagged so
        // the client swallows xterm's automatic replies (cursor-position
        // reports etc.) instead of typing them into the PTY.
        const data = modeSequence(session.termModes) + session.outputBuffer.join("");
        if (data) ws.send(JSON.stringify({ type: "output", data, history: true }));
      } else if (session.isRestored || !session.pty) {
        ws.send(JSON.stringify({
          type: "output",
          data: "\x1b[38;5;245mSession was disconnected.\r\nClick \"Spawn Fresh\" to start a new session.\x1b[0m\r\n"
        }));
      }

      ws.send(JSON.stringify({
        type: "status",
        status: session.status,
        isRestored: session.isRestored
      }));
    },
    message(ws, message) {
      const { sessionId } = ws.data;
      const session = sessions.get(sessionId);
      if (!session) return;

      try {
        const msg = JSON.parse(message.toString());
        switch (msg.type) {
          case "input":
            if (session.pty) {
              session.pty.write(msg.data);
              session.lastInputTime = Date.now();
            }
            break;
          case "resize":
            if (session.pty) {
              session.pty.resize(msg.cols, msg.rows);
            }
            break;
        }
      } catch (e) {
        if (!QUIET) console.error("Error processing message:", e);
      }
    },
    close(ws) {
      const { sessionId } = ws.data;
      const session = sessions.get(sessionId);
      if (session) {
        session.clients.delete(ws);
        log(`\x1b[38;5;245m[ws]\x1b[0m Disconnected from ${sessionId}`);
      }
    },
  },
});

// Restore sessions on startup
const imported = importLegacyState();
if (imported) log(`\x1b[38;5;141m[persistence]\x1b[0m Imported existing state from ${imported} into workspace "${WORKSPACE}" (original left in place)`);
restoreSessions();

log(`\x1b[38;5;141m[server]\x1b[0m Running on http://localhost:${PORT}`);
log(`\x1b[38;5;245m[server]\x1b[0m Launch directory: ${process.env.LAUNCH_CWD || process.cwd()}`);
log(`\x1b[38;5;245m[server]\x1b[0m Workspace "${WORKSPACE}": ${getDataDir()}`);

// Periodic state save
setInterval(() => {
  saveState(sessions);
}, 30000);

// Cleanup on exit
function shutdown() {
  log("\n\x1b[38;5;245m[server]\x1b[0m Saving state before exit...");
  saveState(sessions);
  for (const [, session] of sessions) {
    if (session.pty) session.pty.kill();
    if (session.stateTrackerPty) session.stateTrackerPty.kill();
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);
