// Diagnostic logging, opt-in with OPENUI_DEBUG=1. Silent under OPENUI_QUIET.
// Modules keep their own `log` for lifecycle events; use `debug` for
// per-request / per-hook detail and anything that echoes payloads.
const QUIET = !!process.env.OPENUI_QUIET;
const DEBUG = !QUIET && !!process.env.OPENUI_DEBUG;

export const debug: (...args: unknown[]) => void = DEBUG ? console.log.bind(console) : () => {};
