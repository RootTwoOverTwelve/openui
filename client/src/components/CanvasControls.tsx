import { motion } from "framer-motion";
import { Plus, FolderPlus } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useStore } from "../stores/useStore";

const CATEGORY_COLORS = ["#F97316", "#22C55E", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6"];

export function CanvasControls() {
  const { setAddAgentModalOpen, addNode, sidebarOpen, sidebarWidth, sidebarResizing } = useStore();
  const reactFlowInstance = useReactFlow();

  const handleAddAgent = () => {
    setAddAgentModalOpen(true);
  };

  const handleAddCategory = async () => {
    const id = `category-${Date.now()}`;
    const color = CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];

    // Centre it in the current view, wherever the user has panned to
    const viewport = reactFlowInstance.getViewport();
    const bounds = document.querySelector(".react-flow")?.getBoundingClientRect();
    const viewW = bounds?.width || window.innerWidth;
    const viewH = bounds?.height || window.innerHeight;
    const GRID = 24;
    const position = {
      x: Math.round(((-viewport.x + viewW / 2) / viewport.zoom - 456 / 2) / GRID) * GRID,
      y: Math.round(((-viewport.y + viewH / 2) / viewport.zoom - 312 / 2) / GRID) * GRID,
    };

    const category = {
      id,
      label: "New Category",
      color,
      position,
      width: 456,
      height: 312,
    };

    // Save to server
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(category),
    });

    // Add to canvas
    addNode({
      id,
      type: "category",
      position,
      style: { width: 456, height: 312 },
      data: {
        label: "New Category",
        color,
      },
      zIndex: -1,
    });
  };

  return (
    <motion.div
      // Stay just left of the session panel so the buttons are never covered
      initial={false}
      animate={{ right: sidebarOpen ? sidebarWidth + 16 : 16 }}
      transition={sidebarResizing ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 40 }}
      className="absolute bottom-4 z-10 flex flex-col gap-2"
    >
      <motion.button
        onClick={handleAddCategory}
        className="w-10 h-10 rounded-full bg-surface border border-border shadow-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-surface-hover transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="New Category"
      >
        <FolderPlus className="w-5 h-5" />
      </motion.button>
      <motion.button
        onClick={handleAddAgent}
        className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center text-canvas hover:bg-zinc-100 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="New Agent"
      >
        <Plus className="w-6 h-6" />
      </motion.button>
    </motion.div>
  );
}
