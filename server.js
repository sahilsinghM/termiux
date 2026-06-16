require('dotenv').config();
const http = require('http');
const { execFile } = require('child_process');
const { WebSocketServer } = require('ws');
const { log, err } = require('./src/server/logger.js');
const { checkTmux, spawnPty, attachPtyToWs } = require('./src/server/pty.js');
const { createApp } = require('./src/server/app.js');
const {
  checkWsAuth,
  incrementWsCount,
  decrementWsCount,
} = require('./src/server/auth.js');

async function validateStartup() {
  // Cheapest checks first
  if (!process.env.AUTH_TOKEN) {
    process.stderr.write('✖ AUTH_TOKEN not set. Copy .env.example to .env and set a strong password. Exiting.\n');
    process.exit(1);
  }

  try {
    require('node-pty');
  } catch (e) {
    process.stderr.write('✖ node-pty failed to load. Run: npm install (requires build-essential and Node 18+). Exiting.\n');
    process.exit(1);
  }

  const tmuxOk = await checkTmux();
  if (!tmuxOk) {
    process.stderr.write('✖ tmux not found. Run: sudo apt install tmux. Exiting.\n');
    process.exit(1);
  }
}

async function main() {
  await validateStartup();

  const app = createApp();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    app.sessionParser(req, {}, () => {
      checkWsAuth(req, (authErr) => {
        if (authErr) {
          if (authErr.message === 'connection limit reached') {
            socket.write('HTTP/1.1 429 Too Many Connections\r\n\r\n');
          } else {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          }
          socket.destroy();
          return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          incrementWsCount();
          log(`WS connected: ${req.socket.remoteAddress}`);

          let ptyProcess;
          try {
            ptyProcess = spawnPty();
          } catch (e) {
            err(`PTY spawn failed: ${e.message}`);
            try {
              ws.send(JSON.stringify({ type: 'error', message: `Cannot start terminal: ${e.message}` }));
              ws.close();
            } catch (_) {}
            decrementWsCount();
            return;
          }

          attachPtyToWs(ws, ptyProcess);

          ws.on('close', () => {
            decrementWsCount();
          });
        });
      });
    });
  });

  const PORT = parseInt(process.env.PORT || '3000', 10);
  server.listen(PORT, () => {
    log(`✓ Termiux listening on http://localhost:${PORT}`);
  });
}

main();
