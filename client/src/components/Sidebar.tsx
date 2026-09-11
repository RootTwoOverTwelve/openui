import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Terminal as TerminalIcon,
  Clock,
  Folder,
  Edit3,
  RotateCcw,
  Play,
  Copy,
  Check,
  LogOut,
  GitFork,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Code,
  Cpu,
  Zap,
  Rocket,
  Bot,
  Brain,
  Wand2,
  GitBranch,
} from "lucide-react";
import { useStore, AgentStatus, SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT_WIDTH } from "../stores/useStore";
import { contextColor } from "./AgentNode/AgentNodeCard";

const DETAILS_OPEN_KEY = "openui-sidebar-details-open";
import { Terminal } from "./Terminal";

const statusConfig: Record<AgentStatus, { label: string; color: string }> = {
  running: { label: "Running", color: "#22C55E" },
  waiting_input: { label: "Waiting for input", color: "#FBBF24" },
  tool_calling: { label: "Tool Calling", color: "#8B5CF6" },
  idle: { label: "Idle", color: "#6B7280" },
  disconnected: { label: "Disconnected", color: "#EF4444" },
  error: { label: "Error", color: "#EF4444" },
};

const presetColors = [
  "#F97316", "#22C55E", "#3B82F6", "#8B5CF6", "#EC4899", "#EF4444", "#FBBF24", "#14B8A6"
];

const iconOptions = [
  { id: "sparkles", icon: Sparkles, label: "Sparkles" },
  { id: "code", icon: Code, label: "Code" },
  { id: "cpu", icon: Cpu, label: "CPU" },
  { id: "zap", icon: Zap, label: "Zap" },
  { id: "rocket", icon: Rocket, label: "Rocket" },
  { id: "bot", icon: Bot, label: "Bot" },
  { id: "brain", icon: Brain, label: "Brain" },
  { id: "wand2", icon: Wand2, label: "Wand" },
];

