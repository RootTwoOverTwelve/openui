import { createPortal } from "react-dom";
import { Trash2, Archive, GitFork } from "lucide-react";

interface AgentNodeContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onFork: () => void;
  canFork: boolean;
  forkDisabledReason?: string;
  onArchive: () => void;
  onDelete: () => void;
}

export function AgentNodeContextMenu({
  position,
  onClose,
  onFork,
  canFork,
  forkDisabledReason,
  onArchive,
  onDelete,
}: AgentNodeContextMenuProps) {
  return createPortal(
    <div
      className="context-menu-container fixed z-[9999] min-w-[160px] rounded-lg border shadow-xl py-1"
      style={{
        left: position.x,
        top: position.y,
        backgroundColor: "#262626",
        borderColor: "#333",
      }}
    >
      <button
        onClick={() => {
          if (!canFork) return;
          onFork();
          onClose();
        }}
        disabled={!canFork}
        title={canFork ? "Start a new agent with this conversation's full context. This one keeps running." : forkDisabledReason}
        className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-2"
      >
        <GitFork className="w-3.5 h-3.5" />
        Fork…
      </button>
      <button
        onClick={() => {
          onArchive();
          onClose();
        }}
        title="Stop the agent and move it off the canvas. Restore it any time from Archive."
        className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
      >
        <Archive className="w-3.5 h-3.5" />
        Archive
      </button>
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        title="Remove from OpenUI. The Claude transcript is kept and can be re-imported by session ID."
        className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-white/5 flex items-center gap-2"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
    </div>,
    document.body
  );
}
