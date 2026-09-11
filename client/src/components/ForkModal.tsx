import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, GitFork, MessageSquareText, Wrench, AlertTriangle } from "lucide-react";
import { useStore } from "../stores/useStore";

type ForkKind = "consult" | "develop";

// Standing context for the fork. Served by /api/sessions/:id/context and
// injected by the plugin's SessionStart hook on every start, resume and
// compaction, so it survives all of them.
function briefingFor(kind: ForkKind, parentName: string, cwd: string): string {
  if (kind === "consult") {
    return `You are a consult fork of the session "${parentName}". The original agent continues active development in this same directory (${cwd}) in parallel. Your job is to brainstorm, answer questions, and research using the full context you inherited. Treat the working tree as read-only: do not edit, create, or delete files, run formatters, or make commits unless the user explicitly asks; if something should be persisted (a memory, a briefing, a doc), propose it first. The code may change under you while you work, so re-read files before relying on details. Any "[OpenUI] … fork of this session …" notice in your inherited history was addressed to the original agent, not to you.`;
  }
  return `You are a development fork of the session "${parentName}". The original agent may still be actively working in this same directory and worktree (${cwd}). Before you change anything, think through what could go wrong with two agents editing one tree — clobbered files, conflicting git operations, half-applied refactors, stale assumptions about files the other agent is changing — and how to avoid it: prefer a separate branch or worktree when appropriate, keep changes narrowly scoped, re-read files before editing, never run destructive git commands, and tell the user before doing anything that could interfere with the original agent. Any "[OpenUI] … fork of this session …" notice in your inherited history was addressed to the original agent, not to you.`;
}

const NODE_WIDTH = 400;

