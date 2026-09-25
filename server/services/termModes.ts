// Terminal private modes (DECSET/DECRST) the running agent has turned on.
//
// xterm.js only learns these by parsing them out of the output stream, so a
// terminal that attaches after the agent already announced them starts out of
// sync with what the agent believes. The one that bites is bracketed paste
// (2004): Claude Code enables it twice at startup and never re-sends it, not
// even on resize, so a panel reopened later pastes unbracketed — every
// newline arrives as a bare Enter instead of one held-together blob.
//
// We track the modes as they go past and replay the current state to each
// terminal that connects, the same way we replay scrollback.

// Modes worth restoring. Others are either harmless or specific to a screen
// state we aren't reconstructing.
const REPLAY = new Set([
  1,    // application cursor keys
  25,   // cursor visible
  1000, // mouse: click tracking
  1002, // mouse: drag tracking
  1003, // mouse: any-motion tracking
  1005, // mouse: utf-8 coordinates
  1006, // mouse: SGR coordinates
  1015, // mouse: urxvt coordinates
  1049, // alternate screen buffer
  2004, // bracketed paste
]);

const MODE_RE = /\x1b\[\?([0-9;]+)([hl])/g;

export function trackModes(enabled: Set<number>, data: string): void {
  for (const match of data.matchAll(MODE_RE)) {
    const on = match[2] === "h";
    for (const part of match[1].split(";")) {
      const mode = Number(part);
      if (!Number.isFinite(mode)) continue;
      if (on) enabled.add(mode);
      else enabled.delete(mode);
    }
  }
}

// The escape sequence that brings a fresh terminal up to the current state
export function modeSequence(enabled: Set<number> | undefined): string {
  if (!enabled?.size) return "";
  return [...enabled]
    .filter((mode) => REPLAY.has(mode))
    .sort((a, b) => a - b)
    .map((mode) => `\x1b[?${mode}h`)
    .join("");
}
