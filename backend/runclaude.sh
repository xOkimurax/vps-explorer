#!/bin/sh
export PATH=/host/root/.nvm/versions/node/v24.14.1/bin:$PATH
exec node /host/root/.nvm/versions/node/v24.14.1/lib/node_modules/@anthropic-ai/claude-code/cli.js "$@"
