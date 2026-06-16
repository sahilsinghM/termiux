const express = require('express');
const path = require('path');
const { isTmuxAvailable } = require('./pty.js');
const { createSessionParser, requireAuth, createLoginRouter } = require('./auth.js');

function createApp() {
  const app = express();
  const sessionParser = createSessionParser();

  app.use(sessionParser);
  app.use(createLoginRouter());

  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', tmux: isTmuxAvailable() });
  });

  const distPath = path.join(process.cwd(), 'dist');

  // Auth gate for everything below — /login and /healthz are already handled above
  app.use(requireAuth);

  // Static assets and SPA shell, only reachable after authentication
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  // Attach sessionParser so the WS upgrade handler can access it
  app.sessionParser = sessionParser;

  return app;
}

module.exports = { createApp };
