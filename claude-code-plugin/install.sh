#!/bin/bash

# OpenUI Claude Code Plugin Installer
# Downloads and installs the plugin to ~/.openui/claude-code-plugin/

set -e

INSTALL_DIR="$HOME/.openui/claude-code-plugin"
GITHUB_RAW="https://raw.githubusercontent.com/RootTwoOverTwelve/openui/main/claude-code-plugin"

echo "Installing OpenUI Status Plugin for Claude Code..."

# Create directories
mkdir -p "$INSTALL_DIR/.claude-plugin"
mkdir -p "$INSTALL_DIR/hooks"

# Download plugin files
echo "Downloading plugin files..."
curl -sL "$GITHUB_RAW/.claude-plugin/plugin.json" -o "$INSTALL_DIR/.claude-plugin/plugin.json"
curl -sL "$GITHUB_RAW/hooks/hooks.json" -o "$INSTALL_DIR/hooks/hooks.json"
curl -sL "$GITHUB_RAW/hooks/status-reporter.sh" -o "$INSTALL_DIR/hooks/status-reporter.sh"

# Make script executable
chmod +x "$INSTALL_DIR/hooks/status-reporter.sh"

echo ""
echo "Plugin installed to: $INSTALL_DIR"
echo ""
echo "The plugin will be automatically loaded when you start Claude agents through OpenUI."
echo ""
echo "To verify manually, run:"
echo "  claude --plugin-dir $INSTALL_DIR"
echo "  /plugins"
echo ""
echo "Done!"
