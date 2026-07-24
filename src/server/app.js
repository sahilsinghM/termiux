const express = require('express');
const path = require('path');
const { isTmuxAvailable } = require('./pty.js');
const { createSessionParser, requireAuth, createLoginRouter } = require('./auth.js');

function createApp() {
  const app = express();
  // cloudflared connects from localhost over plain HTTP and forwards
  // X-Forwarded-Proto/CF-Connecting-IP. Trust only the loopback proxy (not a
  // permissive `true`) so req.secure and req.ip reflect the real client without
  // letting arbitrary upstreams spoof them.
  app.set('trust proxy', 'loopback');
  const sessionParser = createSessionParser();

  app.use(sessionParser);
  // ponytail: HSTS is harmless over HTTP and avoids a conditional — browsers ignore it without TLS
  app.use((_req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
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
