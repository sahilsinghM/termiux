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

  // Serve built frontend in production; in dev, Vite handles it
  if (process.env.NODE_ENV !== 'development') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', requireAuth, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // In dev mode, protect the root so the auth test can verify the redirect
    app.get('/', requireAuth, (req, res) => {
      res.send('OK');
    });
  }

  // Attach sessionParser so the WS upgrade handler can access it
  app.sessionParser = sessionParser;

  return app;
}

module.exports = { createApp };
