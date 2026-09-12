import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

// Reference notes for agents live in <repo>/library/*.md (see its README).
// Agents get a pointer plus the heading outline, not the contents, so a
// long runbook never lands in context unless someone explicitly asks.
const LIBRARY_DIR = resolve(import.meta.dir, "..", "..", "library");
const NAME_RE = /^[A-Za-z0-9._ -]+\.md$/;

export interface LibraryEntry {
  file: string;       // basename, e.g. "slurm.md"
  path: string;       // absolute path, what the agent is told
  title: string;      // first "# heading", else the filename
  lines: number;
  bytes: number;
  modified: string;
  outline: string[];  // "## Login", "### Passwordless ssh", ...
}

function describe(file: string): LibraryEntry | null {
  const path = join(LIBRARY_DIR, file);
  let text: string, st;
  try {
    st = statSync(path);
    text = readFileSync(path, "utf-8");
  } catch {
    return null;
  }
  const lines = text.split("\n");
  const headings = lines.filter((l) => /^#{1,6}\s+\S/.test(l)).map((l) => l.trim());
  const h1 = headings.find((h) => h.startsWith("# "));
  return {
    file,
    path,
    title: h1 ? h1.replace(/^#\s+/, "") : file.replace(/\.md$/, ""),
    lines: lines.length,
    bytes: st.size,
    modified: st.mtime.toISOString(),
    outline: headings.filter((h) => !h.startsWith("# ")).slice(0, 40),
  };
}

export function libraryDir() {
  return LIBRARY_DIR;
}

export function listLibrary(): LibraryEntry[] {
  if (!existsSync(LIBRARY_DIR)) return [];
  return readdirSync(LIBRARY_DIR)
    .filter((f) => NAME_RE.test(f) && f !== "README.md")
    .map(describe)
    .filter((e): e is LibraryEntry => !!e)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function readLibraryFile(file: string): { entry: LibraryEntry; content: string } | null {
  if (!NAME_RE.test(file) || file === "README.md") return null;
  const entry = describe(file);
  if (!entry) return null;
  return { entry, content: readFileSync(entry.path, "utf-8") };
}

// What gets typed into the agent's terminal. "point" hands over the path and
// the outline so the agent can copy/append it with shell commands or read a
// single section; "read" asks it to read the whole file (fine for short ones).
export function referenceMessage(entry: LibraryEntry, mode: "point" | "read"): string {
  if (mode === "read") {
    return `Read the reference note at ${entry.path} ("${entry.title}", ${entry.lines} lines) and apply what is relevant to this session.`;
  }
  const outline = entry.outline.length
    ? ` Sections: ${entry.outline.map((h) => h.replace(/^#+\s+/, "")).join(" · ")}.`
    : "";
  return (
    `Reference note available at ${entry.path} ("${entry.title}", ${entry.lines} lines). ` +
    `Do not read it in full.${outline} ` +
    `If it belongs somewhere, copy or append it with shell commands (cp, cat >>) without reading it; ` +
    `if you need specific guidance from it, grep for the section heading and read only that range.`
  );
}
