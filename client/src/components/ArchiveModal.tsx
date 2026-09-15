import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useReactFlow } from "@xyflow/react";
import { X, Archive, RotateCcw, Trash2, Folder } from "lucide-react";
import { useStore } from "../stores/useStore";
import { AGENT_SIZE, findFreeSpot, toNodePlacement, visibleCenter } from "../lib/placement";

interface ArchivedSession {
  nodeId: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  cwd: string;
  createdAt: string;
  customName?: string;
  customColor?: string;
  notes?: string;
  claudeSessionId?: string;
  initialPrompt?: string;
  archivedAt?: string;
}

interface ArchiveModalProps {
  open: boolean;
  onClose: () => void;
}

export function ArchiveModal({ open, onClose }: ArchiveModalProps) {
  const { agents, nodes, addNode, addSession, refreshArchivedCount, setSelectedNodeId, setSidebarOpen, sidebarOpen, sidebarWidth } = useStore();
  const reactFlowInstance = useReactFlow();
  const [items, setItems] = useState<ArchivedSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions/archived");
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      load();
      setConfirmDeleteId(null);
    }
  }, [open]);

  // Put the node back near the middle of what the user is looking at
  const handleRestore = async (item: ArchivedSession) => {
    setBusyId(item.sessionId);
    try {
      const center = visibleCenter(reactFlowInstance.getViewport(), sidebarOpen ? sidebarWidth : 0);
      const position = findFreeSpot(nodes, AGENT_SIZE, center);

      const res = await fetch(`/api/sessions/archived/${item.sessionId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position }),
      });
      if (!res.ok) return;
      const session = await res.json();
      const agent = agents.find((a) => a.id === session.agentId);
      const color = session.customColor || agent?.color || "#888";

      addSession(session.nodeId, {
        id: session.nodeId,
        sessionId: session.sessionId,
        agentId: session.agentId,
        agentName: session.agentName,
        command: session.command,
        color,
        createdAt: session.createdAt,
        cwd: session.cwd,
        gitBranch: session.gitBranch,
        status: session.status || "disconnected",
        customName: session.customName,
        customColor: session.customColor,
        notes: session.notes,
        isRestored: true,
        claudeSessionId: session.claudeSessionId,
        initialPrompt: session.initialPrompt,
        systemPrompt: session.systemPrompt,
        forkedFrom: session.forkedFrom,
        forkKind: session.forkKind,
      });
      addNode({
        id: session.nodeId,
        type: "agent",
        ...toNodePlacement(session.position || position, AGENT_SIZE, nodes),
        data: {
          label: session.customName || session.agentName,
          agentId: session.agentId,
          color,
          icon: agent?.icon || "cpu",
          sessionId: session.sessionId,
        },
      });

      setItems((prev) => prev.filter((i) => i.sessionId !== item.sessionId));
      refreshArchivedCount();
      setSelectedNodeId(session.nodeId);
      setSidebarOpen(true);
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: ArchivedSession) => {
    setBusyId(item.sessionId);
    try {
      const res = await fetch(`/api/sessions/archived/${item.sessionId}`, { method: "DELETE" });
      if (!res.ok) return;
      setItems((prev) => prev.filter((i) => i.sessionId !== item.sessionId));
      setConfirmDeleteId(null);
      refreshArchivedCount();
    } finally {
      setBusyId(null);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-lg mx-4">
              <div className="bg-surface rounded-xl border border-border shadow-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Archive className="w-4 h-4 text-zinc-400" />
                    Archived sessions
                  </h2>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-canvas transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto">
                  {loading && items.length === 0 && (
                    <p className="px-5 py-8 text-sm text-zinc-500 text-center">Loading…</p>
                  )}
                  {!loading && items.length === 0 && (
                    <p className="px-5 py-8 text-sm text-zinc-500 text-center">
                      Nothing archived. Right-click an agent → Archive to park it here.
                    </p>
                  )}
                  {items.map((item) => {
                    const agent = agents.find((a) => a.id === item.agentId);
                    const color = item.customColor || agent?.color || "#888";
                    const busy = busyId === item.sessionId;
                    const confirming = confirmDeleteId === item.sessionId;
                    return (
                      <div key={item.sessionId} className="px-5 py-3 border-b border-border last:border-b-0 flex items-start gap-3">
                        <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{item.customName || item.agentName}</p>
                          <p className="text-[11px] text-zinc-500 font-mono truncate flex items-center gap-1" title={item.cwd}>
                            <Folder className="w-3 h-3 flex-shrink-0" />
                            {item.cwd}
                          </p>
                          <p className="text-[10px] text-zinc-600 mt-0.5">
                            Archived {item.archivedAt ? new Date(item.archivedAt).toLocaleString() : "—"}
                            {item.claudeSessionId
                              ? <> · <span className="font-mono" title={item.claudeSessionId}>{item.claudeSessionId.slice(0, 8)}…</span></>
                              : " · no Claude session recorded"}
                          </p>
                          {item.notes && <p className="text-[11px] text-zinc-500 italic mt-1 truncate">{item.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {confirming ? (
                            <>
                              <button
                                onClick={() => handleDelete(item)}
                                disabled={busy}
                                className="px-2 py-1 rounded-md text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleRestore(item)}
                                disabled={busy}
                                title="Put it back on the canvas (resumable)"
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-surface-active text-zinc-200 hover:bg-zinc-700 disabled:opacity-60 transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Restore
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(item.sessionId)}
                                disabled={busy}
                                title="Remove from OpenUI. The Claude transcript is kept."
                                className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-surface-active disabled:opacity-60 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="px-5 py-2.5 bg-canvas border-t border-border">
                  <p className="text-[10px] text-zinc-600">
                    Deleting only removes OpenUI's record. Claude Code transcripts stay in ~/.claude/projects and can be re-imported by session ID.
                  </p>
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
