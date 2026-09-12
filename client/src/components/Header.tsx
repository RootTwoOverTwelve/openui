import { useState, useEffect } from "react";
import { Plus, Folder, Settings, Archive, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "../stores/useStore";
import { SettingsModal } from "./SettingsModal";
import { ArchiveModal } from "./ArchiveModal";
import { LibraryModal } from "./LibraryModal";

export function Header() {
  const { setAddAgentModalOpen, sessions, launchCwd, workspace, archivedCount, refreshArchivedCount, archiveModalOpen, setArchiveModalOpen, openLibrary } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    refreshArchivedCount();
  }, [refreshArchivedCount]);

  return (
    <header className="h-11 px-3 flex items-center justify-between border-b border-border bg-canvas-dark">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
          <span className="text-sm font-semibold text-white">OpenUI</span>
        </div>
        
        <div className="h-4 w-px bg-border mx-2" />
        
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Folder className="w-3 h-3" />
          <span className="font-mono truncate max-w-[200px]" title="Default directory for new agents">{launchCwd || "~"}</span>
          {workspace && workspace !== "default" && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-surface text-[10px] text-zinc-400" title="Workspace">{workspace}</span>
          )}
        </div>
      </div>

      {/* Center - Session count */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-surface text-[11px] text-zinc-400">
          <div className={`w-1.5 h-1.5 rounded-full ${sessions.size > 0 ? 'bg-green-500' : 'bg-zinc-600'}`} />
          <span>{sessions.size} agent{sessions.size !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Right side buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => openLibrary()}
          className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          title="Library — reference notes for agents"
        >
          <BookOpen className="w-4 h-4" />
        </button>
        <button
          onClick={() => setArchiveModalOpen(true)}
          className="relative p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          title="Archived sessions"
        >
          <Archive className="w-4 h-4" />
          {archivedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-zinc-600 text-[10px] leading-4 text-white text-center">
              {archivedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <motion.button
          onClick={() => setAddAgentModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white text-canvas text-xs font-medium hover:bg-zinc-100 transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus className="w-4 h-4" />
          New Agent
        </motion.button>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ArchiveModal open={archiveModalOpen} onClose={() => setArchiveModalOpen(false)} />
      <LibraryModal />
    </header>
  );
}
