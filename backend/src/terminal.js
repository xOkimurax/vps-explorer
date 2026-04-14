const http = require('http');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

let currentChild = null;
let wsClient = null;

function startTerminal(server) {
  const wss = new WebSocketServer({ server, path: '/terminal' });

  wss.on('connection', (ws, req) => {
    console.log('Terminal client connected');
    wsClient = ws;

    if (currentChild) {
      try { currentChild.kill(); } catch {}
      currentChild = null;
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

    // Spawn Claude directly with pipes - no PTY layer
    // This avoids the musl/glibc exec issue inside Alpine container
    currentChild = spawn('/host/root/.nvm/versions/node/v24.14.1/bin/claude', [], {
      cwd: '/host/root',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    console.log(`Claude spawned with PID: ${currentChild.pid}`);

    currentChild.stdout.on('data', (data) => {
      if (wsClient && wsClient.readyState === 1) {
        wsClient.send(data.toString());
      }
    });

    currentChild.stderr.on('data', (data) => {
      if (wsClient && wsClient.readyState === 1) {
        wsClient.send(data.toString());
      }
    });

    currentChild.on('exit', (code) => {
      console.log(`Claude exited with code ${code}`);
      if (wsClient && wsClient.readyState === 1) {
        wsClient.send(`\r\n[Sesión terminada]\r\n`);
        wsClient.close();
      }
      currentChild = null;
      wsClient = null;
    });

    ws.on('message', (msg) => {
      if (currentChild && currentChild.stdin.writable) {
        currentChild.stdin.write(msg.toString());
      }
    });

    ws.on('close', () => {
      console.log('Terminal client disconnected');
      if (currentChild) {
        try { currentChild.kill(); } catch {}
        currentChild = null;
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