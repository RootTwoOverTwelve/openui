import { openSync, readSync, closeSync, fstatSync } from "fs";

export interface ContextUsage {
  tokens: number;   // prompt tokens on the last assistant turn = live context size
  limit: number;    // model context window
  pct: number;      // 0..100
  at: string;
}

// Claude Code reports the model as e.g. "claude-opus-5[1m]" for the 1M
// context variant; everything else is the standard window.
export function contextLimitFor(model?: string): number {
  return model && /\[1m\]|-1m\b/i.test(model) ? 1_000_000 : 200_000;
}

const TAIL_BYTES = 512 * 1024;

// Read the live context size from the tail of a Claude Code transcript: the
// most recent main-thread assistant record's usage is the whole prompt that
// turn was served with (uncached + cache writes + cache reads). Drops after
// compaction, so it tracks what /compact would act on. Tail-only read so it
// stays cheap on long sessions.
export function readContextUsage(transcriptPath: string, model?: string): ContextUsage | null {
  let fd: number | null = null;
  try {
    fd = openSync(transcriptPath, "r");
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString("utf-8").split("\n");
    // The first line may be a partial record when we cut mid-file
    if (start > 0) lines.shift();

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line || !line.includes('"assistant"')) continue;
      let rec: any;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec.type !== "assistant" || rec.isSidechain) continue;
      const usage = rec.message?.usage;
      if (!usage) continue;
      const tokens =
        (usage.input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) +
        (usage.cache_read_input_tokens || 0);
      if (!tokens) continue;
      // Without the hook-reported model string we can't see the [1m]
      // marker; a prompt over 200k is proof of the larger window
      const limit = model ? contextLimitFor(model) : (tokens > 200_000 ? 1_000_000 : contextLimitFor(rec.message?.model));
      return { tokens, limit, pct: Math.min(100, Math.round((tokens / limit) * 1000) / 10), at: new Date().toISOString() };
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}
