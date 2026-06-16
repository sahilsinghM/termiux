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

  // Protect the app shell before static middleware can short-circuit auth
  app.get('/', requireAuth, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  // Static assets (JS, CSS, icons) — no auth needed on asset files
  app.use(express.static(distPath));

  // SPA catch-all for any future client-side routes
  app.get('*', requireAuth, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  // Attach sessionParser so the WS upgrade handler can access it
  app.sessionParser = sessionParser;

  return app;
}

module.exports = { createApp };
