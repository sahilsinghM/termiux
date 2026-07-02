const pty = require('node-pty');
const { exec, execFile } = require('child_process');
const { log, debug, err } = require('./logger.js');
const { shellEnv } = require('./shellSession.js');
const { startHeartbeat } = require('./heartbeat.js');

let tmuxAvailable = false;

function checkTmux() {
  return new Promise((resolve) => {
    exec('tmux -V', (error) => {
      tmuxAvailable = !error;
      resolve(tmuxAvailable);
    });
  });
}

function isTmuxAvailable() {
  return tmuxAvailable;
}

function spawnPty(sessionName = 'main') {
  return pty.spawn('tmux', ['new-session', '-A', '-s', sessionName], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: shellEnv(process.env),
  });
}

function attachPtyToWs(ws, ptyProcess, sessionName = 'main') {
  const startTime = Date.now();
  const stopHeartbeat = startHeartbeat(ws);

  log(`PTY spawned: pid ${ptyProcess.pid}`);

  ptyProcess.onData((data) => {
    debug(`PTY→WS ${data.length} bytes`);
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(data);
      } catch (_) {
        // client disconnected between readyState check and send
      }
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    log(`PTY exited: code ${exitCode}`);
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'pty-exit' }));
        ws.close();
      }
    } catch (_) {}
  });

  ws.on('message', (data) => {
    const raw = data.toString();
    debug(`WS→PTY ${raw.length} bytes`);
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'resize' && msg.cols && msg.rows) {
        const cols = parseInt(msg.cols, 10);
        const rows = parseInt(msg.rows, 10);
        if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) return;
        ptyProcess.resize(cols, rows);
        execFile('tmux', ['resize-window', '-t', sessionName, '-x', String(cols), '-y', String(rows)], (e) => {
          if (e) err(`tmux resize failed: ${e.message}`);
        });
        return;
      }
    } catch (_) {
      // not JSON — raw PTY input
    }
    try {
      ptyProcess.write(raw);
    } catch (_) {}
  });

  ws.on('close', () => {
    stopHeartbeat();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`WS closed: pid ${ptyProcess.pid} after ${duration}s`);
    try {
      ptyProcess.kill('SIGTERM');
    } catch (_) {}
  });
}

module.exports = { checkTmux, isTmuxAvailable, spawnPty, attachPtyToWs };