export function ForkModal() {
  const {
    forkForNodeId,
    setForkForNodeId,
    sessions,
    nodes,
    agents,
    addNode,
    addSession,
    setSelectedNodeId,
    setSidebarOpen,
  } = useStore();

  const parent = forkForNodeId ? sessions.get(forkForNodeId) : null;
  const parentNode = forkForNodeId ? nodes.find((n) => n.id === forkForNodeId) : null;
  const parentName = parent?.customName || parent?.agentName || "";
  const open = !!parent;

  const [kind, setKind] = useState<ForkKind>("consult");
  const [name, setName] = useState("");
  const [briefing, setBriefing] = useState("");
  const [briefingTouched, setBriefingTouched] = useState(false);
  const [notifyParent, setNotifyParent] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when a new parent is chosen
  useEffect(() => {
    if (!parent) return;
    setKind("consult");
    setName(`${parentName} · consult`);
    setBriefing(briefingFor("consult", parentName, parent.cwd));
    setBriefingTouched(false);
    setNotifyParent(false);
    setError(null);
  }, [forkForNodeId]);

  // Kind drives the defaults unless the user has edited them
  const chooseKind = (next: ForkKind) => {
    if (!parent) return;
    setKind(next);
    setNotifyParent(next === "develop");
    const suffix = next === "consult" ? "consult" : "dev";
    setName((current) => (current === `${parentName} · consult` || current === `${parentName} · dev` ? `${parentName} · ${suffix}` : current));
    if (!briefingTouched) setBriefing(briefingFor(next, parentName, parent.cwd));
  };

  const close = () => setForkForNodeId(null);

  const parentBusy = parent?.status === "running" || parent?.status === "tool_calling";

  const handleCreate = async () => {
    if (!parent || !forkForNodeId || isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const nodeId = `node-${Date.now()}-fork`;
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: parent.agentId,
          agentName: parent.agentName,
          command: parent.command,
          cwd: parent.cwd,
          nodeId,
          customName: name.trim() || undefined,
          customColor: parent.customColor,
          systemPrompt: briefing.trim() || undefined,
          forkFromSessionId: parent.sessionId,
          forkKind: kind,
          notifyParent,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const created = await res.json();
      const agent = agents.find((a) => a.id === parent.agentId);
      const color = parent.customColor || parent.color;
      const now = new Date().toISOString();

      addSession(nodeId, {
        id: nodeId,
        sessionId: created.sessionId,
        agentId: parent.agentId,
        agentName: parent.agentName,
        command: parent.command,
        color,
        createdAt: now,
        cwd: created.cwd || parent.cwd,
        gitBranch: created.gitBranch,
        status: "idle",
        customName: name.trim() || undefined,
        customColor: parent.customColor,
        systemPrompt: briefing.trim() || undefined,
        forkedFrom: { sessionId: parent.sessionId, claudeSessionId: parent.claudeSessionId, name: parentName, at: now },
        forkKind: kind,
      });

      // Beside the parent, in the same category if it has one
      const position = parentNode
        ? { x: parentNode.position.x + NODE_WIDTH + 24, y: parentNode.position.y }
        : { x: 100, y: 100 };
      addNode({
        id: nodeId,
        type: "agent",
        position,
        ...(parentNode?.parentId && { parentId: parentNode.parentId }),
        data: {
          label: name.trim() || parent.agentName,
          agentId: parent.agentId,
          color,
          icon: agent?.icon || "cpu",
          sessionId: created.sessionId,
        },
      });

      setSelectedNodeId(nodeId);
      setSidebarOpen(true);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreating(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && parent && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={close}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-lg mx-4">
              <div className="bg-surface rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <GitFork className="w-4 h-4 text-zinc-400" />
                    Fork “{parentName}”
                  </h2>
                  <button onClick={close} className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-canvas transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-5 overflow-y-auto">
                  <p className="text-xs text-zinc-500">
                    The fork starts with this conversation's full context as a new Claude session. “{parentName}” keeps running.
                  </p>

                  {/* Kind */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => chooseKind("consult")}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        kind === "consult" ? "border-zinc-400 bg-white/5" : "border-border hover:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm text-white">
                        <MessageSquareText className="w-4 h-4 text-zinc-400" />
                        Consult
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Brainstorm, answer questions, research. Same directory, read-only by convention.
                      </p>
                    </button>
                    <button
                      onClick={() => chooseKind("develop")}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        kind === "develop" ? "border-zinc-400 bg-white/5" : "border-border hover:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm text-white">
                        <Wrench className="w-4 h-4 text-zinc-400" />
                        Develop
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Will change code. Same directory — you manage worktree conflicts.
                      </p>
                    </button>
                  </div>

                  {kind === "develop" && (
                    <div className="flex gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>
                        Two agents editing one worktree can clobber each other. The fork is briefed to think this through; consider asking it to work on its own branch or worktree first.
                      </span>
                    </div>
                  )}

                  {parentBusy && (
                    <p className="text-[11px] text-zinc-500">
                      “{parentName}” is working right now — the fork will include everything up to its last completed step.
                    </p>
                  )}

                  {/* Name */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                    />
                  </div>

                  {/* Briefing */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500">Briefing (standing context for the fork)</label>
                    <textarea
                      value={briefing}
                      onChange={(e) => {
                        setBriefing(e.target.value);
                        setBriefingTouched(true);
                      }}
                      rows={6}
                      className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-zinc-300 text-xs leading-relaxed focus:outline-none focus:border-zinc-500 transition-colors resize-y"
                    />
                    <p className="text-[10px] text-zinc-600">
                      Handed to the fork as context every time it starts, resumes, or compacts — so it never forgets what it is.
                    </p>
                  </div>

                  {/* Notify parent */}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyParent}
                      onChange={(e) => setNotifyParent(e.target.checked)}
                      disabled={parent.status === "disconnected"}
                      className="mt-0.5"
                    />
                    <span className="text-xs text-zinc-400">
                      Tell “{parentName}” about this fork
                      <span className="block text-[10px] text-zinc-600">
                        Sent once the fork has started, so the fork doesn't inherit it. Uses one of the parent's turns.
                        {parent.status === "disconnected" && " (Unavailable: the parent isn't running.)"}
                      </span>
                    </span>
                  </label>
                </div>

                <div className="px-5 py-3 bg-canvas border-t border-border flex items-center justify-end gap-2 flex-shrink-0">
                  {error && <p className="text-xs text-red-400 mr-auto truncate" title={error}>{error}</p>}
                  <button
                    onClick={close}
                    className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={isCreating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-canvas text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 transition-colors"
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    {isCreating ? "Forking…" : "Fork"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
