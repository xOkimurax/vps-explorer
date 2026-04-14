#!/bin/bash
export NVM_DIR="/host/root/.nvm"
export HOME="/host/root"
export PATH="/host/root/.nvm/versions/node/v24.14.1/bin:$PATH"
export CI=true
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
cd /host/root

# Patch the trust flag directly to bypass the dialog
mkdir -p /host/root/.claude
echo '{"trustWorkspace":true}' > /host/root/.claude/trust.json 2>/dev/null || true

# Use exec to replace bash with claude - PTY stays valid because the file descriptor is inherited
exec /host/root/.nvm/versions/node/v24.14.1/bin/claude --permission-mode dontAsk