export function Sidebar() {
  const {
    sidebarOpen,
    setSidebarOpen,
    selectedNodeId,
    sessions,
    setSelectedNodeId,
    updateSession,
    updateNode,
    nodes,
    setNewSessionModalOpen,
    setNewSessionForNodeId,
    sidebarWidth,
    setSidebarWidth,
    sidebarResizing: isResizing,
    setSidebarResizing: setIsResizing,
  } = useStore();

  const session = selectedNodeId ? sessions.get(selectedNodeId) : null;
  const node = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [terminalKey, setTerminalKey] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(DETAILS_OPEN_KEY) === "1"; } catch { return false; }
  });
  const toggleDetails = () => {
    setDetailsOpen((open) => {
      try { localStorage.setItem(DETAILS_OPEN_KEY, open ? "0" : "1"); } catch {}
      return !open;
    });
  };
  // Drag the left edge to resize the panel
  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setIsResizing(true);

    const onMove = (ev: PointerEvent) => {
      setSidebarWidth(window.innerWidth - ev.clientX);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      setIsResizing(false);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }, [setSidebarWidth, setIsResizing]);

  // Persist width once a drag finishes
  useEffect(() => {
    if (isResizing) return;
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {}
  }, [isResizing, sidebarWidth]);

  // Keep the terminal from grabbing selection/cursor while dragging
  useEffect(() => {
    if (!isResizing) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [isResizing]);

  // Re-clamp if the window shrinks below the saved width
  useEffect(() => {
    const onWindowResize = () => setSidebarWidth(w => w);
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, [setSidebarWidth]);

  // Reset edit state when session changes (but NOT when nodes change)
  useEffect(() => {
    if (session) {
      setEditName(session.customName || session.agentName);
      setEditNotes(session.notes || "");
      setEditColor(session.customColor || session.color);
      const currentNode = nodes.find(n => n.id === selectedNodeId);
      const nodeIcon = currentNode?.data?.icon;
      setEditIcon(typeof nodeIcon === 'string' ? nodeIcon : "cpu");
    }
    setIsEditing(false);
    // Force terminal recreation when session changes
    setTerminalKey(k => k + 1);
  }, [session?.sessionId]); // Removed nodes and selectedNodeId to prevent closing on updates

  const handleClose = () => {
    setSidebarOpen(false);
    setSelectedNodeId(null);
    setIsEditing(false);
  };

  const handleNewSession = () => {
    if (selectedNodeId) {
      setNewSessionForNodeId(selectedNodeId);
      setNewSessionModalOpen(true);
    }
  };

  const [isResuming, setIsResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Restart the PTY in place; the server resumes the Claude conversation
  // when it knows the Claude session ID
  const handleResume = async () => {
    if (!selectedNodeId || !session || isResuming) return;
    setIsResuming(true);
    setResumeError(null);
    try {
      const res = await fetch(`/api/sessions/${session.sessionId}/restart`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      updateSession(selectedNodeId, { status: "running", isRestored: false });
      // Reconnect the terminal so it replays scrollback and attaches to the new PTY
      setTerminalKey(k => k + 1);
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsResuming(false);
    }
  };

  // Command to continue this Claude session from a normal terminal
  const resumeCommand = session?.claudeSessionId
    ? `cd '${session.cwd.replace(/'/g, `'\\''`)}' && ${session.command} --resume ${session.claudeSessionId}`
    : null;

  const [copied, setCopied] = useState(false);
  const [isDetaching, setIsDetaching] = useState(false);

  const copyResumeCommand = async () => {
    if (!resumeCommand) return false;
    try {
      await navigator.clipboard.writeText(resumeCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return true;
    } catch {
      return false;
    }
  };

  // Stop the PTY here so the session has a single live process, then hand
  // the resume command to the clipboard. Copy first: clipboard access needs
  // to stay close to the click.
  const handleHandOff = async () => {
    if (!selectedNodeId || !session || isDetaching) return;
    setIsDetaching(true);
    try {
      await copyResumeCommand();
      const res = await fetch(`/api/sessions/${session.sessionId}/detach`, { method: "POST" });
      if (res.ok) {
        updateSession(selectedNodeId, { status: "disconnected", isRestored: true });
        setTerminalKey(k => k + 1);
      }
    } finally {
      setIsDetaching(false);
    }
  };

  const displayColor = editColor || session?.customColor || session?.color || "#888";
  const statusInfo = statusConfig[session?.status || "idle"];
  const isDisconnected = session?.status === "disconnected";
  const canResume = session?.agentId === "claude" && !!session?.claudeSessionId;

  return (
    <AnimatePresence>
      {sidebarOpen && session && (
        <motion.div
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 40 }}
          style={{ width: sidebarWidth, maxWidth: "100vw" }}
          className="fixed right-0 top-11 bottom-0 z-50 flex flex-col bg-canvas-dark border-l border-border"
        >
          {/* Resize handle */}
          <div
            onPointerDown={handleResizeStart}
            onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
            title="Drag to resize · double-click to reset"
            className={`absolute top-0 bottom-0 -left-[3px] w-[6px] cursor-col-resize z-10 transition-colors ${
              isResizing ? "bg-zinc-500" : "hover:bg-zinc-600"
            }`}
          />

          {/* Header */}
          <div className="flex-shrink-0 px-3 py-2 border-b border-border">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: displayColor }}
              />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium text-white truncate">
                  {session.customName || session.agentName}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: statusInfo.color }}
                  />
                  <span className="text-[10px] text-zinc-500">{statusInfo.label}</span>
                  {session.contextUsage && (
                    <span
                      className="text-[10px] ml-1"
                      style={{ color: contextColor(session.contextUsage.pct) }}
                      title={`Context: ${session.contextUsage.tokens.toLocaleString()} of ${(session.contextUsage.limit / 1000).toLocaleString()}k tokens`}
                    >
                      · {Math.round(session.contextUsage.pct)}% ctx
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-1 flex-shrink-0">
                {!isDisconnected && (
                  <button
                    onClick={handleNewSession}
                    title="New session (replaces this agent's process)"
                    className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
                    isEditing 
                      ? "text-white bg-surface-active" 
                      : "text-zinc-500 hover:text-white hover:bg-surface-active"
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleClose}
                  className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Disconnected banner */}
          {isDisconnected && (
            <div className="flex-shrink-0 px-4 py-3 bg-red-500/10 border-b border-red-500/20">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-red-400 font-medium">Session Disconnected</p>
                  <p className="text-xs text-red-400/70 mt-0.5">
                    {canResume
                      ? "The agent was stopped. Resume where it left off, or start fresh."
                      : "The agent was stopped. Restart it, or start fresh."}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleResume}
                    disabled={isResuming}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-60 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {isResuming ? "Starting…" : canResume ? "Resume" : "Restart"}
                  </button>
                  <button
                    onClick={handleNewSession}
                    disabled={isResuming}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-surface-active text-zinc-300 text-sm font-medium hover:bg-zinc-700 disabled:opacity-60 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Spawn Fresh
                  </button>
                </div>
                {resumeError && (
                  <p className="text-xs text-red-400">{resumeError}</p>
                )}
              </div>
            </div>
          )}

          {/* Edit Panel */}
          <AnimatePresence>
            {isEditing && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex-shrink-0 overflow-hidden border-b border-border"
              >
                <div className="p-4 space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setEditName(newName);
                        // Instant update
                        if (selectedNodeId && session) {
                          const customName = newName !== session.agentName ? newName : undefined;
                          updateSession(selectedNodeId, { customName });
                          if (node) {
                            updateNode(selectedNodeId, {
                              data: { ...node.data, label: newName },
                            });
                          }
                          // Persist to API
                          fetch(`/api/sessions/${session.sessionId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ customName }),
                          }).catch(console.error);
                        }
                      }}
                      className="mt-1 w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                    />
                  </div>
                  
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Color</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {presetColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            setEditColor(color);
                            // Instant update
                            if (selectedNodeId && session) {
                              updateSession(selectedNodeId, { customColor: color });
                              if (node) {
                                updateNode(selectedNodeId, {
                                  data: { ...node.data, color },
                                });
                              }
                              // Persist to API
                              fetch(`/api/sessions/${session.sessionId}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ customColor: color }),
                              }).catch(console.error);
                            }
                          }}
                          className={`w-7 h-7 rounded-md transition-all ${
                            editColor === color
                              ? "ring-2 ring-white ring-offset-2 ring-offset-canvas-dark scale-110"
                              : "hover:scale-110"
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Icon</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {iconOptions.map(({ id, icon: IconComponent }) => (
                        <button
                          key={id}
                          onClick={() => {
                            setEditIcon(id);
                            // Instant update
                            if (selectedNodeId && node) {
                              updateNode(selectedNodeId, {
                                data: { ...node.data, icon: id },
                              });
                            }
                          }}
                          className={`w-9 h-9 rounded-md transition-all flex items-center justify-center ${
                            editIcon === id
                              ? "ring-2 ring-white ring-offset-2 ring-offset-canvas-dark scale-110 bg-white/10"
                              : "hover:scale-110 hover:bg-white/5 bg-canvas"
                          }`}
                          style={{ borderColor: editIcon === id ? editColor : "#333", borderWidth: '1px' }}
                        >
                          <IconComponent
                            className="w-4 h-4"
                            style={{ color: editIcon === id ? editColor : "#888" }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Notes</label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => {
                        const newNotes = e.target.value;
                        setEditNotes(newNotes);
                        // Update with debounce would be better, but instant for now
                      }}
                      onBlur={() => {
                        // Save notes on blur
                        if (selectedNodeId && session) {
                          fetch(`/api/sessions/${session.sessionId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ notes: editNotes || undefined }),
                          }).catch(console.error);
                          updateSession(selectedNodeId, { notes: editNotes || undefined });
                        }
                      }}
                      placeholder="Add notes..."
                      rows={2}
                      className="mt-1 w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Terminal */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 bg-[#0d0d0d]">
              <Terminal
                key={`${session.sessionId}-${terminalKey}`}
                sessionId={session.sessionId}
                color={displayColor}
                nodeId={selectedNodeId!}
              />
            </div>

          </div>

          {/* Details (collapsed by default to leave room for the terminal) */}
          <div className="flex-shrink-0 border-t border-border">
            <button
              onClick={toggleDetails}
              className="w-full px-4 py-1.5 flex items-center gap-2 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] transition-colors"
            >
              {detailsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              <span>Details</span>
              {!detailsOpen && (
                <span className="ml-auto font-mono text-zinc-600 truncate max-w-[60%]">
                  {session.cwd.split('/').slice(-2).join('/')}{session.gitBranch ? ` · ${session.gitBranch}` : ""}
                </span>
              )}
            </button>
            <div className={`${detailsOpen ? "" : "hidden"} px-4 pb-4 pt-1 space-y-2`}>
              {session.notes && !isEditing && (
                <p className="text-xs text-zinc-400 italic mb-3 pb-3 border-b border-border">
                  {session.notes}
                </p>
              )}
              {session.forkedFrom && (
                <div className="flex items-center gap-2 text-xs mb-3 pb-3 border-b border-border">
                  <GitFork className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                  <span className="text-zinc-500">
                    {session.forkKind === "develop" ? "Dev fork" : session.forkKind === "consult" ? "Consult fork" : "Fork"} of
                  </span>
                  <span className="text-zinc-300 truncate">{session.forkedFrom.name || "a session"}</span>
                  <span className="text-zinc-600 ml-auto whitespace-nowrap" title={session.forkedFrom.at}>
                    {new Date(session.forkedFrom.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              )}
              {session.initialPrompt && (
                <p
                  className="text-xs text-zinc-500 mb-3 pb-3 border-b border-border line-clamp-2"
                  title={session.initialPrompt}
                >
                  <span className="text-zinc-600">Started with: </span>{session.initialPrompt}
                </p>
              )}
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                <span className="text-zinc-500">Started</span>
                <span className="text-zinc-400 font-mono ml-auto">
                  {new Date(session.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Folder className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                <span className="text-zinc-500">Directory</span>
                <span className="text-zinc-400 font-mono ml-auto truncate max-w-[180px]" title={session.cwd}>
                  {session.cwd.split('/').slice(-2).join('/')}
                </span>
              </div>
              {session.gitBranch && (
                <div className="flex items-center gap-2 text-xs">
                  <GitBranch className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                  <span className="text-zinc-500">Branch</span>
                  <span className="text-purple-400 font-mono ml-auto">
                    {session.gitBranch}
                  </span>
                </div>
              )}
              {resumeCommand && (
                <div className="pt-3 mt-3 border-t border-border space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <TerminalIcon className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                    <span className="text-zinc-500">Continue in terminal</span>
                    <span className="text-zinc-600 font-mono ml-auto truncate max-w-[200px]" title={session.claudeSessionId}>
                      {session.claudeSessionId}
                    </span>
                  </div>
                  <code
                    className="block text-[11px] text-zinc-400 font-mono bg-canvas border border-border rounded px-2 py-1.5 whitespace-pre-wrap break-all select-all"
                    title={resumeCommand}
                  >
                    {resumeCommand}
                  </code>
                  <div className="flex gap-2">
                    <button
                      onClick={copyResumeCommand}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-surface-active text-zinc-300 text-xs hover:bg-zinc-700 transition-colors"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                    {!isDisconnected && (
                      <button
                        onClick={handleHandOff}
                        disabled={isDetaching}
                        title="Stops the agent here (resumable later) and copies the command, so only one process runs this session"
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-surface-active text-zinc-300 text-xs hover:bg-zinc-700 disabled:opacity-60 transition-colors"
                      >
                        <LogOut className="w-3 h-3" />
                        {isDetaching ? "Stopping…" : "Hand off to terminal"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
