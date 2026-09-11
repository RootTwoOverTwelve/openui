#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Read version from package.json
const packageJson = await Bun.file(join(import.meta.dir, "..", "package.json")).json();
const CURRENT_VERSION = packageJson.version;

const PORT = process.env.PORT || 6969;
const LAUNCH_CWD = process.cwd();
const IS_DEV = process.env.NODE_ENV === "development" || process.argv.includes("--dev");

// Auto-install plugin if not present
async function ensurePluginInstalled() {
  const pluginDir = join(homedir(), ".openui", "claude-code-plugin");
  const pluginJson = join(pluginDir, ".claude-plugin", "plugin.json");

  if (existsSync(pluginJson)) {
    return; // Plugin already installed
  }

  console.log("\x1b[38;5;141m[plugin]\x1b[0m Installing Claude Code plugin...");

  const GITHUB_RAW = "https://raw.githubusercontent.com/RootTwoOverTwelve/openui/main/claude-code-plugin";

  try {
    // Create directories
    await $`mkdir -p ${pluginDir}/.claude-plugin ${pluginDir}/hooks`.quiet();

    // Download plugin files
    await Promise.all([
      $`curl -sL ${GITHUB_RAW}/.claude-plugin/plugin.json -o ${pluginDir}/.claude-plugin/plugin.json`.quiet(),
      $`curl -sL ${GITHUB_RAW}/hooks/hooks.json -o ${pluginDir}/hooks/hooks.json`.quiet(),
      $`curl -sL ${GITHUB_RAW}/hooks/status-reporter.sh -o ${pluginDir}/hooks/status-reporter.sh`.quiet(),
    ]);

    // Make script executable
    await $`chmod +x ${pluginDir}/hooks/status-reporter.sh`.quiet();

    console.log("\x1b[38;5;82m[plugin]\x1b[0m Plugin installed successfully!");
  } catch (e) {
    console.error("\x1b[38;5;196m[plugin]\x1b[0m Failed to install plugin:", e);
  }
}

// Check for updates (non-blocking)
async function checkForUpdates() {
  try {
    const res = await fetch("https://registry.npmjs.org/@fallom/openui/latest", {
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return;

    const data = await res.json();
    const latestVersion = data.version;

    if (latestVersion && latestVersion !== CURRENT_VERSION) {
      console.log(`\x1b[33m  Update available: ${CURRENT_VERSION} → ${latestVersion}\x1b[0m`);
      console.log(`\x1b[38;5;245m  Run: npm install -g @fallom/openui\x1b[0m\n`);
    }
  } catch {
    // Silently ignore - don't block startup for version check
  }
}

// Clear screen and show ASCII art
console.clear();
console.log(`
\x1b[38;5;141m
    ██╗      █████╗ ██╗   ██╗███╗   ██╗ ██████╗██╗  ██╗██╗███╗   ██╗ ██████╗
    ██║     ██╔══██╗██║   ██║████╗  ██║██╔════╝██║  ██║██║████╗  ██║██╔════╝
    ██║     ███████║██║   ██║██╔██╗ ██║██║     ███████║██║██╔██╗ ██║██║  ███╗
    ██║     ██╔══██║██║   ██║██║╚██╗██║██║     ██╔══██║██║██║╚██╗██║██║   ██║
    ███████╗██║  ██║╚██████╔╝██║ ╚████║╚██████╗██║  ██║██║██║ ╚████║╚██████╔╝
    ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝

    ██╗   ██╗ ██████╗ ██╗   ██╗██████╗      █████╗ ██╗
    ╚██╗ ██╔╝██╔═══██╗██║   ██║██╔══██╗    ██╔══██╗██║
     ╚████╔╝ ██║   ██║██║   ██║██████╔╝    ███████║██║
      ╚██╔╝  ██║   ██║██║   ██║██╔══██╗    ██╔══██║██║
       ██║   ╚██████╔╝╚██████╔╝██║  ██║    ██║  ██║██║
       ╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝

     ██████╗ ██████╗ ███╗   ███╗███╗   ███╗ █████╗ ███╗   ██╗██████╗
    ██╔════╝██╔═══██╗████╗ ████║████╗ ████║██╔══██╗████╗  ██║██╔══██╗
    ██║     ██║   ██║██╔████╔██║██╔████╔██║███████║██╔██╗ ██║██║  ██║
    ██║     ██║   ██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║╚██╗██║██║  ██║
    ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██████╔╝
     ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝

     ██████╗███████╗███╗   ██╗████████╗███████╗██████╗
    ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔════╝██╔══██╗
    ██║     █████╗  ██╔██╗ ██║   ██║   █████╗  ██████╔╝
    ██║     ██╔══╝  ██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗
    ╚██████╗███████╗██║ ╚████║   ██║   ███████╗██║  ██║
     ╚═════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
\x1b[0m

\x1b[38;5;251m                    ╔═══════════════════════════════════════╗
                    ║                                       ║
                    ║   \x1b[1m\x1b[38;5;141mhttp://localhost:${PORT}\x1b[0m\x1b[38;5;251m                 ║
                    ║                                       ║
                    ╚═══════════════════════════════════════╝\x1b[0m

\x1b[38;5;245m                         Press Ctrl+C to stop\x1b[0m
`);

// Ensure plugin is installed and check for updates in background
await ensurePluginInstalled();
checkForUpdates();

// Start the server with LAUNCH_CWD env var
// In production mode, suppress server output
const server = Bun.spawn(["bun", "run", "server/index.ts"], {
  cwd: import.meta.dir + "/..",
  stdio: IS_DEV ? ["inherit", "inherit", "inherit"] : ["inherit", "ignore", "ignore"],
  env: { ...process.env, PORT: String(PORT), LAUNCH_CWD, OPENUI_QUIET: IS_DEV ? "" : "1" }
});

// Open browser
setTimeout(async () => {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  await $`${cmd} http://localhost:${PORT}`.quiet();
}, 1500);

process.on("SIGINT", () => {
  server.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.kill();
  process.exit(0);
});

await server.exited;
