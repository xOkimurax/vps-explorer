const { spawn } = require("child_process");
const { WebSocketServer } = require("ws");

let currentProcess = null;
let wsClient = null;

function startTerminal(server) {
  const wss = new WebSocketServer({ server, path: '/terminal' });

  wss.on('connection', (ws, req) => {
    console.log('Terminal client connected');
    const clientId = Date.now();

    // Kill old process
    const oldProcess = currentProcess;
    currentProcess = null;
    wsClient = null;

    if (oldProcess) {
      try { oldProcess.kill(); } catch (e) { console.log('Kill old process:', e.message); }
    }

    wsClient = ws;

    // Keepalive ping every 25 seconds
    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) {
        ws.ping();
      }
    }, 25000);

    ws.on('pong', () => {
      console.log(`[${clientId}] pong received`);
    });

    // SSH connection using sshpass with password
    const sshPassword = 'matias12';
    const sshCmd = [
      'sshpass', '-p', sshPassword,
      'ssh', '-tt', '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=10',
      '-o', 'LogLevel=ERROR',
      '-p', '22',
      'root@217.76.59.68'
    ];

    try {
      currentProcess = spawn(sshCmd[0], sshCmd.slice(1), {
        cwd: '/root',
        env: { ...process.env, TERM: 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      console.log(`[${clientId}] SSH process spawned with PID: ${currentProcess.pid}`);
    } catch (err) {
      console.error(`[${clientId}] Process spawn failed:`, err.message);
      ws.send(`\x1b[31mError: No se pudo iniciar SSH: ${err.message}\x1b[0m\r\n`);
      return;
    }

    const procRef = { pid: currentProcess.pid };

    currentProcess.stdout.on('data', (data) => {
      if (wsClient && wsClient.readyState === 1) {
        wsClient.send(data);
      }
    });

    currentProcess.stderr.on('data', (data) => {
      if (wsClient && wsClient.readyState === 1) {
        wsClient.send(data);
      }
    });

    currentProcess.on('exit', (code) => {
      console.log(`[${clientId}] Process exited with code ${code}`);
      if (ws.readyState === 1) {
        ws.send(`\r\n[Sesión terminada]\r\n`);
      }
      if (currentProcess && currentProcess.pid === procRef.pid) {
        currentProcess = null;
      }
    });

    ws.on('message', (msg) => {
      if (currentProcess && currentProcess.stdin && currentProcess.stdin.writable) {
        currentProcess.stdin.write(msg.toString());
      }
    });

    ws.on('close', () => {
      console.log('Terminal client disconnected');
      clearInterval(pingInterval);
      if (currentProcess) {
        try { currentProcess.kill(); } catch {}
        currentProcess = null;
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
