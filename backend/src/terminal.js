const http = require('http');
const pty = require('node-pty');
const { WebSocketServer } = require('ws');

let currentPty = null;
let wsClient = null;

function startTerminal(server) {
  const wss = new WebSocketServer({ server, path: '/terminal' });

  wss.on('connection', (ws, req) => {
    console.log('Terminal client connected');
    wsClient = ws;

    if (currentPty) {
      try { currentPty.kill(); } catch {}
      currentPty = null;
    }

    const env = {
      TERM: 'xterm-256color',
      HOME: '/host/root',
      USER: 'root',
      NVM_DIR: '/host/root/.nvm',
      PATH: '/host/root/.nvm/versions/node/v24.14.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      CI: 'true',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_TRUST_WORKSPACE: 'true',
      CLAUDE_PERMISSION_MODE: 'bypassPermissions',
      ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'sk-cp-p7OQOkqUjVHjSxoNwbFPYN6VTuQ_Mg184qlEDPBdRgYVW22T1SbGcA_pottDcDHtDQrGfIrzLA-LFhsOl1PRLnQYXyhy8pRy7QYWsN98y2K44L22Oqew7Nc',
      ANTHROPIC_MODEL: 'MiniMax-M2.7',
    };

    const claudePath = '/host/root/.nvm/versions/node/v24.14.1/lib/node_modules/@anthropic-ai/claude-code/cli.js';

    // Spawn node directly with Claude's cli.js — no bash wrapper
    currentPty = pty.spawn('node', [claudePath], {
      name: 'xterm-256color',
      cwd: '/host/root',
      env,
    });

    console.log(`Claude PTY spawned with PID: ${currentPty.pid}`);

    currentPty.onData((data) => {
      if (wsClient && wsClient.readyState === 1) {
        wsClient.send(data);
      }
    });

    currentPty.onExit((code) => {
      console.log(`PTY exited with code ${code}`);
      if (wsClient && wsClient.readyState === 1) {
        wsClient.send(`\r\n[Sesión terminada]\r\n`);
        wsClient.close();
      }
      currentPty = null;
      wsClient = null;
    });

    ws.on('message', (msg) => {
      if (currentPty) {
        // Only convert bare \n to \r (Enter key), keep other newlines intact
        const input = msg.toString().replace(/\r?\n/g, (match) => match === '\n' ? '\r' : match);
        currentPty.write(input);
      }
    });

    ws.on('close', () => {
      console.log('Terminal client disconnected');
      if (currentPty) {
        try { currentPty.kill(); } catch {}
        currentPty = null;
      }
      wsClient = null;
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });

  return wss;
}

module.exports = { startTerminal };