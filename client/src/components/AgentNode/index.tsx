import { NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Sparkles, Code, Cpu, Zap, Rocket, Bot, Brain, Wand2 } from "lucide-react";
import { useStore, AgentStatus } from "../../stores/useStore";
import { AgentNodeCard } from "./AgentNodeCard";
import { AgentNodeContextMenu } from "./AgentNodeContextMenu";
import { useAgentNodeState } from "./useAgentNodeState";

const iconMap: Record<string, any> = {
  sparkles: Sparkles,
  code: Code,
  cpu: Cpu,
  zap: Zap,
  rocket: Rocket,
  bot: Bot,
  brain: Brain,
  wand2: Wand2,
};

interface AgentNodeData {
  label: string;
  agentId: string;
  color: string;
  icon: string;
  sessionId: string;
}

export const AgentNode = ({ id, data, selected }: NodeProps) => {
  const nodeData = data as unknown as AgentNodeData;

  // Subscribe directly to status and currentTool as primitive values - this guarantees re-render on change
  const status: AgentStatus = useStore((state) => state.sessions.get(id)?.status) || "idle";
  const currentTool = useStore((state) => state.sessions.get(id)?.currentTool);

  // Get the full session for other data
  const session = useStore((state) => state.sessions.get(id));

  const {
    contextMenu,
    handleContextMenu,
    canFork,
    forkDisabledReason,
    handleFork,
    handleArchive,
    handleDelete,
    closeContextMenu,
  } = useAgentNodeState(id, nodeData, session);

  const displayColor = session?.customColor || session?.color || nodeData.color || "#22C55E";
  const displayName = session?.customName || session?.agentName || nodeData.label || "Agent";
  const displayIcon = nodeData.icon || "cpu";
  const Icon = iconMap[displayIcon] || Cpu;

  return (
    <>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onContextMenu={handleContextMenu}
      >
        <AgentNodeCard
          selected={selected}
          displayColor={displayColor}
          displayName={displayName}
          Icon={Icon}
          agentId={nodeData.agentId}
          status={status}
          currentTool={currentTool}
          cwd={session?.cwd}
          originalCwd={session?.originalCwd}
          gitBranch={session?.gitBranch}
          ticketId={session?.ticketId}
          ticketTitle={session?.ticketTitle}
          contextUsage={session?.contextUsage}
        />
      </motion.div>

      {contextMenu && (
        <AgentNodeContextMenu
          position={contextMenu}
          onClose={closeContextMenu}
          onFork={handleFork}
          canFork={canFork}
          forkDisabledReason={forkDisabledReason}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      )}
    </>
  );
};
