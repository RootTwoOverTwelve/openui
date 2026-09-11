import { useState, useEffect } from "react";
import { useStore, AgentSession } from "../../stores/useStore";

interface AgentNodeData {
  sessionId: string;
}

export function useAgentNodeState(
  id: string,
  nodeData: AgentNodeData,
  session: AgentSession | undefined
) {
  const { removeNode, removeSession, setSelectedNodeId, setSidebarOpen, refreshArchivedCount, setForkForNodeId } =
    useStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".context-menu-container")) {
        return;
      }
      setContextMenu(null);
    };
    if (contextMenu) {
      setTimeout(() => {
        window.addEventListener("click", handleClick);
      }, 0);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDelete = async () => {
    const sessionId = session?.sessionId || nodeData.sessionId;
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    }
    removeSession(id);
    removeNode(id);
    setSelectedNodeId(null);
    setSidebarOpen(false);
  };

  const canFork = session?.agentId === "claude" && !!session?.claudeSessionId;
  const forkDisabledReason = session?.agentId !== "claude"
    ? "Only Claude Code sessions can be forked"
    : "Waiting for the Claude session ID — send the agent a message first";

  const handleFork = () => {
    setForkForNodeId(id);
  };

  const handleArchive = async () => {
    const sessionId = session?.sessionId || nodeData.sessionId;
    if (sessionId) {
      const res = await fetch(`/api/sessions/${sessionId}/archive`, { method: "POST" });
      if (!res.ok) return;
    }
    removeSession(id);
    removeNode(id);
    setSelectedNodeId(null);
    setSidebarOpen(false);
    refreshArchivedCount();
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  return {
    contextMenu,
    handleContextMenu,
    canFork,
    forkDisabledReason,
    handleFork,
    handleArchive,
    handleDelete,
    closeContextMenu,
  };
}
