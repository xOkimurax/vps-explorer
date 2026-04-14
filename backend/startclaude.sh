#!/bin/bash
export CLAUDE_TRUST_WORKSPACE=true
export CLAUDE_PERMISSION_MODE=bypassPermissions
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
export HOME=/host/root
export PATH=/host/root/.nvm/versions/node/v24.14.1/bin:$PATH
export NVM_DIR=/host/root/.nvm
exec claude