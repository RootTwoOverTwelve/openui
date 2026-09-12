import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { marked } from "marked";
import { X, BookOpen, Send, FileText, Check, Copy } from "lucide-react";
import { useStore } from "../stores/useStore";

interface LibraryEntry {
  file: string;
  path: string;
  title: string;
  lines: number;
  bytes: number;
  modified: string;
  outline: string[];
}

// Reference notes from <repo>/library. Browse and read them here; when opened
// from a session panel, hand one to that agent. The agent gets a pointer and
// the outline by default so a long runbook never lands in its context.
export function LibraryModal() {
  const { libraryOpen, libraryTargetNodeId, closeLibrary, sessions } = useStore();
  const target = libraryTargetNodeId ? sessions.get(libraryTargetNodeId) : null;
  const targetName = target?.customName || target?.agentName;
  const targetRunning = !!target && target.status !== "disconnected";

  const [dir, setDir] = useState("");
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [content, setContent] = useState<string>("");
  const [sent, setSent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!libraryOpen) return;
    setSent(null);
    setError(null);
    fetch("/api/library")
      .then((r) => r.json())
      .then((d) => {
        setDir(d.dir);
        setEntries(d.entries);
        setSelected((cur) => (cur && d.entries.find((e: LibraryEntry) => e.file === cur.file)) || d.entries[0] || null);
      })
      .catch((e) => setError(String(e)));
  }, [libraryOpen]);

  useEffect(() => {
    if (!selected) {
      setContent("");
      return;
    }
    let cancelled = false;
    fetch(`/api/library/${encodeURIComponent(selected.file)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setContent(d.content || ""); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selected?.file]);

  const send = async (mode: "point" | "read") => {
    if (!target || !selected) return;
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${target.sessionId}/library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: selected.file, mode }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setSent(`${mode === "read" ? "Asked" : "Pointed"} ${targetName} ${mode === "read" ? "to read" : "at"} “${selected.title}”`);
      setTimeout(() => setSent(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const copyPath = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const html = content ? (marked.parse(content) as string) : "";

  return createPortal(
    <AnimatePresence>
      {libraryOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={closeLibrary}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-4xl mx-4 h-[80vh]">
              <div className="bg-surface rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col h-full">
                <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-zinc-400" />
                    Library
                  </h2>
                  <span className="text-[11px] text-zinc-600 font-mono truncate" title={dir}>{dir}</span>
                  {target && (
                    <span className="ml-auto text-[11px] text-zinc-400">
                      for <span className="text-white">{targetName}</span>
                      {!targetRunning && <span className="text-zinc-600"> (not running)</span>}
                    </span>
                  )}
                  <button
                    onClick={closeLibrary}
                    className={`${target ? "" : "ml-auto"} p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-canvas transition-colors`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 min-h-0 flex">
                  {/* list */}
                  <div className="w-64 flex-shrink-0 border-r border-border overflow-y-auto">
                    {entries.length === 0 && (
                      <p className="p-4 text-xs text-zinc-500">
                        No notes yet. Drop Markdown files into <span className="font-mono">library/</span> — the first <span className="font-mono"># heading</span> becomes the name.
                      </p>
                    )}
                    {entries.map((e) => (
                      <button
                        key={e.file}
                        onClick={() => setSelected(e)}
                        className={`w-full text-left px-4 py-2.5 border-b border-border/60 transition-colors ${
                          selected?.file === e.file ? "bg-white/5" : "hover:bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                          <span className="text-sm text-white truncate">{e.title}</span>
                        </div>
                        <p className="text-[10px] text-zinc-600 font-mono mt-0.5 pl-5">
                          {e.file} · {e.lines} lines
                        </p>
                      </button>
                    ))}
                  </div>

                  {/* reader */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    {selected ? (
                      <>
                        <div className="flex-shrink-0 px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-zinc-500 font-mono truncate" title={selected.path}>{selected.path}</span>
                          <button
                            onClick={copyPath}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
                            title="Copy the absolute path"
                          >
                            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                            path
                          </button>
                          {target && (
                            <div className="ml-auto flex items-center gap-1.5">
                              <button
                                onClick={() => send("point")}
                                disabled={!targetRunning}
                                title="Types the path and section outline into the agent's terminal. The agent copies/appends it with shell commands or reads only the section it needs — the note itself stays out of its context."
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white text-canvas text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 transition-colors"
                              >
                                <Send className="w-3 h-3" />
                                Point agent at it
                              </button>
                              <button
                                onClick={() => send("read")}
                                disabled={!targetRunning}
                                title={`Asks the agent to read the whole note (${selected.lines} lines) into its context.`}
                                className="px-2.5 py-1 rounded-md bg-surface-active text-zinc-300 text-xs hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                              >
                                Read in full
                              </button>
                            </div>
                          )}
                        </div>
                        {(sent || error) && (
                          <p className={`px-4 py-1.5 text-[11px] ${error ? "text-red-400" : "text-green-400"} border-b border-border`}>
                            {error || sent}
                          </p>
                        )}
                        <div
                          className="flex-1 min-h-0 overflow-y-auto px-6 py-4 library-markdown"
                          dangerouslySetInnerHTML={{ __html: html }}
                        />
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-sm text-zinc-600">Select a note</div>
                    )}
                  </div>
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
