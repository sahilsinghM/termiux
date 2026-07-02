require('dotenv').config();
const fs = require('fs');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const { WebSocketServer } = require('ws');
const { log, err } = require('./src/server/logger.js');
const { checkTmux, spawnPty, attachPtyToWs } = require('./src/server/pty.js');
const { createApp } = require('./src/server/app.js');
const { validateConfig } = require('./src/server/config.js');
const {
  checkWsAuth,
  incrementWsCount,
  decrementWsCount,
} = require('./src/server/auth.js');

function loadTls() {
  const certFile = process.env.TLS_CERT_FILE;
  const keyFile = process.env.TLS_KEY_FILE;
  if (!certFile && !keyFile) return null;
  if (!certFile || !keyFile) {
    process.stderr.write('✖ TLS_CERT_FILE and TLS_KEY_FILE must both be set. Exiting.\n');
    process.exit(1);
  }
  try {
    return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) };
  } catch (e) {
    process.stderr.write(`✖ Failed to load TLS files: ${e.message}. Exiting.\n`);
    process.exit(1);
  }
}

async function validateStartup() {
  // Cheapest checks first: fail closed on any misconfiguration.
  const config = validateConfig(process.env);
  if (!config.ok) {
    process.stderr.write(`✖ ${config.message} Exiting.\n`);
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
  const tls = loadTls();
  const server = tls ? https.createServer(tls, app) : http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    app.sessionParser(req, {}, () => {
      checkWsAuth(req, (authErr, sessionName) => {
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
            ptyProcess = spawnPty(sessionName);
          } catch (e) {
            err(`PTY spawn failed: ${e.message}`);
            try {
              ws.send(JSON.stringify({ type: 'error', message: `Cannot start terminal: ${e.message}` }));
              ws.close();
            } catch (_) {}
            decrementWsCount();
            return;
          }

          attachPtyToWs(ws, ptyProcess, sessionName);

          ws.on('close', () => {
            decrementWsCount();
          });
        });
      });
    });
  });

  const PORT = parseInt(process.env.PORT || '3000', 10);
  const HOST = process.env.HOST || '127.0.0.1';
  server.listen(PORT, HOST, () => {
    const proto = tls ? 'https' : 'http';
    log(`✓ Termiux listening on ${proto}://${HOST}:${PORT}${tls ? '' : ' (no TLS — set TLS_CERT_FILE + TLS_KEY_FILE for HTTPS)'}`);
  });
}

main();
