import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Wrench, CornerDownRight } from "lucide-react";

interface SubagentMessage {
  role: "user" | "assistant" | "tool" | "result";
  text: string;
  ts?: string;
}

interface SubagentViewProps {
  sessionId: string;
  agentId: string;
  description: string;
  agentType: string;
  running: boolean;
  onBack: () => void;
}

// Read-only rendering of a subagent's transcript. Polls while the agent is
// still writing; there is no PTY behind this, and Claude Code doesn't let
// you talk to a subagent directly either.
export function SubagentView({ sessionId, agentId, description, agentType, running, onBack }: SubagentViewProps) {
  const [messages, setMessages] = useState<SubagentMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/subagents/${agentId}`);
        if (cancelled) return;
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const data = await res.json();
        setMessages(data.messages);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const interval = running ? setInterval(load, 2000) : null;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [sessionId, agentId, running]);

  // Follow new output unless the user has scrolled up
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0d0d0d]">
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-2">
        <button
          onClick={onBack}
          className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
          title="Back to the main terminal"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <Bot className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs text-zinc-300 truncate">{description}</span>
        <span className="text-[10px] text-zinc-600 font-mono">{agentType}</span>
        {running && <span className="ml-auto text-[10px] text-green-400">● running</span>}
        {!running && <span className="ml-auto text-[10px] text-zinc-600">finished · read-only</span>}
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 font-mono text-[12px] leading-relaxed">
        {error && <p className="text-red-400">{error}</p>}
        {messages === null && !error && <p className="text-zinc-600">Loading…</p>}
        {messages?.map((m, i) => {
          if (m.role === "tool") {
            return (
              <div key={i} className="flex items-start gap-2 text-zinc-500">
                <Wrench className="w-3 h-3 mt-1 flex-shrink-0" />
                <span className="truncate">{m.text}</span>
              </div>
            );
          }
          if (m.role === "result") {
            return (
              <div key={i} className="flex items-start gap-2 text-zinc-600">
                <CornerDownRight className="w-3 h-3 mt-1 flex-shrink-0" />
                <pre className="whitespace-pre-wrap break-words text-[11px] max-h-40 overflow-hidden">{m.text}</pre>
              </div>
            );
          }
          const isUser = m.role === "user";
          return (
            <div key={i} className={isUser ? "text-zinc-400" : "text-zinc-200"}>
              <span className={`select-none mr-2 ${isUser ? "text-zinc-600" : "text-orange-400"}`}>{isUser ? "›" : "●"}</span>
              <span className="whitespace-pre-wrap break-words">{m.text}</span>
            </div>
          );
        })}
        {messages && messages.length === 0 && <p className="text-zinc-600">No messages yet.</p>}
      </div>
    </div>
  );
}
